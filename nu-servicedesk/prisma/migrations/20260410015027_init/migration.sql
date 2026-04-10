-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('admin', 'support', 'customer');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('main_support', 'support', 'customer');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('REGISTERED', 'RECEIVED', 'IN_PROGRESS', 'DELAYED', 'EXTEND_REQUESTED', 'COMPLETE_REQUESTED', 'SATISFACTION_PENDING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "RegistrationMethod" AS ENUM ('DIRECT', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "AdminEditField" AS ENUM ('TITLE', 'CONTENT', 'CATEGORY', 'PRIORITY', 'ASSIGNEE', 'STATUS', 'DEADLINE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommentType" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TICKET_CREATED', 'TICKET_RECEIVED', 'EXTEND_REQUESTED', 'EXTEND_AUTO_APPROVE_SOON', 'EXTEND_APPROVED', 'EXTEND_REJECTED', 'EXTEND_AUTO_APPROVED', 'COMPLETE_REQUESTED', 'COMPLETE_APPROVED', 'COMPLETE_REJECTED', 'COMPLETE_2ND_REJECTED', 'COMPLETE_AUTO_APPROVED', 'COMMENT_CREATED', 'IN_PROGRESS_TRANSITION', 'SATISFACTION_REMINDER', 'DELAYED_TRANSITION', 'STALE_ESCALATION', 'PROJECT_DEACTIVATED', 'CUSTOMER_ZERO_WARNING', 'PROXY_APPROVAL_COMPLETED', 'BATCH_JOB_FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "login_id" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "type" "UserType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "company_id" TEXT,
    "department_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "business_number" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "company_id" TEXT NOT NULL,
    "department_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticket_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'REGISTERED',
    "registration_method" "RegistrationMethod" NOT NULL DEFAULT 'DIRECT',
    "desired_date" TIMESTAMP(3) NOT NULL,
    "expected_completion_date" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "urgency_reason" TEXT,
    "complete_request_count" INTEGER NOT NULL DEFAULT 0,
    "last_escalation_at" TIMESTAMP(3),
    "registered_by_id" TEXT NOT NULL,
    "customer_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_status_history" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "previous_status" "TicketStatus" NOT NULL,
    "new_status" "TicketStatus" NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT NOT NULL DEFAULT 'USER',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_deadline_history" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "previous_deadline" TIMESTAMP(3),
    "new_deadline" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_deadline_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_admin_edits" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "field_name" "AdminEditField" NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_admin_edits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_assignments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extend_requests" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "new_deadline" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" TEXT,
    "reject_reason" TEXT,
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extend_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complete_requests" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "previous_status" "TicketStatus" NOT NULL,
    "approver_id" TEXT,
    "reject_reason" TEXT,
    "auto_approved" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complete_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "satisfaction_ratings" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT,
    "rating" INTEGER,
    "comment" TEXT,
    "auto_completed" BOOLEAN NOT NULL DEFAULT false,
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "satisfaction_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "type" "CommentType" NOT NULL,
    "content" TEXT NOT NULL,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "comment_id" TEXT,
    "uploader_id" TEXT,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "login_id" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "fail_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "companies_business_number_key" ON "companies"("business_number");

-- CreateIndex
CREATE UNIQUE INDEX "departments_company_id_name_key" ON "departments"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "holidays_year_idx" ON "holidays"("year");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "tickets_status_deadline_idx" ON "tickets"("status", "deadline");

-- CreateIndex
CREATE INDEX "tickets_project_id_status_idx" ON "tickets"("project_id", "status");

-- CreateIndex
CREATE INDEX "idx_tickets_registered_by_status" ON "tickets"("registered_by_id", "status");

-- CreateIndex
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at");

-- CreateIndex
CREATE INDEX "ticket_status_history_ticket_id_created_at_idx" ON "ticket_status_history"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_deadline_history_ticket_id_created_at_idx" ON "ticket_deadline_history"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_admin_edits_ticket_id_created_at_idx" ON "ticket_admin_edits"("ticket_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_assignments_ticket_id_user_id_key" ON "ticket_assignments"("ticket_id", "user_id");

-- CreateIndex
CREATE INDEX "extend_requests_ticket_id_idx" ON "extend_requests"("ticket_id");

-- CreateIndex
CREATE INDEX "extend_requests_status_created_at_idx" ON "extend_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "extend_requests_ticket_id_key" ON "extend_requests"("ticket_id");

-- CreateIndex
CREATE INDEX "complete_requests_ticket_id_attempt_number_idx" ON "complete_requests"("ticket_id", "attempt_number");

-- CreateIndex
CREATE INDEX "complete_requests_status_created_at_idx" ON "complete_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "satisfaction_ratings_ticket_id_key" ON "satisfaction_ratings"("ticket_id");

-- CreateIndex
CREATE INDEX "comments_ticket_id_created_at_idx" ON "comments"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "attachments_ticket_id_idx" ON "attachments"("ticket_id");

-- CreateIndex
CREATE INDEX "attachments_comment_id_idx" ON "attachments"("comment_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_deleted_is_read_created_at_idx" ON "notifications"("user_id", "is_deleted", "is_read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "login_history_user_id_created_at_idx" ON "login_history"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "login_history_login_id_success_created_at_idx" ON "login_history"("login_id", "success", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_deadline_history" ADD CONSTRAINT "ticket_deadline_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_deadline_history" ADD CONSTRAINT "ticket_deadline_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_admin_edits" ADD CONSTRAINT "ticket_admin_edits_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_admin_edits" ADD CONSTRAINT "ticket_admin_edits_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extend_requests" ADD CONSTRAINT "extend_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extend_requests" ADD CONSTRAINT "extend_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extend_requests" ADD CONSTRAINT "extend_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complete_requests" ADD CONSTRAINT "complete_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complete_requests" ADD CONSTRAINT "complete_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complete_requests" ADD CONSTRAINT "complete_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "satisfaction_ratings" ADD CONSTRAINT "satisfaction_ratings_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "satisfaction_ratings" ADD CONSTRAINT "satisfaction_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
