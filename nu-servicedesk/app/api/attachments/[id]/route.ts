// Design Ref: §4 -- GET/DELETE /api/attachments/[id]
// Plan SC: FR-10 첨부파일 다운로드/삭제

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { generateDownloadPresignUrl, deleteFile } from '@/lib/r2';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/attachments/[id]
 * Generate a fresh download presigned URL for an attachment.
 * Checks ticket access (same RBAC as ticket GET).
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

    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            id: true,
            project: {
              select: {
                members: {
                  where: { userId: session.userId },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '첨부파일을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // RBAC: customer must be project member
    if (session.type === 'customer' && attachment.ticket) {
      if (attachment.ticket.project.members.length === 0) {
        return NextResponse.json(
          { success: false, error: { code: 'PROJECT_ACCESS_DENIED', message: '해당 프로젝트에 접근 권한이 없습니다.', status: 403 } },
          { status: 403 },
        );
      }
    }

    const downloadUrl = await generateDownloadPresignUrl(attachment.r2Key);

    return NextResponse.json({
      success: true,
      data: {
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        downloadUrl,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Attachment download failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/attachments/[id]
 * Delete an attachment from R2 and DB.
 * Author or admin only.
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

    const { id } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '첨부파일을 찾을 수 없습니다.', status: 404 } },
        { status: 404 },
      );
    }

    // Only uploader or admin can delete
    if (attachment.uploaderId !== session.userId && session.type !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '업로더 또는 관리자만 삭제할 수 있습니다.', status: 403 } },
        { status: 403 },
      );
    }

    // Delete from R2 first, then from DB
    try {
      await deleteFile(attachment.r2Key);
    } catch (r2Error) {
      logger.warn({ r2Error, r2Key: attachment.r2Key }, 'R2 delete failed (proceeding with DB delete)');
    }

    await prisma.attachment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    logger.error({ error }, 'Attachment delete failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
