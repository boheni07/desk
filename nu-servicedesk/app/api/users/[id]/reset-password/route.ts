// Design Ref: §4 — POST /api/users/[id]/reset-password
// Plan SC: SC-08 RBAC, OWASP (비밀번호 초기화 시 전체 세션 폐기)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, deleteAllUserSessions } from '@/lib/session';
import { hashPassword, generateInitialPassword } from '@/lib/password';
import { logger } from '@/lib/logger';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/users/[id]/reset-password — 비밀번호 초기화 (admin only)
 * 비밀번호를 Desk@{loginId}로 초기화하고, mustChangePassword=true 설정.
 * OWASP: 해당 사용자의 모든 세션을 폐기한다.
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

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, loginId: true, name: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Reset to a new secure random password
    const newPassword = generateInitialPassword();
    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        mustChangePassword: true,
        loginAttempts: 0,
        lockedUntil: null,
      },
    });

    // OWASP: Delete all sessions for this user
    const deletedSessions = await deleteAllUserSessions(id);

    logger.info(
      { adminId: session.userId, targetUserId: id, sessionsDeleted: deletedSessions },
      'Password reset by admin',
    );

    // Return newPassword once (admin must relay to user; not stored in plain text)
    return NextResponse.json({
      success: true,
      data: {
        userId: id,
        loginId: user.loginId,
        newPassword,
        sessionsCleared: deletedSessions,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Password reset failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
