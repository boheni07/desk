// Design Ref: §F — PUT /api/auth/password
// Plan SC: OWASP 비밀번호 변경 시 전체 세션 폐기 + 재로그인

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession, deleteAllUserSessions, clearSessionCookies } from '@/lib/session';
import { hashPassword, verifyPassword, validatePasswordStrength } from '@/lib/password';
import { logger } from '@/lib/logger';

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(1, '새 비밀번호를 입력해 주세요.'),
  confirmPassword: z.string().min(1, '비밀번호 확인을 입력해 주세요.'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.',
  path: ['confirmPassword'],
});

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

    // Parse and validate request body
    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

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

    const { currentPassword, newPassword } = parsed.data;

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
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

    // If NOT initial change (mustChangePassword), verify current password
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '현재 비밀번호를 입력해 주세요.',
              status: 400,
              fieldErrors: {
                currentPassword: ['현재 비밀번호를 입력해 주세요.'],
              },
            },
          },
          { status: 400 },
        );
      }

      const isValid = await verifyPassword(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: '현재 비밀번호가 올바르지 않습니다.',
              status: 401,
              fieldErrors: {
                currentPassword: ['현재 비밀번호가 올바르지 않습니다.'],
              },
            },
          },
          { status: 401 },
        );
      }
    }

    // Validate new password strength
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: '비밀번호가 보안 요구사항을 충족하지 않습니다.',
            status: 400,
            fieldErrors: {
              newPassword: strength.errors,
            },
          },
        },
        { status: 400 },
      );
    }

    // Hash new password and update
    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    });

    // V2.1: Delete all sessions for this user (OWASP)
    await deleteAllUserSessions(user.id);

    // Clear current session cookies
    await clearSessionCookies();

    logger.info({ userId: user.id }, 'Password changed, all sessions deleted');

    return NextResponse.json({
      success: true,
      data: {
        requireRelogin: true,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Password change failed');

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
