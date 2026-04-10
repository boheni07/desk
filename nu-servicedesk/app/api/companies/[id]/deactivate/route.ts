// Design Ref: §4 — POST /api/companies/[id]/deactivate
// Deactivate company + all its users (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/companies/[id]/deactivate — 고객사 + 소속 사용자 일괄 비활성화
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

    const { id } = await params;

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '고객사를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Deactivate company and all its users in a transaction
    const [updatedCompany, userUpdateResult] = await prisma.$transaction([
      prisma.company.update({
        where: { id },
        data: { isActive: false },
      }),
      prisma.user.updateMany({
        where: { companyId: id, isActive: true },
        data: { isActive: false },
      }),
    ]);

    logger.info(
      { companyId: id, usersDeactivated: userUpdateResult.count },
      'Company and users deactivated',
    );

    return NextResponse.json({
      success: true,
      data: {
        company: updatedCompany,
        usersDeactivated: userUpdateResult.count,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Company deactivation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
