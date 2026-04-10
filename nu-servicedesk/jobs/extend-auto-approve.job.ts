// Design Ref: §6 -- extend-auto-approve batch job
// Plan SC: FR-17 연기 자동승인 (V2.0: warning notification)

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getBusinessHoursBetween } from '@/lib/business-hours';
import { BUSINESS_RULES } from '@/lib/constants';
import { getHolidays } from '@/lib/holidays';
import {
  createNotification,
  getTicketAssigneeIds,
} from '@/lib/notification-helper';

/**
 * extend-auto-approve: Every 1 min
 * Find ExtendRequests WHERE status='PENDING'.
 * - If elapsed >= WARN_HOURS and < AUTO_APPROVE_HOURS: send warning to supervisors (dedup)
 * - If elapsed >= AUTO_APPROVE_HOURS: auto-approve
 */
export async function processExtendAutoApprove(_job: Job): Promise<void> {
  const now = new Date();

  const pendingRequests = await prisma.extendRequest.findMany({
    where: { status: 'PENDING', isDeleted: false },
    include: {
      ticket: {
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          deadline: true,
          customerUserId: true,
          registeredById: true,
        },
      },
    },
  });

  if (pendingRequests.length === 0) return;

  const holidays = await getHolidays();
  let warned = 0;
  let approved = 0;

  for (const req of pendingRequests) {
    const elapsed = getBusinessHoursBetween(req.createdAt, now, holidays);

    // Phase 1: Auto-approve (>= EXTEND_AUTO_APPROVE_HOURS)
    if (elapsed >= BUSINESS_RULES.EXTEND_AUTO_APPROVE_HOURS) {
      // Auto-approve the extend request
      const transitioned = await prisma.$transaction(async (tx) => {
        // Update ExtendRequest (include isDeleted: true to match approveExtend() behavior)
        await tx.extendRequest.update({
          where: { id: req.id },
          data: {
            status: 'APPROVED',
            autoApproved: true,
            approvedAt: now,
            isDeleted: true,
          },
        });

        // Update ticket deadline (optimistic lock with result validation)
        const result = await tx.$queryRaw<{ id: string }[]>`
          UPDATE tickets
          SET deadline = ${req.newDeadline},
              status = 'IN_PROGRESS'::"TicketStatus",
              updated_at = NOW()
          WHERE id = ${req.ticketId}
            AND status = 'EXTEND_REQUESTED'::"TicketStatus"
          RETURNING id
        `;
        if (result.length === 0) return false;

        // Record deadline history
        await tx.ticketDeadlineHistory.create({
          data: {
            ticketId: req.ticketId,
            previousDeadline: req.ticket.deadline,
            newDeadline: req.newDeadline,
            reason: `연기 자동승인 (${BUSINESS_RULES.EXTEND_AUTO_APPROVE_HOURS}근무시간 경과)`,
            actorId: null,
          },
        });

        // Record status history (EXTEND_REQUESTED -> IN_PROGRESS)
        await tx.ticketStatusHistory.create({
          data: {
            ticketId: req.ticketId,
            previousStatus: 'EXTEND_REQUESTED',
            newStatus: 'IN_PROGRESS',
            actorId: null,
            actorType: 'SYSTEM',
            reason: '연기 자동승인',
          },
        });

        return true;
      });

      if (!transitioned) continue;

      // Notify ticket creator + assignees (outside transaction)
      const notifyIds = new Set<string>();
      if (req.ticket.registeredById) notifyIds.add(req.ticket.registeredById);
      if (req.ticket.customerUserId) notifyIds.add(req.ticket.customerUserId);
      const assigneeIds = await getTicketAssigneeIds(req.ticketId);
      assigneeIds.forEach((id) => notifyIds.add(id));

      for (const userId of notifyIds) {
        await createNotification({
          userId,
          type: 'EXTEND_AUTO_APPROVED',
          title: '연기요청 자동승인',
          body: `티켓 ${req.ticket.ticketNumber}의 연기요청이 ${BUSINESS_RULES.EXTEND_AUTO_APPROVE_HOURS}근무시간 경과로 자동승인되었습니다.`,
          ticketId: req.ticketId,
        });
      }

      approved++;
      continue;
    }

    // Phase 2: Warning (>= WARN_HOURS and < AUTO_APPROVE_HOURS)
    if (elapsed >= BUSINESS_RULES.EXTEND_AUTO_APPROVE_WARN_HOURS) {
      // Check if warning already sent (dedup via Notification table)
      const existingWarning = await prisma.notification.findFirst({
        where: {
          ticketId: req.ticketId,
          type: 'EXTEND_AUTO_APPROVE_SOON',
        },
      });

      if (!existingWarning) {
        if (req.ticket.customerUserId) {
          await createNotification({
            userId: req.ticket.customerUserId,
            type: 'EXTEND_AUTO_APPROVE_SOON',
            title: '연기요청 자동승인 임박',
            body: `티켓 ${req.ticket.ticketNumber}의 연기요청이 ${BUSINESS_RULES.EXTEND_AUTO_APPROVE_HOURS - BUSINESS_RULES.EXTEND_AUTO_APPROVE_WARN_HOURS}시간 내 자동승인됩니다. 검토해 주세요.`,
            ticketId: req.ticketId,
          });
        }
        warned++;
      }
    }
  }

  if (warned > 0 || approved > 0) {
    logger.info({ warned, approved, total: pendingRequests.length }, 'extend-auto-approve completed');
  }
}
