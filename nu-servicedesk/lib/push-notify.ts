// Design Ref: §6 -- Web Push (VAPID) implementation
// Plan SC: FR-23 Push 알림, 트랜잭션 외부 비동기 발송

import webpush from 'web-push';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import type { NotificationType } from '@prisma/client';

// Initialize VAPID on module load
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@servicedesk.local'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
}

/**
 * Send push to a single subscription.
 * Returns 'sent' on success, 'expired' if the subscription is no longer valid (410/404).
 */
export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<'sent' | 'expired'> {
  const pushSub = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };

  try {
    await webpush.sendNotification(
      pushSub,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192.png',
        badge: payload.badge || '/badge-72.png',
        url: payload.url || '/',
        tag: payload.tag || 'servicedesk',
      }),
    );
    return 'sent';
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 410 || statusCode === 404) {
      return 'expired';
    }
    logger.error({ error, endpoint: subscription.endpoint }, 'Push send failed');
    throw error;
  }
}

/**
 * Send push to all subscriptions for a user.
 * Returns count of successful sends.
 * Expired subscriptions are deleted from DB.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return 0;

  let sentCount = 0;

  for (const sub of subscriptions) {
    try {
      const result = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );

      if (result === 'expired') {
        // Delete expired subscription
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      } else {
        sentCount++;
        // Update lastUsedAt
        await prisma.pushSubscription
          .update({
            where: { id: sub.id },
            data: { lastUsedAt: new Date() },
          })
          .catch(() => {});
      }
    } catch {
      // Individual send failure should not stop others
    }
  }

  return sentCount;
}

/**
 * Send push to multiple users in parallel.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;

  await Promise.allSettled(userIds.map((userId) => sendPushToUser(userId, payload)));
}

/**
 * Build a push payload from notification type and ticket context.
 */
export function buildPushPayload(
  type: NotificationType,
  title: string,
  body: string,
  ticketId?: string,
): PushPayload {
  let url = '/dashboard';
  if (ticketId) {
    url = `/tickets/${ticketId}`;
  }

  // Map notification types to tags for grouping
  let tag = 'servicedesk';
  if (type.startsWith('TICKET_')) tag = 'ticket';
  else if (type.startsWith('EXTEND_')) tag = 'extend';
  else if (type.startsWith('COMPLETE_')) tag = 'complete';
  else if (type === 'COMMENT_CREATED') tag = 'comment';
  else if (type === 'BATCH_JOB_FAILED') tag = 'system';

  return { title, body, url, tag };
}
