// Design Ref: §4 — GET/POST /api/companies/[id]/departments
// Plan SC: FR-02 부서 관리 (고객사 하위)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const createDepartmentSchema = z.object({
  name: z.string().min(1, '부서명을 입력해 주세요.').max(100, '부서명은 100자 이내로 입력해 주세요.'),
  code: z.string().max(20).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/companies/[id]/departments — 고객사 부서 목록
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

    // Verify company exists
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '고객사를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const departments = await prisma.department.findMany({
      where: { companyId: id },
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, data: departments });
  } catch (error) {
    logger.error({ error }, 'Department list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/companies/[id]/departments — 부서 생성 (admin only)
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

    // Verify company exists
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '고객사를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = createDepartmentSchema.safeParse(body);

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

    const { name, code } = parsed.data;

    // Check duplicate name within company (@@unique([companyId, name]))
    const existing = await prisma.department.findFirst({
      where: { companyId: id, name },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_NAME', message: '같은 이름의 부서가 이미 존재합니다.', status: 409 } },
        { status: 409 },
      );
    }

    const department = await prisma.department.create({
      data: {
        companyId: id,
        name,
        code: code ?? null,
      },
    });

    return NextResponse.json({ success: true, data: department }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Department creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
