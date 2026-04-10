// Design Ref: §4 — GET/POST/DELETE /api/projects/[id]/members
// Plan SC: FR-07 프로젝트 멤버 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const addMemberSchema = z.object({
  userId: z.string().min(1, '사용자를 선택해 주세요.'),
  role: z.enum(['main_support', 'support', 'customer'], {
    errorMap: () => ({ message: '올바른 역할을 선택해 주세요. (main_support, support, customer)' }),
  }).optional().default('support'),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/members — 프로젝트 멤버 목록
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const { id } = await params;

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: customer can only see members of their assigned projects
    if (session.type === 'customer') {
      const isMember = await prisma.projectMember.findFirst({
        where: { projectId: id, userId: session.userId },
      });
      if (!isMember) {
        return NextResponse.json(
          { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: '해당 프로젝트에 접근 권한이 없습니다.', status: 403 } },
          { status: 403 },
        );
      }
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId: id },
      include: {
        user: {
          select: {
            id: true,
            loginId: true,
            name: true,
            type: true,
            isActive: true,
            email: true,
            phone: true,
            company: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: members });
  } catch (error) {
    logger.error({ error }, 'Project members list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects/[id]/members — 프로젝트 멤버 추가 (admin only)
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

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = addMemberSchema.safeParse(body);

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

    const { userId, role } = parsed.data;

    // Verify user exists and is active
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_NOT_FOUND', message: '사용자를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }
    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'USER_INACTIVE', message: '비활성 사용자는 멤버로 추가할 수 없습니다.', status: 422 } },
        { status: 422 },
      );
    }

    // Check for duplicate member (@@unique([projectId, userId]))
    const existingMember = await prisma.projectMember.findFirst({
      where: { projectId: id, userId },
    });
    if (existingMember) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_MEMBER', message: '이미 프로젝트에 배정된 사용자입니다.', status: 409 } },
        { status: 409 },
      );
    }

    // If adding main_support, check if one already exists
    if (role === 'main_support') {
      const existingMainSupport = await prisma.projectMember.findFirst({
        where: { projectId: id, role: 'main_support' },
      });
      if (existingMainSupport) {
        return NextResponse.json(
          { success: false, error: { code: 'MAIN_SUPPORT_EXISTS', message: 'Main 담당자가 이미 배정되어 있습니다. 기존 담당자를 먼저 변경해 주세요.', status: 422 } },
          { status: 422 },
        );
      }
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId: id,
        userId,
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            loginId: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: member }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Project member add failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[id]/members?userId=xxx — 프로젝트 멤버 제거 (admin only)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'userId 쿼리 파라미터가 필요합니다.', status: 400 } },
        { status: 400 },
      );
    }

    const member = await prisma.projectMember.findFirst({
      where: { projectId: id, userId },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '프로젝트에 배정되지 않은 사용자입니다.', status: 404 } },
        { status: 404 },
      );
    }

    await prisma.projectMember.delete({ where: { id: member.id } });

    return NextResponse.json({ success: true, data: { projectId: id, userId } });
  } catch (error) {
    logger.error({ error }, 'Project member remove failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
