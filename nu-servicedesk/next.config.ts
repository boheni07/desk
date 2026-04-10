import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // Bootstrap SCSS 커스터마이징 지원
  sassOptions: {
    includePaths: ['./styles', './node_modules'],
  },
  // pino, BullMQ, IORedis: webpack 번들링 제외 (worker thread 경로 문제 방지)
  // pino-pretty → thread-stream이 lib/worker.js를 worker thread로 스폰하는데
  // webpack 번들 내에서 __dirname 경로 해석 실패 → 반드시 external로 설정 필요
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream', 'bullmq', 'ioredis'],
  // instrumentation.js는 Next.js 15에서 기본 활성화 (별도 설정 불필요)

  // 보안 헤더 (OWASP 권장)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // 클릭재킹 방지
          { key: 'X-Frame-Options', value: 'DENY' },
          // MIME 타입 스니핑 방지
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // XSS 필터 (레거시 브라우저)
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer 정책
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions Policy (불필요한 브라우저 기능 비활성화)
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // HSTS: HTTPS 강제 (1년, 서브도메인 포함)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // CSP: XSS/injection 방어
          // - dev: unsafe-eval 필수 (Next.js HMR), prod: unsafe-eval 제거
          // - cdn.jsdelivr.net: Pretendard 폰트 CDN
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://cdn.jsdelivr.net",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        // API 엔드포인트: 캐시 비활성화
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default nextConfig;
