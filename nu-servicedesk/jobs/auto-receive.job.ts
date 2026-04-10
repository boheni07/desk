// Design Ref: §6 -- auto-receive batch job
// Plan SC: FR-13 자동접수 (4 근무시간 경과 시 REGISTERED -> RECEIVED)

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getBusinessHoursBetween } from '@/lib/business-hours';
import { BUSINESS_RULES } from '@/lib/constants';
import { createNotification, getTicketAssigneeIds } from '@/lib/notification-helper';

/**
 * auto-receive: Every 1 min
 * Find tickets WHERE status='REGISTERED' AND business hours since createdAt >= AUTO_RECEIVE_HOURS.
 * Transition REGISTERED -> RECEIVED using optimistic lock.
 */
export async function processAutoReceive(_job: Job): Promise<void> {
  const now = new Date();

  // Fetch all REGISTERED tickets
  const tickets = await prisma.ticket.findMany({
    where: { status: 'REGISTERED' },
    select: { id: true, ticketNumber: true, createdAt: true },
  });

  if (tickets.length === 0) return;

  // Fetch holidays for business hours calculation
  const holidays = await getHolidays();

  let processed = 0;

  for (const ticket of tickets) {
    const elapsed = getBusinessHoursBetween(ticket.createdAt, now, holidays);

    if (elapsed < BUSINESS_RULES.AUTO_RECEIVE_HOURS) {
      continue;
    }

    // Optimistic lock: atomic UPDATE with status check
    const result = await prisma.$queryRaw<any[]>`
      UPDATE tickets
      SET status = 'RECEIVED'::"TicketStatus",
          received_at = NOW(),
          updated_at = NOW()
      WHERE id = ${ticket.id} AND status = 'REGISTERED'::"TicketStatus"
      RETURNING id
    `;

    if (result.length === 0) {
      // Already transitioned by someone else -- skip
      continue;
    }

    // Record status history
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        previousStatus: 'REGISTERED',
        newStatus: 'RECEIVED',
        actorId: null,
        actorType: 'SYSTEM',
        reason: `자동접수 (${BUSINESS_RULES.AUTO_RECEIVE_HOURS}근무시간 경과)`,
      },
    });

    // Notify assignees (if any)
    const assigneeIds = await getTicketAssigneeIds(ticket.id);
    for (const userId of assigneeIds) {
      await createNotification({
        userId,
        type: 'TICKET_RECEIVED',
        title: '티켓 자동접수',
        body: `티켓 ${ticket.ticketNumber}이(가) ${BUSINESS_RULES.AUTO_RECEIVE_HOURS}근무시간 경과로 자동접수되었습니다.`,
        ticketId: ticket.id,
      });
    }

    processed++;
  }

  if (processed > 0) {
    logger.info({ processed, total: tickets.length }, 'auto-receive completed');
  }
}

// ---------------------------------------------------------------------------
// Shared holiday helper (used across multiple jobs)
// ---------------------------------------------------------------------------

export async function getHolidays(): Promise<Date[]> {
  const currentYear = new Date().getFullYear();
  const holidays = await prisma.holiday.findMany({
    where: { year: { in: [currentYear - 1, currentYear, currentYear + 1] } },
    select: { date: true },
  });
  return holidays.map((h) => h.date);
}
