// 테스트: 보안 헤더 구성 검증
// Fix 커버: [MEDIUM] HSTS + CSP 헤더 추가

import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

// ──────────────────────────────────────────
// next.config.ts headers() 함수 호출
// ──────────────────────────────────────────

async function getHeaders() {
  if (!nextConfig.headers) throw new Error('headers() not defined');
  return nextConfig.headers();
}

describe('next.config.ts 보안 헤더', () => {
  it('headers() 함수가 존재한다', () => {
    expect(typeof nextConfig.headers).toBe('function');
  });

  it('전체 경로(/**)에 적용되는 헤더 블록이 존재한다', async () => {
    const headers = await getHeaders();
    const globalBlock = headers.find((h) => h.source === '/(.*)');
    expect(globalBlock).toBeDefined();
  });

  describe('필수 보안 헤더 존재 확인', () => {
    const requiredHeaders = [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Strict-Transport-Security',
      'Content-Security-Policy',
    ];

    it.each(requiredHeaders)('%s 헤더가 존재한다', async (headerKey) => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const found = globalBlock?.headers.some((h) => h.key === headerKey);
      expect(found, `${headerKey} 헤더가 없습니다`).toBe(true);
    });
  });

  describe('HSTS 헤더 값 검증', () => {
    it('max-age가 설정되어 있다', async () => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const hsts = globalBlock?.headers.find((h) => h.key === 'Strict-Transport-Security');
      expect(hsts?.value).toMatch(/max-age=\d+/);
    });

    it('max-age >= 31536000 (1년)', async () => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const hsts = globalBlock?.headers.find((h) => h.key === 'Strict-Transport-Security');
      const match = hsts?.value.match(/max-age=(\d+)/);
      const maxAge = parseInt(match?.[1] ?? '0', 10);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);
    });

    it('includeSubDomains 포함', async () => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const hsts = globalBlock?.headers.find((h) => h.key === 'Strict-Transport-Security');
      expect(hsts?.value).toContain('includeSubDomains');
    });
  });

  describe('CSP 헤더 값 검증', () => {
    it('default-src 지시어 포함', async () => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const csp = globalBlock?.headers.find((h) => h.key === 'Content-Security-Policy');
      expect(csp?.value).toContain("default-src");
    });

    it("frame-ancestors 'none' — 클릭재킹 방지", async () => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const csp = globalBlock?.headers.find((h) => h.key === 'Content-Security-Policy');
      expect(csp?.value).toContain("frame-ancestors 'none'");
    });

    it("form-action 'self' — 폼 제출 제한", async () => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const csp = globalBlock?.headers.find((h) => h.key === 'Content-Security-Policy');
      expect(csp?.value).toContain("form-action 'self'");
    });
  });

  describe('X-Frame-Options 검증', () => {
    it("값이 DENY", async () => {
      const headers = await getHeaders();
      const globalBlock = headers.find((h) => h.source === '/(.*)');
      const xfo = globalBlock?.headers.find((h) => h.key === 'X-Frame-Options');
      expect(xfo?.value).toBe('DENY');
    });
  });

  describe('API 캐시 헤더', () => {
    it('/api/** 경로에 no-store 캐시 헤더가 있다', async () => {
      const headers = await getHeaders();
      const apiBlock = headers.find((h) => h.source === '/api/(.*)');
      const cacheControl = apiBlock?.headers.find((h) => h.key === 'Cache-Control');
      expect(cacheControl?.value).toContain('no-store');
    });
  });
});
