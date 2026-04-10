// Local file upload endpoint (dev only, replaces R2 presigned PUT)

import { NextRequest, NextResponse } from 'next/server';
import { saveLocalFile } from '@/lib/r2';

export async function PUT(request: NextRequest) {
  try {
    const key = new URL(request.url).searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 });
    }

    const data = Buffer.from(await request.arrayBuffer());
    await saveLocalFile(key, data);

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error('Local upload failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
