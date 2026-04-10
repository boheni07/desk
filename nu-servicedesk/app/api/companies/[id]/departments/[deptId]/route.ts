// Design Ref: §4 — PUT/DELETE /api/companies/[id]/departments/[deptId]
// Plan SC: FR-02 부서 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const updateDepartmentSchema = z.object({
  name: z.string().min(1, '부서명을 입력해 주세요.').max(100).optional(),
  code: z.string().max(20).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string; deptId: string }> };

/**
 * PUT /api/companies/[id]/departments/[deptId] — 부서 수정 (admin only)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const { id, deptId } = await params;

    const department = await prisma.department.findFirst({
      where: { id: deptId, companyId: id },
    });

    if (!department) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '부서를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = updateDepartmentSchema.safeParse(body);

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

    const data = parsed.data;

    // Check duplicate name within company if changed
    if (data.name && data.name !== department.name) {
      const dup = await prisma.department.findFirst({
        where: { companyId: id, name: data.name, NOT: { id: deptId } },
      });
      if (dup) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_NAME', message: '같은 이름의 부서가 이미 존재합니다.', status: 409 } },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.department.update({
      where: { id: deptId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Department update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/companies/[id]/departments/[deptId] — 부서 삭제
 * 소속 사용자가 있으면 삭제 불가.
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

    const { id, deptId } = await params;

    const department = await prisma.department.findFirst({
      where: { id: deptId, companyId: id },
    });

    if (!department) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '부서를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Check for assigned users
    const userCount = await prisma.user.count({ where: { departmentId: deptId } });
    if (userCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_USERS', message: `소속 사용자 ${userCount}명이 있어 삭제할 수 없습니다.`, status: 422 } },
        { status: 422 },
      );
    }

    await prisma.department.delete({ where: { id: deptId } });

    return NextResponse.json({ success: true, data: { id: deptId } });
  } catch (error) {
    logger.error({ error }, 'Department delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
