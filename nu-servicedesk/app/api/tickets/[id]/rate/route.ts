// Design Ref: §4 — POST /api/tickets/[id]/rate
// Plan SC: FR-19 만족도 평가, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

type RouteParams = { params: Promise<{ id: string }> };

const rateSchema = z.object({
  rating: z.number().int().min(1, '1~5 사이의 점수를 입력해 주세요.').max(5, '1~5 사이의 점수를 입력해 주세요.'),
  comment: z.string().max(500, '코멘트는 500자 이내로 입력해 주세요.').optional(),
});

/**
 * POST /api/tickets/[id]/rate — 만족도 평가 (customer, SATISFACTION_PENDING only)
 * Updates SatisfactionRating, transitions to CLOSED.
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

    if (session.type !== 'customer' && session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '고객담당자 또는 관리자만 평가할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;

    const body = await request.json();
    const parsed = rateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, status: 400 } },
        { status: 400 },
      );
    }

    const { rating, comment } = parsed.data;

    // Verify ticket is in SATISFACTION_PENDING status
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

    if (ticket.status !== 'SATISFACTION_PENDING') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATUS', message: '만족도 평가는 만족도대기 상태에서만 가능합니다.', status: 422 } },
        { status: 422 },
      );
    }

    // Check if already rated
    const existingRating = await prisma.satisfactionRating.findUnique({
      where: { ticketId: id },
    });

    if (existingRating?.rating !== null) {
      return NextResponse.json(
        { success: false, error: { code: 'ALREADY_RATED', message: '이미 평가가 완료되었습니다.', status: 409 } },
        { status: 409 },
      );
    }

    // Transaction: update rating + transition ticket to CLOSED
    await prisma.$transaction(async (tx) => {
      // Update satisfaction rating
      await tx.satisfactionRating.update({
        where: { ticketId: id },
        data: {
          rating,
          comment: comment ?? null,
          userId: session.userId,
        },
      });

      // Transition ticket to CLOSED via optimistic locking
      const result = await tx.$queryRaw<{ id: string }[]>`
        UPDATE tickets
        SET status = 'CLOSED'::"TicketStatus",
            updated_at = NOW()
        WHERE id = ${id} AND status = 'SATISFACTION_PENDING'::"TicketStatus"
        RETURNING id
      `;

      if (result.length === 0) {
        throw new Error('Ticket status changed during rating');
      }

      // Record status history
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: id,
          previousStatus: 'SATISFACTION_PENDING',
          newStatus: 'CLOSED',
          actorId: session.userId,
          actorType: 'USER',
          reason: `만족도 평가 완료 (${rating}점)`,
        },
      });
    });

    const updated = await prisma.ticket.findUnique({
      where: { id },
      include: {
        satisfactionRating: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Ticket rate failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
