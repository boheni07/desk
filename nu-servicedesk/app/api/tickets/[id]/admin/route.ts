// Design Ref: §4 — PUT /api/tickets/[id]/admin
// Plan SC: FR-11 관리자 수정, AdminEditField enum 7종

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import type { TicketStatus } from '@prisma/client';

type RouteParams = { params: Promise<{ id: string }> };

const VALID_TICKET_STATUSES = ['REGISTERED','RECEIVED','IN_PROGRESS','DELAYED','EXTEND_REQUESTED','COMPLETE_REQUESTED','SATISFACTION_PENDING','CLOSED','CANCELLED'];

const adminEditSchema = z.object({
  field: z.enum(['TITLE', 'CONTENT', 'CATEGORY', 'PRIORITY', 'ASSIGNEE', 'STATUS', 'DEADLINE']),
  value: z.string().min(1, '값을 입력해 주세요.'),
  reason: z.string().min(1, '수정 사유를 입력해 주세요.'),
});

/**
 * PUT /api/tickets/[id]/admin — 관리자 수정 (워크플로우 우회 포함)
 * admin only. Records TicketAdminEdit.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    if (session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '관리자만 접근할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;

    const body = await request.json();
    const parsed = adminEditSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다.', status: 400, fieldErrors } },
        { status: 400 },
      );
    }

    const { field, value, reason } = parsed.data;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Determine previous value and build update data
    let previousValue: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    switch (field) {
      case 'TITLE':
        previousValue = ticket.title;
        updateData.title = value;
        break;
      case 'CONTENT':
        previousValue = ticket.content;
        updateData.content = value;
        break;
      case 'CATEGORY': {
        previousValue = ticket.categoryId;
        const cat = await prisma.category.findUnique({ where: { id: value } });
        if (!cat || !cat.isActive) {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_CATEGORY', message: '유효하지 않은 카테고리입니다.', status: 400 } },
            { status: 400 },
          );
        }
        updateData.categoryId = value;
        break;
      }
      case 'PRIORITY':
        previousValue = ticket.priority;
        if (!['URGENT', 'HIGH', 'NORMAL', 'LOW'].includes(value)) {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_PRIORITY', message: '유효하지 않은 우선순위입니다.', status: 400 } },
            { status: 400 },
          );
        }
        updateData.priority = value;
        break;
      case 'ASSIGNEE': {
        // This records the admin edit, actual assignment is via /assign endpoint
        previousValue = null;
        // Upsert assignment
        await prisma.ticketAssignment.upsert({
          where: { ticketId_userId: { ticketId: id, userId: value } },
          update: {},
          create: { ticketId: id, userId: value },
        });
        break;
      }
      case 'STATUS': {
        // Direct status change (workflow override by admin)
        if (!VALID_TICKET_STATUSES.includes(value)) {
          return NextResponse.json(
            { success: false, error: { code: 'INVALID_STATUS', message: '유효하지 않은 상태값입니다.', status: 400 } },
            { status: 400 },
          );
        }
        previousValue = ticket.status;
        updateData.status = value;
        break;
      }
      case 'DEADLINE':
        previousValue = ticket.deadline?.toISOString() ?? null;
        updateData.deadline = new Date(value);
        // Record deadline history
        await prisma.ticketDeadlineHistory.create({
          data: {
            ticketId: id,
            previousDeadline: ticket.deadline,
            newDeadline: new Date(value),
            reason: `관리자 직접 변경: ${reason}`,
            actorId: session.userId,
          },
        });
        break;
    }

    // Apply update + record admin edit in a transaction
    let updated = ticket;
    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        updated = await tx.ticket.update({
          where: { id },
          data: updateData,
        });
      }

      // Record status history for STATUS changes inside the transaction
      if (field === 'STATUS') {
        await tx.ticketStatusHistory.create({
          data: {
            ticketId: id,
            previousStatus: previousValue as TicketStatus,
            newStatus: value as TicketStatus,
            actorId: session.userId,
            actorType: 'USER',
            reason: `관리자 직접 변경: ${reason}`,
          },
        });
      }

      // Record admin edit
      await tx.ticketAdminEdit.create({
        data: {
          ticketId: id,
          adminId: session.userId,
          fieldName: field,
          previousValue,
          newValue: value,
          reason,
        },
      });
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Admin edit failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
