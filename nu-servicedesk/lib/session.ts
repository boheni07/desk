// Design Ref: §7.1 — Redis-backed server sessions + role_hint HMAC signing
// Plan SC: SC-08 RBAC, OWASP 비밀번호 변경 시 전체 세션 폐기

import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redis } from './redis';
import { BUSINESS_RULES } from './constants';
import { logger } from './logger';
import type { RedisSession, UserType } from '@/types/auth';

const SESSION_TTL = BUSINESS_RULES.SESSION_TTL_SECONDS; // 28800 (8 hours)
const SESSION_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';
const COOKIE_SID = 'sid';
const COOKIE_ROLE_HINT = 'role_hint';

const isProduction = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// role_hint HMAC signing (V2.1: separate ROLE_HINT_SECRET)
// ---------------------------------------------------------------------------

function getRoleHintSecret(): string {
  const secret = process.env.ROLE_HINT_SECRET;
  if (!secret) {
    throw new Error('ROLE_HINT_SECRET environment variable is not set');
  }
  if (secret.startsWith('change-me')) {
    logger.warn('ROLE_HINT_SECRET is still a placeholder value — change it before deploying to production');
  }
  return secret;
}


/**
 * Sign a role string with HMAC-SHA256 (truncated to 32 hex chars = 128 bits).
 */
export function signRoleHint(role: string): string {
  const secret = getRoleHintSecret();
  const signature = createHmac('sha256', secret).update(role).digest('hex').slice(0, 32);
  return `${role}.${signature}`;
}

/**
 * Verify a role_hint cookie value using timing-safe comparison.
 * Returns the role if valid, null otherwise.
 */
export function verifyRoleHint(value: string): string | null {
  try {
    const dotIndex = value.lastIndexOf('.');
    if (dotIndex === -1) return null;

    const role = value.slice(0, dotIndex);
    const sig = value.slice(dotIndex + 1);
    const secret = getRoleHintSecret();
    // Accept both 32-char (current) and 16-char (legacy) HMAC signatures
    const fullHmac = createHmac('sha256', secret).update(role).digest('hex');
    const expected = fullHmac.slice(0, sig.length === 16 ? 16 : 32);

    if (sig.length !== expected.length) return null;
    const isValid = timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return isValid ? role : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random session ID.
 */
function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a new server session.
 * Stores session data in Redis and sets HttpOnly cookies.
 */
export async function createSession(
  userId: string,
  loginId: string,
  name: string,
  type: UserType,
  companyId: string | null,
): Promise<string> {
  const sessionId = generateSessionId();
  const now = new Date().toISOString();

  const sessionData: RedisSession = {
    userId,
    loginId,
    name,
    type,
    companyId,
    createdAt: now,
    lastAccessAt: now,
  };

  await redis.set(
    `${SESSION_PREFIX}${sessionId}`,
    JSON.stringify(sessionData),
    'EX',
    SESSION_TTL,
  );

  // Index: track session ID per user for efficient bulk deletion
  await redis.sadd(`${USER_SESSIONS_PREFIX}${userId}`, sessionId);
  await redis.expire(`${USER_SESSIONS_PREFIX}${userId}`, SESSION_TTL);

  // Set cookies
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_SID, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL,
  });

  cookieStore.set(COOKIE_ROLE_HINT, signRoleHint(type), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL,
  });

  logger.info({ userId, type }, 'Session created');

  return sessionId;
}

/**
 * Retrieve the current session from the request cookies.
 * Implements sliding expiry: refreshes TTL on every access.
 * Returns null if no valid session exists.
 */
export async function getSession(): Promise<(RedisSession & { sessionId: string }) | null> {
  try {
    const cookieStore = await cookies();
    const sidCookie = cookieStore.get(COOKIE_SID);

    if (!sidCookie?.value) {
      return null;
    }

    const sessionId = sidCookie.value;
    const key = `${SESSION_PREFIX}${sessionId}`;
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    const session: RedisSession = JSON.parse(data);

    // Sliding expiry: refresh TTL and lastAccessAt
    session.lastAccessAt = new Date().toISOString();
    await redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL);

    return { ...session, sessionId };
  } catch (error) {
    logger.error({ error }, 'Failed to get session');
    return null;
  }
}

/**
 * Delete a specific session by its ID.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  // Read session to get userId for index cleanup
  const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
  if (data) {
    try {
      const session: RedisSession = JSON.parse(data);
      await redis.srem(`${USER_SESSIONS_PREFIX}${session.userId}`, sessionId);
    } catch { /* skip if malformed */ }
  }
  logger.info('Session deleted');
}

/**
 * Delete all sessions for a given user.
 * Used when password is changed (OWASP requirement, V2.1 spec).
 *
 * Uses user_sessions:{userId} Set index for O(1) lookup instead of SCAN.
 */
export async function deleteAllUserSessions(userId: string): Promise<number> {
  const indexKey = `${USER_SESSIONS_PREFIX}${userId}`;
  const sessionIds = await redis.smembers(indexKey);

  if (sessionIds.length === 0) return 0;

  const pipeline = redis.pipeline();
  for (const sid of sessionIds) {
    pipeline.del(`${SESSION_PREFIX}${sid}`);
  }
  pipeline.del(indexKey);
  await pipeline.exec();

  logger.info({ userId, deleted: sessionIds.length }, 'All user sessions deleted');
  return sessionIds.length;
}

/**
 * Clear session cookies (for logout).
 */
export async function clearSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_SID, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });

  cookieStore.set(COOKIE_ROLE_HINT, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}
