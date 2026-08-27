CREATE TYPE "public"."accounting_period_status" AS ENUM('dang_mo', 'da_khoa');--> statement-breakpoint
CREATE TYPE "public"."advance_status" AS ENUM('dang_no', 'da_hoan');--> statement-breakpoint
CREATE TYPE "public"."cash_flow_period_type" AS ENUM('tuan', 'thang');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('khach_hang', 'nha_cung_cap');--> statement-breakpoint
CREATE TYPE "public"."payment_check_step" AS ENUM('don_vi', 'ke_toan', 'tai_chinh');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('chuyen_khoan', 'tien_mat');--> statement-breakpoint
CREATE TYPE "public"."payment_request_stage" AS ENUM('nhap', 'cho_don_vi', 'cho_ke_toan', 'cho_tai_chinh', 'cho_phe_duyet', 'da_duyet', 'da_chi', 'da_hach_toan', 'tu_choi', 'huy');--> statement-breakpoint
CREATE TYPE "public"."payment_request_type" AS ENUM('thanh_toan', 'tam_ung', 'hoan_ung');--> statement-breakpoint
CREATE TYPE "public"."receivable_direction" AS ENUM('phai_thu', 'phai_tra');--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_code" varchar(7) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "accounting_period_status" DEFAULT 'dang_mo' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"reopened_at" timestamp with time zone,
	"reopened_by" uuid,
	"reopen_reason" text,
	"exported_at" timestamp with time zone,
	"exported_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"payment_request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"settled_amount" bigint DEFAULT 0 NOT NULL,
	"advance_date" date NOT NULL,
	"due_date" date,
	"status" "advance_status" DEFAULT 'dang_no' NOT NULL,
	"settled_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cash_flow_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_type" "cash_flow_period_type" DEFAULT 'thang' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"construction_site_id" uuid,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"balance_note" text,
	"planned_in" bigint DEFAULT 0 NOT NULL,
	"planned_out" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_request_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_request_id" uuid NOT NULL,
	"construction_site_id" uuid,
	"cost_code" varchar(64),
	"cost_group" "cost_group" DEFAULT 'chi_phi_chung' NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"basis" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "payment_request_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_request_id" uuid NOT NULL,
	"step" "payment_check_step" NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"note" text,
	"entered_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"request_type" "payment_request_type" DEFAULT 'thanh_toan' NOT NULL,
	"title" text NOT NULL,
	"stage" "payment_request_stage" DEFAULT 'nhap' NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"department" varchar(128),
	"origin_module" varchar(8) DEFAULT 'KT' NOT NULL,
	"supplier_id" uuid,
	"payee_name" varchar(255),
	"advance_user_id" uuid,
	"advance_due_date" date,
	"advance_override_reason" text,
	"settles_advance_id" uuid,
	"receivable_id" uuid,
	"purchase_order_id" uuid,
	"delivery_id" uuid,
	"contract_id" uuid,
	"accounting_period" varchar(7),
	"due_date" date,
	"requested_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"payment_method" "payment_method",
	"paid_date" date,
	"payment_reference" varchar(64),
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"posted_at" timestamp with time zone,
	"posted_reference" varchar(64),
	"closed_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "receivable_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receivable_id" uuid NOT NULL,
	"settled_date" date NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"method" "payment_method",
	"reference" varchar(64),
	"payment_request_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "receivables_payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"direction" "receivable_direction" NOT NULL,
	"party_type" "party_type" NOT NULL,
	"customer_id" uuid,
	"supplier_id" uuid,
	"party_name" varchar(255),
	"contract_id" uuid,
	"construction_site_id" uuid,
	"purchase_order_id" uuid,
	"invoice_number" varchar(64),
	"invoice_date" date,
	"description" text,
	"amount" bigint DEFAULT 0 NOT NULL,
	"settled_amount" bigint DEFAULT 0 NOT NULL,
	"due_date" date,
	"settled_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"reconciled_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_exported_by_users_id_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_plans" ADD CONSTRAINT "cash_flow_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_plans" ADD CONSTRAINT "cash_flow_plans_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_plans" ADD CONSTRAINT "cash_flow_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_plans" ADD CONSTRAINT "cash_flow_plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_allocations" ADD CONSTRAINT "payment_request_allocations_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_allocations" ADD CONSTRAINT "payment_request_allocations_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_allocations" ADD CONSTRAINT "payment_request_allocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_allocations" ADD CONSTRAINT "payment_request_allocations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_steps" ADD CONSTRAINT "payment_request_steps_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_steps" ADD CONSTRAINT "payment_request_steps_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_advance_user_id_users_id_fk" FOREIGN KEY ("advance_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_receivable_id_receivables_payables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables_payables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_settlements" ADD CONSTRAINT "receivable_settlements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_reconciled_by_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables_payables" ADD CONSTRAINT "receivables_payables_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_periods_unique" ON "accounting_periods" USING btree ("company_id","period_code");--> statement-breakpoint
CREATE INDEX "advances_user_idx" ON "advances" USING btree ("user_id","status","due_date");--> statement-breakpoint
CREATE INDEX "advances_company_idx" ON "advances" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "advances_one_per_request" ON "advances" USING btree ("payment_request_id");--> statement-breakpoint
CREATE INDEX "cash_flow_plans_idx" ON "cash_flow_plans" USING btree ("company_id","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_plans_period" ON "cash_flow_plans" USING btree ("company_id","period_type","period_start","construction_site_id") WHERE "cash_flow_plans"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "payment_request_allocations_idx" ON "payment_request_allocations" USING btree ("payment_request_id");--> statement-breakpoint
CREATE INDEX "payment_request_allocations_site_idx" ON "payment_request_allocations" USING btree ("construction_site_id","cost_code");--> statement-breakpoint
CREATE INDEX "payment_request_steps_idx" ON "payment_request_steps" USING btree ("payment_request_id","decided_at");--> statement-breakpoint
CREATE INDEX "payment_requests_list_idx" ON "payment_requests" USING btree ("company_id","stage","due_date");--> statement-breakpoint
CREATE INDEX "payment_requests_supplier_idx" ON "payment_requests" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "payment_requests_contract_idx" ON "payment_requests" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "payment_requests_order_idx" ON "payment_requests" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "payment_requests_advance_user_idx" ON "payment_requests" USING btree ("advance_user_id");--> statement-breakpoint
CREATE INDEX "payment_requests_period_idx" ON "payment_requests" USING btree ("company_id","accounting_period");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_code" ON "payment_requests" USING btree ("code") WHERE "payment_requests"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "receivable_settlements_idx" ON "receivable_settlements" USING btree ("receivable_id","settled_date");--> statement-breakpoint
CREATE INDEX "receivables_list_idx" ON "receivables_payables" USING btree ("company_id","direction","due_date");--> statement-breakpoint
CREATE INDEX "receivables_customer_idx" ON "receivables_payables" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "receivables_supplier_idx" ON "receivables_payables" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "receivables_contract_idx" ON "receivables_payables" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receivables_code" ON "receivables_payables" USING btree ("code") WHERE "receivables_payables"."code" IS NOT NULL;