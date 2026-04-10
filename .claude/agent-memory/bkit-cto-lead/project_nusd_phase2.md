---
name: nu-servicedesk Phase 2 Implementation
description: Phase 2 implementation status for nu-servicedesk (business hours, auth, middleware, UI shell)
type: project
---

Phase 2 of nu-servicedesk was implemented on 2026-04-10.

**Why:** The project requires auth infrastructure (sessions, middleware, password management) and business hours engine before any ticket workflow features can be built.

**How to apply:** When working on subsequent phases (Module 3+), all auth utilities and business hours engine are in place. Next priorities are Module 3-4 (master/project management CRUD) and Module 5 (ticket core + state machine).

Files created in Phase 2:
- lib/business-hours.ts (5 exported functions, KST timezone-aware)
- lib/__tests__/business-hours.test.ts (50+ vitest tests)
- lib/session.ts (Redis sessions, HMAC role_hint, sliding expiry)
- lib/password.ts (bcrypt hash, validate strength)
- lib/logger.ts (pino with pretty print dev mode)
- middleware.ts (Next.js edge middleware, HMAC verification)
- app/api/auth/login/route.ts (rate limiting, account locking, login history)
- app/api/auth/logout/route.ts
- app/api/auth/session/route.ts
- app/api/auth/password/route.ts (OWASP: deletes all sessions)
- app/api/profile/route.ts (GET/PUT)
- app/api/health/route.ts
- app/(auth)/layout.tsx, login/page.tsx, change-password/page.tsx
- app/(main)/layout.tsx, dashboard/page.tsx
- components/layout/header.tsx, sidebar.tsx
- vitest.config.ts

Prisma migration not yet run (requires Docker PostgreSQL).
