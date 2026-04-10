// Design Ref: §4 -- POST /api/tickets/[id]/complete (완료요청)
// Plan SC: FR-18 완료요청, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { requestComplete } from '@/lib/ticket-workflow';
import { BusinessError } from '@/lib/errors';

type RouteParams = { params: Promise<{ id: string }> };

const completeSchema = z.object({
  content: z.string().max(2000, '내용은 2000자 이내로 입력해 주세요.').optional(),
});

/**
 * POST /api/tickets/[id]/complete -- 완료요청 (support/admin)
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

    if (session.type !== 'support' && session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '지원담당자 또는 관리자만 완료요청할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = completeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, status: 400 } },
        { status: 400 },
      );
    }

    const completeRequest = await requestComplete(id, {
      actorId: session.userId,
      actorRole: session.type,
      content: parsed.data.content,
    });

    return NextResponse.json({ success: true, data: completeRequest });
  } catch (error) {
    if (error instanceof BusinessError) {
      return NextResponse.json(error.toResponse(), { status: error.status });
    }
    logger.error({ error }, 'Complete request failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
