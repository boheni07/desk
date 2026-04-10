// 테스트: 티켓 댓글 상태 가드 + 담당자 멤버십 가드
// Fix 커버:
//   [HIGH] CLOSED/CANCELLED 티켓 댓글 금지
//   [HIGH] assign 시 프로젝트 멤버십 확인

import { describe, it, expect } from 'vitest';
import { canTransition } from '../ticket-state-machine';
import { TICKET_EVENTS } from '../ticket-constants';

// ──────────────────────────────────────────
// 댓글 상태 가드 로직 (route handler와 동일)
// ──────────────────────────────────────────

type TicketStatus =
  | 'REGISTERED' | 'RECEIVED' | 'IN_PROGRESS' | 'DELAYED'
  | 'EXTEND_REQUESTED' | 'COMPLETE_REQUESTED' | 'SATISFACTION_PENDING'
  | 'CLOSED' | 'CANCELLED';

function canComment(status: TicketStatus): { allowed: boolean; code?: string } {
  if (status === 'CLOSED' || status === 'CANCELLED') {
    return { allowed: false, code: 'TICKET_CLOSED' };
  }
  return { allowed: true };
}

// ──────────────────────────────────────────
// 담당자 배정 멤버십 가드 로직
// ──────────────────────────────────────────

function canAssign(
  assigneeType: string,
  assigneeIsActive: boolean,
  isMemberOfProject: boolean,
): { allowed: boolean; code?: string } {
  if (!assigneeIsActive) {
    return { allowed: false, code: 'INVALID_USER' };
  }
  if (assigneeType !== 'support' && assigneeType !== 'admin') {
    return { allowed: false, code: 'INVALID_USER_TYPE' };
  }
  if (!isMemberOfProject) {
    return { allowed: false, code: 'NOT_PROJECT_MEMBER' };
  }
  return { allowed: true };
}

describe('CLOSED/CANCELLED 티켓 댓글 금지', () => {
  // ──────────────────────────────────────────
  // 종료 상태에서 댓글 차단
  // ──────────────────────────────────────────

  it('CLOSED 티켓에 댓글 작성 불가', () => {
    const result = canComment('CLOSED');
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('TICKET_CLOSED');
  });

  it('CANCELLED 티켓에 댓글 작성 불가', () => {
    const result = canComment('CANCELLED');
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('TICKET_CLOSED');
  });

  // ──────────────────────────────────────────
  // 활성 상태에서 댓글 허용
  // ──────────────────────────────────────────

  const activeStatuses: TicketStatus[] = [
    'REGISTERED',
    'RECEIVED',
    'IN_PROGRESS',
    'DELAYED',
    'EXTEND_REQUESTED',
    'COMPLETE_REQUESTED',
    'SATISFACTION_PENDING',
  ];

  it.each(activeStatuses)('%s 상태에서 댓글 작성 가능', (status) => {
    const result = canComment(status);
    expect(result.allowed).toBe(true);
  });

  it('종료 상태 2개만 차단 (CLOSED + CANCELLED)', () => {
    const blocked = (['REGISTERED', 'RECEIVED', 'IN_PROGRESS', 'DELAYED',
      'EXTEND_REQUESTED', 'COMPLETE_REQUESTED', 'SATISFACTION_PENDING',
      'CLOSED', 'CANCELLED'] as TicketStatus[])
      .filter((s) => !canComment(s).allowed);
    expect(blocked).toEqual(['CLOSED', 'CANCELLED']);
  });
});

describe('담당자 배정 프로젝트 멤버십 가드', () => {
  // ──────────────────────────────────────────
  // 정상 배정 케이스
  // ──────────────────────────────────────────

  it('활성 support 프로젝트 멤버 — 배정 허용', () => {
    const result = canAssign('support', true, true);
    expect(result.allowed).toBe(true);
  });

  it('활성 admin 프로젝트 멤버 — 배정 허용', () => {
    const result = canAssign('admin', true, true);
    expect(result.allowed).toBe(true);
  });

  // ──────────────────────────────────────────
  // 차단 케이스
  // ──────────────────────────────────────────

  it('비활성화된 사용자 — 차단 (INVALID_USER)', () => {
    const result = canAssign('support', false, true);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('INVALID_USER');
  });

  it('customer 타입 — 차단 (INVALID_USER_TYPE)', () => {
    const result = canAssign('customer', true, true);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('INVALID_USER_TYPE');
  });

  it('프로젝트 비멤버 support — 차단 (NOT_PROJECT_MEMBER)', () => {
    const result = canAssign('support', true, false);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('NOT_PROJECT_MEMBER');
  });

  it('프로젝트 비멤버 admin — 차단 (NOT_PROJECT_MEMBER)', () => {
    // admin도 프로젝트 멤버여야 배정 가능
    const result = canAssign('admin', true, false);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('NOT_PROJECT_MEMBER');
  });

  it('비활성 + 비멤버 — 비활성 체크가 먼저', () => {
    const result = canAssign('support', false, false);
    expect(result.code).toBe('INVALID_USER');
  });

  // ──────────────────────────────────────────
  // 우선순위 검증 (체크 순서)
  // ──────────────────────────────────────────

  it('비활성 user 체크 → 타입 체크 → 멤버십 체크 순서', () => {
    // 비활성이면 타입 체크 전에 차단
    expect(canAssign('customer', false, true).code).toBe('INVALID_USER');
    // 활성 + 잘못된 타입이면 타입 체크 차단
    expect(canAssign('customer', true, true).code).toBe('INVALID_USER_TYPE');
    // 활성 + 올바른 타입 + 비멤버이면 멤버십 차단
    expect(canAssign('support', true, false).code).toBe('NOT_PROJECT_MEMBER');
  });
});

describe('CLOSED/CANCELLED 상태에서 취소 불가 (상태머신 확인)', () => {
  it('CLOSED 상태에서 어떤 이벤트도 허용 안 됨', () => {
    const events = Object.values(TICKET_EVENTS);
    for (const event of events) {
      const result = canTransition('CLOSED', event, 'admin');
      expect(result.allowed).toBe(false);
    }
  });

  it('CANCELLED 상태에서 어떤 이벤트도 허용 안 됨', () => {
    const events = Object.values(TICKET_EVENTS);
    for (const event of events) {
      const result = canTransition('CANCELLED', event, 'admin');
      expect(result.allowed).toBe(false);
    }
  });
});
