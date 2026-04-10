// Design Ref: §4 — GET/PUT/DELETE /api/users/[id]
// Plan SC: SC-08 RBAC, FR-03 사용자 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const updateUserSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  email: z.string().email('올바른 이메일 형식이 아닙니다.').nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  type: z.enum(['admin', 'support', 'customer']).optional(),
  companyId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/users/[id] — 사용자 상세
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

    if (session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '관리자만 접근할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        loginId: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        isActive: true,
        mustChangePassword: true,
        loginAttempts: true,
        lockedUntil: true,
        companyId: true,
        departmentId: true,
        company: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        createdAt: true,
        updatedAt: true,
        _count: { select: { projectMembers: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    logger.error({ error }, 'User detail failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/users/[id] — 사용자 수정 (admin only)
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

    const { id } = await params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);

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

    // Check email uniqueness if changed
    if (data.email && data.email !== existing.email) {
      const dup = await prisma.user.findFirst({
        where: { email: data.email, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.', status: 409 } },
          { status: 409 },
        );
      }
    }

    // Verify companyId if provided
    if (data.companyId) {
      const company = await prisma.company.findUnique({ where: { id: data.companyId } });
      if (!company) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_COMPANY', message: '존재하지 않는 회사입니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    // Verify departmentId if provided
    if (data.departmentId) {
      const targetCompanyId = data.companyId ?? existing.companyId;
      const dept = await prisma.department.findFirst({
        where: { id: data.departmentId, ...(targetCompanyId ? { companyId: targetCompanyId } : {}) },
      });
      if (!dept) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_DEPARTMENT', message: '존재하지 않거나 해당 회사에 속하지 않는 부서입니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.companyId !== undefined && { companyId: data.companyId }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: {
        id: true,
        loginId: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        isActive: true,
        companyId: true,
        departmentId: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'User update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/users/[id] — 사용자 비활성화 (soft-delete, admin only)
 * 자기 자신은 삭제 불가.
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

    // Cannot delete self
    if (id === session.userId) {
      return NextResponse.json(
        { success: false, error: { code: 'CANNOT_DELETE_SELF', message: '자기 자신은 비활성화할 수 없습니다.', status: 422 } },
        { status: 422 },
      );
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: { id: updated.id, isActive: updated.isActive } });
  } catch (error) {
    logger.error({ error }, 'User delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
