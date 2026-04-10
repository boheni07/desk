// Design Ref: §4 — GET/PUT/DELETE /api/companies/[id]
// Plan SC: SC-08 RBAC, FR-02 고객사 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const updateCompanySchema = z.object({
  name: z.string().min(1, '회사명을 입력해 주세요.').max(100).optional(),
  businessNumber: z.string().max(20).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/companies/[id] — 고객사 상세 (부서 포함)
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

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, projects: true } },
      },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '고객사를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: company });
  } catch (error) {
    logger.error({ error }, 'Company detail failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/companies/[id] — 고객사 수정 (admin only)
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

    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '고객사를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = updateCompanySchema.safeParse(body);

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

    // Check duplicate name if changed
    if (data.name && data.name !== existing.name) {
      const dup = await prisma.company.findFirst({ where: { name: data.name, NOT: { id } } });
      if (dup) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_NAME', message: '이미 등록된 회사명입니다.', status: 409 } },
          { status: 409 },
        );
      }
    }

    // Check duplicate businessNumber if changed
    if (data.businessNumber && data.businessNumber !== existing.businessNumber) {
      const dup = await prisma.company.findFirst({ where: { businessNumber: data.businessNumber, NOT: { id } } });
      if (dup) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_BUSINESS_NUMBER', message: '이미 등록된 사업자번호입니다.', status: 409 } },
          { status: 409 },
        );
      }
    }

    // If deactivating, ensure no active projects exist (mirrors DELETE guard)
    if (data.isActive === false && existing.isActive === true) {
      const activeProjects = await prisma.project.count({
        where: { companyId: id, isActive: true },
      });
      if (activeProjects > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'HAS_ACTIVE_PROJECTS', message: `활성 프로젝트 ${activeProjects}건이 있어 비활성화할 수 없습니다.`, status: 422 } },
          { status: 422 },
        );
      }
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.businessNumber !== undefined && { businessNumber: data.businessNumber }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Company update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/companies/[id] — 고객사 비활성화 (soft-delete, admin only)
 * 활성 프로젝트가 있으면 삭제 불가.
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

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '고객사를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Check for active projects
    const activeProjects = await prisma.project.count({
      where: { companyId: id, isActive: true },
    });

    if (activeProjects > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_ACTIVE_PROJECTS', message: `활성 프로젝트 ${activeProjects}건이 있어 비활성화할 수 없습니다.`, status: 422 } },
        { status: 422 },
      );
    }

    const updated = await prisma.company.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Company delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
