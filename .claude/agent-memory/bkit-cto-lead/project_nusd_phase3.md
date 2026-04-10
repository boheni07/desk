---
name: nu-servicedesk Phase 3 — Master/Project Management
description: Module 3+4 implementation (companies, users, categories, holidays, settings, projects, members) — APIs + pages (2026-04-10)
type: project
---

Phase 3 (Module 3 + Module 4) implemented on 2026-04-10.

**Why:** Master data management (companies, users, categories, holidays) and project management are prerequisites for the ticket workflow (Module 5). All CRUD + RBAC enforcement in place.

**How to apply:** All master/project APIs and admin pages are complete. Next priority is Module 5 (ticket CRUD + state machine). The schema uses `UserType` enum with `admin`, `support`, `customer` (NOT `manager`/`agent`). The `Company` model uses `businessNumber`/`address`/`phone` (NOT `contractStart`/`contractEnd`). The `Project` model has a `code` field (unique, uppercase).

API Routes created (14 files):
- app/api/companies/route.ts (GET list, POST create)
- app/api/companies/[id]/route.ts (GET detail, PUT update, DELETE soft-delete)
- app/api/companies/[id]/deactivate/route.ts (POST company+users deactivation)
- app/api/companies/[id]/departments/route.ts (GET list, POST create)
- app/api/companies/[id]/departments/[deptId]/route.ts (PUT update, DELETE)
- app/api/users/route.ts (GET list w/ filters, POST create w/ auto-password)
- app/api/users/[id]/route.ts (GET detail, PUT update, DELETE soft-delete)
- app/api/users/[id]/reset-password/route.ts (POST reset + OWASP session purge)
- app/api/categories/route.ts (GET sorted list, POST create)
- app/api/categories/[id]/route.ts (PUT update, DELETE soft-delete)
- app/api/holidays/route.ts (GET by year, POST single/bulk create)
- app/api/holidays/[id]/route.ts (PUT update, DELETE hard-delete)
- app/api/settings/supervisor/route.ts (GET/PUT supervisorUserIds)
- app/api/projects/route.ts (GET list w/ RBAC, POST create)
- app/api/projects/[id]/route.ts (GET detail w/ members, PUT update, DELETE)
- app/api/projects/[id]/members/route.ts (GET list, POST add, DELETE remove)

Pages created (9 files):
- app/(main)/master/companies/page.tsx (list + search + create/edit modal)
- app/(main)/master/companies/[id]/page.tsx (detail + department CRUD)
- app/(main)/master/users/page.tsx (list + filters + create modal)
- app/(main)/master/users/[id]/page.tsx (detail form + password reset)
- app/(main)/master/categories/page.tsx (inline editable table)
- app/(main)/master/holidays/page.tsx (year selector + bulk import)
- app/(main)/system/settings/page.tsx (supervisor multi-select)
- app/(main)/master/projects/page.tsx (list + create modal)
- app/(main)/master/projects/[id]/page.tsx (detail tabs: info + members)

Design decisions made:
1. Company schema uses businessNumber/address/phone (not contractStart/contractEnd per prompt) -- matched actual Prisma schema
2. UserType enum: admin/support/customer (not manager/agent per prompt) -- matched actual Prisma schema
3. Project code is uppercase-enforced via Zod regex and UI transform
4. Holiday bulk import accepts multi-line text format "YYYY-MM-DD name"
5. Main support role enforced: max 1 per project
6. Customer RBAC: can only see assigned projects, not all
