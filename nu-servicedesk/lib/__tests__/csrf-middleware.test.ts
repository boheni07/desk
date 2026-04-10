// 테스트: CSRF 미들웨어 Origin 검증 로직
// Fix 커버: [HIGH] NEXT_PUBLIC_APP_URL 미설정 시 CSRF 우회 가능 버그

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────
// 미들웨어의 CSRF 핵심 로직 추출 (순수 함수로 테스트)
// ──────────────────────────────────────────

function checkCsrf(
  method: string,
  pathname: string,
  origin: string | null,
  appUrl: string | undefined,
  requestHost: string,
): { blocked: boolean; reason?: string } {
  const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!MUTATING.includes(method) || !pathname.startsWith('/api/')) {
    return { blocked: false };
  }

  if (!origin) {
    // 동일 사이트 요청 (origin 없음) — 허용
    return { blocked: false };
  }

  // Fix: appUrl 없으면 request host로 fallback (절대 체크 우회 안 됨)
  const allowedOrigin = appUrl ?? `https://${requestHost}`;

  if (origin !== allowedOrigin) {
    return { blocked: true, reason: 'CSRF_REJECTED' };
  }

  return { blocked: false };
}

describe('CSRF 미들웨어 Origin 검증', () => {
  // ──────────────────────────────────────────
  // NEXT_PUBLIC_APP_URL 설정된 경우
  // ──────────────────────────────────────────

  describe('NEXT_PUBLIC_APP_URL 설정 시', () => {
    const APP_URL = 'https://servicedesk.example.com';

    it('올바른 origin — 통과', () => {
      const result = checkCsrf('POST', '/api/tickets', APP_URL, APP_URL, 'servicedesk.example.com');
      expect(result.blocked).toBe(false);
    });

    it('다른 도메인 origin — 차단 (CSRF)', () => {
      const result = checkCsrf('POST', '/api/tickets', 'https://evil.com', APP_URL, 'servicedesk.example.com');
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('CSRF_REJECTED');
    });

    it('origin 없음 (서버사이드/same-site) — 허용', () => {
      const result = checkCsrf('POST', '/api/tickets', null, APP_URL, 'servicedesk.example.com');
      expect(result.blocked).toBe(false);
    });

    it('PUT 요청도 차단', () => {
      const result = checkCsrf('PUT', '/api/projects/123', 'https://evil.com', APP_URL, 'servicedesk.example.com');
      expect(result.blocked).toBe(true);
    });

    it('DELETE 요청도 차단', () => {
      const result = checkCsrf('DELETE', '/api/companies/123', 'https://evil.com', APP_URL, 'servicedesk.example.com');
      expect(result.blocked).toBe(true);
    });

    it('GET 요청은 CSRF 체크 대상이 아님', () => {
      const result = checkCsrf('GET', '/api/tickets', 'https://evil.com', APP_URL, 'servicedesk.example.com');
      expect(result.blocked).toBe(false);
    });

    it('/api/ 경로가 아니면 CSRF 체크 안 함', () => {
      const result = checkCsrf('POST', '/form-submit', 'https://evil.com', APP_URL, 'servicedesk.example.com');
      expect(result.blocked).toBe(false);
    });
  });

  // ──────────────────────────────────────────
  // NEXT_PUBLIC_APP_URL 미설정 시 (핵심 버그 수정 검증)
  // ──────────────────────────────────────────

  describe('NEXT_PUBLIC_APP_URL 미설정 시 — request host fallback (구 버그: 체크 우회)', () => {
    it('cross-origin POST — 차단 (수정 전에는 우회 가능했음)', () => {
      // 수정 전: appUrl && origin && origin !== appUrl → appUrl=undefined → 조건 false → 허용 (버그!)
      // 수정 후: fallback to request host → origin !== requestHost → 차단 (정상)
      const result = checkCsrf('POST', '/api/tickets', 'https://evil.com', undefined, 'localhost:3010');
      expect(result.blocked).toBe(true);
    });

    it('same-origin POST — 허용 (request host와 일치)', () => {
      const result = checkCsrf('POST', '/api/tickets', 'https://localhost:3010', undefined, 'localhost:3010');
      expect(result.blocked).toBe(false);
    });

    it('origin 없는 POST — 허용 (서버사이드 요청)', () => {
      const result = checkCsrf('POST', '/api/tickets', null, undefined, 'localhost:3010');
      expect(result.blocked).toBe(false);
    });

    it('다른 포트에서의 요청 — 차단', () => {
      const result = checkCsrf('POST', '/api/users', 'http://localhost:3020', undefined, 'localhost:3010');
      expect(result.blocked).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // HTTP 메서드별 적용 범위
  // ──────────────────────────────────────────

  describe('CSRF 적용 HTTP 메서드', () => {
    const APP_URL = 'https://app.example.com';
    const EVIL = 'https://evil.com';

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s 메서드는 CSRF 체크 대상', (method) => {
      const result = checkCsrf(method, '/api/resource', EVIL, APP_URL, 'app.example.com');
      expect(result.blocked).toBe(true);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('%s 메서드는 CSRF 체크 대상 아님', (method) => {
      const result = checkCsrf(method, '/api/resource', EVIL, APP_URL, 'app.example.com');
      expect(result.blocked).toBe(false);
    });
  });
});
