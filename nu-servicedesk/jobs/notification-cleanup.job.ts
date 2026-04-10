// Design Ref: §6 -- notification-cleanup batch job (V2.0 new)
// Plan SC: 알림 보존기한 준수

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';

/**
 * notification-cleanup: Daily 03:00 KST
 * Delete Notification WHERE createdAt < now - NOTIFICATION_RETAIN_DAYS days.
 */
export async function processNotificationCleanup(_job: Job): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BUSINESS_RULES.NOTIFICATION_RETAIN_DAYS);

  const result = await prisma.notification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });

  logger.info(
    { deleted: result.count, retainDays: BUSINESS_RULES.NOTIFICATION_RETAIN_DAYS },
    'notification-cleanup completed',
  );
}
