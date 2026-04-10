// Design Ref: §4 — POST /api/auth/logout
// Plan SC: SC-08 RBAC

import { NextResponse } from 'next/server';
import { getSession, deleteSession, clearSessionCookies } from '@/lib/session';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    const session = await getSession();

    if (session) {
      await deleteSession(session.sessionId);
    }

    await clearSessionCookies();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Logout failed');

    // Still clear cookies even if Redis fails
    try {
      await clearSessionCookies();
    } catch {
      // Ignore
    }

    return NextResponse.json({ success: true });
  }
}
