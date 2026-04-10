// Design Ref: §4 — POST /api/tickets/[id]/cancel
// Plan SC: FR-22 취소, SC-08 RBAC, 낙관적 락

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { CANCELLABLE_STATUSES } from '@/lib/ticket-constants';
import { ERRORS } from '@/lib/errors';

type RouteParams = { params: Promise<{ id: string }> };

const cancelSchema = z.object({
  reason: z.string().min(1, '취소 사유를 입력해 주세요.'),
});

/**
 * POST /api/tickets/[id]/cancel — 티켓 취소 (admin only)
 * REGISTERED/RECEIVED/IN_PROGRESS/DELAYED/EXTEND_REQUESTED -> CANCELLED
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

    const { id } = await params;

    // Fetch ticket BEFORE role check so we can verify ownership
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { status: true, registeredById: true },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: admin can cancel any CANCELLABLE_STATUSES ticket;
    // support/customer can cancel only their own REGISTERED tickets
    if (session.type === 'admin') {
      if (!CANCELLABLE_STATUSES.includes(ticket.status)) {
        const err = ERRORS.TICKET_CANCEL_NOT_ALLOWED();
        return NextResponse.json(err.toResponse(), { status: err.status });
      }
    } else if (session.type === 'support' || session.type === 'customer') {
      if (ticket.status !== 'REGISTERED' || ticket.registeredById !== session.userId) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: '본인이 등록한 REGISTERED 상태의 티켓만 취소할 수 있습니다.', status: 403 } },
          { status: 403 },
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '티켓을 취소할 권한이 없습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = cancelSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, status: 400 } },
        { status: 400 },
      );
    }

    const { reason } = parsed.data;

    const previousStatus = ticket.status;

    // Atomic: optimistic lock UPDATE + status history in single transaction
    const txResult = await prisma.$transaction(async (tx) => {
      const result = await tx.$queryRaw<{ id: string }[]>`
        UPDATE tickets
        SET status = 'CANCELLED'::"TicketStatus",
            updated_at = NOW()
        WHERE id = ${id} AND status = ${previousStatus}::"TicketStatus"
        RETURNING id
      `;

      if (result.length === 0) return null;

      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          previousStatus,
          newStatus: 'CANCELLED',
          actorId: session.userId,
          actorType: 'USER',
          reason,
        },
      });

      return result;
    });

    if (!txResult) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: '티켓 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.', status: 409 } },
        { status: 409 },
      );
    }

    const updated = await prisma.ticket.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Ticket cancel failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
