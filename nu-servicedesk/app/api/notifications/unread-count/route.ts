// Design Ref: §4 -- GET /api/notifications/unread-count
// Plan SC: FR-23 알림 벨 배지 카운트

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

/**
 * GET /api/notifications/unread-count
 * Returns count of unread, non-deleted notifications for current user.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const count = await prisma.notification.count({
      where: {
        userId: session.userId,
        isRead: false,
        isDeleted: false,
      },
    });

    return NextResponse.json({ success: true, count });
  } catch (error) {
    logger.error({ error }, 'GET /api/notifications/unread-count failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
