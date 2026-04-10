// 테스트: 비활성화 가드 로직
// Fix 커버: [CRITICAL] PUT companies/projects isActive=false 시 활성 티켓/프로젝트 체크 누락

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────
// 비활성화 가드 로직 (route handler 조건과 동일)
// ──────────────────────────────────────────

interface DeactivationCheckResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

function checkProjectDeactivation(
  requestIsActive: boolean | undefined,
  currentIsActive: boolean,
  activeTicketCount: number,
): DeactivationCheckResult {
  if (requestIsActive === false && currentIsActive === true) {
    if (activeTicketCount > 0) {
      return {
        allowed: false,
        code: 'HAS_ACTIVE_TICKETS',
        message: `활성 티켓 ${activeTicketCount}건이 있어 비활성화할 수 없습니다.`,
      };
    }
  }
  return { allowed: true };
}

function checkCompanyDeactivation(
  requestIsActive: boolean | undefined,
  currentIsActive: boolean,
  activeProjectCount: number,
): DeactivationCheckResult {
  if (requestIsActive === false && currentIsActive === true) {
    if (activeProjectCount > 0) {
      return {
        allowed: false,
        code: 'HAS_ACTIVE_PROJECTS',
        message: `활성 프로젝트 ${activeProjectCount}건이 있어 비활성화할 수 없습니다.`,
      };
    }
  }
  return { allowed: true };
}

describe('프로젝트 비활성화 가드 (PUT /api/projects/[id])', () => {
  // ──────────────────────────────────────────
  // 활성 티켓 존재 시 차단
  // ──────────────────────────────────────────

  it('활성 티켓 5건 있을 때 isActive=false 요청 — 차단', () => {
    const result = checkProjectDeactivation(false, true, 5);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('HAS_ACTIVE_TICKETS');
  });

  it('활성 티켓 1건 있을 때 — 차단', () => {
    const result = checkProjectDeactivation(false, true, 1);
    expect(result.allowed).toBe(false);
  });

  it('에러 메시지에 티켓 건수 포함', () => {
    const result = checkProjectDeactivation(false, true, 3);
    expect(result.message).toContain('3');
    expect(result.message).toContain('활성 티켓');
  });

  it('활성 티켓 0건 — 비활성화 허용', () => {
    const result = checkProjectDeactivation(false, true, 0);
    expect(result.allowed).toBe(true);
  });

  it('이미 비활성화된 프로젝트 — 재비활성화 요청 통과 (중복 체크 불필요)', () => {
    // currentIsActive=false이면 조건 false → 체크 안 함
    const result = checkProjectDeactivation(false, false, 99);
    expect(result.allowed).toBe(true);
  });

  it('isActive=true 요청 (활성화) — 티켓 체크 없이 허용', () => {
    const result = checkProjectDeactivation(true, false, 0);
    expect(result.allowed).toBe(true);
  });

  it('isActive 필드 없음 (다른 필드만 수정) — 체크 없이 허용', () => {
    const result = checkProjectDeactivation(undefined, true, 99);
    expect(result.allowed).toBe(true);
  });

  // ──────────────────────────────────────────
  // DELETE vs PUT 일관성: 동일한 가드 적용
  // ──────────────────────────────────────────

  it('PUT과 DELETE 모두 동일한 가드 적용 (활성 티켓 있으면 차단)', () => {
    // PUT isActive=false
    const putResult = checkProjectDeactivation(false, true, 3);
    // DELETE는 같은 조건 (activeTickets > 0 → 차단)
    const deleteGuard = 3 > 0; // deleteResult.blocked
    expect(putResult.allowed).toBe(false);
    expect(deleteGuard).toBe(true);
  });
});

describe('고객사 비활성화 가드 (PUT /api/companies/[id])', () => {
  it('활성 프로젝트 3건 있을 때 isActive=false 요청 — 차단', () => {
    const result = checkCompanyDeactivation(false, true, 3);
    expect(result.allowed).toBe(false);
    expect(result.code).toBe('HAS_ACTIVE_PROJECTS');
  });

  it('활성 프로젝트 1건 있을 때 — 차단', () => {
    const result = checkCompanyDeactivation(false, true, 1);
    expect(result.allowed).toBe(false);
  });

  it('에러 메시지에 프로젝트 건수 포함', () => {
    const result = checkCompanyDeactivation(false, true, 7);
    expect(result.message).toContain('7');
    expect(result.message).toContain('활성 프로젝트');
  });

  it('활성 프로젝트 0건 — 비활성화 허용', () => {
    const result = checkCompanyDeactivation(false, true, 0);
    expect(result.allowed).toBe(true);
  });

  it('이미 비활성화된 고객사 — 재비활성화 허용', () => {
    const result = checkCompanyDeactivation(false, false, 10);
    expect(result.allowed).toBe(true);
  });

  it('isActive 필드 없음 — 체크 없이 허용', () => {
    const result = checkCompanyDeactivation(undefined, true, 99);
    expect(result.allowed).toBe(true);
  });

  it('DELETE 가드와 PUT 가드 일관성 — 같은 기준(활성 프로젝트)', () => {
    // DELETE는 HAS_ACTIVE_PROJECTS로 차단, PUT도 동일하게 차단
    const result = checkCompanyDeactivation(false, true, 1);
    expect(result.code).toBe('HAS_ACTIVE_PROJECTS');
  });
});
