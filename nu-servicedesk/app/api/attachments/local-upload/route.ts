// Local file upload endpoint (dev only, replaces R2 presigned PUT)
// Security: requires authentication, validates path traversal, enforces file size limit

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { saveLocalFile } from '@/lib/r2';
import { FILE_LIMITS } from '@/lib/constants';
import path from 'path';

export async function PUT(request: NextRequest) {
  try {
    // Authentication required
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const key = new URL(request.url).searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    // Path traversal prevention
    const normalized = path.normalize(key);
    if (normalized.includes('..') || path.isAbsolute(normalized)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
    }

    // File size validation
    const data = Buffer.from(await request.arrayBuffer());
    if (data.length > FILE_LIMITS.MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    if (data.length === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    await saveLocalFile(key, data);

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('Local upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
