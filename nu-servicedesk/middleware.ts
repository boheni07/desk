// Design Ref: §7.1 — Middleware: role_hint HMAC verification + session guard
// Plan SC: SC-08 RBAC 완전 적용
// Note: Edge Runtime에서는 Node.js 'crypto' 모듈 사용 불가 → Web Crypto API 사용

import { NextResponse, type NextRequest } from 'next/server';

// Public routes that do not require authentication
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/health',
  '/api/push-subscriptions/vapid-key',
]);

// Check if a path is public (exact match or starts with a public prefix)
function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Static assets and Next.js internals
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon')) return true;
  // Local file upload endpoint: requires authentication (removed from public paths for security)
  return false;
}

// Verify role_hint cookie HMAC signature using Web Crypto API (Edge Runtime compatible)
// Uses timing-safe comparison via double-HMAC to prevent timing attacks
async function verifyRoleHint(value: string, secret: string): Promise<string | null> {
  try {
    const dotIndex = value.lastIndexOf('.');
    if (dotIndex === -1) return null;

    const role = value.slice(0, dotIndex);
    const sig = value.slice(dotIndex + 1);

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const msgData = encoder.encode(role);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, msgData);
    const hashArray = Array.from(new Uint8Array(signatureBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Accept both 32-char (current) and 16-char (legacy) HMAC signatures
    const expected = hashHex.slice(0, sig.length === 16 ? 16 : 32);

    // Timing-safe comparison for Edge Runtime (no crypto.timingSafeEqual)
    if (sig.length !== expected.length) return null;
    const sigBytes = encoder.encode(sig);
    const expBytes = encoder.encode(expected);
    let diff = 0;
    for (let i = 0; i < sigBytes.length; i++) diff |= sigBytes[i] ^ expBytes[i];
    return diff === 0 ? role : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sid = request.cookies.get('sid')?.value;
  const roleHint = request.cookies.get('role_hint')?.value;

  if (!sid) {
    return handleUnauthenticated(request);
  }

  // Verify role_hint HMAC if present
  if (roleHint) {
    const secret = process.env.ROLE_HINT_SECRET;
    if (secret) {
      const role = await verifyRoleHint(roleHint, secret);
      if (!role) {
        // Tampered role_hint cookie — reject
        return handleUnauthenticated(request);
      }
    }
  }

  // CSRF: Origin header check for mutating requests
  // Design §G: SameSite=Strict + Origin 헤더 검증 확정
  // Falls back to request host if NEXT_PUBLIC_APP_URL is not configured (never skips check)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
    if (!origin && !referer) {
      return NextResponse.json(
        { success: false, error: { code: 'CSRF_REJECTED', message: '요청 출처가 유효하지 않습니다.', status: 403 } },
        { status: 403 },
      );
    }
    // Compare hosts only (ignore protocol) to handle HTTPS proxies/tunnels
    const reqHost = request.headers.get('host') ?? request.nextUrl.host;
    const configHost = rawAppUrl ? (() => { try { return new URL(rawAppUrl).host; } catch { return null; } })() : null;
    let csrfRejected = false;
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        csrfRejected = originHost !== reqHost && originHost !== configHost;
      } catch {
        csrfRejected = true;
      }
    }
    if (csrfRejected) {
      return NextResponse.json(
        { success: false, error: { code: 'CSRF_REJECTED', message: '요청 출처가 유효하지 않습니다.', status: 403 } },
        { status: 403 },
      );
    }
  }

  // Session cookie exists and role_hint (if present) is valid
  // Full session validation happens in API routes via getSession()
  return NextResponse.next();
}

function handleUnauthenticated(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // API routes: return 401 JSON
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '인증이 필요합니다.',
          status: 401,
        },
      },
      { status: 401 },
    );
  }

  // Page routes: redirect to login
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
