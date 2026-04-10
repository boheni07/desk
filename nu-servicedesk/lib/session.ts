// Design Ref: §7.1 — Redis-backed server sessions + role_hint HMAC signing
// Plan SC: SC-08 RBAC, OWASP 비밀번호 변경 시 전체 세션 폐기

import { randomBytes, createHmac } from 'crypto';
import { cookies } from 'next/headers';
import { redis } from './redis';
import { BUSINESS_RULES } from './constants';
import { logger } from './logger';
import type { RedisSession, UserType } from '@/types/auth';

const SESSION_TTL = BUSINESS_RULES.SESSION_TTL_SECONDS; // 28800 (8 hours)
const SESSION_PREFIX = 'session:';
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
  return secret;
}

/**
 * Sign a role string with HMAC-SHA256 (truncated to 16 hex chars).
 */
export function signRoleHint(role: string): string {
  const secret = getRoleHintSecret();
  const signature = createHmac('sha256', secret).update(role).digest('hex').slice(0, 16);
  return `${role}.${signature}`;
}

/**
 * Verify a role_hint cookie value.
 * Returns the role if valid, null otherwise.
 */
export function verifyRoleHint(value: string): string | null {
  try {
    const dotIndex = value.lastIndexOf('.');
    if (dotIndex === -1) return null;

    const role = value.slice(0, dotIndex);
    const sig = value.slice(dotIndex + 1);
    const secret = getRoleHintSecret();
    const expected = createHmac('sha256', secret).update(role).digest('hex').slice(0, 16);

    return sig === expected ? role : null;
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
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
  logger.info({ sessionId: sessionId.slice(0, 8) + '...' }, 'Session deleted');
}

/**
 * Delete all sessions for a given user.
 * Used when password is changed (OWASP requirement, V2.1 spec).
 *
 * Note: Uses SCAN instead of KEYS for production safety.
 */
export async function deleteAllUserSessions(userId: string): Promise<number> {
  let deleted = 0;
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${SESSION_PREFIX}*`, 'COUNT', 100);
    cursor = nextCursor;

    for (const key of keys) {
      try {
        const data = await redis.get(key);
        if (data) {
          const session: RedisSession = JSON.parse(data);
          if (session.userId === userId) {
            await redis.del(key);
            deleted++;
          }
        }
      } catch {
        // Skip malformed session data
      }
    }
  } while (cursor !== '0');

  logger.info({ userId, deleted }, 'All user sessions deleted');
  return deleted;
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
