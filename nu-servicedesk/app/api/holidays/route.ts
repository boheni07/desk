// Design Ref: §4 — GET/POST /api/holidays
// Plan SC: FR-04 공휴일 관리, 근무시간 계산 엔진 연동

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const createHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD입니다.'),
  name: z.string().min(1, '공휴일명을 입력해 주세요.').max(50, '공휴일명은 50자 이내로 입력해 주세요.'),
});

const bulkCreateSchema = z.object({
  holidays: z.array(createHolidaySchema).min(1, '최소 1개의 공휴일을 입력해 주세요.'),
});

/**
 * GET /api/holidays — 공휴일 목록 (연도별)
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
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

    const holidays = await prisma.holiday.findMany({
      where: { year },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json({ success: true, data: holidays });
  } catch (error) {
    logger.error({ error }, 'Holidays list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/holidays — 공휴일 생성 (admin only)
 * Body can be single { date, name } or bulk { holidays: [...] }
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

    // Check if bulk import or single
    if (body.holidays && Array.isArray(body.holidays)) {
      return handleBulkCreate(body);
    }

    return handleSingleCreate(body);
  } catch (error) {
    logger.error({ error }, 'Holiday creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

async function handleSingleCreate(body: unknown) {
  const parsed = createHolidaySchema.safeParse(body);

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

  const { date, name } = parsed.data;
  const dateObj = new Date(date + 'T00:00:00.000Z');
  const year = dateObj.getUTCFullYear();

  // Check duplicate date
  const existing = await prisma.holiday.findFirst({
    where: { date: dateObj },
  });
  if (existing) {
    return NextResponse.json(
      { success: false, error: { code: 'DUPLICATE_DATE', message: `${date}에 이미 공휴일이 등록되어 있습니다. (${existing.name})`, status: 409 } },
      { status: 409 },
    );
  }

  const holiday = await prisma.holiday.create({
    data: { date: dateObj, name, year },
  });

  return NextResponse.json({ success: true, data: holiday }, { status: 201 });
}

async function handleBulkCreate(body: unknown) {
  const parsed = bulkCreateSchema.safeParse(body);

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

  const { holidays } = parsed.data;
  const created: unknown[] = [];
  const skipped: { date: string; reason: string }[] = [];

  for (const h of holidays) {
    const dateObj = new Date(h.date + 'T00:00:00.000Z');
    const year = dateObj.getUTCFullYear();

    try {
      const existing = await prisma.holiday.findFirst({ where: { date: dateObj } });
      if (existing) {
        skipped.push({ date: h.date, reason: `이미 등록됨 (${existing.name})` });
        continue;
      }

      const holiday = await prisma.holiday.create({
        data: { date: dateObj, name: h.name, year },
      });
      created.push(holiday);
    } catch {
      skipped.push({ date: h.date, reason: '생성 실패' });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      created,
      skipped,
      totalCreated: created.length,
      totalSkipped: skipped.length,
    },
  }, { status: 201 });
}
