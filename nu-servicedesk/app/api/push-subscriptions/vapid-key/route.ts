// Design Ref: §4 -- GET /api/push-subscriptions/vapid-key
// Plan SC: FR-23 VAPID public key endpoint (no auth required)

import { NextResponse } from 'next/server';

/**
 * GET /api/push-subscriptions/vapid-key
 * Returns the VAPID public key for client-side push subscription.
 * No authentication required -- browser needs this before user is logged in.
 */
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return NextResponse.json(
      { success: false, error: { code: 'CONFIG_ERROR', message: 'VAPID key not configured', status: 500 } },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, publicKey });
}
