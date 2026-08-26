CREATE TYPE "public"."bid_document_category" AS ENUM('phap_ly', 'nang_luc', 'kinh_nghiem', 'nhan_su', 'thiet_bi', 'bien_phap_thi_cong', 'tien_do', 'an_toan', 'bang_gia');--> statement-breakpoint
CREATE TYPE "public"."bidding_stage" AS ENUM('tiep_nhan_ho_so', 'khao_sat', 'boc_tach', 'du_toan', 'cho_duyet_gia', 'da_duyet_gia', 'nop_thau', 'trung_thau', 'truot_thau');--> statement-breakpoint
CREATE TYPE "public"."cost_group" AS ENUM('vat_tu', 'nhan_cong', 'may_moc', 'thau_phu', 'chi_phi_chung', 'du_phong', 'loi_nhuan');--> statement-breakpoint
CREATE TYPE "public"."unit_price_source" AS ENUM('lich_su_mua', 'bao_gia_ncc', 'dinh_muc_noi_bo');--> statement-breakpoint
CREATE TABLE "bid_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bidding_project_id" uuid NOT NULL,
	"category" "bid_document_category" NOT NULL,
	"name" text NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"document_id" uuid,
	"submitted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bidding_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"opportunity_id" uuid,
	"customer_id" uuid,
	"stage" "bidding_stage" DEFAULT 'tiep_nhan_ho_so' NOT NULL,
	"responsible_user_id" uuid,
	"estimated_value" bigint,
	"site_address" text,
	"submission_deadline" date,
	"submitted_at" timestamp with time zone,
	"clarification_notes" text,
	"survey_notes" text,
	"lost_reason" text,
	"budget_generated_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bidding_projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "boq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bidding_project_id" uuid NOT NULL,
	"position" numeric(10, 2) DEFAULT '0' NOT NULL,
	"item_code" varchar(64),
	"name" text NOT NULL,
	"unit" varchar(32) NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"drawing_ref" varchar(64),
	"drawing_document_id" uuid,
	"drawing_version_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estimate_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"boq_item_id" uuid,
	"unit_price_id" uuid,
	"position" numeric(10, 2) DEFAULT '0' NOT NULL,
	"cost_group" "cost_group" NOT NULL,
	"description" text NOT NULL,
	"unit" varchar(32),
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bidding_project_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current_version" boolean DEFAULT true NOT NULL,
	"status" "status_group" DEFAULT 'draft' NOT NULL,
	"bid_price" bigint,
	"direct_cost" bigint,
	"overhead_cost" bigint,
	"contingency_cost" bigint,
	"finance_cost" bigint,
	"tax_amount" bigint,
	"profit_amount" bigint,
	"profit_margin_percent" numeric(5, 2),
	"basis_notes" text,
	"prepared_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bidding_project_id" uuid NOT NULL,
	"estimate_id" uuid,
	"cost_group" "cost_group" NOT NULL,
	"cost_code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"budgeted_amount" bigint DEFAULT 0 NOT NULL,
	"actual_amount" bigint DEFAULT 0 NOT NULL,
	"committed_amount" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unit_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"unit" varchar(32) NOT NULL,
	"cost_group" "cost_group" NOT NULL,
	"price" bigint NOT NULL,
	"source" "unit_price_source" NOT NULL,
	"supplier_id" uuid,
	"supplier_name" varchar(255),
	"effective_date" date NOT NULL,
	"applied_project_ref" varchar(64),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bid_documents" ADD CONSTRAINT "bid_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_documents" ADD CONSTRAINT "bid_documents_bidding_project_id_bidding_projects_id_fk" FOREIGN KEY ("bidding_project_id") REFERENCES "public"."bidding_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_documents" ADD CONSTRAINT "bid_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_documents" ADD CONSTRAINT "bid_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid_documents" ADD CONSTRAINT "bid_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidding_projects" ADD CONSTRAINT "bidding_projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidding_projects" ADD CONSTRAINT "bidding_projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidding_projects" ADD CONSTRAINT "bidding_projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidding_projects" ADD CONSTRAINT "bidding_projects_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidding_projects" ADD CONSTRAINT "bidding_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bidding_projects" ADD CONSTRAINT "bidding_projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_bidding_project_id_bidding_projects_id_fk" FOREIGN KEY ("bidding_project_id") REFERENCES "public"."bidding_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_drawing_document_id_documents_id_fk" FOREIGN KEY ("drawing_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_drawing_version_id_document_versions_id_fk" FOREIGN KEY ("drawing_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_unit_price_id_unit_prices_id_fk" FOREIGN KEY ("unit_price_id") REFERENCES "public"."unit_prices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_items" ADD CONSTRAINT "estimate_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_bidding_project_id_bidding_projects_id_fk" FOREIGN KEY ("bidding_project_id") REFERENCES "public"."bidding_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_bidding_project_id_bidding_projects_id_fk" FOREIGN KEY ("bidding_project_id") REFERENCES "public"."bidding_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_prices" ADD CONSTRAINT "unit_prices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_prices" ADD CONSTRAINT "unit_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_prices" ADD CONSTRAINT "unit_prices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bid_documents_project_idx" ON "bid_documents" USING btree ("bidding_project_id","category");--> statement-breakpoint
CREATE INDEX "bidding_projects_company_stage_idx" ON "bidding_projects" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "bidding_projects_opportunity_idx" ON "bidding_projects" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "bidding_projects_responsible_idx" ON "bidding_projects" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "boq_items_project_idx" ON "boq_items" USING btree ("bidding_project_id","position");--> statement-breakpoint
CREATE INDEX "boq_items_drawing_idx" ON "boq_items" USING btree ("drawing_version_id");--> statement-breakpoint
CREATE INDEX "estimate_items_estimate_idx" ON "estimate_items" USING btree ("estimate_id","position");--> statement-breakpoint
CREATE INDEX "estimates_project_idx" ON "estimates" USING btree ("bidding_project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_one_current_per_project" ON "estimates" USING btree ("bidding_project_id") WHERE "estimates"."is_current_version" AND "estimates"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_code_version" ON "estimates" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "project_budgets_project_idx" ON "project_budgets" USING btree ("bidding_project_id","cost_group");--> statement-breakpoint
CREATE UNIQUE INDEX "project_budgets_cost_code" ON "project_budgets" USING btree ("bidding_project_id","cost_code") WHERE "project_budgets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "unit_prices_lookup_idx" ON "unit_prices" USING btree ("company_id","item_code","effective_date");--> statement-breakpoint
CREATE INDEX "unit_prices_cost_group_idx" ON "unit_prices" USING btree ("company_id","cost_group");