// Design Ref: §6 -- BullMQ Queue + Recurring Job Scheduler
// Plan SC: Module 6 -- 10 batch jobs, exponential backoff, DLQ

import { Queue, type JobsOptions } from 'bullmq';
import { logger } from '@/lib/logger';

// BullMQ requires its own IORedis connection (cannot share with session redis)
// REDIS_URL 파싱으로 REDIS_HOST/REDIS_PORT 별도 설정 불필요
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const { host, port, password } = parseRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');

const redisConnection = {
  host,
  port,
  ...(password ? { password } : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// ---------------------------------------------------------------------------
// Default job options: exponential backoff, DLQ on permanent failure
// ---------------------------------------------------------------------------

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 }, // 2s -> 4s -> 8s
  removeOnComplete: { count: 100 },
  removeOnFail: false, // preserve failed jobs in DLQ for inspection
};

// ---------------------------------------------------------------------------
// Single shared queue with job name as discriminator
// ---------------------------------------------------------------------------

export const serviceDeskQueue = new Queue('servicedesk', {
  connection: redisConnection,
  defaultJobOptions,
});

export { redisConnection };

// ---------------------------------------------------------------------------
// Recurring job definitions
// ---------------------------------------------------------------------------

interface RecurringJobDef {
  name: string;
  cron: string;
  tz: string;
}

const RECURRING_JOBS: RecurringJobDef[] = [
  // Every 1 minute
  { name: 'auto-receive',          cron: '*/1 * * * *', tz: 'Asia/Seoul' },
  { name: 'delay-detect',          cron: '*/1 * * * *', tz: 'Asia/Seoul' },
  { name: 'extend-auto-approve',   cron: '*/1 * * * *', tz: 'Asia/Seoul' },

  // Hourly
  { name: 'satisfaction-close',    cron: '0 * * * *',   tz: 'Asia/Seoul' },

  // Daily
  { name: 'project-deactivate-notify', cron: '0 0 * * *', tz: 'Asia/Seoul' },  // 00:00 KST
  { name: 'customer-zero-warning',     cron: '0 9 * * *', tz: 'Asia/Seoul' },  // 09:00 KST
  { name: 'stale-escalation',          cron: '0 9 * * *', tz: 'Asia/Seoul' },  // 09:00 KST
  { name: 'notification-cleanup',      cron: '0 3 * * *', tz: 'Asia/Seoul' },  // 03:00 KST
  { name: 'push-cleanup',             cron: '0 3 * * *', tz: 'Asia/Seoul' },  // 03:00 KST
  { name: 'login-history-cleanup',     cron: '30 3 * * *', tz: 'Asia/Seoul' }, // 03:30 KST
];

/**
 * Schedule all recurring jobs using BullMQ repeat (cron).
 * Idempotent: removes stale repeatables, then re-adds.
 */
export async function scheduleRecurringJobs(): Promise<void> {
  // Remove all existing repeatable jobs to avoid duplicates
  const existing = await serviceDeskQueue.getRepeatableJobs();
  for (const job of existing) {
    await serviceDeskQueue.removeRepeatableByKey(job.key);
  }

  // Schedule fresh
  for (const def of RECURRING_JOBS) {
    await serviceDeskQueue.add(def.name, {}, {
      repeat: { pattern: def.cron, tz: def.tz },
      ...defaultJobOptions,
    });
    logger.info({ job: def.name, cron: def.cron }, 'Scheduled recurring job');
  }

  logger.info({ count: RECURRING_JOBS.length }, 'All recurring jobs scheduled');
}
