// Design Ref: §6 -- push-cleanup batch job (V2.0 new)
// Plan SC: Push 구독 만료 정리

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';

/**
 * push-cleanup: Daily 03:00 KST
 * Delete PushSubscription WHERE lastUsedAt < now - PUSH_SUBSCRIPTION_EXPIRE_DAYS days.
 */
export async function processPushCleanup(_job: Job): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - BUSINESS_RULES.PUSH_SUBSCRIPTION_EXPIRE_DAYS);

  const result = await prisma.pushSubscription.deleteMany({
    where: {
      lastUsedAt: { lt: cutoff },
    },
  });

  logger.info(
    { deleted: result.count, expireDays: BUSINESS_RULES.PUSH_SUBSCRIPTION_EXPIRE_DAYS },
    'push-cleanup completed',
  );
}
