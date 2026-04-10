// Design Ref: §4 — GET/POST /api/users
// Plan SC: SC-08 RBAC, FR-03 사용자 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { hashPassword, generateInitialPassword } from '@/lib/password';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';

const createUserSchema = z.object({
  loginId: z.string()
    .min(3, '아이디는 3자 이상 입력해 주세요.')
    .max(30, '아이디는 30자 이내로 입력해 주세요.')
    .regex(/^[a-zA-Z0-9_.-]+$/, '아이디는 영문, 숫자, _, ., - 만 사용 가능합니다.'),
  name: z.string().min(1, '이름을 입력해 주세요.').max(50, '이름은 50자 이내로 입력해 주세요.'),
  type: z.enum(['admin', 'support', 'customer'], { errorMap: () => ({ message: '올바른 역할을 선택해 주세요.' }) }),
  companyId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  email: z.string().email('올바른 이메일 형식이 아닙니다.').nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
});

/**
 * GET /api/users — 사용자 목록 (페이징, 필터, 검색)
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
    const role = searchParams.get('role') || '';
    const companyId = searchParams.get('companyId') || '';
    const isActive = searchParams.get('isActive');

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { loginId: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      // Support comma-separated roles: "admin,support"
      const roles = role.split(',').map((r) => r.trim()).filter(Boolean);
      if (roles.length === 1) {
        where.type = roles[0];
      } else if (roles.length > 1) {
        where.type = { in: roles };
      }
    }

    if (companyId) {
      where.companyId = companyId;
    }

    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          loginId: true,
          name: true,
          email: true,
          phone: true,
          type: true,
          isActive: true,
          mustChangePassword: true,
          companyId: true,
          departmentId: true,
          company: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { users, total, page, limit },
    });
  } catch (error) {
    logger.error({ error }, 'Users list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/users — 사용자 생성 (admin only)
 * 초기 비밀번호: Desk@{loginId}, mustChangePassword=true
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
    const parsed = createUserSchema.safeParse(body);

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

    const { loginId, name, type, companyId, departmentId, email, phone } = parsed.data;

    // Check unique loginId
    const existingLogin = await prisma.user.findUnique({ where: { loginId } });
    if (existingLogin) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_LOGIN_ID', message: '이미 사용 중인 아이디입니다.', status: 409 } },
        { status: 409 },
      );
    }

    // Check unique email if provided
    if (email) {
      const existingEmail = await prisma.user.findFirst({ where: { email } });
      if (existingEmail) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_EMAIL', message: '이미 사용 중인 이메일입니다.', status: 409 } },
          { status: 409 },
        );
      }
    }

    // Validate companyId for customer type
    if (type === 'customer' && !companyId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: '고객 사용자는 회사를 선택해야 합니다.', status: 400, fieldErrors: { companyId: ['고객 사용자는 회사를 선택해야 합니다.'] } } },
        { status: 400 },
      );
    }

    // Verify companyId exists if provided
    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_COMPANY', message: '존재하지 않는 회사입니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    // Verify departmentId exists and belongs to company if provided
    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, ...(companyId ? { companyId } : {}) },
      });
      if (!dept) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_DEPARTMENT', message: '존재하지 않거나 해당 회사에 속하지 않는 부서입니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    // Auto-generate secure random initial password (8 chars: upper+lower+digit+special)
    const initialPassword = generateInitialPassword();
    const hashedPassword = await hashPassword(initialPassword);

    const user = await prisma.user.create({
      data: {
        loginId,
        name,
        password: hashedPassword,
        type,
        companyId: companyId ?? null,
        departmentId: departmentId ?? null,
        email: email ?? null,
        phone: phone ?? null,
        mustChangePassword: true,
      },
      select: {
        id: true,
        loginId: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        isActive: true,
        mustChangePassword: true,
        companyId: true,
        departmentId: true,
        createdAt: true,
      },
    });

    // Return initialPassword once (admin must relay to user; not stored in plain text)
    return NextResponse.json({ success: true, data: { ...user, initialPassword } }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'User creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
