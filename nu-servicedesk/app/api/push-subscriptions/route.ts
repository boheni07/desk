// Design Ref: §4 -- POST/DELETE /api/push-subscriptions
// Plan SC: FR-23 Push subscription management

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url('유효한 endpoint URL이 필요합니다.'),
    keys: z.object({
      p256dh: z.string().min(1, 'p256dh 키가 필요합니다.'),
      auth: z.string().min(1, 'auth 키가 필요합니다.'),
    }),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url('유효한 endpoint URL이 필요합니다.'),
});

/**
 * POST /api/push-subscriptions -- Register/update push subscription
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '입력값이 올바르지 않습니다.',
            fieldErrors: parsed.error.flatten().fieldErrors,
            status: 400,
          },
        },
        { status: 400 },
      );
    }

    const { endpoint, keys } = parsed.data.subscription;

    // Upsert by endpoint — update keys if changed, update lastUsedAt
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: session.userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        lastUsedAt: new Date(),
      },
      create: {
        userId: session.userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    logger.info({ userId: session.userId }, 'Push subscription registered');

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'POST /api/push-subscriptions failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/push-subscriptions -- Unsubscribe (hard delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '입력값이 올바르지 않습니다.',
            status: 400,
          },
        },
        { status: 400 },
      );
    }

    // Delete the subscription (only if it belongs to this user)
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint: parsed.data.endpoint,
        userId: session.userId,
      },
    });

    logger.info({ userId: session.userId }, 'Push subscription removed');

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'DELETE /api/push-subscriptions failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
