// Design Ref: §4 — POST /api/auth/login
// Plan SC: SC-08 RBAC, OWASP 로그인 보안

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { verifyPassword } from '@/lib/password';
import { createSession } from '@/lib/session';
import { logger } from '@/lib/logger';
import { ERRORS, BusinessError } from '@/lib/errors';
import { BUSINESS_RULES } from '@/lib/constants';

const loginSchema = z.object({
  loginId: z.string().min(1, '아이디를 입력해 주세요.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

// Rate limit: max attempts per IP within window
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 15 * 60; // 15 minutes in seconds
const RATE_LIMIT_PREFIX = 'login_rate:';

async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `${RATE_LIMIT_PREFIX}${ip}`;
  const current = await redis.get(key);
  if (current && parseInt(current, 10) >= RATE_LIMIT_MAX) {
    return false; // rate limited
  }
  return true;
}

async function incrementRateLimit(ip: string): Promise<void> {
  const key = `${RATE_LIMIT_PREFIX}${ip}`;
  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, RATE_LIMIT_WINDOW, 'NX');
  await pipeline.exec();
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || null;

  try {
    // Rate limit check
    if (!(await checkRateLimit(ip))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.',
            status: 429,
          },
        },
        { status: 429 },
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: '입력값이 올바르지 않습니다.',
            status: 400,
            fieldErrors,
          },
        },
        { status: 400 },
      );
    }

    const { loginId, password } = parsed.data;

    // Find user by loginId
    const user = await prisma.user.findUnique({
      where: { loginId },
    });

    if (!user) {
      await incrementRateLimit(ip);
      await recordLoginHistory(null, loginId, false, ip, userAgent, 'USER_NOT_FOUND');
      return NextResponse.json(ERRORS.INVALID_CREDENTIALS().toResponse(), { status: 401 });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await recordLoginHistory(user.id, loginId, false, ip, userAgent, 'ACCOUNT_LOCKED');
      return NextResponse.json(ERRORS.ACCOUNT_LOCKED().toResponse(), { status: 423 });
    }

    // Check if account is active
    if (!user.isActive) {
      await recordLoginHistory(user.id, loginId, false, ip, userAgent, 'ACCOUNT_INACTIVE');
      return NextResponse.json(ERRORS.ACCOUNT_INACTIVE().toResponse(), { status: 403 });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password);

    if (!isValidPassword) {
      await incrementRateLimit(ip);
      const newAttempts = user.loginAttempts + 1;

      // Lock account after max attempts
      if (newAttempts >= BUSINESS_RULES.LOGIN_MAX_ATTEMPTS) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            loginAttempts: newAttempts,
            lockedUntil: new Date(Date.now() + BUSINESS_RULES.LOGIN_LOCK_SECONDS * 1000),
          },
        });
        await recordLoginHistory(user.id, loginId, false, ip, userAgent, 'MAX_ATTEMPTS_EXCEEDED');
        return NextResponse.json(ERRORS.ACCOUNT_LOCKED().toResponse(), { status: 423 });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: newAttempts },
      });

      await recordLoginHistory(user.id, loginId, false, ip, userAgent, 'INVALID_PASSWORD');
      return NextResponse.json(ERRORS.INVALID_CREDENTIALS().toResponse(), { status: 401 });
    }

    // Reset login attempts on success
    if (user.loginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: 0, lockedUntil: null },
      });
    }

    // Record successful login
    await recordLoginHistory(user.id, loginId, true, ip, userAgent, null);

    // Check if must change password
    if (user.mustChangePassword) {
      // Create a temporary session for password change
      const sessionId = await createSession(
        user.id,
        user.loginId,
        user.name,
        user.type,
        user.companyId,
      );

      return NextResponse.json({
        success: true,
        data: {
          mustChangePassword: true,
          user: {
            id: user.id,
            loginId: user.loginId,
            name: user.name,
            type: user.type,
          },
        },
      });
    }

    // Create full session
    await createSession(
      user.id,
      user.loginId,
      user.name,
      user.type,
      user.companyId,
    );

    return NextResponse.json({
      success: true,
      data: {
        mustChangePassword: false,
        user: {
          id: user.id,
          loginId: user.loginId,
          name: user.name,
          type: user.type,
          companyId: user.companyId,
        },
      },
    });
  } catch (error) {
    if (error instanceof BusinessError) {
      return NextResponse.json(error.toResponse(), { status: error.status });
    }

    logger.error({ error, ip }, 'Login failed unexpectedly');

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '서버 오류가 발생했습니다.',
          status: 500,
        },
      },
      { status: 500 },
    );
  }
}

// Record login history for audit trail (개인정보보호법)
async function recordLoginHistory(
  userId: string | null,
  loginId: string,
  success: boolean,
  ipAddress: string,
  userAgent: string | null,
  failReason: string | null,
): Promise<void> {
  try {
    await prisma.loginHistory.create({
      data: {
        userId,
        loginId,
        success,
        ipAddress,
        userAgent,
        failReason,
      },
    });
  } catch (error) {
    // Non-critical — log but don't fail login
    logger.error({ error, loginId }, 'Failed to record login history');
  }
}
