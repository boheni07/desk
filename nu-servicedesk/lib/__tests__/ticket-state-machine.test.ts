// Design Ref: §5 — State Machine tests (V2.1)
// Plan SC: FR-13~14 티켓 상태 워크플로우 전 구간

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getNextStatus,
  getValidEvents,
  getAvailableEvents,
  VALID_TRANSITIONS,
} from '../ticket-state-machine';
import { TICKET_EVENTS } from '../ticket-constants';

describe('ticket-state-machine', () => {
  // ─────────────────────────────────────────
  // REGISTERED transitions
  // ─────────────────────────────────────────

  describe('REGISTERED state', () => {
    it('allows support to RECEIVE', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.RECEIVE, 'support');
      expect(result.allowed).toBe(true);
    });

    it('allows admin to RECEIVE', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.RECEIVE, 'admin');
      expect(result.allowed).toBe(true);
    });

    it('rejects customer from RECEIVE', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.RECEIVE, 'customer');
      expect(result.allowed).toBe(false);
    });

    it('allows SYSTEM to AUTO_RECEIVE', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.AUTO_RECEIVE, 'SYSTEM');
      expect(result.allowed).toBe(true);
    });

    it('rejects non-SYSTEM from AUTO_RECEIVE', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.AUTO_RECEIVE, 'admin');
      expect(result.allowed).toBe(false);
    });

    it('returns RECEIVED for RECEIVE event', () => {
      expect(getNextStatus('REGISTERED', TICKET_EVENTS.RECEIVE)).toBe('RECEIVED');
    });

    it('allows admin to CANCEL', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(true);
    });

    it('rejects support from CANCEL', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.CANCEL, 'support');
      expect(result.allowed).toBe(false);
    });

    it('rejects CONFIRM from REGISTERED', () => {
      const result = canTransition('REGISTERED', TICKET_EVENTS.CONFIRM, 'support');
      expect(result.allowed).toBe(false);
    });
  });

  // ────────���────────────────────────────────
  // RECEIVED transitions
  // ��─────────────────��──────────────────────

  describe('RECEIVED state', () => {
    it('allows support to CONFIRM (-> IN_PROGRESS)', () => {
      const result = canTransition('RECEIVED', TICKET_EVENTS.CONFIRM, 'support');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('RECEIVED', TICKET_EVENTS.CONFIRM)).toBe('IN_PROGRESS');
    });

    it('allows SYSTEM to DELAY_DETECT (-> DELAYED)', () => {
      const result = canTransition('RECEIVED', TICKET_EVENTS.DELAY_DETECT, 'SYSTEM');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('RECEIVED', TICKET_EVENTS.DELAY_DETECT)).toBe('DELAYED');
    });

    it('rejects customer from CONFIRM', () => {
      const result = canTransition('RECEIVED', TICKET_EVENTS.CONFIRM, 'customer');
      expect(result.allowed).toBe(false);
    });

    it('allows admin to CANCEL', () => {
      const result = canTransition('RECEIVED', TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('RECEIVED', TICKET_EVENTS.CANCEL)).toBe('CANCELLED');
    });
  });

  // ───────���─────────────────────────────────
  // IN_PROGRESS transitions
  // ─────────────────────────────────────────

  describe('IN_PROGRESS state', () => {
    it('allows support to REQUEST_EXTEND', () => {
      const result = canTransition('IN_PROGRESS', TICKET_EVENTS.REQUEST_EXTEND, 'support');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('IN_PROGRESS', TICKET_EVENTS.REQUEST_EXTEND)).toBe('EXTEND_REQUESTED');
    });

    it('allows support to REQUEST_COMPLETE', () => {
      const result = canTransition('IN_PROGRESS', TICKET_EVENTS.REQUEST_COMPLETE, 'support');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('IN_PROGRESS', TICKET_EVENTS.REQUEST_COMPLETE)).toBe('COMPLETE_REQUESTED');
    });

    it('allows SYSTEM DELAY_DETECT (-> DELAYED)', () => {
      const result = canTransition('IN_PROGRESS', TICKET_EVENTS.DELAY_DETECT, 'SYSTEM');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('IN_PROGRESS', TICKET_EVENTS.DELAY_DETECT)).toBe('DELAYED');
    });

    it('rejects customer from REQUEST_COMPLETE', () => {
      const result = canTransition('IN_PROGRESS', TICKET_EVENTS.REQUEST_COMPLETE, 'customer');
      expect(result.allowed).toBe(false);
    });

    it('allows admin to CANCEL', () => {
      const result = canTransition('IN_PROGRESS', TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(true);
    });
  });

  // ─────────────────────────────────────────
  // DELAYED transitions
  // ─────────────────────────────────────────

  describe('DELAYED state', () => {
    it('allows support to CONFIRM (-> IN_PROGRESS)', () => {
      const result = canTransition('DELAYED', TICKET_EVENTS.CONFIRM, 'support');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('DELAYED', TICKET_EVENTS.CONFIRM)).toBe('IN_PROGRESS');
    });

    it('allows support to REQUEST_EXTEND', () => {
      const result = canTransition('DELAYED', TICKET_EVENTS.REQUEST_EXTEND, 'support');
      expect(result.allowed).toBe(true);
    });

    it('allows support to REQUEST_COMPLETE', () => {
      const result = canTransition('DELAYED', TICKET_EVENTS.REQUEST_COMPLETE, 'support');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('DELAYED', TICKET_EVENTS.REQUEST_COMPLETE)).toBe('COMPLETE_REQUESTED');
    });

    it('allows admin to CANCEL', () => {
      const result = canTransition('DELAYED', TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(true);
    });
  });

  // ─────────────────────────────────────────
  // EXTEND_REQUESTED transitions
  // ───���─────────────────────────────────────

  describe('EXTEND_REQUESTED state', () => {
    it('allows customer to APPROVE_EXTEND', () => {
      const result = canTransition('EXTEND_REQUESTED', TICKET_EVENTS.APPROVE_EXTEND, 'customer');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('EXTEND_REQUESTED', TICKET_EVENTS.APPROVE_EXTEND)).toBe('IN_PROGRESS');
    });

    it('allows admin to APPROVE_EXTEND', () => {
      const result = canTransition('EXTEND_REQUESTED', TICKET_EVENTS.APPROVE_EXTEND, 'admin');
      expect(result.allowed).toBe(true);
    });

    it('allows customer to REJECT_EXTEND', () => {
      const result = canTransition('EXTEND_REQUESTED', TICKET_EVENTS.REJECT_EXTEND, 'customer');
      expect(result.allowed).toBe(true);
    });

    it('allows SYSTEM AUTO_APPROVE_EXTEND', () => {
      const result = canTransition('EXTEND_REQUESTED', TICKET_EVENTS.AUTO_APPROVE_EXTEND, 'SYSTEM');
      expect(result.allowed).toBe(true);
    });

    it('rejects support from APPROVE_EXTEND', () => {
      const result = canTransition('EXTEND_REQUESTED', TICKET_EVENTS.APPROVE_EXTEND, 'support');
      expect(result.allowed).toBe(false);
    });

    it('allows admin to CANCEL', () => {
      const result = canTransition('EXTEND_REQUESTED', TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(true);
    });
  });

  // ───���─────────────────────────────────────
  // COMPLETE_REQUESTED transitions
  // ───���─────────────────────────────────────

  describe('COMPLETE_REQUESTED state', () => {
    it('allows customer to APPROVE_COMPLETE (-> SATISFACTION_PENDING)', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.APPROVE_COMPLETE, 'customer');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('COMPLETE_REQUESTED', TICKET_EVENTS.APPROVE_COMPLETE)).toBe('SATISFACTION_PENDING');
    });

    it('allows customer to REJECT_COMPLETE with attempt <= 2', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: 1,
      });
      expect(result.allowed).toBe(true);
    });

    it('allows customer to REJECT_COMPLETE with attempt = 2', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: 2,
      });
      expect(result.allowed).toBe(true);
    });

    it('rejects REJECT_COMPLETE with attempt > 2', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.REJECT_COMPLETE, 'customer', {
        attemptNumber: 3,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('최대 반려 횟수');
    });

    it('allows SYSTEM AUTO_COMPLETE (-> SATISFACTION_PENDING)', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE, 'SYSTEM');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('COMPLETE_REQUESTED', TICKET_EVENTS.AUTO_COMPLETE)).toBe('SATISFACTION_PENDING');
    });

    it('rejects support from APPROVE_COMPLETE', () => {
      const result = canTransition('COMPLETE_REQUESTED', TICKET_EVENTS.APPROVE_COMPLETE, 'support');
      expect(result.allowed).toBe(false);
    });
  });

  // ─────────────────────────────────────────
  // SATISFACTION_PENDING transitions
  // ──────��──────────────────────────────────

  describe('SATISFACTION_PENDING state', () => {
    it('allows customer to RATE_SATISFACTION (-> CLOSED)', () => {
      const result = canTransition('SATISFACTION_PENDING', TICKET_EVENTS.RATE_SATISFACTION, 'customer');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('SATISFACTION_PENDING', TICKET_EVENTS.RATE_SATISFACTION)).toBe('CLOSED');
    });

    it('allows SYSTEM AUTO_CLOSE (-> CLOSED)', () => {
      const result = canTransition('SATISFACTION_PENDING', TICKET_EVENTS.AUTO_CLOSE, 'SYSTEM');
      expect(result.allowed).toBe(true);
      expect(getNextStatus('SATISFACTION_PENDING', TICKET_EVENTS.AUTO_CLOSE)).toBe('CLOSED');
    });

    it('rejects CANCEL from SATISFACTION_PENDING', () => {
      const result = canTransition('SATISFACTION_PENDING', TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(false);
    });
  });

  // ─────────────────────────────────────────
  // Terminal states
  // ────────────��────────────────────────────

  describe('terminal states', () => {
    it('CLOSED has no valid transitions', () => {
      const events = getValidEvents('CLOSED');
      expect(events).toHaveLength(0);
    });

    it('CANCELLED has no valid transitions', () => {
      const events = getValidEvents('CANCELLED');
      expect(events).toHaveLength(0);
    });

    it('returns null for invalid transition from CLOSED', () => {
      expect(getNextStatus('CLOSED', TICKET_EVENTS.CONFIRM)).toBeNull();
    });
  });

  // ─────────────────────────────────────────
  // CANCEL from multiple states
  // ──────────��──────────────────────────────

  describe('CANCEL event', () => {
    const cancellableStates: Array<{ status: string }> = [
      { status: 'REGISTERED' },
      { status: 'RECEIVED' },
      { status: 'IN_PROGRESS' },
      { status: 'DELAYED' },
      { status: 'EXTEND_REQUESTED' },
    ];

    it.each(cancellableStates)('admin can cancel from $status', ({ status }) => {
      const result = canTransition(status as any, TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(true);
      expect(getNextStatus(status as any, TICKET_EVENTS.CANCEL)).toBe('CANCELLED');
    });

    const nonCancellableStates = [
      { status: 'COMPLETE_REQUESTED' },
      { status: 'SATISFACTION_PENDING' },
      { status: 'CLOSED' },
      { status: 'CANCELLED' },
    ];

    it.each(nonCancellableStates)('cannot cancel from $status', ({ status }) => {
      const result = canTransition(status as any, TICKET_EVENTS.CANCEL, 'admin');
      expect(result.allowed).toBe(false);
    });
  });

  // ─────────────────────────────────────────
  // getValidEvents
  // ─────────────────────────────────────────

  describe('getValidEvents', () => {
    it('REGISTERED has RECEIVE, AUTO_RECEIVE, CANCEL', () => {
      const events = getValidEvents('REGISTERED');
      expect(events).toContain(TICKET_EVENTS.RECEIVE);
      expect(events).toContain(TICKET_EVENTS.AUTO_RECEIVE);
      expect(events).toContain(TICKET_EVENTS.CANCEL);
    });

    it('IN_PROGRESS has multiple events', () => {
      const events = getValidEvents('IN_PROGRESS');
      expect(events).toContain(TICKET_EVENTS.DELAY_DETECT);
      expect(events).toContain(TICKET_EVENTS.REQUEST_EXTEND);
      expect(events).toContain(TICKET_EVENTS.REQUEST_COMPLETE);
      expect(events).toContain(TICKET_EVENTS.CANCEL);
    });
  });

  // ─────────────────────────────────────────
  // getAvailableEvents (role-filtered)
  // ��────────────────────────────────────────

  describe('getAvailableEvents', () => {
    it('support from REGISTERED sees RECEIVE only (not AUTO_RECEIVE, CANCEL)', () => {
      const events = getAvailableEvents('REGISTERED', 'support');
      expect(events).toContain(TICKET_EVENTS.RECEIVE);
      expect(events).not.toContain(TICKET_EVENTS.AUTO_RECEIVE);
      expect(events).not.toContain(TICKET_EVENTS.CANCEL);
    });

    it('admin from REGISTERED sees RECEIVE and CANCEL', () => {
      const events = getAvailableEvents('REGISTERED', 'admin');
      expect(events).toContain(TICKET_EVENTS.RECEIVE);
      expect(events).toContain(TICKET_EVENTS.CANCEL);
    });

    it('customer from COMPLETE_REQUESTED sees APPROVE and REJECT', () => {
      const events = getAvailableEvents('COMPLETE_REQUESTED', 'customer');
      expect(events).toContain(TICKET_EVENTS.APPROVE_COMPLETE);
      expect(events).toContain(TICKET_EVENTS.REJECT_COMPLETE);
    });

    it('customer from CLOSED sees nothing', () => {
      const events = getAvailableEvents('CLOSED', 'customer');
      expect(events).toHaveLength(0);
    });
  });

  // ──────────────────��──────────────────────
  // VALID_TRANSITIONS completeness
  // ─────────────────────────────────────────

  describe('VALID_TRANSITIONS map', () => {
    it('has entries for all non-terminal states', () => {
      const nonTerminal = [
        'REGISTERED', 'RECEIVED', 'IN_PROGRESS', 'DELAYED',
        'EXTEND_REQUESTED', 'COMPLETE_REQUESTED', 'SATISFACTION_PENDING',
      ];
      for (const status of nonTerminal) {
        expect(VALID_TRANSITIONS.has(status as any)).toBe(true);
      }
    });

    it('does not have entries for CLOSED or CANCELLED', () => {
      expect(VALID_TRANSITIONS.has('CLOSED')).toBeFalsy();
      expect(VALID_TRANSITIONS.has('CANCELLED')).toBeFalsy();
    });
  });
});
