// Design Ref: §6 -- File storage (Cloudflare R2 or local fallback for dev)
// Plan SC: FR-10 첨부파일, FR-21 댓글 첨부

import { randomUUID } from 'crypto';
import { FILE_LIMITS } from './constants';
import path from 'path';
import fs from 'fs/promises';

// Detect if R2 is configured
const USE_R2 = !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);

// Local upload directory for dev
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';

// Lazy-init R2 client only when configured
let r2: import('@aws-sdk/client-s3').S3Client | null = null;
function getR2() {
  if (!r2) {
    const { S3Client } = require('@aws-sdk/client-s3');
    r2 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return r2;
}

const BUCKET = process.env.R2_BUCKET_NAME || 'nu-servicedesk';

/**
 * Build a unique key for an attachment.
 */
export function buildR2Key(ticketId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `tickets/${ticketId}/${randomUUID()}-${sanitized}`;
}

/**
 * Generate a presigned URL for uploading.
 * R2 mode: returns S3 presigned PUT URL.
 * Local mode: returns local API upload endpoint.
 */
export async function generateUploadPresignUrl(
  key: string,
  contentType: string,
): Promise<string> {
  if (USE_R2) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
    return getSignedUrl(getR2(), command, { expiresIn: FILE_LIMITS.PRESIGN_UPLOAD_TTL });
  }
  // Local mode: return a local upload endpoint
  return `${APP_URL}/api/attachments/local-upload?key=${encodeURIComponent(key)}`;
}

/**
 * Generate a presigned URL for downloading.
 */
export async function generateDownloadPresignUrl(key: string): Promise<string> {
  if (USE_R2) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    return getSignedUrl(getR2(), command, { expiresIn: FILE_LIMITS.PRESIGN_DOWNLOAD_TTL });
  }
  // Local mode: serve from public/uploads
  return `${APP_URL}/uploads/${key}`;
}

/**
 * Delete a file.
 */
export async function deleteFile(key: string): Promise<void> {
  if (USE_R2) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
    await getR2().send(command);
    return;
  }
  // Local mode
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Save a file to local storage (dev only).
 */
export async function saveLocalFile(key: string, data: Buffer): Promise<void> {
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}
