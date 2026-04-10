---
name: nu-servicedesk Module 8+9 Implementation
description: Comments, Attachments (R2), Advanced Filters, Ticket Detail Enhancements implemented (2026-04-10)
type: project
---

Module 8 (Comments) and Module 9 (Attachments + Filters + Detail Enhancements) implemented on 2026-04-10.

**Why:** The design V2.1 requires full comment/attachment support with RBAC, a 10-minute server-side comment edit window (V2.0 anti-bypass), Cloudflare R2 presigned URL file storage, advanced multi-select filters with URL state persistence, and enriched ticket detail views (timeline, extend/complete approve/reject buttons, admin edit log).

**How to apply:** All comment and attachment APIs follow the same session/RBAC pattern as ticket APIs. The R2 client uses AWS SDK v3 (already in package.json). The attachment flow is presign-then-upload (client uploads directly to R2, not through the API server). Filters use comma-separated query params for multi-select. The ticket detail page now imports CommentList and AttachmentList as separate client components that fetch their own data.

Files created:
- lib/r2.ts (S3Client for R2, generateUploadPresignUrl, generateDownloadPresignUrl, deleteFile, buildR2Key)
- app/api/tickets/[id]/comments/route.ts (GET: list with soft-delete masking, POST: create with notification)
- app/api/tickets/[id]/comments/[commentId]/route.ts (PUT: 10min edit limit via differenceInMinutes, DELETE: soft-delete)
- app/api/attachments/presign/route.ts (POST: validate extension/size, create DB record, return presigned upload URL)
- app/api/attachments/[id]/route.ts (GET: download presigned URL, DELETE: R2 + DB delete)
- components/tickets/comment-list.tsx (full comment CRUD UI, internal memo toggle, inline edit, avatar initials)
- components/tickets/attachment-list.tsx (file list, presigned upload flow, download, delete, file type icons)

Files modified:
- app/api/tickets/[id]/route.ts (added adminEdits include, uploader on attachments)
- app/api/tickets/route.ts (Module 9B: comma-separated status/priority, createdFrom/To date range, sortBy/sortOrder)
- app/(main)/tickets/[id]/page.tsx (replaced stubs with CommentList/AttachmentList, added timeline, extend/complete approve/reject, admin edit log)
- app/(main)/tickets/page.tsx (Module 9B: advanced filter panel with badges, URL state sync, sort controls, deadline column)

Key design decisions:
- Comment list fetches via its own API endpoint (not from ticket detail response) for independence and pagination-readiness
- Attachment upload is a 2-step presign flow (API returns presigned URL, client PUTs directly to R2)
- Soft-deleted comments show "삭제된 댓글입니다." placeholder text (content cleared in DB)
- Internal comments filtered at API level for customers (type: PUBLIC only)
- Filter state persisted in URL query params for bookmarkability and browser back/forward support
- Status/priority filters use clickable Badge components for multi-select (not native <select multiple>)
- Admin edit log only visible to admin users
- Extend/complete approve/reject buttons shown inline on pending requests (no separate page)
