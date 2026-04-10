// 테스트: 날짜 범위 유효성 검증 로직
// Fix 커버: [CRITICAL] 프로젝트 시작일/종료일 교차 검증, 처리희망일 과거 방지

import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────
// 날짜 범위 검증 헬퍼 (route handler 로직과 동일)
// ──────────────────────────────────────────

function validateDateRange(startDate: string, endDate: string | null): string | null {
  if (!endDate) return null; // 종료일 없으면 OK
  if (endDate < startDate) return '종료일은 시작일보다 같거나 이후여야 합니다.';
  return null;
}

function validateDesiredDate(desiredDate: string): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const desired = new Date(desiredDate);
  if (desired < today) return '처리희망일은 오늘 이후여야 합니다.';
  return null;
}

// effective date range (PUT 수정 시 기존 값 + 새 값 조합)
function validateEffectiveDateRange(
  existingStart: string,
  existingEnd: string | null,
  newStart?: string,
  newEnd?: string | null,
): string | null {
  const effectiveStart = newStart ?? existingStart;
  const effectiveEnd = newEnd !== undefined ? newEnd : existingEnd;
  return validateDateRange(effectiveStart, effectiveEnd);
}

describe('프로젝트 날짜 범위 검증', () => {
  // ──────────────────────────────────────────
  // 기본 검증
  // ──────────────────────────────────────────

  it('종료일 없으면 항상 통과', () => {
    expect(validateDateRange('2026-01-01', null)).toBeNull();
    expect(validateDateRange('2099-12-31', null)).toBeNull();
  });

  it('종료일 = 시작일이면 통과', () => {
    expect(validateDateRange('2026-04-10', '2026-04-10')).toBeNull();
  });

  it('종료일 > 시작일이면 통과', () => {
    expect(validateDateRange('2026-01-01', '2026-12-31')).toBeNull();
    expect(validateDateRange('2026-04-10', '2026-04-11')).toBeNull();
  });

  it('종료일 < 시작일이면 에러', () => {
    expect(validateDateRange('2026-04-10', '2026-04-09')).not.toBeNull();
    expect(validateDateRange('2026-12-31', '2026-01-01')).not.toBeNull();
  });

  it('에러 메시지가 한국어로 반환된다', () => {
    const error = validateDateRange('2026-04-10', '2026-04-01');
    expect(error).toContain('종료일');
    expect(error).toContain('시작일');
  });

  // ──────────────────────────────────────────
  // PUT 수정 시 effective date 조합 검증
  // ──────────────────────────────────────────

  describe('PUT effective date 검증', () => {
    it('기존 값 유지 + 종료일만 변경 — 새 종료일이 기존 시작일보다 과거면 에러', () => {
      // 기존: 2026-06-01 ~ 2026-12-31, 새 종료일: 2026-05-01
      const error = validateEffectiveDateRange('2026-06-01', '2026-12-31', undefined, '2026-05-01');
      expect(error).not.toBeNull();
    });

    it('기존 값 유지 + 종료일만 변경 — 유효한 경우', () => {
      const error = validateEffectiveDateRange('2026-06-01', '2026-12-31', undefined, '2026-07-01');
      expect(error).toBeNull();
    });

    it('시작일만 변경 — 기존 종료일보다 늦으면 에러', () => {
      // 기존: 2026-01-01 ~ 2026-06-30, 새 시작일: 2026-07-01
      const error = validateEffectiveDateRange('2026-01-01', '2026-06-30', '2026-07-01', undefined);
      expect(error).not.toBeNull();
    });

    it('시작일+종료일 모두 변경 — 유효한 범위', () => {
      const error = validateEffectiveDateRange('2026-01-01', '2026-06-30', '2026-03-01', '2026-09-30');
      expect(error).toBeNull();
    });

    it('종료일을 null로 제거 — 항상 통과', () => {
      const error = validateEffectiveDateRange('2026-06-01', '2026-12-31', undefined, null);
      expect(error).toBeNull();
    });
  });
});

describe('처리희망일 과거 방지', () => {
  // ──────────────────────────────────────────
  // 미래/오늘/과거
  // ──────────────────────────────────────────

  it('오늘 날짜는 통과한다', () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(validateDesiredDate(today)).toBeNull();
  });

  it('내일 날짜는 통과한다', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    expect(validateDesiredDate(tomorrow)).toBeNull();
  });

  it('먼 미래 날짜는 통과한다', () => {
    expect(validateDesiredDate('2099-12-31')).toBeNull();
  });

  it('어제 날짜는 에러를 반환한다', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    expect(validateDesiredDate(yesterday)).not.toBeNull();
  });

  it('1년 전 날짜는 에러를 반환한다', () => {
    expect(validateDesiredDate('2025-01-01')).not.toBeNull();
  });

  it('에러 메시지에 "오늘 이후" 포함', () => {
    const error = validateDesiredDate('2020-01-01');
    expect(error).toContain('오늘 이후');
  });
});
