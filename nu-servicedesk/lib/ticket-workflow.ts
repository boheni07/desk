// Design Ref: §1.2 -- lib/ticket-workflow.ts [V2.0]
// Plan SC: FR-17 연기 워크플로우, FR-18 완료 워크플로우, SC-08 RBAC

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { canTransition, getNextStatus } from '@/lib/ticket-state-machine';
import { TICKET_EVENTS } from '@/lib/ticket-constants';
import { BUSINESS_RULES } from '@/lib/constants';
import { addBusinessDays, getBusinessHoursBetween } from '@/lib/business-hours';
import { getHolidays } from '@/lib/holidays';
import { ERRORS, BusinessError } from '@/lib/errors';
import {
  createNotification,
  createNotificationsForUsers,
  getSupervisorUserIds,
  getTicketAssigneeIds,
} from '@/lib/notification-helper';
import type { UserType } from '@/types/auth';
import type { ExtendRequest, CompleteRequest, TicketStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowContext {
  actorId: string;
  actorRole: UserType;
  autoApproved?: boolean;
}

// ---------------------------------------------------------------------------
// Extend Workflow
// ---------------------------------------------------------------------------

/**
 * Request deadline extension for a ticket.
 * Support role only, from IN_PROGRESS or DELAYED status.
 */
export async function requestExtend(
  ticketId: string,
  params: {
    requestedDays: number;
    reason: string;
    actorId: string;
  },
): Promise<ExtendRequest> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, ticketNumber: true, status: true, deadline: true },
  });

  if (!ticket) {
    throw new BusinessError('NOT_FOUND', 404, '티켓을 찾을 수 없습니다.');
  }

  // Check state machine allows REQUEST_EXTEND
  const check = canTransition(ticket.status, TICKET_EVENTS.REQUEST_EXTEND, 'support');
  if (!check.allowed) {
    throw new BusinessError('INVALID_STATUS', 422, check.reason || '현재 상태에서 연기요청할 수 없습니다.');
  }

  // Pre-compute holidays once (avoid duplicate DB call)
  const holidays = await getHolidays();

  // Check extend deadline buffer (must request before deadline - 8 business hours)
  if (ticket.deadline) {
    const hoursUntilDeadline = getBusinessHoursBetween(new Date(), ticket.deadline, holidays);
    if (hoursUntilDeadline < BUSINESS_RULES.EXTEND_DEADLINE_BUFFER_HOURS) {
      throw ERRORS.EXTEND_DEADLINE_PASSED();
    }
  }

  // Calculate new deadline: current deadline + requestedDays business days
  const baseDeadline = ticket.deadline ?? new Date();
  const newDeadline = addBusinessDays(baseDeadline, params.requestedDays, holidays);

  // Transaction: duplicate check + create ExtendRequest + transition ticket
  // findFirst inside tx to prevent TOCTOU race condition
  const extendRequest = await prisma.$transaction(async (tx) => {
    const existingExtend = await tx.extendRequest.findFirst({
      where: { ticketId, isDeleted: false, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (existingExtend) {
      throw ERRORS.EXTEND_ALREADY_USED();
    }

    const er = await tx.extendRequest.create({
      data: {
        ticketId,
        requesterId: params.actorId,
        newDeadline,
        reason: params.reason,
        status: 'PENDING',
      },
    });

    // Transition ticket to EXTEND_REQUESTED (optimistic lock)
    const extResult = await tx.$queryRaw<{ id: string }[]>`
      UPDATE tickets
      SET status = 'EXTEND_REQUESTED'::"TicketStatus",
          updated_at = NOW()
      WHERE id = ${ticketId}
        AND status = ${ticket.status}::"TicketStatus"
      RETURNING id
    `;
    if (extResult.length === 0) {
      throw new BusinessError('CONFLICT', 409, '티켓 상태가 변경되었습니다. 다시 시도해주세요.');
    }

    await tx.ticketStatusHistory.create({
      data: {
        ticketId,
        previousStatus: ticket.status,
        newStatus: 'EXTEND_REQUESTED',
        actorId: params.actorId,
        actorType: 'USER',
        reason: `연기요청: ${params.reason} (+${params.requestedDays}근무일)`,
      },
    });

    return er;
  });

  // Notify customer/supervisor (outside transaction)
  const supervisorIds = await getSupervisorUserIds(ticketId);
  const notifyIds = new Set<string>(supervisorIds);

  const ticketDetail = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { customerUserId: true },
  });
  if (ticketDetail?.customerUserId) {
    notifyIds.add(ticketDetail.customerUserId);
  }

  for (const userId of notifyIds) {
    await createNotification({
      userId,
      type: 'EXTEND_REQUESTED',
      title: '연기요청',
      body: `티켓 ${ticket.ticketNumber}에 대한 연기요청(+${params.requestedDays}근무일)이 접수되었습니다.`,
      ticketId,
    });
  }

  return extendRequest;
}

/**
 * Approve an extend request.
 * Customer/admin role. Updates deadline and transitions back to IN_PROGRESS.
 */
export async function approveExtend(
  extendRequestId: string,
  ctx: WorkflowContext,
): Promise<void> {
  const er = await prisma.extendRequest.findUnique({
    where: { id: extendRequestId },
    include: {
      ticket: {
        select: { id: true, ticketNumber: true, status: true, deadline: true, registeredById: true, customerUserId: true },
      },
    },
  });

  if (!er) {
    throw new BusinessError('NOT_FOUND', 404, '연기요청을 찾을 수 없습니다.');
  }

  if (er.status !== 'PENDING') {
    throw ERRORS.EXTEND_ALREADY_PROCESSED();
  }

  const event = ctx.autoApproved ? TICKET_EVENTS.AUTO_APPROVE_EXTEND : TICKET_EVENTS.APPROVE_EXTEND;
  const actorRole = ctx.autoApproved ? 'SYSTEM' as const : ctx.actorRole;

  const check = canTransition(er.ticket.status, event, actorRole);
  if (!check.allowed) {
    throw new BusinessError('INVALID_STATUS', 422, check.reason || '현재 상태에서 연기승인할 수 없습니다.');
  }

  await prisma.$transaction(async (tx) => {
    // Update ExtendRequest
    await tx.extendRequest.update({
      where: { id: extendRequestId },
      data: {
        status: 'APPROVED',
        approverId: ctx.autoApproved ? null : ctx.actorId,
        autoApproved: ctx.autoApproved ?? false,
        approvedAt: new Date(),
        isDeleted: true,
      },
    });

    // Update ticket deadline (optimistic lock)
    const apvResult = await tx.$queryRaw<{ id: string }[]>`
      UPDATE tickets
      SET deadline = ${er.newDeadline},
          status = 'IN_PROGRESS'::"TicketStatus",
          updated_at = NOW()
      WHERE id = ${er.ticketId}
        AND status = 'EXTEND_REQUESTED'::"TicketStatus"
      RETURNING id
    `;
    if (apvResult.length === 0) {
      throw new BusinessError('CONFLICT', 409, '티켓 상태가 변경되었습니다. 다시 시도해주세요.');
    }

    // Record deadline history
    await tx.ticketDeadlineHistory.create({
      data: {
        ticketId: er.ticketId,
        previousDeadline: er.ticket.deadline,
        newDeadline: er.newDeadline,
        reason: ctx.autoApproved ? '연기 자동승인' : '연기승인',
        actorId: ctx.autoApproved ? null : ctx.actorId,
      },
    });

    // Record status history
    await tx.ticketStatusHistory.create({
      data: {
        ticketId: er.ticketId,
        previousStatus: 'EXTEND_REQUESTED',
        newStatus: 'IN_PROGRESS',
        actorId: ctx.autoApproved ? null : ctx.actorId,
        actorType: ctx.autoApproved ? 'SYSTEM' : 'USER',
        reason: ctx.autoApproved ? '연기 자동승인' : '연기승인',
      },
    });
  });

  // Notify (outside transaction)
  const notificationType = ctx.autoApproved ? 'EXTEND_AUTO_APPROVED' as const : 'EXTEND_APPROVED' as const;
  const notifyIds = new Set<string>();
  if (er.ticket.registeredById) notifyIds.add(er.ticket.registeredById);
  if (er.ticket.customerUserId) notifyIds.add(er.ticket.customerUserId);
  const assigneeIds = await getTicketAssigneeIds(er.ticketId);
  assigneeIds.forEach((id) => notifyIds.add(id));
  // Remove the actor from notification recipients
  notifyIds.delete(ctx.actorId);

  for (const userId of notifyIds) {
    await createNotification({
      userId,
      type: notificationType,
      title: ctx.autoApproved ? '연기 자동승인' : '연기승인',
      body: `티켓 ${er.ticket.ticketNumber}의 연기요청이 ${ctx.autoApproved ? '자동' : ''}승인되었습니다.`,
      ticketId: er.ticketId,
    });
  }
}

/**
 * Reject an extend request.
 * Customer/admin role. Ticket returns to previous status (IN_PROGRESS or DELAYED).
 */
export async function rejectExtend(
  extendRequestId: string,
  ctx: WorkflowContext & { rejectReason: string },
): Promise<void> {
  const er = await prisma.extendRequest.findUnique({
    where: { id: extendRequestId },
    include: {
      ticket: {
        select: { id: true, ticketNumber: true, status: true },
      },
    },
  });

  if (!er) {
    throw new BusinessError('NOT_FOUND', 404, '연기요청을 찾을 수 없습니다.');
  }

  if (er.status !== 'PENDING') {
    throw ERRORS.EXTEND_ALREADY_PROCESSED();
  }

  const check = canTransition(er.ticket.status, TICKET_EVENTS.REJECT_EXTEND, ctx.actorRole);
  if (!check.allowed) {
    throw new BusinessError('INVALID_STATUS', 422, check.reason || '현재 상태에서 연기반려할 수 없습니다.');
  }

  // The previous status before EXTEND_REQUESTED was IN_PROGRESS or DELAYED.
  // Retrieve from status history.
  const previousHistory = await prisma.ticketStatusHistory.findFirst({
    where: { ticketId: er.ticketId, newStatus: 'EXTEND_REQUESTED' },
    orderBy: { createdAt: 'desc' },
    select: { previousStatus: true },
  });
  const returnStatus: TicketStatus = previousHistory?.previousStatus ?? 'IN_PROGRESS';

  await prisma.$transaction(async (tx) => {
    await tx.extendRequest.update({
      where: { id: extendRequestId },
      data: {
        status: 'REJECTED',
        approverId: ctx.actorId,
        rejectReason: ctx.rejectReason,
        isDeleted: true,
      },
    });

    const rejResult = await tx.$queryRaw<{ id: string }[]>`
      UPDATE tickets
      SET status = ${returnStatus}::"TicketStatus",
          updated_at = NOW()
      WHERE id = ${er.ticketId}
        AND status = 'EXTEND_REQUESTED'::"TicketStatus"
      RETURNING id
    `;
    if (rejResult.length === 0) {
      throw new BusinessError('CONFLICT', 409, '티켓 상태가 변경되었습니다. 다시 시도해주세요.');
    }

    await tx.ticketStatusHistory.create({
      data: {
        ticketId: er.ticketId,
        previousStatus: 'EXTEND_REQUESTED',
        newStatus: returnStatus,
        actorId: ctx.actorId,
        actorType: 'USER',
        reason: `연기반려: ${ctx.rejectReason}`,
      },
    });
  });

  // Notify requester
  await createNotification({
    userId: er.requesterId,
    type: 'EXTEND_REJECTED',
    title: '연기요청 반려',
    body: `티켓 ${er.ticket.ticketNumber}의 연기요청이 반려되었습니다. 사유: ${ctx.rejectReason}`,
    ticketId: er.ticketId,
  });
}

// ---------------------------------------------------------------------------
// Complete Workflow
// ---------------------------------------------------------------------------

/**
 * Request ticket completion.
 * Support/admin role, from IN_PROGRESS or DELAYED status.
 */
export async function requestComplete(
  ticketId: string,
  ctx: WorkflowContext & { content?: string },
): Promise<CompleteRequest> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNumber: true,
      status: true,
      completeRequestCount: true,
      customerUserId: true,
    },
  });

  if (!ticket) {
    throw new BusinessError('NOT_FOUND', 404, '티켓을 찾을 수 없습니다.');
  }

  const check = canTransition(ticket.status, TICKET_EVENTS.REQUEST_COMPLETE, ctx.actorRole);
  if (!check.allowed) {
    throw new BusinessError('INVALID_STATUS', 422, check.reason || '현재 상태에서 완료요청할 수 없습니다.');
  }

  // Check max attempts
  if (ticket.completeRequestCount >= BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS) {
    throw ERRORS.COMPLETE_MAX_REACHED();
  }

  const attemptNumber = ticket.completeRequestCount + 1;

  const completeRequest = await prisma.$transaction(async (tx) => {
    const cr = await tx.completeRequest.create({
      data: {
        ticketId,
        requesterId: ctx.actorId,
        attemptNumber,
        content: ctx.content ?? '',
        status: 'PENDING',
        previousStatus: ticket.status,
      },
    });

    const crResult = await tx.$queryRaw<{ id: string }[]>`
      UPDATE tickets
      SET status = 'COMPLETE_REQUESTED'::"TicketStatus",
          complete_request_count = ${attemptNumber},
          updated_at = NOW()
      WHERE id = ${ticketId}
        AND status = ${ticket.status}::"TicketStatus"
      RETURNING id
    `;
    if (crResult.length === 0) {
      throw new BusinessError('CONFLICT', 409, '티켓 상태가 변경되었습니다. 다시 시도해주세요.');
    }

    await tx.ticketStatusHistory.create({
      data: {
        ticketId,
        previousStatus: ticket.status,
        newStatus: 'COMPLETE_REQUESTED',
        actorId: ctx.actorId,
        actorType: 'USER',
        reason: `완료요청 (${attemptNumber}회차)`,
      },
    });

    return cr;
  });

  // 3rd attempt: auto-approve immediately
  if (attemptNumber === BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS) {
    await approveComplete(completeRequest.id, {
      actorId: ctx.actorId,
      actorRole: ctx.actorRole,
      autoApproved: true,
    });
    return completeRequest;
  }

  // Notify customer/supervisors
  const notifyIds = new Set<string>();
  if (ticket.customerUserId) notifyIds.add(ticket.customerUserId);
  const supervisorIds = await getSupervisorUserIds(ticketId);
  supervisorIds.forEach((id) => notifyIds.add(id));
  notifyIds.delete(ctx.actorId);

  for (const userId of notifyIds) {
    await createNotification({
      userId,
      type: 'COMPLETE_REQUESTED',
      title: '완료요청',
      body: `티켓 ${ticket.ticketNumber}에 대한 완료요청(${attemptNumber}회차)이 접수되었습니다.`,
      ticketId,
    });
  }

  return completeRequest;
}

/**
 * Approve a complete request.
 * Customer/admin role. Ticket transitions to SATISFACTION_PENDING.
 */
export async function approveComplete(
  completeRequestId: string,
  ctx: WorkflowContext,
): Promise<void> {
  const cr = await prisma.completeRequest.findUnique({
    where: { id: completeRequestId },
    include: {
      ticket: {
        select: { id: true, ticketNumber: true, status: true, registeredById: true, customerUserId: true },
      },
    },
  });

  if (!cr) {
    throw new BusinessError('NOT_FOUND', 404, '완료요청을 찾을 수 없습니다.');
  }

  if (cr.status !== 'PENDING') {
    throw new BusinessError('ALREADY_PROCESSED', 409, '이미 처리된 완료요청입니다.');
  }

  const event = ctx.autoApproved ? TICKET_EVENTS.AUTO_COMPLETE : TICKET_EVENTS.APPROVE_COMPLETE;
  const actorRole = ctx.autoApproved ? 'SYSTEM' as const : ctx.actorRole;

  const check = canTransition(cr.ticket.status, event, actorRole);
  if (!check.allowed) {
    throw new BusinessError('INVALID_STATUS', 422, check.reason || '현재 상태에서 완료승인할 수 없습니다.');
  }

  const targetStatus = getNextStatus(cr.ticket.status, event) ?? 'SATISFACTION_PENDING';

  await prisma.$transaction(async (tx) => {
    await tx.completeRequest.update({
      where: { id: completeRequestId },
      data: {
        status: 'APPROVED',
        approverId: ctx.autoApproved ? null : ctx.actorId,
        autoApproved: ctx.autoApproved ?? false,
        approvedAt: new Date(),
      },
    });

    const acResult = await tx.$queryRaw<{ id: string }[]>`
      UPDATE tickets
      SET status = ${targetStatus}::"TicketStatus",
          updated_at = NOW()
      WHERE id = ${cr.ticketId}
        AND status = 'COMPLETE_REQUESTED'::"TicketStatus"
      RETURNING id
    `;
    if (acResult.length === 0) {
      throw new BusinessError('CONFLICT', 409, '티켓 상태가 변경되었습니다. 다시 시도해주세요.');
    }

    await tx.ticketStatusHistory.create({
      data: {
        ticketId: cr.ticketId,
        previousStatus: 'COMPLETE_REQUESTED',
        newStatus: targetStatus,
        actorId: ctx.autoApproved ? null : ctx.actorId,
        actorType: ctx.autoApproved ? 'SYSTEM' : 'USER',
        reason: ctx.autoApproved ? '완료 자동승인' : '완료승인',
      },
    });

    // Create SatisfactionRating stub if not exists
    const existing = await tx.satisfactionRating.findUnique({
      where: { ticketId: cr.ticketId },
    });
    if (!existing) {
      await tx.satisfactionRating.create({
        data: {
          ticketId: cr.ticketId,
          userId: null,
          rating: null,
        },
      });
    }
  });

  // Notify (outside transaction)
  const notifyIds = new Set<string>();
  if (cr.ticket.registeredById) notifyIds.add(cr.ticket.registeredById);
  if (cr.ticket.customerUserId) notifyIds.add(cr.ticket.customerUserId);
  const assigneeIds = await getTicketAssigneeIds(cr.ticketId);
  assigneeIds.forEach((id) => notifyIds.add(id));
  notifyIds.delete(ctx.actorId);

  const notificationType = ctx.autoApproved ? 'COMPLETE_AUTO_APPROVED' as const : 'COMPLETE_APPROVED' as const;

  for (const userId of notifyIds) {
    await createNotification({
      userId,
      type: notificationType,
      title: ctx.autoApproved ? '완료 자동승인' : '완료승인',
      body: `티켓 ${cr.ticket.ticketNumber}의 완료요청이 ${ctx.autoApproved ? '자동' : ''}승인되었습니다.`,
      ticketId: cr.ticketId,
    });
  }
}

/**
 * Reject a complete request.
 * Customer/admin role. Ticket returns to previousStatus.
 * On 2nd rejection, escalates to supervisor.
 */
export async function rejectComplete(
  completeRequestId: string,
  ctx: WorkflowContext & { rejectReason: string },
): Promise<void> {
  const cr = await prisma.completeRequest.findUnique({
    where: { id: completeRequestId },
    include: {
      ticket: {
        select: { id: true, ticketNumber: true, status: true },
      },
    },
  });

  if (!cr) {
    throw new BusinessError('NOT_FOUND', 404, '완료요청을 찾을 수 없습니다.');
  }

  if (cr.status !== 'PENDING') {
    throw new BusinessError('ALREADY_PROCESSED', 409, '이미 처리된 완료요청입니다.');
  }

  const check = canTransition(
    cr.ticket.status,
    TICKET_EVENTS.REJECT_COMPLETE,
    ctx.actorRole,
    { attemptNumber: cr.attemptNumber },
  );
  if (!check.allowed) {
    throw new BusinessError('INVALID_STATUS', 422, check.reason || '현재 상태에서 완료반려할 수 없습니다.');
  }

  // V2.0: Return to previousStatus stored in CompleteRequest
  const returnStatus: TicketStatus = cr.previousStatus;

  await prisma.$transaction(async (tx) => {
    await tx.completeRequest.update({
      where: { id: completeRequestId },
      data: {
        status: 'REJECTED',
        approverId: ctx.actorId,
        rejectReason: ctx.rejectReason,
      },
    });

    const rcResult = await tx.$queryRaw<{ id: string }[]>`
      UPDATE tickets
      SET status = ${returnStatus}::"TicketStatus",
          updated_at = NOW()
      WHERE id = ${cr.ticketId}
        AND status = 'COMPLETE_REQUESTED'::"TicketStatus"
      RETURNING id
    `;
    if (rcResult.length === 0) {
      throw new BusinessError('CONFLICT', 409, '티켓 상태가 변경되었습니다. 다시 시도해주세요.');
    }

    await tx.ticketStatusHistory.create({
      data: {
        ticketId: cr.ticketId,
        previousStatus: 'COMPLETE_REQUESTED',
        newStatus: returnStatus,
        actorId: ctx.actorId,
        actorType: 'USER',
        reason: `완료반려 (${cr.attemptNumber}회차): ${ctx.rejectReason}`,
      },
    });
  });

  // After restore, check if deadline exceeded → auto-transition to DELAYED
  if (returnStatus !== 'DELAYED') {
    const restoredTicket = await prisma.ticket.findUnique({
      where: { id: cr.ticketId },
      select: { deadline: true },
    });
    if (restoredTicket?.deadline && new Date() > restoredTicket.deadline) {
      await prisma.$transaction(async (tx) => {
        const dlResult = await tx.$queryRaw<{ id: string }[]>`
          UPDATE tickets
          SET status = 'DELAYED'::"TicketStatus",
              updated_at = NOW()
          WHERE id = ${cr.ticketId}
            AND status = ${returnStatus}::"TicketStatus"
          RETURNING id
        `;
        if (dlResult.length === 0) return; // Already transitioned by another process
        await tx.ticketStatusHistory.create({
          data: {
            ticketId: cr.ticketId,
            previousStatus: returnStatus,
            newStatus: 'DELAYED',
            actorId: null,
            actorType: 'SYSTEM',
            reason: '완료반려 후 기한 초과로 자동 지연 전환',
          },
        });
      });
    }
  }

  // Notify the requester (support who requested completion)
  await createNotification({
    userId: cr.requesterId,
    type: 'COMPLETE_REJECTED',
    title: '완료요청 반려',
    body: `티켓 ${cr.ticket.ticketNumber}의 완료요청(${cr.attemptNumber}회차)이 반려되었습니다. 사유: ${ctx.rejectReason}`,
    ticketId: cr.ticketId,
  });

  // On 2nd rejection, escalate to admin users (관리책임자)
  if (cr.attemptNumber === 2) {
    const adminUsers = await prisma.user.findMany({
      where: { type: 'admin', isActive: true },
      select: { id: true },
    });
    const adminIds = adminUsers.map((u) => u.id);
    if (adminIds.length > 0) {
      await createNotificationsForUsers(adminIds, {
        type: 'COMPLETE_2ND_REJECTED',
        title: '완료요청 2차 반려 에스컬레이션',
        body: `티켓 ${cr.ticket.ticketNumber}의 완료요청이 2회 반려되었습니다. 확인이 필요합니다.`,
        ticketId: cr.ticketId,
      });
    }
  }
}

// Helpers — getHolidays() moved to lib/holidays.ts (shared with batch jobs)
