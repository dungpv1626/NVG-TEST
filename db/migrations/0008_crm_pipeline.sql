CREATE TYPE "public"."complaint_severity" AS ENUM('thap', 'trung_binh', 'cao');--> statement-breakpoint
CREATE TYPE "public"."opportunity_classification" AS ENUM('M1', 'M2', 'M3', 'M4');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('tiep_nhan', 'xac_minh', 'khao_sat', 'bao_gia', 'dam_phan', 'ky_hop_dong', 'mat_co_hoi');--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"customer_id" uuid NOT NULL,
	"related_entity_type" varchar(64),
	"related_entity_id" uuid,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"severity" "complaint_severity" DEFAULT 'trung_binh' NOT NULL,
	"assignee_id" uuid,
	"response_due_date" date,
	"status" "status_group" DEFAULT 'in_progress' NOT NULL,
	"resolution" text,
	"customer_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "complaints_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stage" "opportunity_stage" DEFAULT 'tiep_nhan' NOT NULL,
	"classification" "opportunity_classification",
	"owner_id" uuid,
	"estimated_value" bigint,
	"project_type" varchar(64),
	"expected_start_date" date,
	"due_date" date,
	"lost_reason" text,
	"handed_over_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "opportunities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "opportunity_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_stage" "opportunity_stage",
	"to_stage" "opportunity_stage" NOT NULL,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current_version" boolean DEFAULT true NOT NULL,
	"total_value" bigint,
	"discount_amount" bigint,
	"discount_reason" text,
	"status" "status_group" DEFAULT 'draft' NOT NULL,
	"sent_to_customer_at" timestamp with time zone,
	"customer_response" text,
	"responded_at" timestamp with time zone,
	"valid_until" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "quotes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "site_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone,
	"surveyed_at" timestamp with time zone,
	"surveyed_by" uuid,
	"needs" text,
	"decision_maker" varchar(128),
	"budget_note" text,
	"schedule_note" text,
	"commercial_terms" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_surveyed_by_users_id_fk" FOREIGN KEY ("surveyed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "complaints_customer_idx" ON "complaints" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "complaints_assignee_idx" ON "complaints" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "opportunities_company_stage_idx" ON "opportunities" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "opportunities_customer_idx" ON "opportunities" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "opportunities_owner_idx" ON "opportunities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "opportunity_stage_history_idx" ON "opportunity_stage_history" USING btree ("opportunity_id","changed_at");--> statement-breakpoint
CREATE INDEX "quotes_opportunity_idx" ON "quotes" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "site_surveys_opportunity_idx" ON "site_surveys" USING btree ("opportunity_id");