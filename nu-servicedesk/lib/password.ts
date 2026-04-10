// Design Ref: §7 — Password hashing + validation
// Plan SC: SC-08 RBAC 완전 적용 (비밀번호 규칙 포함)

import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

/**
 * Generate a secure random initial password satisfying complexity requirements.
 * 2 uppercase + 2 lowercase + 2 digits + 2 special characters, shuffled (8 chars total).
 */
/** Unbiased random index using rejection sampling */
function secureRandomIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  let r: number;
  do {
    r = randomBytes(1)[0];
  } while (r >= limit);
  return r % max;
}

export function generateInitialPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '@#$!';

  const parts = [
    upper[secureRandomIndex(upper.length)],
    upper[secureRandomIndex(upper.length)],
    lower[secureRandomIndex(lower.length)],
    lower[secureRandomIndex(lower.length)],
    digits[secureRandomIndex(digits.length)],
    digits[secureRandomIndex(digits.length)],
    special[secureRandomIndex(special.length)],
    special[secureRandomIndex(special.length)],
  ];

  // Fisher-Yates shuffle
  for (let i = parts.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return parts.join('');
}

/**
 * Hash a plain-text password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plain-text password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength.
 *
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('비밀번호는 최소 8자 이상이어야 합니다.');
  }

  if (password.length > 72) {
    errors.push('비밀번호는 72자 이내여야 합니다.');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('대문자를 최소 1자 포함해야 합니다.');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('소문자를 최소 1자 포함해야 합니다.');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('숫자를 최소 1자 포함해야 합니다.');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push('특수문자를 최소 1자 포함해야 합니다.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
