CREATE TYPE "public"."change_request_origin" AS ENUM('khach_hang', 'noi_bo', 'cong_truong', 'phap_ly');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('moi', 'dang_danh_gia', 'chap_thuan', 'tu_choi', 'da_thuc_hien');--> statement-breakpoint
CREATE TYPE "public"."design_discipline" AS ENUM('phuong_an', 'kien_truc', 'ket_cau', 'dien_nuoc');--> statement-breakpoint
CREATE TYPE "public"."design_review_decision" AS ENUM('gop_y', 'yeu_cau_sua', 'duyet');--> statement-breakpoint
CREATE TYPE "public"."design_reviewer_type" AS ENUM('khach_hang', 'noi_bo');--> statement-breakpoint
CREATE TYPE "public"."design_stage" AS ENUM('dau_bai', 'phuong_an', 'cho_khach_duyet', 'ho_so_ky_thuat', 'du_toan', 'ban_giao', 'dung_thiet_ke');--> statement-breakpoint
CREATE TYPE "public"."discipline_task_status" AS ENUM('chua_bat_dau', 'dang_lam', 'cho_kiem_tra', 'hoan_thanh');--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_project_id" uuid NOT NULL,
	"code" varchar(40),
	"title" text NOT NULL,
	"origin" "change_request_origin" NOT NULL,
	"requester_name" varchar(128),
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content" text NOT NULL,
	"reason" text NOT NULL,
	"status" "change_request_status" DEFAULT 'moi' NOT NULL,
	"schedule_impact_days" integer,
	"cost_impact" bigint,
	"affected_drawing_count" integer,
	"impact_notes" text,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "design_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_project_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current_version" boolean DEFAULT true NOT NULL,
	"design_task" text,
	"functional_needs" text,
	"budget_amount" bigint,
	"budget_note" text,
	"style_note" text,
	"site_condition" text,
	"legal_documents" text,
	"change_reason" text,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "design_discipline_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_project_id" uuid NOT NULL,
	"discipline" "design_discipline" NOT NULL,
	"assignee_id" uuid,
	"status" "discipline_task_status" DEFAULT 'chua_bat_dau' NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"conflict_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "design_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"opportunity_id" uuid,
	"customer_id" uuid,
	"stage" "design_stage" DEFAULT 'dau_bai' NOT NULL,
	"responsible_user_id" uuid,
	"site_address" text,
	"handover_deadline" date,
	"handed_over_at" timestamp with time zone,
	"construction_site_id" uuid,
	"stopped_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "design_projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "design_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"reviewer_type" "design_reviewer_type" NOT NULL,
	"decision" "design_review_decision" NOT NULL,
	"recorded_by" uuid,
	"reviewer_name" varchar(128),
	"comments" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "design_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_project_id" uuid NOT NULL,
	"surveyed_at" timestamp with time zone,
	"surveyed_by" uuid,
	"land_width" numeric(10, 2),
	"land_depth" numeric(10, 2),
	"land_area" numeric(12, 2),
	"orientation" varchar(32),
	"measurement_notes" text,
	"surrounding_notes" text,
	"usage_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_project_id" uuid NOT NULL,
	"discipline" "design_discipline" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current_version" boolean DEFAULT true NOT NULL,
	"code" varchar(40),
	"title" text NOT NULL,
	"document_id" uuid,
	"document_version_id" uuid,
	"change_reason" text,
	"change_request_id" uuid,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"customer_approved_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_briefs" ADD CONSTRAINT "design_briefs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_briefs" ADD CONSTRAINT "design_briefs_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_briefs" ADD CONSTRAINT "design_briefs_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_briefs" ADD CONSTRAINT "design_briefs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_briefs" ADD CONSTRAINT "design_briefs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_discipline_tasks" ADD CONSTRAINT "design_discipline_tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_discipline_tasks" ADD CONSTRAINT "design_discipline_tasks_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_discipline_tasks" ADD CONSTRAINT "design_discipline_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_discipline_tasks" ADD CONSTRAINT "design_discipline_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_discipline_tasks" ADD CONSTRAINT "design_discipline_tasks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_surveys" ADD CONSTRAINT "design_surveys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_surveys" ADD CONSTRAINT "design_surveys_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_surveys" ADD CONSTRAINT "design_surveys_surveyed_by_users_id_fk" FOREIGN KEY ("surveyed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_surveys" ADD CONSTRAINT "design_surveys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_surveys" ADD CONSTRAINT "design_surveys_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_requests_project_idx" ON "change_requests" USING btree ("design_project_id","status");--> statement-breakpoint
CREATE INDEX "change_requests_requested_by_idx" ON "change_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "design_briefs_project_idx" ON "design_briefs" USING btree ("design_project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "design_briefs_one_current_per_project" ON "design_briefs" USING btree ("design_project_id") WHERE "design_briefs"."is_current_version" AND "design_briefs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "design_briefs_project_version" ON "design_briefs" USING btree ("design_project_id","version");--> statement-breakpoint
CREATE INDEX "design_discipline_tasks_project_idx" ON "design_discipline_tasks" USING btree ("design_project_id","discipline");--> statement-breakpoint
CREATE INDEX "design_discipline_tasks_assignee_idx" ON "design_discipline_tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "design_discipline_tasks_unique" ON "design_discipline_tasks" USING btree ("design_project_id","discipline") WHERE "design_discipline_tasks"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "design_projects_company_stage_idx" ON "design_projects" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "design_projects_opportunity_idx" ON "design_projects" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "design_projects_responsible_idx" ON "design_projects" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "design_reviews_version_idx" ON "design_reviews" USING btree ("design_version_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "design_surveys_project_idx" ON "design_surveys" USING btree ("design_project_id","surveyed_at");--> statement-breakpoint
CREATE INDEX "design_versions_project_idx" ON "design_versions" USING btree ("design_project_id","discipline","version");--> statement-breakpoint
CREATE UNIQUE INDEX "design_versions_one_current_per_discipline" ON "design_versions" USING btree ("design_project_id","discipline") WHERE "design_versions"."is_current_version" AND "design_versions"."published_at" IS NOT NULL AND "design_versions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "design_versions_project_discipline_version" ON "design_versions" USING btree ("design_project_id","discipline","version");