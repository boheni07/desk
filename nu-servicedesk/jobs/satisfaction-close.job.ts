// Design Ref: §6 -- satisfaction-close batch job
// Plan SC: FR-19 만족도 자동종료 (V2.0: reminderSentAt dedup), FR-17 완료요청 3회차 자동승인

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getBusinessHoursBetween } from '@/lib/business-hours';
import { BUSINESS_RULES } from '@/lib/constants';
import { getHolidays } from '@/lib/holidays';
import { createNotification } from '@/lib/notification-helper';
import { approveComplete } from '@/lib/ticket-workflow';


/**
 * satisfaction-close: Every hour
 * Find tickets WHERE status='SATISFACTION_PENDING' AND SatisfactionRating.rating IS NULL.
 * - If elapsed >= SATISFACTION_REMINDER_DAYS (business days): send reminder (dedup via reminderSentAt)
 * - If elapsed >= SATISFACTION_CLOSE_DAYS (business days): auto-close
 */
export async function processSatisfactionClose(_job: Job): Promise<void> {
  const now = new Date();

  // Phase 0: Auto-approve COMPLETE_MAX_ATTEMPTS-th attempt complete requests (Design FR-17: 무한 반려 방지)
  const maxAttemptCrs = await prisma.completeRequest.findMany({
    where: {
      status: 'PENDING',
      attemptNumber: BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS,
    },
    select: { id: true, ticketId: true },
  });

  let autoApproved = 0;
  for (const cr of maxAttemptCrs) {
    try {
      await approveComplete(cr.id, {
        actorId: '',
        actorRole: 'admin', // overridden internally to SYSTEM when autoApproved=true
        autoApproved: true,
      });
      autoApproved++;
    } catch (err) {
      logger.error({ err, completeRequestId: cr.id, ticketId: cr.ticketId }, 'Auto-approve complete (max attempt) failed');
    }
  }

  if (autoApproved > 0) {
    logger.info({ autoApproved }, 'satisfaction-close: auto-approved max-attempt complete requests');
  }

  // Find SATISFACTION_PENDING tickets with no rating
  const tickets = await prisma.ticket.findMany({
    where: {
      status: 'SATISFACTION_PENDING',
      satisfactionRating: {
        rating: null,
        autoCompleted: false,
      },
    },
    select: {
      id: true,
      ticketNumber: true,
      customerUserId: true,
      satisfactionRating: {
        select: {
          id: true,
          reminderSentAt: true,
          createdAt: true,
        },
      },
      statusHistory: {
        where: { newStatus: 'SATISFACTION_PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  if (tickets.length === 0) return;

  const holidays = await getHolidays();
  let reminded = 0;
  let closed = 0;

  for (const ticket of tickets) {
    // Use the date when ticket entered SATISFACTION_PENDING as start point
    const satisfactionStartDate =
      ticket.statusHistory[0]?.createdAt ?? ticket.satisfactionRating?.createdAt ?? now;

    // Convert business hours elapsed to business days
    const elapsedHours = getBusinessHoursBetween(satisfactionStartDate, now, holidays);
    const elapsedDays = elapsedHours / BUSINESS_RULES.WORK_HOURS_PER_DAY;

    // Phase 1: Auto-close (>= SATISFACTION_CLOSE_DAYS)
    if (elapsedDays >= BUSINESS_RULES.SATISFACTION_AUTO_CLOSE_DAYS) {
      // Auto-close: update SatisfactionRating + transition to CLOSED
      await prisma.$transaction(async (tx) => {
        if (ticket.satisfactionRating) {
          await tx.satisfactionRating.update({
            where: { id: ticket.satisfactionRating.id },
            data: { autoCompleted: true },
          });
        }

        const result = await tx.$queryRaw<{ id: string }[]>`
          UPDATE tickets
          SET status = 'CLOSED'::"TicketStatus",
              updated_at = NOW()
          WHERE id = ${ticket.id}
            AND status = 'SATISFACTION_PENDING'::"TicketStatus"
          RETURNING id
        `;
        if (result.length === 0) return; // Already transitioned

        await tx.ticketStatusHistory.create({
          data: {
            ticketId: ticket.id,
            previousStatus: 'SATISFACTION_PENDING',
            newStatus: 'CLOSED',
            actorId: null,
            actorType: 'SYSTEM',
            reason: `만족도 미응답 자동종료 (${BUSINESS_RULES.SATISFACTION_AUTO_CLOSE_DAYS}근무일 경과)`,
          },
        });
      });

      closed++;
      continue;
    }

    // Phase 2: Reminder (>= SATISFACTION_REMINDER_DAYS)
    if (elapsedDays >= BUSINESS_RULES.SATISFACTION_REMINDER_DAYS) {
      // Skip if reminder already sent
      if (ticket.satisfactionRating?.reminderSentAt) {
        continue;
      }

      // Update reminderSentAt
      if (ticket.satisfactionRating) {
        await prisma.satisfactionRating.update({
          where: { id: ticket.satisfactionRating.id },
          data: { reminderSentAt: now },
        });
      }

      // Notify customer
      if (ticket.customerUserId) {
        await createNotification({
          userId: ticket.customerUserId,
          type: 'SATISFACTION_REMINDER',
          title: '만족도 평가 요청',
          body: `티켓 ${ticket.ticketNumber}의 만족도 평가를 부탁드립니다. 미응답 시 ${BUSINESS_RULES.SATISFACTION_AUTO_CLOSE_DAYS}근무일 후 자동종료됩니다.`,
          ticketId: ticket.id,
        });
      }

      reminded++;
    }
  }

  if (reminded > 0 || closed > 0) {
    logger.info({ reminded, closed, total: tickets.length }, 'satisfaction-close completed');
  }
}
