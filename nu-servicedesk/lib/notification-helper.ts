// Design Ref: §6 -- Notification helper (DB + Web Push)
// Plan SC: FR-23 알림 시스템, 트랜잭션 규칙 준수
// Push is sent OUTSIDE transaction, failure must not affect DB success

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendPushToUser, sendPushToUsers, buildPushPayload } from '@/lib/push-notify';
import type { NotificationType } from '@prisma/client';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  ticketId?: string;
  projectId?: string;
  linkUrl?: string;
}

/**
 * Derive a link URL from notification params.
 */
function deriveLink(params: Omit<CreateNotificationParams, 'userId'>): string | null {
  if (params.ticketId) return `/tickets/${params.ticketId}`;
  if (params.projectId) return `/projects/${params.projectId}`;
  return null;
}

/**
 * Create a single notification in the DB, then send Web Push.
 * Push is sent outside any transaction context; push failure does not affect DB.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        ticketId: params.ticketId ?? null,
        linkUrl: params.linkUrl ?? deriveLink(params),
      },
    });
  } catch (error) {
    logger.error({ error, params }, 'Failed to create notification');
    return; // If DB insert fails, skip push
  }

  // Send push outside transaction — fire-and-forget
  try {
    const payload = buildPushPayload(params.type, params.title, params.body, params.ticketId);
    await sendPushToUser(params.userId, payload);
  } catch (error) {
    logger.warn({ error, userId: params.userId }, 'Push send failed (non-critical)');
  }
}

/**
 * Create notifications for multiple users (same content, different userId).
 * After DB insert, sends Web Push to all users in parallel.
 */
export async function createNotificationsForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>,
): Promise<void> {
  if (userIds.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: params.type,
        title: params.title,
        body: params.body,
        ticketId: params.ticketId ?? null,
        linkUrl: params.linkUrl ?? deriveLink(params),
      })),
    });
  } catch (error) {
    logger.error({ error, userIds, params }, 'Failed to create notifications for users');
    return; // If DB insert fails, skip push
  }

  // Send push outside transaction — fire-and-forget
  try {
    const payload = buildPushPayload(params.type, params.title, params.body, params.ticketId);
    await sendPushToUsers(userIds, payload);
  } catch (error) {
    logger.warn({ error, userIds }, 'Push send to users failed (non-critical)');
  }
}

/**
 * Create a notification within a Prisma transaction context.
 * Use this when notification must be atomic with other DB operations.
 */
export async function createNotificationInTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  params: CreateNotificationParams,
): Promise<void> {
  await tx.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      ticketId: params.ticketId ?? null,
      linkUrl: params.linkUrl ?? deriveLink(params),
    },
  });
}

/**
 * Get all active admin user IDs.
 */
export async function getAdminUserIds(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { type: 'admin', isActive: true },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}

/**
 * Get supervisor user IDs for a given ticket's project.
 * Supervisors = main_support members of the ticket's project.
 */
export async function getSupervisorUserIds(ticketId: string): Promise<string[]> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { projectId: true },
  });
  if (!ticket) return [];

  const members = await prisma.projectMember.findMany({
    where: { projectId: ticket.projectId, role: 'main_support' },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

/**
 * Get the assignee user IDs for a ticket.
 */
export async function getTicketAssigneeIds(ticketId: string): Promise<string[]> {
  const assignments = await prisma.ticketAssignment.findMany({
    where: { ticketId },
    select: { userId: true },
  });
  return assignments.map((a) => a.userId);
}
