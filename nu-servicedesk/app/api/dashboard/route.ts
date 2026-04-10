// Design Ref: §10 -- GET /api/dashboard (role-based dashboard data)
// Plan SC: FR-22 Dashboard, SC-08 RBAC

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { serviceDeskQueue } from '@/jobs/queue';
import { TERMINAL_STATUSES } from '@/lib/ticket-constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

const ticketInclude = {
  project: { select: { id: true, name: true, code: true } },
  assignments: { select: { user: { select: { id: true, name: true } } } },
  category: { select: { id: true, name: true } },
};

// ---------------------------------------------------------------------------
// Admin dashboard data
// ---------------------------------------------------------------------------

async function getAdminDashboard() {
  const { start: todayStart, end: todayEnd } = todayRange();

  const [
    ticketsTotal,
    ticketsOpen,
    ticketsDelayed,
    ticketsToday,
    recentTickets,
    delayedTickets,
    byStatus,
    byPriority,
    secondRejectionRequests,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({
      where: { status: { notIn: TERMINAL_STATUSES } },
    }),
    prisma.ticket.count({
      where: { status: 'DELAYED' },
    }),
    prisma.ticket.count({
      where: {
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: ticketInclude,
    }),
    prisma.ticket.findMany({
      where: { status: 'DELAYED' },
      orderBy: { deadline: 'asc' },
      include: ticketInclude,
    }),
    prisma.ticket.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ['priority'],
      _count: { _all: true },
    }),
    // 완료요청 2차 반려 주의 티켓: COMPLETE_REQUESTED 상태이며 2회차 이상 반려된 것
    prisma.completeRequest.findMany({
      where: {
        status: 'REJECTED',
        attemptNumber: { gte: 2 },
        ticket: { status: 'COMPLETE_REQUESTED' },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        ticket: {
          include: ticketInclude,
        },
      },
    }),
  ]);

  // Avg response time (REGISTERED -> RECEIVED) over last 30 days
  let avgResponseTimeHours = 0;
  try {
    const historyRecords = await prisma.ticketStatusHistory.findMany({
      where: {
        previousStatus: 'REGISTERED',
        newStatus: 'RECEIVED',
        createdAt: { gte: thirtyDaysAgo() },
      },
      select: { ticketId: true, createdAt: true },
    });

    if (historyRecords.length > 0) {
      // For each RECEIVED transition, find the ticket createdAt
      const ticketIds = historyRecords.map((h) => h.ticketId);
      const tickets = await prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, createdAt: true },
      });
      const ticketCreatedMap = new Map(tickets.map((t) => [t.id, t.createdAt]));

      let totalMs = 0;
      let count = 0;
      for (const record of historyRecords) {
        const registered = ticketCreatedMap.get(record.ticketId);
        if (registered) {
          totalMs += record.createdAt.getTime() - registered.getTime();
          count++;
        }
      }
      if (count > 0) {
        avgResponseTimeHours = Math.round((totalMs / count / 3_600_000) * 10) / 10;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to compute avgResponseTime');
  }

  // BullMQ queue stats
  let batchJobStatus: { queueName: string; waiting: number; active: number; failed: number }[] = [];
  try {
    const counts = await serviceDeskQueue.getJobCounts(
      'waiting',
      'active',
      'failed',
    );
    batchJobStatus = [
      {
        queueName: 'servicedesk',
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
      },
    ];
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch BullMQ queue stats');
  }

  return {
    stats: {
      ticketsTotal,
      ticketsOpen,
      ticketsDelayed,
      ticketsToday,
      avgResponseTimeHours,
    },
    byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })),
    byPriority: byPriority.map((g) => ({ priority: g.priority, count: g._count._all })),
    recentTickets,
    delayedTickets,
    secondRejectionTickets: secondRejectionRequests.map((r) => ({
      requestId: r.id,
      attemptNumber: r.attemptNumber,
      rejectReason: r.rejectReason,
      ticket: r.ticket,
    })),
    batchJobStatus,
  };
}

// ---------------------------------------------------------------------------
// Support dashboard data
// ---------------------------------------------------------------------------

async function getSupportDashboard(userId: string) {
  // Get projects this support user is a member of
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const projectIds = memberships.map((m) => m.projectId);

  // Tickets assigned directly to this user (via TicketAssignment)
  const assignedTicketIds = (
    await prisma.ticketAssignment.findMany({
      where: { userId },
      select: { ticketId: true },
    })
  ).map((a) => a.ticketId);

  const [open, inProgress, delayed, assignedTickets, recentActivity] = await Promise.all([
    prisma.ticket.count({
      where: {
        id: { in: assignedTicketIds },
        status: { in: ['REGISTERED', 'RECEIVED'] },
      },
    }),
    prisma.ticket.count({
      where: {
        id: { in: assignedTicketIds },
        status: 'IN_PROGRESS',
      },
    }),
    prisma.ticket.count({
      where: {
        id: { in: assignedTicketIds },
        status: 'DELAYED',
      },
    }),
    prisma.ticket.findMany({
      where: {
        id: { in: assignedTicketIds },
        status: { notIn: TERMINAL_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
      include: ticketInclude,
    }),
    prisma.ticket.findMany({
      where: {
        projectId: { in: projectIds },
        status: { notIn: TERMINAL_STATUSES },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: ticketInclude,
    }),
  ]);

  return {
    myTickets: { open, inProgress, delayed },
    assignedTickets,
    recentActivity,
  };
}

// ---------------------------------------------------------------------------
// Customer dashboard data
// ---------------------------------------------------------------------------

async function getCustomerDashboard(userId: string, companyId: string | null) {
  // Customer's project memberships
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  const projectIds = memberships.map((m) => m.projectId);

  const [open, completed, pendingRating, recentTickets, projects] = await Promise.all([
    prisma.ticket.count({
      where: {
        projectId: { in: projectIds },
        status: { notIn: TERMINAL_STATUSES },
      },
    }),
    prisma.ticket.count({
      where: {
        projectId: { in: projectIds },
        status: 'CLOSED',
      },
    }),
    // SATISFACTION_PENDING with no rating yet
    prisma.ticket.count({
      where: {
        projectId: { in: projectIds },
        status: 'SATISFACTION_PENDING',
        satisfactionRating: null,
      },
    }),
    prisma.ticket.findMany({
      where: {
        projectId: { in: projectIds },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: ticketInclude,
    }),
    prisma.project.findMany({
      where: {
        id: { in: projectIds },
        isActive: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    myTickets: { open, completed, pendingRating },
    recentTickets,
    projects,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    let data: unknown;

    switch (session.type) {
      case 'admin':
        data = await getAdminDashboard();
        break;
      case 'support':
        data = await getSupportDashboard(session.userId);
        break;
      case 'customer':
        data = await getCustomerDashboard(session.userId, session.companyId);
        break;
      default:
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: '알 수 없는 사용자 유형입니다.', status: 403 } },
          { status: 403 },
        );
    }

    return NextResponse.json({ success: true, data, userType: session.type });
  } catch (error) {
    logger.error({ error }, 'Dashboard API error');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
