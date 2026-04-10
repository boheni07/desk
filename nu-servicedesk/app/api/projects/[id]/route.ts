// Design Ref: §4 — GET/PUT/DELETE /api/projects/[id]
// Plan SC: FR-06 프로젝트 관리, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  departmentName: z.string().max(100).trim().nullable().optional(),
  isActive: z.boolean().optional(),
  customerIds: z.array(z.string()).optional(),
  supportIds: z.array(z.string()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id] — 프로젝트 상세 (멤버 목록 포함)
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

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                loginId: true,
                name: true,
                type: true,
                isActive: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { tickets: true } },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: customer can only see their assigned projects
    if (session.type === 'customer') {
      const isMember = project.members.some((m) => m.userId === session.userId);
      if (!isMember) {
        return NextResponse.json(
          { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: '해당 프로젝트에 접근 권한이 없습니다.', status: 403 } },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error) {
    logger.error({ error }, 'Project detail failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/projects/[id] — 프로젝트 수정 (admin only)
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

    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = updateProjectSchema.safeParse(body);

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

    // Validate date range against existing values
    const effectiveStart = data.startDate ?? existing.startDate.toISOString().split('T')[0];
    const effectiveEnd = data.endDate !== undefined
      ? data.endDate
      : (existing.endDate ? existing.endDate.toISOString().split('T')[0] : null);
    if (effectiveEnd && effectiveEnd < effectiveStart) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '입력값이 올바르지 않습니다.',
            status: 400,
            fieldErrors: { endDate: ['종료일은 시작일보다 같거나 이후여야 합니다.'] },
          },
        },
        { status: 400 },
      );
    }

    // If deactivating, ensure no active tickets exist (mirrors DELETE guard)
    if (data.isActive === false && existing.isActive === true) {
      const activeTickets = await prisma.ticket.count({
        where: {
          projectId: id,
          status: { notIn: ['CLOSED', 'CANCELLED'] },
        },
      });
      if (activeTickets > 0) {
        return NextResponse.json(
          { success: false, error: { code: 'HAS_ACTIVE_TICKETS', message: `활성 티켓 ${activeTickets}건이 있어 비활성화할 수 없습니다.`, status: 422 } },
          { status: 422 },
        );
      }
    }

    // Validate customerIds if provided
    if (data.customerIds !== undefined && data.customerIds.length > 0) {
      const customers = await prisma.user.findMany({
        where: { id: { in: data.customerIds }, type: 'customer', isActive: true, companyId: existing.companyId },
        select: { id: true },
      });
      if (customers.length !== data.customerIds.length) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_CUSTOMER_MEMBER', message: '유효하지 않은 고객담당자가 포함되어 있습니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    // Validate supportIds if provided
    if (data.supportIds !== undefined && data.supportIds.length > 0) {
      const supports = await prisma.user.findMany({
        where: { id: { in: data.supportIds }, type: 'support', isActive: true },
        select: { id: true },
      });
      if (supports.length !== data.supportIds.length) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_SUPPORT_MEMBER', message: '유효하지 않은 지원담당자가 포함되어 있습니다.', status: 400 } },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.project.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
          ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.departmentName !== undefined && { department: data.departmentName || null }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        include: {
          company: { select: { id: true, name: true } },
        },
      });

      // Replace all members if customerIds or supportIds provided
      if (data.customerIds !== undefined || data.supportIds !== undefined) {
        await tx.projectMember.deleteMany({ where: { projectId: id } });

        if (data.customerIds && data.customerIds.length > 0) {
          await tx.projectMember.createMany({
            data: data.customerIds.map((userId) => ({ projectId: id, userId, role: 'customer' })),
          });
        }

        if (data.supportIds && data.supportIds.length > 0) {
          await tx.projectMember.createMany({
            data: data.supportIds.map((userId, idx) => ({
              projectId: id,
              userId,
              role: idx === 0 ? 'main_support' : 'support',
            })),
          });
        }
      }

      return p;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Project update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[id] — 프로젝트 비활성화 (soft-delete, admin only)
 * 활성 티켓이 있으면 삭제 불가.
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

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Check for non-closed/non-cancelled tickets
    const activeTickets = await prisma.ticket.count({
      where: {
        projectId: id,
        status: { notIn: ['CLOSED', 'CANCELLED'] },
      },
    });

    if (activeTickets > 0) {
      return NextResponse.json(
        { success: false, error: { code: 'HAS_ACTIVE_TICKETS', message: `활성 티켓 ${activeTickets}건이 있어 비활성화할 수 없습니다.`, status: 422 } },
        { status: 422 },
      );
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.error({ error }, 'Project delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
