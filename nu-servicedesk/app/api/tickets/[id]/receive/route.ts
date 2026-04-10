// Design Ref: §4 — POST /api/tickets/[id]/receive (수동접수)
// Plan SC: FR-13 수동접수, SC-08 RBAC, 낙관적 락

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { canTransition } from '@/lib/ticket-state-machine';
import { TICKET_EVENTS } from '@/lib/ticket-constants';
import { ERRORS } from '@/lib/errors';
import { createNotification } from '@/lib/notification-helper';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/receive — 수동접수 (REGISTERED -> RECEIVED)
 * support/admin only. Uses optimistic locking.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    // Role check via state machine
    const transitionCheck = canTransition('REGISTERED', TICKET_EVENTS.RECEIVE, session.type);
    if (!transitionCheck.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: transitionCheck.reason || '권한이 없습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;

    // Parse optional expectedCompletionDate from request body
    let expectedCompletionDate: string | undefined;
    try {
      const body = await request.json();
      if (body.expectedCompletionDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.expectedCompletionDate)) {
          return NextResponse.json(
            { success: false, error: { code: 'VALIDATION_ERROR', message: 'expectedCompletionDate 형식은 YYYY-MM-DD입니다.', status: 400 } },
            { status: 400 },
          );
        }
        expectedCompletionDate = body.expectedCompletionDate;
      }
    } catch {
      // No body or invalid JSON — proceed without expectedCompletionDate
    }

    // Determine deadline value: provided expectedCompletionDate or ticket's desiredDate
    let deadlineValue: Date | null = null;
    if (expectedCompletionDate) {
      deadlineValue = new Date(expectedCompletionDate);
    } else {
      const existing = await prisma.ticket.findUnique({
        where: { id },
        select: { desiredDate: true },
      });
      if (existing?.desiredDate) {
        deadlineValue = existing.desiredDate;
      }
    }

    // Optimistic locking: atomic UPDATE with status check
    // Design Ref: §5.2 — $queryRaw RETURNING * pattern
    const result = deadlineValue
      ? await prisma.$queryRaw<any[]>`
          UPDATE tickets
          SET status = 'RECEIVED'::"TicketStatus",
              received_at = NOW(),
              deadline = ${deadlineValue},
              expected_completion_date = ${deadlineValue},
              updated_at = NOW()
          WHERE id = ${id} AND status = 'REGISTERED'::"TicketStatus"
          RETURNING *
        `
      : await prisma.$queryRaw<any[]>`
          UPDATE tickets
          SET status = 'RECEIVED'::"TicketStatus",
              received_at = NOW(),
              updated_at = NOW()
          WHERE id = ${id} AND status = 'REGISTERED'::"TicketStatus"
          RETURNING *
        `;

    if (result.length === 0) {
      // Check current state
      const ticket = await prisma.ticket.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!ticket) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
          { status: 404 },
        );
      }

      if (ticket.status === 'RECEIVED' || ticket.status === 'IN_PROGRESS') {
        // Already received — idempotent
        const err = ERRORS.TICKET_ALREADY_RECEIVED();
        return NextResponse.json(err.toResponse(), { status: err.status });
      }

      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATUS', message: `현재 상태(${ticket.status})에서는 접수할 수 없습니다.`, status: 409 } },
        { status: 409 },
      );
    }

    // Record status history and assignment in transaction
    await prisma.$transaction([
      prisma.ticketStatusHistory.create({
        data: {
          ticketId: id,
          previousStatus: 'REGISTERED',
          newStatus: 'RECEIVED',
          actorId: session.userId,
          actorType: 'USER',
          reason: '수동접수',
        },
      }),
      // Assign current user as handler
      prisma.ticketAssignment.upsert({
        where: {
          ticketId_userId: { ticketId: id, userId: session.userId },
        },
        update: {},
        create: {
          ticketId: id,
          userId: session.userId,
        },
      }),
    ]);

    // Return updated ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        assignments: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    // Send TICKET_RECEIVED notification to the person who created the ticket
    if (ticket?.registeredById) {
      createNotification({
        userId: ticket.registeredById,
        type: 'TICKET_RECEIVED',
        title: '티켓이 접수되었습니다',
        body: `[${ticket.ticketNumber}] 티켓이 접수 처리되었습니다.`,
        ticketId: id,
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    logger.error({ error }, 'Ticket receive failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
