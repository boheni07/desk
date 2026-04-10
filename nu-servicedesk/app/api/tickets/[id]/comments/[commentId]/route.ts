// Design Ref: §4 -- PUT/DELETE /api/tickets/[id]/comments/[commentId]
// Plan SC: FR-21 댓글 수정/삭제, V2.0 10분 수정 제한 (서버 검증)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { differenceInMinutes } from 'date-fns';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { ERRORS } from '@/lib/errors';
import { BUSINESS_RULES } from '@/lib/constants';

type RouteParams = { params: Promise<{ id: string; commentId: string }> };

const updateCommentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해 주세요.').max(5000, '댓글은 5000자 이내로 입력해 주세요.'),
});

/**
 * PUT /api/tickets/[id]/comments/[commentId]
 * Edit a comment.
 * V2.0: Server checks differenceInMinutes(now, comment.createdAt) <= 10
 * Only the author can edit. Cannot edit deleted comments.
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

    const { commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        author: { select: { id: true, name: true, type: true } },
      },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '댓글을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Cannot edit deleted comments
    if (comment.isDeleted) {
      return NextResponse.json(
        { success: false, error: { code: 'COMMENT_DELETED', message: '삭제된 댓글은 수정할 수 없습니다.', status: 422 } },
        { status: 422 },
      );
    }

    // Only author can edit
    if (comment.authorId !== session.userId) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '작성자만 수정할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    // V2.0: Server-side 10-minute edit limit (prevents client bypass)
    const minutesSinceCreation = differenceInMinutes(new Date(), comment.createdAt);
    if (minutesSinceCreation > BUSINESS_RULES.COMMENT_EDIT_LIMIT_MINUTES) {
      const err = ERRORS.COMMENT_EDIT_EXPIRED();
      return NextResponse.json(err.toResponse(), { status: err.status });
    }

    const body = await request.json();
    const parsed = updateCommentSchema.safeParse(body);

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

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: {
        content: parsed.data.content,
        isEdited: true,
      },
      include: {
        author: { select: { id: true, name: true, type: true } },
        attachments: {
          select: { id: true, fileName: true, fileSize: true, mimeType: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        ticketId: updated.ticketId,
        type: updated.type,
        content: updated.content,
        isDeleted: updated.isDeleted,
        isEdited: updated.isEdited,
        author: updated.author,
        attachments: updated.attachments,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Comment update failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/tickets/[id]/comments/[commentId]
 * Soft-delete a comment (set isDeleted=true, clear content).
 * Author or admin can delete. Cannot un-delete.
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

    const { commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '댓글을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Already deleted — idempotent
    if (comment.isDeleted) {
      return NextResponse.json({ success: true, data: { id: comment.id, isDeleted: true } });
    }

    // Only author or admin can delete
    if (comment.authorId !== session.userId && session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '작성자 또는 관리자만 삭제할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    await prisma.comment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        content: '', // Clear content on soft-delete
      },
    });

    return NextResponse.json({ success: true, data: { id: commentId, isDeleted: true } });
  } catch (error) {
    logger.error({ error }, 'Comment delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
