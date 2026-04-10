// Design Ref: §4 — GET/POST /api/companies
// Plan SC: SC-08 RBAC (admin only for write), FR-02 고객사 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';

const createCompanySchema = z.object({
  name: z.string().min(1, '회사명을 입력해 주세요.').max(100, '회사명은 100자 이내로 입력해 주세요.'),
  businessNumber: z.string().max(20, '사업자번호는 20자 이내로 입력해 주세요.').nullable().optional(),
  address: z.string().max(200, '주소는 200자 이내로 입력해 주세요.').nullable().optional(),
  phone: z.string().max(20, '전화번호는 20자 이내로 입력해 주세요.').nullable().optional(),
});

/**
 * GET /api/companies — 고객사 목록 (페이징, 검색)
 * admin: 전체 목록 조회
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

    if (session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '관리자만 접근할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      BUSINESS_RULES.PAGE_SIZE_MAX,
      Math.max(1, parseInt(searchParams.get('limit') || String(BUSINESS_RULES.PAGE_SIZE_DEFAULT), 10)),
    );
    const search = searchParams.get('search')?.trim() || '';
    const isActive = searchParams.get('isActive');

    const where: Record<string, unknown> = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          _count: { select: { departments: true, users: true, projects: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.company.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        companies,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Companies list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/companies — 고객사 생성 (admin only)
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
    const parsed = createCompanySchema.safeParse(body);

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

    const { name, businessNumber, address, phone } = parsed.data;

    // Check duplicate name
    const existing = await prisma.company.findFirst({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_NAME', message: '이미 등록된 회사명입니다.', status: 409 } },
        { status: 409 },
      );
    }

    // Check duplicate businessNumber if provided
    if (businessNumber) {
      const existingBn = await prisma.company.findFirst({ where: { businessNumber } });
      if (existingBn) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_BUSINESS_NUMBER', message: '이미 등록된 사업자번호입니다.', status: 409 } },
          { status: 409 },
        );
      }
    }

    const company = await prisma.company.create({
      data: {
        name,
        businessNumber: businessNumber ?? null,
        address: address ?? null,
        phone: phone ?? null,
      },
    });

    return NextResponse.json({ success: true, data: company }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Company creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
