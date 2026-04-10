// Design Ref: §4 -- GET /api/notifications
// Plan SC: FR-23 알림 목록 조회 (페이지네이션, 필터)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';
import type { Prisma } from '@prisma/client';

// Allowlist for notification type validation
const VALID_NOTIFICATION_TYPES = new Set([
  'TICKET_CREATED', 'TICKET_RECEIVED',
  'EXTEND_REQUESTED', 'EXTEND_AUTO_APPROVE_SOON', 'EXTEND_APPROVED', 'EXTEND_REJECTED', 'EXTEND_AUTO_APPROVED',
  'COMPLETE_REQUESTED', 'COMPLETE_APPROVED', 'COMPLETE_REJECTED', 'COMPLETE_2ND_REJECTED', 'COMPLETE_AUTO_APPROVED',
  'COMMENT_CREATED', 'IN_PROGRESS_TRANSITION', 'SATISFACTION_REMINDER', 'DELAYED_TRANSITION', 'STALE_ESCALATION',
  'PROJECT_DEACTIVATED', 'CUSTOMER_ZERO_WARNING', 'PROXY_APPROVAL_COMPLETED', 'BATCH_JOB_FAILED',
]);

/**
 * GET /api/notifications
 * List notifications for current user (paginated).
 * Query params: page, limit, isRead (true/false/all), type, category (ticket/system)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      BUSINESS_RULES.PAGE_SIZE_MAX,
      Math.max(1, parseInt(searchParams.get('limit') || String(BUSINESS_RULES.PAGE_SIZE_DEFAULT), 10)),
    );
    const isReadParam = searchParams.get('isRead'); // 'true', 'false', or null (all)
    const typeParam = searchParams.get('type');
    const categoryParam = searchParams.get('category'); // 'ticket' or 'system'

    // Build where clause
    const where: Prisma.NotificationWhereInput = {
      userId: session.userId,
      isDeleted: false,
    };

    if (isReadParam === 'true') {
      where.isRead = true;
    } else if (isReadParam === 'false') {
      where.isRead = false;
    }

    if (typeParam) {
      if (!VALID_NOTIFICATION_TYPES.has(typeParam)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: '유효하지 않은 알림 유형입니다.', status: 400 } },
          { status: 400 },
        );
      }
      where.type = typeParam as Prisma.NotificationWhereInput['type'];
    }

    // Category filter: ticket or system types
    if (categoryParam === 'ticket') {
      where.type = {
        in: [
          'TICKET_CREATED', 'TICKET_RECEIVED',
          'EXTEND_REQUESTED', 'EXTEND_AUTO_APPROVE_SOON', 'EXTEND_APPROVED', 'EXTEND_REJECTED', 'EXTEND_AUTO_APPROVED',
          'COMPLETE_REQUESTED', 'COMPLETE_APPROVED', 'COMPLETE_REJECTED', 'COMPLETE_2ND_REJECTED', 'COMPLETE_AUTO_APPROVED',
          'COMMENT_CREATED', 'IN_PROGRESS_TRANSITION', 'SATISFACTION_REMINDER', 'DELAYED_TRANSITION', 'STALE_ESCALATION',
        ],
      };
    } else if (categoryParam === 'system') {
      where.type = {
        in: ['PROJECT_DEACTIVATED', 'CUSTOMER_ZERO_WARNING', 'PROXY_APPROVAL_COMPLETED', 'BATCH_JOB_FAILED'],
      };
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          ticket: {
            select: { id: true, ticketNumber: true, title: true },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'GET /api/notifications failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
