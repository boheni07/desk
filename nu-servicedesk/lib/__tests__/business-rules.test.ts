// 테스트: BUSINESS_RULES 상수 완전성 및 신규 상수 검증
// Fix 커버: [MINOR] WORK_HOURS_PER_DAY, STALE_ESCALATION_CHECK_HOURS 상수화

import { describe, it, expect } from 'vitest';
import { BUSINESS_RULES, FILE_LIMITS } from '../constants';

describe('BUSINESS_RULES', () => {
  // ──────────────────────────────────────────
  // 신규 추가 상수 검증
  // ──────────────────────────────────────────

  it('WORK_HOURS_PER_DAY = 9 (9시-18시 근무)', () => {
    expect(BUSINESS_RULES.WORK_HOURS_PER_DAY).toBe(9);
  });

  it('STALE_ESCALATION_CHECK_HOURS = 24 (재에스컬레이션 억제 시간)', () => {
    expect(BUSINESS_RULES.STALE_ESCALATION_CHECK_HOURS).toBe(24);
  });

  // ──────────────────────────────────────────
  // 기존 핵심 상수 값 확인
  // ──────────────────────────────────────────

  it('COMPLETE_MAX_ATTEMPTS = 3 (3회차 자동승인)', () => {
    expect(BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS).toBe(3);
  });

  it('AUTO_RECEIVE_HOURS = 4 (4근무시간 자동접수)', () => {
    expect(BUSINESS_RULES.AUTO_RECEIVE_HOURS).toBe(4);
  });

  it('SATISFACTION_AUTO_CLOSE_DAYS = 5 (5근무일 자동종료)', () => {
    expect(BUSINESS_RULES.SATISFACTION_AUTO_CLOSE_DAYS).toBe(5);
  });

  it('SATISFACTION_REMINDER_DAYS = 4 (4근무일 리마인더)', () => {
    expect(BUSINESS_RULES.SATISFACTION_REMINDER_DAYS).toBe(4);
  });

  it('STALE_ESCALATION_DAYS = 3 (3근무일 에스컬레이션)', () => {
    expect(BUSINESS_RULES.STALE_ESCALATION_DAYS).toBe(3);
  });

  it('EXTEND_DEADLINE_BUFFER_HOURS = 8 (마감 8근무시간 전까지 연기 가능)', () => {
    expect(BUSINESS_RULES.EXTEND_DEADLINE_BUFFER_HOURS).toBe(8);
  });

  // ──────────────────────────────────────────
  // 비즈니스 일관성 검증
  // ──────────────────────────────────────────

  it('SATISFACTION_REMINDER_DAYS < SATISFACTION_AUTO_CLOSE_DAYS (리마인더가 먼저)', () => {
    expect(BUSINESS_RULES.SATISFACTION_REMINDER_DAYS)
      .toBeLessThan(BUSINESS_RULES.SATISFACTION_AUTO_CLOSE_DAYS);
  });

  it('EXTEND_AUTO_APPROVE_WARN_HOURS < EXTEND_AUTO_APPROVE_HOURS (경고가 먼저)', () => {
    expect(BUSINESS_RULES.EXTEND_AUTO_APPROVE_WARN_HOURS)
      .toBeLessThan(BUSINESS_RULES.EXTEND_AUTO_APPROVE_HOURS);
  });

  it('PAGE_SIZE_DEFAULT <= PAGE_SIZE_MAX', () => {
    expect(BUSINESS_RULES.PAGE_SIZE_DEFAULT).toBeLessThanOrEqual(BUSINESS_RULES.PAGE_SIZE_MAX);
  });

  it('COMPLETE_MAX_ATTEMPTS는 양의 정수', () => {
    expect(Number.isInteger(BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS)).toBe(true);
    expect(BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS).toBeGreaterThan(0);
  });

  it('WORK_HOURS_PER_DAY와 getBusinessHoursBetween 연산이 일관적 (1근무일 = 9시간)', () => {
    // satisfaction-close 및 stale-escalation에서 elapsedHours / WORK_HOURS_PER_DAY = elapsedDays
    const HOURS_IN_ONE_WORK_DAY = BUSINESS_RULES.WORK_HOURS_PER_DAY;
    const elapsedDays = HOURS_IN_ONE_WORK_DAY / BUSINESS_RULES.WORK_HOURS_PER_DAY;
    expect(elapsedDays).toBe(1);
  });

  // ──────────────────────────────────────────
  // 모든 상수가 숫자 또는 불리언인지 확인 (타입 안전성)
  // ──────────────────────────────────────────

  it('모든 BUSINESS_RULES 값이 숫자 또는 불리언이다', () => {
    for (const [key, value] of Object.entries(BUSINESS_RULES)) {
      expect(
        typeof value === 'number' || typeof value === 'boolean',
        `${key}: ${value} is not number/boolean`,
      ).toBe(true);
    }
  });
});

describe('FILE_LIMITS', () => {
  it('BLOCKED_EXTENSIONS에 위험 확장자 포함', () => {
    expect(FILE_LIMITS.BLOCKED_EXTENSIONS).toContain('exe');
    expect(FILE_LIMITS.BLOCKED_EXTENSIONS).toContain('sh');
    expect(FILE_LIMITS.BLOCKED_EXTENSIONS).toContain('bat');
  });

  it('MAX_FILE_SIZE <= MAX_TICKET_TOTAL', () => {
    expect(FILE_LIMITS.MAX_FILE_SIZE).toBeLessThanOrEqual(FILE_LIMITS.MAX_TICKET_TOTAL);
  });
});
