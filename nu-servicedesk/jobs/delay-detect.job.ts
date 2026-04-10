// Design Ref: §6 -- delay-detect batch job
// Plan SC: FR-14 지연감지 (deadline < now -> DELAYED)

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createNotification, getTicketAssigneeIds } from '@/lib/notification-helper';

/**
 * delay-detect: Every 1 min
 * Find tickets WHERE status IN ('RECEIVED','IN_PROGRESS') AND deadline < now.
 * Transition to DELAYED using optimistic lock.
 */
export async function processDelayDetect(_job: Job): Promise<void> {
  const now = new Date();

  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ['RECEIVED', 'IN_PROGRESS'] },
      deadline: { lt: now },
    },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      customerUserId: true,
    },
  });

  if (tickets.length === 0) return;

  let processed = 0;

  for (const ticket of tickets) {
    // Optimistic lock: only update if status hasn't changed
    const result = await prisma.$queryRaw<any[]>`
      UPDATE tickets
      SET status = 'DELAYED'::"TicketStatus",
          updated_at = NOW()
      WHERE id = ${ticket.id}
        AND status = ${ticket.status}::"TicketStatus"
        AND deadline < NOW()
      RETURNING id
    `;

    if (result.length === 0) continue;

    // Record status history
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        previousStatus: ticket.status,
        newStatus: 'DELAYED',
        actorId: null,
        actorType: 'SYSTEM',
        reason: '처리기한 초과로 자동 지연전환',
      },
    });

    // Notify assignees
    const assigneeIds = await getTicketAssigneeIds(ticket.id);
    for (const userId of assigneeIds) {
      await createNotification({
        userId,
        type: 'DELAYED_TRANSITION',
        title: '티켓 지연',
        body: `티켓 ${ticket.ticketNumber}이(가) 처리기한을 초과하여 지연 상태로 전환되었습니다.`,
        ticketId: ticket.id,
      });
    }

    // Notify customer
    if (ticket.customerUserId) {
      await createNotification({
        userId: ticket.customerUserId,
        type: 'DELAYED_TRANSITION',
        title: '티켓 지연 안내',
        body: `티켓 ${ticket.ticketNumber}이(가) 처리기한을 초과하여 지연 상태로 전환되었습니다.`,
        ticketId: ticket.id,
      });
    }

    processed++;
  }

  if (processed > 0) {
    logger.info({ processed, total: tickets.length }, 'delay-detect completed');
  }
}
