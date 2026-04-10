// Design Ref: §6 -- Cloudflare R2 file storage (S3-compatible, presigned URLs)
// Plan SC: FR-10 첨부파일, FR-21 댓글 첨부

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { FILE_LIMITS } from './constants';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!, // https://{accountId}.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'nu-servicedesk';

/**
 * Build a unique R2 key for a ticket attachment.
 * Format: tickets/{ticketId}/{uuid}-{sanitizedFilename}
 */
export function buildR2Key(ticketId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `tickets/${ticketId}/${randomUUID()}-${sanitized}`;
}

/**
 * Generate a presigned URL for uploading a file to R2.
 * TTL: FILE_LIMITS.PRESIGN_UPLOAD_TTL (300 seconds = 5 minutes)
 */
export async function generateUploadPresignUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2, command, {
    expiresIn: FILE_LIMITS.PRESIGN_UPLOAD_TTL,
  });
}

/**
 * Generate a presigned URL for downloading a file from R2.
 * TTL: FILE_LIMITS.PRESIGN_DOWNLOAD_TTL (3600 seconds = 1 hour)
 */
export async function generateDownloadPresignUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(r2, command, {
    expiresIn: FILE_LIMITS.PRESIGN_DOWNLOAD_TTL,
  });
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  await r2.send(command);
}
