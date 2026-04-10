// Design Ref: §4 — GET/POST /api/categories
// Plan SC: FR-05 카테고리 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const createCategorySchema = z.object({
  name: z.string().min(1, '카테고리명을 입력해 주세요.').max(50, '카테고리명은 50자 이내로 입력해 주세요.'),
  sortOrder: z.number().int().min(0).optional(),
});

/**
 * GET /api/categories — 카테고리 목록 (sortOrder 정렬)
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

    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { tickets: true } },
      },
    });

    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    logger.error({ error }, 'Categories list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/categories — 카테고리 생성 (admin only)
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
    const parsed = createCategorySchema.safeParse(body);

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

    const { name, sortOrder } = parsed.data;

    // Check duplicate name (unique constraint)
    const existing = await prisma.category.findFirst({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_NAME', message: '이미 등록된 카테고리명입니다.', status: 409 } },
        { status: 409 },
      );
    }

    // Auto-assign sortOrder if not provided
    let finalSortOrder = sortOrder ?? 0;
    if (sortOrder === undefined) {
      const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } });
      finalSortOrder = (maxOrder._max.sortOrder ?? 0) + 1;
    }

    const category = await prisma.category.create({
      data: { name, sortOrder: finalSortOrder },
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Category creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
