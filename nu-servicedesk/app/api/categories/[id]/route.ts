// Design Ref: §4 — PUT/DELETE /api/categories/[id]
// Plan SC: FR-05 카테고리 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/categories/[id] — 카테고리 수정 (admin only)
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

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '카테고리를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = updateCategorySchema.safeParse(body);

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
      const dup = await prisma.category.findFirst({ where: { name: data.name, NOT: { id } } });
      if (dup) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_NAME', message: '이미 등록된 카테고리명입니다.', status: 409 } },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Category update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/categories/[id] — 카테고리 비활성화 (soft-delete, admin only)
 * 연결된 티켓이 있으면 삭제 불가.
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

    const category = await prisma.category.findUnique({ where: { id } });
    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '카테고리를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Check for tickets using this category
    const ticketCount = await prisma.ticket.count({ where: { categoryId: id } });
    if (ticketCount > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_TICKETS', message: `해당 카테고리를 사용하는 티켓 ${ticketCount}건이 있어 삭제할 수 없습니다.`, status: 422 } },
        { status: 422 },
      );
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Category delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
