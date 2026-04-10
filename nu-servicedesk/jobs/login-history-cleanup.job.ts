// Design Ref: §6 -- login-history-cleanup batch job (V2.1 new)
// Plan SC: 개인정보보호법 로그인 이력 보존기간 준수

import type { Job } from 'bullmq';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';

/**
 * login-history-cleanup: Daily 02:00 KST
 * Delete LoginHistory WHERE createdAt < now - LOGIN_HISTORY_RETAIN_YEARS years.
 */
export async function processLoginHistoryCleanup(_job: Job): Promise<void> {
  const cutoff = new Date();
  // LOGIN_HISTORY_RETAIN_YEARS is 1 year; convert to days for Date arithmetic
  const retainDays = BUSINESS_RULES.LOGIN_HISTORY_RETAIN_YEARS * 365;
  cutoff.setDate(cutoff.getDate() - retainDays);

  // Design §E: LIMIT 10000 per run to avoid long lock times on large tables
  const result = await prisma.$executeRaw`
    DELETE FROM login_history
    WHERE id IN (
      SELECT id FROM login_history
      WHERE created_at < ${cutoff}
      LIMIT 10000
    )
  `;

  logger.info(
    { deleted: result, retainYears: BUSINESS_RULES.LOGIN_HISTORY_RETAIN_YEARS },
    'login-history-cleanup completed',
  );
}
