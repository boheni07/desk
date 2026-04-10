// Design Ref: §4 — GET/POST /api/tickets
// Plan SC: FR-09 채번, FR-10 티켓 등록, FR-22 티켓 목록, SC-08 RBAC

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { BUSINESS_RULES } from '@/lib/constants';
import { generateTicketNumber } from '@/lib/ticket-number';
import { addBusinessDays } from '@/lib/business-hours';
import { createNotificationsForUsers } from '@/lib/notification-helper';

const createTicketSchema = z.object({
  title: z.string().min(1, '제목을 입력해 주세요.').max(200, '제목은 200자 이내로 입력해 주세요.'),
  content: z.string().min(1, '내용을 입력해 주세요.'),
  projectId: z.string().min(1, '프로젝트를 선택해 주세요.'),
  categoryId: z.string().min(1, '카테고리를 선택해 주세요.'),
  priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '처리희망일 형식은 YYYY-MM-DD입니다.').optional(),
  urgencyReason: z.string().max(500, '긴급 사유는 500자 이내로 입력해 주세요.').optional(),
  registrationMethod: z.enum(['DIRECT', 'PHONE', 'EMAIL', 'OTHER']).optional().default('DIRECT'),
});

// Allowlists for query param validation
const VALID_STATUSES = new Set(['REGISTERED','RECEIVED','IN_PROGRESS','DELAYED','EXTEND_REQUESTED','COMPLETE_REQUESTED','SATISFACTION_PENDING','CLOSED','CANCELLED']);
const VALID_PRIORITIES = new Set(['URGENT','HIGH','NORMAL','LOW']);
const VALID_SORT_BY = new Set(['createdAt','deadline','priority']);
const VALID_SORT_ORDER = new Set(['asc','desc']);

/**
 * GET /api/tickets — 티켓 목록 (RBAC 필터링)
 * admin: 전체 조회
 * support: 배정된 프로젝트 또는 자신에게 배정된 티켓
 * customer: 자신이 속한 프로젝트의 티켓만
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

    // Module 9B: Enhanced filters
    const status = searchParams.get('status') || '';          // comma-separated: REGISTERED,RECEIVED
    const priority = searchParams.get('priority') || '';      // comma-separated: HIGH,URGENT
    const projectId = searchParams.get('projectId') || '';
    const assigneeId = searchParams.get('assigneeId') || '';
    const search = searchParams.get('search')?.trim() || '';
    const createdFrom = searchParams.get('createdFrom') || '';  // ISO date string
    const createdTo = searchParams.get('createdTo') || '';      // ISO date string
    const sortBy = VALID_SORT_BY.has(searchParams.get('sortBy') || '') ? searchParams.get('sortBy')! : 'createdAt';
    const sortOrder = VALID_SORT_ORDER.has(searchParams.get('sortOrder') || '') ? searchParams.get('sortOrder')! : 'desc';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    // Filters: comma-separated multi-select for status and priority
    if (status) {
      const statuses = status.split(',').filter(Boolean).filter(s => VALID_STATUSES.has(s));
      if (statuses.length === 1) {
        where.status = statuses[0];
      } else if (statuses.length > 1) {
        where.status = { in: statuses };
      }
    }
    if (priority) {
      const priorities = priority.split(',').filter(Boolean).filter(p => VALID_PRIORITIES.has(p));
      if (priorities.length === 1) {
        where.priority = priorities[0];
      } else if (priorities.length > 1) {
        where.priority = { in: priorities };
      }
    }
    if (projectId) {
      where.projectId = projectId;
    }
    if (assigneeId) {
      where.assignments = { some: { userId: assigneeId } };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { ticketNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Date range filter
    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) {
        where.createdAt.gte = new Date(createdFrom);
      }
      if (createdTo) {
        // Include the entire end date (set to end of day)
        const endDate = new Date(createdTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    // RBAC filtering
    if (session.type === 'customer') {
      // Customer: only tickets in projects they are assigned to
      where.project = {
        members: { some: { userId: session.userId } },
      };
    } else if (session.type === 'support') {
      // Support: tickets assigned to them OR unassigned in their projects
      const rbacOr = [
        { assignments: { some: { userId: session.userId } } },
        { project: { members: { some: { userId: session.userId } } } },
      ];

      if (search) {
        const searchOr = [
          { title: { contains: search, mode: 'insensitive' } },
          { ticketNumber: { contains: search, mode: 'insensitive' } },
        ];
        delete where.OR;
        where.AND = [
          { OR: searchOr },
          { OR: rbacOr },
        ];
      } else {
        where.OR = rbacOr;
      }
    }
    // admin: no additional filtering

    // Module 9B: Sorting
    // Priority sort needs a custom mapping since Prisma sorts enums alphabetically
    const PRIORITY_SORT_MAP: Record<string, number> = {
      URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orderBy: any;
    if (sortBy === 'deadline') {
      // Sort with nulls last for deadline
      orderBy = { deadline: sortOrder === 'asc' ? 'asc' : 'desc' };
    } else if (sortBy === 'priority') {
      orderBy = { priority: sortOrder === 'asc' ? 'asc' : 'desc' };
    } else {
      orderBy = { createdAt: sortOrder === 'asc' ? 'asc' : 'desc' };
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          project: { select: { id: true, name: true, company: { select: { id: true, name: true } } } },
          category: { select: { id: true, name: true } },
          assignments: {
            include: {
              user: { select: { id: true, name: true } },
            },
            take: 3,
          },
          registeredBy: { select: { id: true, name: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: { tickets, total, page, limit },
    });
  } catch (error) {
    logger.error({ error }, 'Ticket list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/tickets — 티켓 등록
 * customer, support 가능
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

    const body = await request.json();
    const parsed = createTicketSchema.safeParse(body);

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

    const { title, content, projectId, categoryId, priority, desiredDate, urgencyReason, registrationMethod } = parsed.data;

    // Verify project exists and is active
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { members: { where: { userId: session.userId } } },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '프로젝트를 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    if (!project.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'PROJECT_INACTIVE', message: '비활성 프로젝트에는 티켓을 등록할 수 없습니다.', status: 422 } },
        { status: 422 },
      );
    }

    // RBAC: customer/support must be member of the project
    if (session.type !== 'admin' && project.members.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: '해당 프로젝트에 접근 권한이 없습니다.', status: 403 } },
        { status: 403 },
      );
    }

    // Verify category exists and is active
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || !category.isActive) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CATEGORY', message: '유효하지 않은 카테고리입니다.', status: 400 } },
        { status: 400 },
      );
    }

    // Validate desiredDate is not in the past
    if (desiredDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const desired = new Date(desiredDate);
      if (desired < today) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '입력값이 올바르지 않습니다.',
              status: 400,
              fieldErrors: { desiredDate: ['처리희망일은 오늘 이후여야 합니다.'] },
            },
          },
          { status: 400 },
        );
      }
    }

    // Calculate desired date (default: +5 business days)
    const currentYear = new Date().getFullYear();
    const holidays = await prisma.holiday.findMany({
      where: { year: { in: [currentYear - 1, currentYear, currentYear + 1] } },
      select: { date: true },
    });
    const holidayDates = holidays.map((h) => h.date);

    const desiredDateValue = desiredDate
      ? new Date(desiredDate)
      : addBusinessDays(new Date(), BUSINESS_RULES.DESIRED_DATE_DEFAULT_DAYS, holidayDates);

    // Generate ticket number
    const ticketNumber = await generateTicketNumber();

    // Create ticket + satisfaction rating stub in transaction
    const ticket = await prisma.$transaction(async (tx) => {
      const newTicket = await tx.ticket.create({
        data: {
          ticketNumber,
          projectId,
          title,
          content,
          categoryId,
          priority,
          status: 'REGISTERED',
          desiredDate: desiredDateValue,
          registeredById: session.userId,
          customerUserId: session.type === 'customer' ? session.userId : null,
          urgencyReason: urgencyReason || null,
          registrationMethod,
        },
        include: {
          project: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          registeredBy: { select: { id: true, name: true } },
        },
      });

      // Create SatisfactionRating stub
      await tx.satisfactionRating.create({
        data: {
          ticketId: newTicket.id,
        },
      });

      // Record initial status history
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: newTicket.id,
          previousStatus: 'REGISTERED',
          newStatus: 'REGISTERED',
          actorId: session.userId,
          actorType: 'USER',
          reason: '티켓 등록',
        },
      });

      return newTicket;
    });

    // Send TICKET_CREATED notification to project's main_support assignees
    const mainSupportMembers = await prisma.projectMember.findMany({
      where: { projectId, role: 'main_support' },
      select: { userId: true },
    });
    const recipientIds = mainSupportMembers.map((m) => m.userId);
    if (recipientIds.length > 0) {
      createNotificationsForUsers(recipientIds, {
        type: 'TICKET_CREATED',
        title: '새 티켓이 등록되었습니다',
        body: `[${ticket.ticketNumber}] ${title}`,
        ticketId: ticket.id,
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Ticket creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
