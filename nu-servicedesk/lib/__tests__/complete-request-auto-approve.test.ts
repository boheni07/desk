// 테스트: 완료요청 3회차 자동승인 시나리오
// Fix 커버: [CRITICAL] satisfaction-close.job.ts 3회차 자동승인 누락

import { describe, it, expect } from 'vitest';
import { canTransition, getNextStatus } from '../ticket-state-machine';
import { TICKET_EVENTS } from '../ticket-constants';
import { BUSINESS_RULES } from '../constants';

describe('완료요청 3회차 자동승인 시나리오', () => {
  // ──────────────────────────────────────────
  // 상태머신 레벨: 3회차에서 반려 불가
  // ──────────────────────────────────────────

  describe('3회차 REJECT_COMPLETE 차단 (상태머신)', () => {
    it('1회차 완료요청 — 반려 가능', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: 1,
      });
      expect(result.allowed).toBe(true);
    });

    it('2회차 완료요청 — 반려 가능', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: 2,
      });
      expect(result.allowed).toBe(true);
    });

    it('3회차(COMPLETE_MAX_ATTEMPTS)에서 반려 불가', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS,
      });
      expect(result.allowed).toBe(false);
    });

    it('3회차 반려 시 에러 메시지에 "최대 반려 횟수" 포함', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS,
      });
      expect(result.reason).toContain('최대 반려 횟수');
    });

    it('4회차 이상도 반려 불가', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS + 1,
      });
      expect(result.allowed).toBe(false);
    });
  });

  // ──────────────────────────────────────────
  // AUTO_COMPLETE 이벤트 (배치잡 자동승인)
  // ──────────────────────────────────────────

  describe('AUTO_COMPLETE 이벤트 (SYSTEM 전용)', () => {
    it('SYSTEM이 AUTO_COMPLETE 실행 가능', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE, 'SYSTEM');
      expect(result.allowed).toBe(true);
    });

    it('AUTO_COMPLETE 후 SATISFACTION_PENDING으로 전이', () => {
      const next = getNextStatus('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE);
      expect(next).toBe('SATISFACTION_PENDING');
    });

    it('support는 AUTO_COMPLETE 실행 불가', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE, 'support');
      expect(result.allowed).toBe(false);
    });

    it('admin은 AUTO_COMPLETE 실행 불가 (SYSTEM 전용)', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE, 'admin');
      expect(result.allowed).toBe(false);
    });

    it('customer는 AUTO_COMPLETE 실행 불가', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE, 'customer');
      expect(result.allowed).toBe(false);
    });
  });

  // ──────────────────────────────────────────
  // 정상 완료승인 흐름
  // ──────────────────────────────────────────

  describe('정상 APPROVE_COMPLETE 흐름', () => {
    it('1회차 — customer가 승인 가능', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.APPROVE_COMPLETE, 'customer');
      expect(result.allowed).toBe(true);
    });

    it('승인 후 SATISFACTION_PENDING으로 전이', () => {
      const next = getNextStatus('COMPLETE_REQUESTED', TICKET_EVENTS.APPROVE_COMPLETE);
      expect(next).toBe('SATISFACTION_PENDING');
    });

    it('support는 APPROVE_COMPLETE 불가 (customer/admin 전용)', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.APPROVE_COMPLETE, 'support');
      expect(result.allowed).toBe(false);
    });

    it('admin은 APPROVE_COMPLETE 가능', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.APPROVE_COMPLETE, 'admin');
      expect(result.allowed).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // 3회 반려 후 자동승인 시나리오 전체 흐름
  // ──────────────────────────────────────────

  describe('3회 반려 후 자동승인 전체 시나리오', () => {
    it('1차 반려 → REJECT_COMPLETE 허용', () => {
      const r = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', { attemptNumber: 1 });
      expect(r.allowed).toBe(true);
    });

    it('2차 반려 → REJECT_COMPLETE 허용', () => {
      const r = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', { attemptNumber: 2 });
      expect(r.allowed).toBe(true);
    });

    it('3차 재요청 → REQUEST_COMPLETE 허용 (attemptNumber 3은 요청 단계)', () => {
      // 3회차 완료요청은 지원담당자가 할 수 있음
      const r = canTransition('IN_PROGRESS', TICKET_EVENTS.REQUEST_COMPLETE, 'support');
      expect(r.allowed).toBe(true);
    });

    it('3회차 완료요청 생성 후 batch에서 AUTO_COMPLETE 실행', () => {
      // batch: COMPLETE_REQUESTED + attemptNumber === 3 → AUTO_COMPLETE by SYSTEM
      const r = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE, 'SYSTEM');
      expect(r.allowed).toBe(true);
      expect(getNextStatus('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE)).toBe('SATISFACTION_PENDING');
    });

    it('3회차 이후 반려 시도 → 차단되어야 함 (무한 반려 방지)', () => {
      const r = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: BUSINESS_RULES.COMPLETE_MAX_ATTEMPTS,
      });
      expect(r.allowed).toBe(false);
    });
  });
});
