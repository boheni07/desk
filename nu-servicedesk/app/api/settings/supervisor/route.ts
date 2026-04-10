// Design Ref: §4 — GET/PUT /api/settings/supervisor
// Plan SC: 시스템 설정 (supervisorUserIds)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const SUPERVISOR_KEY = 'supervisorUserIds';

const updateSupervisorSchema = z.object({
  userIds: z.array(z.string()).min(0),
});

/**
 * GET /api/settings/supervisor — 감독자 설정 조회
 */
export async function GET() {
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

    const setting = await prisma.systemSetting.findUnique({
      where: { key: SUPERVISOR_KEY },
    });

    const userIds: string[] = setting ? JSON.parse(setting.value) : [];

    // Fetch user details for each supervisor
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds }, isActive: true },
          select: { id: true, loginId: true, name: true, type: true },
        })
      : [];

    return NextResponse.json({
      success: true,
      data: {
        userIds,
        users,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Supervisor settings fetch failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/settings/supervisor — 감독자 설정 수정 (admin only)
 */
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const parsed = updateSupervisorSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '입력값이 올바르지 않습니다.', status: 400, fieldErrors } },
        { status: 400 },
      );
    }

    const { userIds } = parsed.data;

    // Validate all userIds exist and are active
    if (userIds.length > 0) {
      const validUsers = await prisma.user.count({
        where: { id: { in: userIds }, isActive: true },
      });
      if (validUsers !== userIds.length) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_USERS', message: '존재하지 않거나 비활성 상태인 사용자가 포함되어 있습니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    // Upsert the setting
    const setting = await prisma.systemSetting.upsert({
      where: { key: SUPERVISOR_KEY },
      update: { value: JSON.stringify(userIds) },
      create: { key: SUPERVISOR_KEY, value: JSON.stringify(userIds) },
    });

    return NextResponse.json({
      success: true,
      data: {
        key: setting.key,
        userIds,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Supervisor settings update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
