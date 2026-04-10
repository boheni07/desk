// Design Ref: §4 — POST /api/tickets/[id]/assign
// Plan SC: FR-12 담당자 추가 배정, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

type RouteParams = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  userId: z.string().min(1, '담당자를 선택해 주세요.'),
});

/**
 * POST /api/tickets/[id]/assign — 담당자 배정 (admin/support with project membership)
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

    if (session.type === 'customer') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '관리자 또는 지원담당자만 배정할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    const { id } = await params;

    const body = await request.json();
    const parsed = assignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message, status: 400 } },
        { status: 400 },
      );
    }

    const { userId } = parsed.data;

    // Verify ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Verify the target user exists and is support type
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, type: true, isActive: true },
    });

    if (!targetUser || !targetUser.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_USER', message: '유효하지 않은 사용자입니다.', status: 400 } },
        { status: 400 },
      );
    }

    if (targetUser.type !== 'support' && targetUser.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_USER_TYPE', message: '지원담당자 또는 관리자만 배정할 수 있습니다.', status: 400 } },
        { status: 400 },
      );
    }

    // Verify the assignee is a member of the ticket's project
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: ticket.projectId, userId },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_PROJECT_MEMBER', message: '해당 프로젝트에 속하지 않는 담당자입니다.', status: 400 } },
        { status: 400 },
      );
    }

    // Upsert assignment
    const assignment = await prisma.ticketAssignment.upsert({
      where: {
        ticketId_userId: { ticketId: id, userId },
      },
      update: {},
      create: {
        ticketId: id,
        userId,
      },
      include: {
        user: { select: { id: true, name: true, type: true } },
      },
    });

    return NextResponse.json({ success: true, data: assignment }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Ticket assign failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
