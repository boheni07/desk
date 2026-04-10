// Design Ref: §4 -- GET/POST /api/tickets/[id]/comments
// Plan SC: FR-21 댓글, SC-08 RBAC, V2.0 내부 메모 분리

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { createNotificationsForUsers } from '@/lib/notification-helper';

type RouteParams = { params: Promise<{ id: string }> };

const createCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해 주세요.').max(5000, '댓글은 5000자 이내로 입력해 주세요.'),
  isInternal: z.boolean().optional().default(false),
  attachmentIds: z.array(z.string()).optional().default([]),
});

/**
 * GET /api/tickets/[id]/comments
 * List all comments for a ticket (sorted by createdAt ASC).
 * - Soft-deleted comments: show { isDeleted: true, content: '삭제된 댓글입니다.' }
 * - INTERNAL comments: hidden from customer users
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

    const { id: ticketId } = await params;

    // Verify ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        projectId: true,
        project: {
          select: {
            members: {
              where: { userId: session.userId },
              take: 1,
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: customer must be project member
    if (session.type === 'customer' && ticket.project.members.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: '해당 프로젝트에 접근 권한이 없습니다.', status: 403 } },
        { status: 403 },
      );
    }

    // Build where clause: hide INTERNAL comments from customers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { ticketId };
    if (session.type === 'customer') {
      where.type = 'PUBLIC';
    }

    const comments = await prisma.comment.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, type: true } },
        attachments: {
          select: { id: true, fileName: true, fileSize: true, mimeType: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map soft-deleted comments to masked content
    const mapped = comments.map((c) => ({
      id: c.id,
      ticketId: c.ticketId,
      type: c.type,
      content: c.isDeleted ? '삭제된 댓글입니다.' : c.content,
      isDeleted: c.isDeleted,
      isEdited: c.isEdited,
      author: c.author,
      attachments: c.isDeleted ? [] : c.attachments,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data: mapped });
  } catch (error) {
    logger.error({ error }, 'Comment list failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * POST /api/tickets/[id]/comments
 * Create a new comment.
 * - isInternal=true: only support/admin (customer cannot see internal comments)
 * - Notifies other participants via createNotification(COMMENT_CREATED)
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

    const { id: ticketId } = await params;

    const body = await request.json();
    const parsed = createCommentSchema.safeParse(body);

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

    const { content, isInternal, attachmentIds } = parsed.data;

    // Only support/admin can create internal comments
    if (isInternal && session.type === 'customer') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '내부 메모는 지원담당자만 작성할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    // Verify ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        projectId: true,
        registeredById: true,
        customerUserId: true,
        project: {
          select: {
            members: {
              where: { userId: session.userId },
              take: 1,
            },
          },
        },
        assignments: {
          select: { userId: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '티켓을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: customer must be project member
    if (session.type === 'customer' && ticket.project.members.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: '해당 프로젝트에 접근 권한이 없습니다.', status: 403 } },
        { status: 403 },
      );
    }

    // Block comments on closed/cancelled tickets
    if (ticket.status === 'CLOSED' || ticket.status === 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: { code: 'TICKET_CLOSED', message: '종료된 티켓에는 댓글을 작성할 수 없습니다.', status: 422 } },
        { status: 422 },
      );
    }

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        ticketId,
        authorId: session.userId,
        type: isInternal ? 'INTERNAL' : 'PUBLIC',
        content,
      },
      include: {
        author: { select: { id: true, name: true, type: true } },
        attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true } },
      },
    });

    // Link pre-uploaded attachments to this comment (uploaded by same user)
    if (attachmentIds.length > 0) {
      await prisma.attachment.updateMany({
        where: { id: { in: attachmentIds }, uploaderId: session.userId, commentId: null },
        data: { commentId: comment.id },
      });
    }

    // Notify other participants (skip self-notification)
    // Collect participant IDs: registeredBy, customerUser, assigned users
    const participantIds = new Set<string>();
    if (ticket.registeredById) participantIds.add(ticket.registeredById);
    if (ticket.customerUserId) participantIds.add(ticket.customerUserId);
    for (const a of ticket.assignments) participantIds.add(a.userId);

    // Remove current user (no self-notification)
    participantIds.delete(session.userId);

    // For internal comments, only notify support/admin participants
    let notifyUserIds = Array.from(participantIds);
    if (isInternal) {
      const users = await prisma.user.findMany({
        where: { id: { in: notifyUserIds }, type: { in: ['admin', 'support'] } },
        select: { id: true },
      });
      notifyUserIds = users.map((u) => u.id);
    }

    if (notifyUserIds.length > 0) {
      await createNotificationsForUsers(notifyUserIds, {
        type: 'COMMENT_CREATED',
        title: `새 댓글: ${ticket.ticketNumber}`,
        body: `${session.name}님이 "${ticket.title}" 티켓에 댓글을 작성했습니다.`,
        ticketId,
      });
    }

    // Re-fetch attachments to include newly linked ones
    const linked = await prisma.attachment.findMany({
      where: { commentId: comment.id },
      select: { id: true, fileName: true, fileSize: true, mimeType: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: comment.id,
        ticketId: comment.ticketId,
        type: comment.type,
        content: comment.content,
        isDeleted: comment.isDeleted,
        isEdited: comment.isEdited,
        author: comment.author,
        attachments: linked,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Comment creation failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
