// Design Ref: §6 -- stale-escalation batch job
// Plan SC: FR-14 장기체류 에스컬레이션 (V2.0: lastEscalationAt dedup)

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getBusinessHoursBetween } from '@/lib/business-hours';
import { BUSINESS_RULES } from '@/lib/constants';
import { getHolidays } from '@/lib/holidays';
import { createNotificationsForUsers, getSupervisorUserIds } from '@/lib/notification-helper';

/**
 * stale-escalation: Daily 09:00 KST
 * Find DELAYED tickets where lastEscalationAt is null or > STALE_ESCALATION_CHECK_HOURS ago.
 * If delayed >= STALE_ESCALATION_DAYS business days: escalate to supervisors.
 */
export async function processStaleEscalation(_job: Job): Promise<void> {
  const now = new Date();
  const checkWindowAgo = new Date(now.getTime() - BUSINESS_RULES.STALE_ESCALATION_CHECK_HOURS * 60 * 60 * 1000);

  const tickets = await prisma.ticket.findMany({
    where: {
      status: 'DELAYED',
      OR: [
        { lastEscalationAt: null },
        { lastEscalationAt: { lt: checkWindowAgo } },
      ],
    },
    select: {
      id: true,
      ticketNumber: true,
      deadline: true,
      statusHistory: {
        where: { newStatus: 'DELAYED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  if (tickets.length === 0) return;

  const holidays = await getHolidays();
  let escalated = 0;

  for (const ticket of tickets) {
    // Calculate business days since ticket became DELAYED
    const delayedSince = ticket.statusHistory[0]?.createdAt ?? ticket.deadline ?? now;
    const elapsedHours = getBusinessHoursBetween(delayedSince, now, holidays);
    const elapsedDays = elapsedHours / BUSINESS_RULES.WORK_HOURS_PER_DAY;

    if (elapsedDays < BUSINESS_RULES.STALE_ESCALATION_DAYS) {
      continue;
    }

    // Get supervisors for this ticket's project
    const supervisorIds = await getSupervisorUserIds(ticket.id);
    if (supervisorIds.length === 0) continue;

    await createNotificationsForUsers(supervisorIds, {
      type: 'STALE_ESCALATION',
      title: '장기 지연 에스컬레이션',
      body: `티켓 ${ticket.ticketNumber}이(가) ${Math.floor(elapsedDays)}근무일 이상 지연 상태입니다. 확인해 주세요.`,
      ticketId: ticket.id,
    });

    // Update lastEscalationAt
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { lastEscalationAt: now },
    });

    escalated++;
  }

  if (escalated > 0) {
    logger.info({ escalated, total: tickets.length }, 'stale-escalation completed');
  }
}
