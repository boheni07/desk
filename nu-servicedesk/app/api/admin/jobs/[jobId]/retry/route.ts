// Design Ref: §6 -- POST /api/admin/jobs/[jobId]/retry (DLQ 재시도)
// Plan SC: V2.1 DLQ management API

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { serviceDeskQueue } from '@/jobs/queue';

type RouteParams = { params: Promise<{ jobId: string }> };

/**
 * POST /api/admin/jobs/[jobId]/retry -- Retry a specific failed job. Admin only.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    const { jobId } = await params;

    const job = await serviceDeskQueue.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '작업을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const state = await job.getState();
    if (state !== 'failed') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATE', message: `작업 상태가 'failed'가 아닙니다. 현재: ${state}`, status: 422 } },
        { status: 422 },
      );
    }

    await job.retry();

    logger.info({ jobId, jobName: job.name, adminId: session.userId }, 'Job retried by admin');

    return NextResponse.json({
      success: true,
      data: {
        message: '작업이 재시도 큐에 추가되었습니다.',
        jobId,
        jobName: job.name,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Admin job retry failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
