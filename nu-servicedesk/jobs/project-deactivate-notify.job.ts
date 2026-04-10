// Design Ref: §6 -- project-deactivate-notify batch job
// Plan SC: FR-06 프로젝트 종료일 사전 알림

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getNextBusinessDayStart } from '@/lib/business-hours';
import { createNotificationsForUsers } from '@/lib/notification-helper';
import { getHolidays } from './auto-receive.job';

/**
 * project-deactivate-notify: Daily 00:00 KST
 * Find Projects WHERE isActive=true AND endDate = tomorrow (next business day).
 * Notify all project members.
 */
export async function processProjectDeactivateNotify(_job: Job): Promise<void> {
  const now = new Date();
  const holidays = await getHolidays();

  // Get the next business day (tomorrow in business terms)
  const nextBizDay = getNextBusinessDayStart(now, holidays);
  const nextBizDayEnd = new Date(nextBizDay.getTime() + 24 * 60 * 60 * 1000);

  // Find active projects ending on the next business day
  const projects = await prisma.project.findMany({
    where: {
      isActive: true,
      endDate: {
        gte: nextBizDay,
        lt: nextBizDayEnd,
      },
    },
    select: {
      id: true,
      name: true,
      code: true,
      members: {
        select: { userId: true },
      },
    },
  });

  if (projects.length === 0) return;

  let notified = 0;

  for (const project of projects) {
    const memberIds = project.members.map((m) => m.userId);
    if (memberIds.length === 0) continue;

    await createNotificationsForUsers(memberIds, {
      type: 'PROJECT_DEACTIVATED',
      title: '프로젝트 종료 예정',
      body: `프로젝트 '${project.name}' (${project.code})이(가) 내일 종료 예정입니다.`,
      projectId: project.id,
    });

    notified += memberIds.length;
  }

  logger.info({ projects: projects.length, notified }, 'project-deactivate-notify completed');
}
