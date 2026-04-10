// Design Ref: §4 — GET/PUT /api/tickets/[id]
// Plan SC: FR-10 티켓 조회, FR-11 티켓 수정 제한, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { TERMINAL_STATUSES } from '@/lib/ticket-constants';

type RouteParams = { params: Promise<{ id: string }> };

const updateTicketSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).optional(),
});

/**
 * GET /api/tickets/[id] — 티켓 상세
 * Includes: comments (10 latest), attachments, status history, assignments,
 * extendRequests, completeRequests, satisfactionRating
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            company: { select: { id: true, name: true } },
            members: {
              where: { userId: session.userId },
              take: 1,
            },
          },
        },
        category: { select: { id: true, name: true } },
        registeredBy: { select: { id: true, name: true, type: true } },
        customerUser: { select: { id: true, name: true } },
        assignments: {
          include: {
            user: { select: { id: true, name: true, type: true } },
          },
          orderBy: { assignedAt: 'asc' },
        },
        statusHistory: {
          include: {
            actor: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        comments: {
          where: {
            isDeleted: false,
            // Hide INTERNAL comments from customer
            ...(session.type === 'customer' ? { type: 'PUBLIC' } : {}),
          },
          include: {
            author: { select: { id: true, name: true, type: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        attachments: {
          where: { commentId: null },
          include: {
            uploader: { select: { id: true, name: true } },
          },
          orderBy: { uploadedAt: 'desc' },
        },
        adminEdits: {
          include: {
            admin: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        extendRequests: {
          where: { isDeleted: false },
          include: {
            requester: { select: { id: true, name: true } },
            approver: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        completeRequests: {
          include: {
            requester: { select: { id: true, name: true } },
            approver: { select: { id: true, name: true } },
          },
          orderBy: { attemptNumber: 'desc' },
        },
        satisfactionRating: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: customer and support can only see tickets in their assigned projects
    if (session.type === 'customer' || session.type === 'support') {
      const isMember = ticket.project.members.length > 0;
      if (!isMember) {
        return NextResponse.json(
          { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: '해당 프로젝트에 접근 권한이 없습니다.', status: 403 } },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    logger.error({ error }, 'Ticket detail failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/tickets/[id] — 티켓 수정 (title, content, categoryId, priority)
 * support/admin only, not allowed when CLOSED/CANCELLED
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

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: customer can edit only their own REGISTERED tickets
    if (session.type === 'customer') {
      if (ticket.status !== 'REGISTERED' || ticket.registeredById !== session.userId) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: '본인이 등록한 REGISTERED 상태의 티켓만 수정할 수 있습니다.', status: 403 } },
          { status: 403 },
        );
      }
    }

    if (TERMINAL_STATUSES.includes(ticket.status)) {
      return NextResponse.json(
        { success: false, error: { code: 'TICKET_NOT_EDITABLE', message: '종료되거나 취소된 티켓은 수정할 수 없습니다.', status: 422 } },
        { status: 422 },
      );
    }

    const body = await request.json();
    const parsed = updateTicketSchema.safeParse(body);

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

    const data = parsed.data;

    // Verify categoryId if provided
    if (data.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
      if (!category || !category.isActive) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_CATEGORY', message: '유효하지 않은 카테고리입니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.priority !== undefined && { priority: data.priority }),
      },
      include: {
        project: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Ticket update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
