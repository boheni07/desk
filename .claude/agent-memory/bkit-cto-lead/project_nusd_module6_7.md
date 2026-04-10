---
name: nu-servicedesk Module 6+7 Implementation
description: BullMQ infrastructure (10 batch jobs) + Ticket Workflow (extend/complete approval) implementation status (2026-04-10)
type: project
---

Module 6 (BullMQ + 10 batch jobs) and Module 7 (ticket workflow) implemented on 2026-04-10.

**Why:** The service desk requires automated batch processing (auto-receive, delay detection, escalation, cleanup) and extend/complete approval workflows to fulfill the V2.1 design spec.

**How to apply:** All batch jobs and workflow APIs are in place. The notification-helper currently does DB-only notifications (no push yet). When building the Push module, replace createNotification calls with push-aware versions. The extend-auto-approve batch job duplicates some logic from ticket-workflow.ts (approveExtend) inline for transactional safety within the job context.

Files created:
- lib/notification-helper.ts (createNotification, createNotificationsForUsers, getAdminUserIds, getSupervisorUserIds, getTicketAssigneeIds)
- lib/ticket-workflow.ts (requestExtend, approveExtend, rejectExtend, requestComplete, approveComplete, rejectComplete)
- lib/business-hours.ts (added addBusinessDays, getBusinessDaysBetween)
- jobs/queue.ts (BullMQ Queue, scheduleRecurringJobs with 10 cron definitions)
- jobs/worker.ts (BullMQ Worker, DLQ handler with admin notification)
- jobs/auto-receive.job.ts (REGISTERED->RECEIVED after 4 biz hours)
- jobs/delay-detect.job.ts (RECEIVED/IN_PROGRESS->DELAYED when deadline passed)
- jobs/extend-auto-approve.job.ts (warning at 3h, auto-approve at 4h)
- jobs/satisfaction-close.job.ts (reminder at 4 biz days, auto-close at 5 biz days)
- jobs/project-deactivate-notify.job.ts (daily, notify members before endDate)
- jobs/customer-zero-warning.job.ts (daily, warn admins of 0-customer companies)
- jobs/stale-escalation.job.ts (daily, escalate tickets delayed >= 3 biz days)
- jobs/notification-cleanup.job.ts (daily, delete notifications > 90 days)
- jobs/push-cleanup.job.ts (daily, delete push subscriptions > 90 days)
- jobs/login-history-cleanup.job.ts (daily, delete login history > 1 year)
- app/api/tickets/[id]/extend/route.ts (POST: request extend)
- app/api/tickets/[id]/extend/approve/route.ts (POST: approve extend)
- app/api/tickets/[id]/extend/reject/route.ts (POST: reject extend)
- app/api/tickets/[id]/complete/route.ts (POST: request complete)
- app/api/tickets/[id]/complete/approve/route.ts (POST: approve complete)
- app/api/tickets/[id]/complete/reject/route.ts (POST: reject complete)
- app/api/admin/jobs/route.ts (GET: list DLQ failed jobs)
- app/api/admin/jobs/[jobId]/retry/route.ts (POST: retry failed job)

Key design decisions:
- Single BullMQ queue "servicedesk" with job name as discriminator (simpler than per-job queues)
- Exponential backoff: 2s/4s/8s, 3 attempts, then DLQ
- getHolidays() exported from auto-receive.job.ts as shared helper (queries 3 years of holidays)
- notification-helper has separate createNotificationInTx() for use within Prisma transactions
- ticket-workflow uses raw SQL RETURNING pattern for optimistic locking (matches existing codebase pattern)
- Complete workflow stores previousStatus in CompleteRequest for V2.0 return-to-original-status on rejection
