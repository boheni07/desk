// Design Ref: §4 — GET /api/auth/session
// Returns current session user info for client-side auth state

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '인증이 필요합니다.',
            status: 401,
          },
        },
        { status: 401 },
      );
    }

    // Fetch fresh user data to include mustChangePassword
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        loginId: true,
        name: true,
        type: true,
        companyId: true,
        mustChangePassword: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ACCOUNT_INACTIVE',
            message: '비활성 계정입니다.',
            status: 403,
          },
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        type: user.type,
        companyId: user.companyId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Session check failed');

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '서버 오류가 발생했습니다.',
          status: 500,
        },
      },
      { status: 500 },
    );
  }
}
