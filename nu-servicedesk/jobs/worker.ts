// Design Ref: §6 -- BullMQ Worker + DLQ Handler
// Plan SC: Module 6 -- process 10 batch jobs, DLQ admin notification

import { Worker, type Job } from 'bullmq';
import { logger } from '@/lib/logger';
import { scheduleRecurringJobs, redisConnection } from './queue';
import { createNotificationsForUsers, getAdminUserIds } from '@/lib/notification-helper';

// Import all job processors
import { processAutoReceive } from './auto-receive.job';
import { processDelayDetect } from './delay-detect.job';
import { processExtendAutoApprove } from './extend-auto-approve.job';
import { processSatisfactionClose } from './satisfaction-close.job';
import { processProjectDeactivateNotify } from './project-deactivate-notify.job';
import { processCustomerZeroWarning } from './customer-zero-warning.job';
import { processStaleEscalation } from './stale-escalation.job';
import { processNotificationCleanup } from './notification-cleanup.job';
import { processPushCleanup } from './push-cleanup.job';
import { processLoginHistoryCleanup } from './login-history-cleanup.job';

// ---------------------------------------------------------------------------
// Job name -> processor mapping
// ---------------------------------------------------------------------------

type JobProcessor = (job: Job) => Promise<void>;

const processors: Record<string, JobProcessor> = {
  'auto-receive': processAutoReceive,
  'delay-detect': processDelayDetect,
  'extend-auto-approve': processExtendAutoApprove,
  'satisfaction-close': processSatisfactionClose,
  'project-deactivate-notify': processProjectDeactivateNotify,
  'customer-zero-warning': processCustomerZeroWarning,
  'stale-escalation': processStaleEscalation,
  'notification-cleanup': processNotificationCleanup,
  'push-cleanup': processPushCleanup,
  'login-history-cleanup': processLoginHistoryCleanup,
};

// ---------------------------------------------------------------------------
// Worker instance
// ---------------------------------------------------------------------------

let worker: Worker | null = null;

/**
 * Start the BullMQ worker and schedule recurring jobs.
 * Called from instrumentation.ts on Node.js runtime startup.
 */
export function startWorkers(): void {
  if (worker) {
    logger.warn('Workers already started, skipping');
    return;
  }

  worker = new Worker(
    'servicedesk',
    async (job: Job) => {
      const processor = processors[job.name];
      if (!processor) {
        logger.warn({ jobName: job.name, jobId: job.id }, 'Unknown job name, skipping');
        return;
      }

      const startTime = Date.now();
      logger.info({ jobName: job.name, jobId: job.id }, 'Job started');

      try {
        await processor(job);
        logger.info(
          { jobName: job.name, jobId: job.id, durationMs: Date.now() - startTime },
          'Job completed',
        );
      } catch (error) {
        logger.error(
          { jobName: job.name, jobId: job.id, error, durationMs: Date.now() - startTime },
          'Job processing error',
        );
        throw error; // rethrow so BullMQ tracks retry/failure
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // max 10 jobs per second
      },
    },
  );

  // DLQ handler: notify admins on permanent failure (attempts exhausted)
  worker.on('failed', async (job: Job | undefined, error: Error) => {
    if (!job) return;

    if (job.attemptsMade >= (job.opts?.attempts ?? 3)) {
      logger.error(
        { jobName: job.name, jobId: job.id, attemptsMade: job.attemptsMade, error: error.message },
        'Job permanently failed (DLQ)',
      );

      try {
        const adminIds = await getAdminUserIds();
        if (adminIds.length > 0) {
          await createNotificationsForUsers(adminIds, {
            type: 'BATCH_JOB_FAILED',
            title: '배치 작업 실패',
            body: `작업 '${job.name}' (ID: ${job.id})이 ${job.attemptsMade}회 시도 후 실패했습니다. 오류: ${error.message}`,
          });
        }
      } catch (notifyError) {
        logger.error({ notifyError, jobName: job.name }, 'Failed to notify admins about DLQ job');
      }
    }
  });

  worker.on('error', (error) => {
    logger.error({ error }, 'Worker error');
  });

  // Startup recovery: ensure recurring jobs are scheduled
  scheduleRecurringJobs().catch((error) => {
    logger.error({ error }, 'Failed to schedule recurring jobs on startup');
  });

  logger.info('BullMQ worker started for queue "servicedesk"');
}

/**
 * Gracefully stop the worker. Waits for in-progress jobs to complete (max 30s).
 * Called from instrumentation.ts on SIGTERM.
 */
export async function stopWorkers(): Promise<void> {
  if (!worker) return;

  logger.info('Stopping BullMQ worker...');
  await worker.close();
  worker = null;
  logger.info('BullMQ worker stopped');
}
