// Design Ref: §4 -- POST /api/tickets/[id]/extend (연기요청)
// Plan SC: FR-17 연기요청, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { requestExtend } from '@/lib/ticket-workflow';
import { BusinessError } from '@/lib/errors';

type RouteParams = { params: Promise<{ id: string }> };

const extendSchema = z.object({
  requestedDays: z.number().int().min(1, '1일 이상 입력해 주세요.').max(30, '최대 30일까지 연기 가능합니다.'),
  reason: z.string().min(1, '사유를 입력해 주세요.').max(500, '사유는 500자 이내로 입력해 주세요.'),
});

/**
 * POST /api/tickets/[id]/extend -- 연기요청 (support only)
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

    if (session.type !== 'support') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '지원담당자만 연기요청할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = extendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0].message,
            status: 400,
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const extendRequest = await requestExtend(id, {
      requestedDays: parsed.data.requestedDays,
      reason: parsed.data.reason,
      actorId: session.userId,
    });

    return NextResponse.json({ success: true, data: extendRequest });
  } catch (error) {
    if (error instanceof BusinessError) {
      return NextResponse.json(error.toResponse(), { status: error.status });
    }
    logger.error({ error }, 'Extend request failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
