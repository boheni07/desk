// Design Ref: §4 -- POST /api/tickets/[id]/complete/approve (완료승인)
// Plan SC: FR-18 완료승인, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { approveComplete } from '@/lib/ticket-workflow';
import { BusinessError } from '@/lib/errors';

type RouteParams = { params: Promise<{ id: string }> };

const approveSchema = z.object({
  completeRequestId: z.string().min(1, '완료요청 ID가 필요합니다.'),
});

/**
 * POST /api/tickets/[id]/complete/approve -- 완료승인 (customer/admin)
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

    if (session.type !== 'customer' && session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '고객담당자 또는 관리자만 승인할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    await params;
    const body = await request.json();
    const parsed = approveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, status: 400 } },
        { status: 400 },
      );
    }

    await approveComplete(parsed.data.completeRequestId, {
      actorId: session.userId,
      actorRole: session.type,
    });

    return NextResponse.json({ success: true, data: { message: '완료요청이 승인되었습니다.' } });
  } catch (error) {
    if (error instanceof BusinessError) {
      return NextResponse.json(error.toResponse(), { status: error.status });
    }
    logger.error({ error }, 'Complete approve failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
