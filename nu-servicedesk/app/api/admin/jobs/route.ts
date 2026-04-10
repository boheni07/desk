// Design Ref: §6 -- GET /api/admin/jobs (DLQ 관리)
// Plan SC: V2.1 DLQ management API

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { serviceDeskQueue } from '@/jobs/queue';

/**
 * GET /api/admin/jobs -- List failed jobs in DLQ. Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    if (session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '관리자만 접근할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const start = parseInt(searchParams.get('start') ?? '0', 10);
    const end = parseInt(searchParams.get('end') ?? '49', 10);

    const failedJobs = await serviceDeskQueue.getFailed(start, end);

    const jobs = failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      data: job.data,
    }));

    const totalFailed = await serviceDeskQueue.getFailedCount();

    // Real BullMQ queue stats
    const queueCounts = await serviceDeskQueue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        total: totalFailed,
        start,
        end,
        queueStats: {
          queueName: 'servicedesk',
          waiting: queueCounts.waiting ?? 0,
          active: queueCounts.active ?? 0,
          completed: queueCounts.completed ?? 0,
          failed: queueCounts.failed ?? 0,
          delayed: queueCounts.delayed ?? 0,
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Admin jobs list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
