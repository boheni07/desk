// Design Ref: §4 -- POST /api/notifications/[id]/read
// Plan SC: FR-23 알림 개별 읽음 처리

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/notifications/[id]/read
 * Mark a single notification as read.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const { id } = await params;

    // Only mark as read if it belongs to the current user
    const result = await prisma.notification.updateMany({
      where: {
        id,
        userId: session.userId,
        isDeleted: false,
      },
      data: {
        isRead: true,
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '알림을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'POST /api/notifications/[id]/read failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
