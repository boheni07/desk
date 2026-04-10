// Design Ref: §4 -- POST /api/notifications/read-all
// Plan SC: FR-23 알림 일괄 읽음 처리

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * POST /api/notifications/read-all
 * Mark all unread notifications as read for current user.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId: session.userId,
        isRead: false,
        isDeleted: false,
      },
      data: {
        isRead: true,
      },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    logger.error({ error }, 'POST /api/notifications/read-all failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
