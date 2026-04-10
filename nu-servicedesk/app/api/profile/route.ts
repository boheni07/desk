// Design Ref: §4 — GET/PUT /api/profile
// Plan SC: FR-30 프로필 관리

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const updateProfileSchema = z.object({
  name: z.string().min(1, '이름을 입력해 주세요.').max(50, '이름은 50자 이내로 입력해 주세요.').optional(),
  email: z.string().email('올바른 이메일 형식이 아닙니다.').nullable().optional(),
  phone: z.string()
    .regex(/^[0-9\-+() ]{7,20}$/, '올바른 전화번호 형식이 아닙니다.')
    .nullable()
    .optional(),
});

/**
 * GET /api/profile — 현재 사용자 프로필 조회
 */
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

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        loginId: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        companyId: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: '사용자를 찾을 수 없습니다.',
            status: 404,
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error({ error }, 'Profile fetch failed');

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

/**
 * PUT /api/profile — 현재 사용자 프로필 수정 (name, email, phone)
 */
export async function PUT(request: Request) {
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

    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '입력값이 올바르지 않습니다.',
            status: 400,
            fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Check email uniqueness if provided
    if (data.email) {
      const existing = await prisma.user.findFirst({
        where: {
          email: data.email,
          NOT: { id: session.userId },
        },
      });

      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'DUPLICATE_EMAIL',
              message: '이미 사용 중인 이메일입니다.',
              status: 409,
              fieldErrors: {
                email: ['이미 사용 중인 이메일입니다.'],
              },
            },
          },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: session.userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
      },
      select: {
        id: true,
        loginId: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        companyId: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error({ error }, 'Profile update failed');

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
