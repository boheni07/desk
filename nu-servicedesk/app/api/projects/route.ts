// Design Ref: §4 — GET/POST /api/projects
// Plan SC: FR-06 프로젝트 관리, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';

const createProjectSchema = z.object({
  name: z.string().min(1, '프로젝트명을 입력해 주세요.').max(100, '프로젝트명은 100자 이내로 입력해 주세요.'),
  companyId: z.string().min(1, '고객사를 선택해 주세요.'),
  departmentName: z.string().max(100).trim().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '시작일 형식은 YYYY-MM-DD입니다.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '종료일 형식은 YYYY-MM-DD입니다.').nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  customerIds: z.array(z.string()).optional().default([]),
  supportIds: z.array(z.string()).optional().default([]),
}).refine(
  (data) => !data.endDate || data.endDate >= data.startDate,
  { message: '종료일은 시작일보다 같거나 이후여야 합니다.', path: ['endDate'] },
);

/**
 * GET /api/projects — 프로젝트 목록
 * admin/support: 전체 조회
 * customer: 자신이 배정된 프로젝트만
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: '로그인이 필요합니다.', status: 401 } },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      BUSINESS_RULES.PAGE_SIZE_MAX,
      Math.max(1, parseInt(searchParams.get('limit') || String(BUSINESS_RULES.PAGE_SIZE_DEFAULT), 10)),
    );
    const search = searchParams.get('search')?.trim() || '';
    const companyId = searchParams.get('companyId') || '';
    const isActive = searchParams.get('isActive');

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (companyId) {
      where.companyId = companyId;
    }

    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    // RBAC: customer always sees only their assigned projects
    // support/admin with myProjects=true also filters to assigned projects only
    const myProjects = searchParams.get('myProjects');
    if (session.type === 'customer' || myProjects === 'true') {
      where.members = {
        some: { userId: session.userId },
      };
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          _count: { select: { members: true, tickets: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { projects, total, page, limit },
    });
  } catch (error) {
    logger.error({ error }, 'Projects list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/projects — 프로젝트 생성 (admin only)
 */
export async function POST(request: NextRequest) {
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
    const parsed = createProjectSchema.safeParse(body);

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

    const { name, companyId, departmentName, startDate, endDate, description, customerIds, supportIds } = parsed.data;

    // Verify company exists and is active
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_COMPANY', message: '존재하지 않는 고객사입니다.', status: 400 } },
        { status: 400 },
      );
    }
    if (!company.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'COMPANY_INACTIVE', message: '비활성 고객사에는 프로젝트를 생성할 수 없습니다.', status: 422 } },
        { status: 422 },
      );
    }

    // Validate customer members: must be active customer type belonging to the company
    if (customerIds.length > 0) {
      const customers = await prisma.user.findMany({
        where: { id: { in: customerIds }, type: 'customer', isActive: true, companyId },
        select: { id: true },
      });
      if (customers.length !== customerIds.length) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_CUSTOMER_MEMBER', message: '유효하지 않은 고객담당자가 포함되어 있습니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    // Validate support members: must be active support type
    if (supportIds.length > 0) {
      const supports = await prisma.user.findMany({
        where: { id: { in: supportIds }, type: 'support', isActive: true },
        select: { id: true },
      });
      if (supports.length !== supportIds.length) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_SUPPORT_MEMBER', message: '유효하지 않은 지원담당자가 포함되어 있습니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    // Auto-generate project code: PRJ-{YYYYMM}-{NNN}
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthCount = await prisma.project.count({ where: { createdAt: { gte: monthStart } } });
    let code = `PRJ-${yyyymm}-${String(monthCount + 1).padStart(3, '0')}`;
    // Ensure uniqueness in case of concurrent creation
    let suffix = monthCount + 1;
    while (await prisma.project.findFirst({ where: { code } })) {
      suffix++;
      code = `PRJ-${yyyymm}-${String(suffix).padStart(3, '0')}`;
    }

    // Create project + members in a single transaction
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name,
          code,
          companyId,
          department: departmentName || null,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          description: description ?? null,
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      // Add customer members
      if (customerIds.length > 0) {
        await tx.projectMember.createMany({
          data: customerIds.map((userId) => ({ projectId: p.id, userId, role: 'customer' })),
        });
      }

      // Add support members — first selected becomes main_support
      if (supportIds.length > 0) {
        await tx.projectMember.createMany({
          data: supportIds.map((userId, idx) => ({
            projectId: p.id,
            userId,
            role: idx === 0 ? 'main_support' : 'support',
          })),
        });
      }

      return p;
    });

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Project creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
