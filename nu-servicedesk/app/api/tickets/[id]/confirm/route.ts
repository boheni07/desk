// Design Ref: §4, §5.2 — POST /api/tickets/[id]/confirm
// Plan SC: FR-14 RECEIVED->IN_PROGRESS, 409 TICKET_ALREADY_DELAYED, 204 멱등성

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { ERRORS } from '@/lib/errors';
import { BUSINESS_RULES } from '@/lib/constants';
import { addBusinessDays } from '@/lib/business-hours';
import { createNotification } from '@/lib/notification-helper';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/tickets/[id]/confirm — 처리 시작 (RECEIVED/DELAYED -> IN_PROGRESS)
 * support/admin only. Uses optimistic locking.
 *
 * V2.0 spec:
 * - If ticket is already IN_PROGRESS: 204 No Content (idempotent)
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

    if (session.type === 'customer') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '지원담당자 또는 관리자만 실행할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;

    // Check current ticket state first to determine if deadline needs renewal
    const currentTicket = await prisma.ticket.findUnique({
      where: { id },
      select: { status: true, deadline: true },
    });

    const isFromDelayed = currentTicket?.status === 'DELAYED';

    // Optimistic locking: try to transition from RECEIVED or DELAYED to IN_PROGRESS
    // When transitioning from DELAYED, extend deadline by +5 business days from now
    // to prevent delay-detect batch from immediately reverting to DELAYED
    const result = isFromDelayed
      ? await (async () => {
          const holidays = await prisma.holiday.findMany({ select: { date: true } });
          const holidayDates = holidays.map(h => h.date);
          const newDeadline = addBusinessDays(new Date(), BUSINESS_RULES.DESIRED_DATE_DEFAULT_DAYS, holidayDates);
          return prisma.$queryRaw<any[]>`
            UPDATE tickets
            SET status = 'IN_PROGRESS'::"TicketStatus",
                deadline = ${newDeadline},
                expected_completion_date = ${newDeadline},
                updated_at = NOW()
            WHERE id = ${id} AND status = 'DELAYED'::"TicketStatus"
            RETURNING *
          `;
        })()
      : await prisma.$queryRaw<any[]>`
          UPDATE tickets
          SET status = 'IN_PROGRESS'::"TicketStatus",
              updated_at = NOW()
          WHERE id = ${id} AND status = 'RECEIVED'::"TicketStatus"
          RETURNING *
        `;

    if (result.length === 0) {
      // Conflict — check current state for appropriate response
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

      // Already IN_PROGRESS -> 204 idempotent
      if (ticket.status === 'IN_PROGRESS') {
        return new NextResponse(null, { status: 204 });
      }

      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATUS', message: `현재 상태(${ticket.status})에서는 처리를 시작할 수 없습니다.`, status: 409 } },
        { status: 409 },
      );
    }

    // Determine the previous status
    const prevStatus = isFromDelayed ? 'DELAYED' : 'RECEIVED';

    // Record status history
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: id,
        previousStatus: prevStatus,
        newStatus: 'IN_PROGRESS',
        actorId: session.userId,
        actorType: 'USER',
        reason: isFromDelayed ? '지연 상태에서 처리 재개 (처리기한 자동 연장)' : '처리 시작',
      },
    });

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

    // Send IN_PROGRESS_TRANSITION notification to the customer who registered the ticket
    if (ticket?.customerUserId) {
      createNotification({
        userId: ticket.customerUserId,
        type: 'IN_PROGRESS_TRANSITION',
        title: '티켓 처리가 시작되었습니다',
        body: `[${ticket.ticketNumber}] 티켓이 처리중 상태로 전환되었습니다.`,
        ticketId: id,
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    logger.error({ error }, 'Ticket confirm failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
