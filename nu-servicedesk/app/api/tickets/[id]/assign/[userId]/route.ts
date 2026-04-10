// Design Ref: §4 — DELETE /api/tickets/[id]/assign/[userId]
// Plan SC: FR-12 담당자 배정 해제, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

type RouteParams = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/tickets/[id]/assign/[userId] — 배정 해제 (admin/support)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
        { success: false, error: { code: 'FORBIDDEN', message: '관리자 또는 지원담당자만 배정을 해제할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id, userId } = await params;

    // Verify ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Try to delete assignment
    try {
      await prisma.ticketAssignment.delete({
        where: {
          ticketId_userId: { ticketId: id, userId },
        },
      });
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '해당 배정 정보를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    logger.error({ error }, 'Ticket unassign failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
