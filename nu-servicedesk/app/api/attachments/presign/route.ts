// Design Ref: §4 -- POST /api/attachments/presign
// Plan SC: FR-10 첨부파일 업로드 (Cloudflare R2 presigned URL)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { FILE_LIMITS } from '@/lib/constants';
import { buildR2Key, generateUploadPresignUrl } from '@/lib/r2';

const presignSchema = z.object({
  ticketId: z.string().min(1, '티켓 ID가 필요합니다.'),
  filename: z.string().min(1, '파일명이 필요합니다.'),
  contentType: z.string().min(1, 'Content-Type이 필요합니다.'),
  fileSize: z.number().int().positive('파일 크기가 유효하지 않습니다.'),
});

/**
 * POST /api/attachments/presign
 * Generate a presigned upload URL for Cloudflare R2.
 * Validates extension and file size before issuing URL.
 * Creates Attachment record in DB (pending until client completes upload).
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
    const parsed = presignSchema.safeParse(body);

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

    const { ticketId, filename, contentType, fileSize } = parsed.data;

    // Validate file extension
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (!FILE_LIMITS.ALLOWED_EXTENSIONS.includes(ext as typeof FILE_LIMITS.ALLOWED_EXTENSIONS[number])) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_TYPE_NOT_ALLOWED', message: `허용되지 않는 파일 형식입니다. 허용: ${FILE_LIMITS.ALLOWED_EXTENSIONS.join(', ')}`, status: 400 } },
        { status: 400 },
      );
    }

    if (FILE_LIMITS.BLOCKED_EXTENSIONS.includes(ext as typeof FILE_LIMITS.BLOCKED_EXTENSIONS[number])) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_TYPE_BLOCKED', message: '차단된 파일 형식입니다.', status: 400 } },
        { status: 400 },
      );
    }

    // Validate file size
    if (fileSize > FILE_LIMITS.MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_TOO_LARGE', message: `파일 크기가 ${FILE_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB를 초과합니다.`, status: 413 } },
        { status: 413 },
      );
    }

    // Verify ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
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

    // Check per-ticket total size limit
    const existingTotal = await prisma.attachment.aggregate({
      where: { ticketId },
      _sum: { fileSize: true },
    });
    const currentTotal = existingTotal._sum.fileSize || 0;
    if (currentTotal + fileSize > FILE_LIMITS.MAX_TICKET_TOTAL) {
      return NextResponse.json(
        { success: false, error: { code: 'FILE_TOO_LARGE', message: `티켓 첨부파일 총 용량(${FILE_LIMITS.MAX_TICKET_TOTAL / 1024 / 1024}MB)을 초과합니다.`, status: 413 } },
        { status: 413 },
      );
    }

    // Build R2 key and generate presigned URL
    const r2Key = buildR2Key(ticketId, filename);
    const presignedUrl = await generateUploadPresignUrl(r2Key, contentType);

    // Create attachment record in DB
    const attachment = await prisma.attachment.create({
      data: {
        ticketId,
        uploaderId: session.userId,
        fileName: filename,
        fileSize,
        mimeType: contentType,
        r2Key,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        attachmentId: attachment.id,
        presignedUrl,
        r2Key,
      },
    }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Attachment presign failed');
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: '서버 오류가 발생했습니다.', status: 500 } },
      { status: 500 },
    );
  }
}
