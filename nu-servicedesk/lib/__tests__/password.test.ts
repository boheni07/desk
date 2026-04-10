// 테스트: generateInitialPassword 보안 속성
// Fix 커버: [HIGH] 예측 가능한 Desk@{loginId} 패턴 제거

import { describe, it, expect } from 'vitest';
import { generateInitialPassword } from '../password';

describe('generateInitialPassword', () => {
  // ──────────────────────────────────────────
  // 형식 및 복잡도 요구사항
  // ──────────────────────────────────────────

  it('8자 길이를 반환한다', () => {
    const pw = generateInitialPassword();
    expect(pw).toHaveLength(8);
  });

  it('대문자를 최소 1자 포함한다', () => {
    const pw = generateInitialPassword();
    expect(/[A-Z]/.test(pw)).toBe(true);
  });

  it('소문자를 최소 1자 포함한다', () => {
    const pw = generateInitialPassword();
    expect(/[a-z]/.test(pw)).toBe(true);
  });

  it('숫자를 최소 1자 포함한다', () => {
    const pw = generateInitialPassword();
    expect(/[0-9]/.test(pw)).toBe(true);
  });

  it('특수문자(@#$!)를 최소 1자 포함한다', () => {
    const pw = generateInitialPassword();
    expect(/[@#$!]/.test(pw)).toBe(true);
  });

  it('허용 문자 집합 외의 문자를 포함하지 않는다', () => {
    const allowed = /^[A-HJ-NP-Za-hj-np-z2-9@#$!]+$/;
    for (let i = 0; i < 20; i++) {
      expect(allowed.test(generateInitialPassword())).toBe(true);
    }
  });

  // ──────────────────────────────────────────
  // 랜덤성 검증
  // ──────────────────────────────────────────

  it('동일한 비밀번호를 반복 생성하지 않는다 (10회)', () => {
    const passwords = new Set(Array.from({ length: 10 }, () => generateInitialPassword()));
    // 10회 중 최소 5개 이상 다른 값이 나와야 한다 (동일 확률 ≈ 1/문자수^8)
    expect(passwords.size).toBeGreaterThanOrEqual(5);
  });

  it('loginId를 포함하지 않는다 (구 패턴 Desk@loginId 퇴출 검증)', () => {
    const loginId = 'testuser';
    for (let i = 0; i < 20; i++) {
      expect(generateInitialPassword()).not.toContain(loginId);
    }
  });

  it('Desk@ 패턴으로 시작하지 않는다', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateInitialPassword().startsWith('Desk@')).toBe(false);
    }
  });

  // ──────────────────────────────────────────
  // 비밀번호 강도 규칙 통과 (validatePasswordStrength 연동)
  // ──────────────────────────────────────────

  it('validatePasswordStrength를 통과한다', async () => {
    const { validatePasswordStrength } = await import('../password');
    for (let i = 0; i < 10; i++) {
      const pw = generateInitialPassword();
      const result = validatePasswordStrength(pw);
      expect(result.valid).toBe(true);
    }
  });
});
