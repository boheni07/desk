# nu-ServiceDesk

한국 기업 특화 티켓 기반 서비스 지원 플랫폼 (Trust Building Platform)

## 프로젝트 레벨

**Dynamic** — 풀스택 SaaS (커스텀 백엔드)

## 기술 스택

- Frontend: Next.js 15 (App Router) + React 19 + TypeScript
- UI: **Bootstrap 5 + React-Bootstrap v2.x + SCSS** (Pretendard 폰트)
- Backend: Next.js API Routes (Option C Pragmatic Balance)
- Database: PostgreSQL 15+ (Prisma ORM, 22개 모델) — 포트 5433
- Cache/Queue: Redis 7+ (세션 + BullMQ 10개 배치 잡) — 포트 6379
- Auth: 커스텀 Server Session + Redis (Sliding Expiry 8시간)
- File: Cloudflare R2 (Presigned URL) / 로컬 파일 저장 fallback (R2 미설정 시)
- Push: Web Push (VAPID)

## 핵심 규칙

1. **Bootstrap Only** — Tailwind CSS, shadcn/ui 사용 금지. react-bootstrap 컴포넌트 활용.
2. **Server/Client 분리** — Bootstrap CSS 클래스는 Server Component OK. react-bootstrap 컴포넌트는 반드시 'use client'.
3. **낙관적 락** — Prisma 조건부 UPDATE 대신 `$executeRaw RETURNING *` 패턴 사용.
4. **State Machine** — 티켓 상태 전이는 반드시 `lib/ticket-state-machine.ts` 경유.
5. **비즈니스 상수** — `lib/constants.ts`의 BUSINESS_RULES 참조. 매직넘버 금지.
6. **트랜잭션** — Web Push 발송은 트랜잭션 외부에서 비동기. DB 알림 INSERT는 트랜잭션 내부.
7. **OWASP** — 비밀번호 변경 시 전체 세션 폐기. role_hint 쿠키 HMAC 서명 필수.

## 문서 구조

```
docs/
├── 00-pm/
│   └── nu-servicedesk.prd.md          # PRD (FINAL)
├── 01-plan/
│   └── features/
│       └── nu-servicedesk.plan.md     # Plan (FINAL)
├── 02-design/
│   └── features/
│       └── nu-servicedesk.design.md   # Design (FINAL)
├── 03-analysis/
│   └── nu-servicedesk.analysis.md     # Gap 분석 결과
├── 04-report/
│   ├── nu-servicedesk.report.md       # PDCA 완료 보고서
│   └── qa-inspection.report.md        # QA 검수 보고서
├── mockups/                            # HTML 프로토타입 목업
│   ├── 01-login.html
│   ├── 02-dashboard-admin.html
│   ├── 03-ticket-list.html
│   ├── 04-ticket-detail.html
│   └── common.css
└── archive/
    └── versions/                       # 구버전 문서 (V1.1, V2.0, V2.1)
```

## 개발 환경 설정

```bash
# 1. 인프라 기동
docker compose up -d          # PostgreSQL(5433) + Redis(6379)

# 2. 의존성 설치
npm install

# 3. DB 초기화
npx prisma migrate deploy     # 마이그레이션 적용
npx tsx prisma/seed.ts        # 샘플 데이터 시드

# 4. 개발 서버
npm run dev                   # http://localhost:3010
```

## 주요 계정 (개발용)

| 역할 | 아이디 | 비밀번호 |
|------|--------|----------|
| 관리자 | `admin` | `Admin@1234` |
| 지원담당자 | `sup.kim` ~ `sup.yang` (8명) | `Support@1234` |
| 고객 | `alpha.han` ~ `epsilon.han` (5개사 20명) | `Customer@1234` |

## 주요 파일 위치

| 역할 | 경로 |
|------|------|
| DB 스키마 | `prisma/schema.prisma` |
| 샘플 데이터 | `prisma/seed.ts` |
| Prisma 클라이언트 | `lib/prisma.ts` |
| 세션 관리 | `lib/session.ts` |
| 티켓 상태머신 | `lib/ticket-state-machine.ts` |
| 비즈니스 규칙 상수 | `lib/constants.ts` |
| BullMQ 배치 잡 | `jobs/` |
| API Routes | `app/api/` |
| 페이지 | `app/(main)/`, `app/(auth)/` |
| 공통 컴포넌트 | `components/` |
