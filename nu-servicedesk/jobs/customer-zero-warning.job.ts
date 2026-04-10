// Design Ref: §6 -- customer-zero-warning batch job
// Plan SC: 고객담당자 0명 경고 (V2.0: 24h dedup)

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createNotificationsForUsers, getAdminUserIds } from '@/lib/notification-helper';

/**
 * customer-zero-warning: Daily 09:00 KST
 * Find active Companies with 0 active customer users.
 * Dedup: skip if CUSTOMER_ZERO_WARNING sent within last 24h.
 */
export async function processCustomerZeroWarning(_job: Job): Promise<void> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Find active companies
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      users: {
        where: { type: 'customer', isActive: true },
        select: { id: true },
      },
    },
  });

  const zeroCustomerCompanies = companies.filter((c) => c.users.length === 0);

  if (zeroCustomerCompanies.length === 0) return;

  const adminIds = await getAdminUserIds();
  if (adminIds.length === 0) return;

  let warned = 0;

  for (const company of zeroCustomerCompanies) {
    // 24h dedup: check if CUSTOMER_ZERO_WARNING was sent recently for any admin
    // We check against the first admin as a representative (all admins get the same notification)
    const recentWarning = await prisma.notification.findFirst({
      where: {
        type: 'CUSTOMER_ZERO_WARNING',
        createdAt: { gte: twentyFourHoursAgo },
        body: { contains: company.name },
      },
    });

    if (recentWarning) continue;

    await createNotificationsForUsers(adminIds, {
      type: 'CUSTOMER_ZERO_WARNING',
      title: '고객담당자 미배정 경고',
      body: `고객사 '${company.name}'에 활성 고객담당자가 없습니다. 확인해 주세요.`,
    });

    warned++;
  }

  if (warned > 0) {
    logger.info({ warned, total: zeroCustomerCompanies.length }, 'customer-zero-warning completed');
  }
}
