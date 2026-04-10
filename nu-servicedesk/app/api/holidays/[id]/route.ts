// Design Ref: §4 — PUT/DELETE /api/holidays/[id]
// Plan SC: FR-04 공휴일 관리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const updateHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD입니다.').optional(),
  name: z.string().min(1).max(50).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/holidays/[id] — 공휴일 수정 (admin only)
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

    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '공휴일을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = updateHolidaySchema.safeParse(body);

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

    const updateData: Record<string, unknown> = {};

    if (data.date) {
      const dateObj = new Date(data.date + 'T00:00:00.000Z');

      // Check duplicate date
      const dup = await prisma.holiday.findFirst({
        where: { date: dateObj, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_DATE', message: `${data.date}에 이미 공휴일이 등록되어 있습니다.`, status: 409 } },
          { status: 409 },
        );
      }

      updateData.date = dateObj;
      updateData.year = dateObj.getUTCFullYear();
    }

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    const updated = await prisma.holiday.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Holiday update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/holidays/[id] — 공휴일 삭제 (hard delete, admin only)
 * 공휴일은 설정 데이터이므로 물리 삭제한다.
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

    const holiday = await prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '공휴일을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    await prisma.holiday.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    logger.error({ error }, 'Holiday delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
