CREATE TYPE "public"."delivery_issue_type" AS ENUM('thieu', 'sai_quy_cach', 'hu_hong');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_stage" AS ENUM('nhap', 'da_dat', 'dang_giao', 'da_giao_du', 'huy');--> statement-breakpoint
CREATE TYPE "public"."purchase_request_stage" AS ENUM('nhap', 'cho_duyet', 'da_duyet', 'dang_mua', 'hoan_thanh', 'tu_choi', 'huy');--> statement-breakpoint
CREATE TYPE "public"."purchase_urgency" AS ENUM('thuong', 'gap');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('cho_bao_gia', 'da_nhan', 'duoc_chon', 'khong_chon');--> statement-breakpoint
CREATE TYPE "public"."supplier_class" AS ENUM('chinh', 'du_phong', 'ngung_giao_dich');--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"purchase_order_id" uuid NOT NULL,
	"delivered_date" date NOT NULL,
	"received_by" uuid,
	"delivered_by_name" varchar(128),
	"delivery_note_number" varchar(64),
	"invoice_number" varchar(64),
	"has_quality_certificate" boolean DEFAULT false NOT NULL,
	"document_urls" text[],
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "delivery_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"purchase_order_item_id" uuid NOT NULL,
	"quantity_ok" numeric(18, 3) DEFAULT '0' NOT NULL,
	"quantity_issue" numeric(18, 3) DEFAULT '0' NOT NULL,
	"issue_type" "delivery_issue_type",
	"issue_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"position" numeric(10, 2) DEFAULT '0' NOT NULL,
	"item_code" varchar(64),
	"name" text NOT NULL,
	"specification" text,
	"unit" varchar(32) NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"delivered_quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"purchase_request_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"quotation_id" uuid,
	"stage" "purchase_order_stage" DEFAULT 'nhap' NOT NULL,
	"order_date" date,
	"promised_date" date,
	"contract_number" varchar(64),
	"total_value" bigint DEFAULT 0 NOT NULL,
	"committed_to_budget" bigint DEFAULT 0 NOT NULL,
	"closed_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_request_id" uuid NOT NULL,
	"position" numeric(10, 2) DEFAULT '0' NOT NULL,
	"item_code" varchar(64),
	"name" text NOT NULL,
	"specification" text,
	"unit" varchar(32) NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"estimated_unit_price" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"title" text NOT NULL,
	"construction_site_id" uuid,
	"bidding_project_id" uuid,
	"cost_code" varchar(64),
	"cost_group" "cost_group" DEFAULT 'vat_tu' NOT NULL,
	"stage" "purchase_request_stage" DEFAULT 'nhap' NOT NULL,
	"urgency" "purchase_urgency" DEFAULT 'thuong' NOT NULL,
	"needed_date" date,
	"delivery_location" text,
	"estimated_value" bigint DEFAULT 0 NOT NULL,
	"requested_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"purchase_request_item_id" uuid,
	"item_code" varchar(64),
	"name" text NOT NULL,
	"specification" text,
	"unit" varchar(32) NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"purchase_request_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "quotation_status" DEFAULT 'cho_bao_gia' NOT NULL,
	"quoted_date" date,
	"valid_until" date,
	"tax_rate_bp" integer DEFAULT 0 NOT NULL,
	"wastage_rate_bp" integer DEFAULT 0 NOT NULL,
	"shipping_fee" bigint DEFAULT 0 NOT NULL,
	"delivery_days" integer,
	"payment_term_days" integer,
	"warranty_months" integer,
	"selection_reason" text,
	"selected_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"category" varchar(128),
	"supplier_class" "supplier_class" DEFAULT 'du_phong' NOT NULL,
	"tax_code" varchar(20),
	"contact_person" varchar(128),
	"phone" varchar(20),
	"email" varchar(255),
	"address" text,
	"default_payment_term_days" integer,
	"rating_spec_conformity" integer,
	"rating_quality_stability" integer,
	"rating_price" integer,
	"rating_delivery" integer,
	"rating_payment_terms" integer,
	"rating_documents" integer,
	"rating_warranty" integer,
	"rating_reputation" integer,
	"rating_notes" text,
	"rated_at" timestamp with time zone,
	"suspended_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_purchase_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_bidding_project_id_bidding_projects_id_fk" FOREIGN KEY ("bidding_project_id") REFERENCES "public"."bidding_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_purchase_request_item_id_purchase_request_items_id_fk" FOREIGN KEY ("purchase_request_item_id") REFERENCES "public"."purchase_request_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_order_idx" ON "deliveries" USING btree ("purchase_order_id","delivered_date");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_code" ON "deliveries" USING btree ("code") WHERE "deliveries"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "delivery_items_idx" ON "delivery_items" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_items_order_item_idx" ON "delivery_items" USING btree ("purchase_order_item_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_idx" ON "purchase_order_items" USING btree ("purchase_order_id","position");--> statement-breakpoint
CREATE INDEX "purchase_orders_list_idx" ON "purchase_orders" USING btree ("company_id","stage","promised_date");--> statement-breakpoint
CREATE INDEX "purchase_orders_request_idx" ON "purchase_orders" USING btree ("purchase_request_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_code" ON "purchase_orders" USING btree ("code") WHERE "purchase_orders"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "purchase_request_items_idx" ON "purchase_request_items" USING btree ("purchase_request_id","position");--> statement-breakpoint
CREATE INDEX "purchase_requests_list_idx" ON "purchase_requests" USING btree ("company_id","stage","needed_date");--> statement-breakpoint
CREATE INDEX "purchase_requests_site_idx" ON "purchase_requests" USING btree ("construction_site_id");--> statement-breakpoint
CREATE INDEX "purchase_requests_bidding_idx" ON "purchase_requests" USING btree ("bidding_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_requests_code" ON "purchase_requests" USING btree ("code") WHERE "purchase_requests"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "quotation_items_idx" ON "quotation_items" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "quotation_items_history_idx" ON "quotation_items" USING btree ("item_code");--> statement-breakpoint
CREATE INDEX "quotations_request_idx" ON "quotations" USING btree ("purchase_request_id","status");--> statement-breakpoint
CREATE INDEX "quotations_supplier_idx" ON "quotations" USING btree ("supplier_id","quoted_date");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_one_per_supplier" ON "quotations" USING btree ("purchase_request_id","supplier_id") WHERE "quotations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "suppliers_class_idx" ON "suppliers" USING btree ("supplier_class","name");--> statement-breakpoint
CREATE INDEX "suppliers_category_idx" ON "suppliers" USING btree ("category");--> statement-breakpoint
-- ============================================================================
-- Ràng buộc viết tay — drizzle-kit không sinh được CHECK và khoá ngoại chéo module
-- ============================================================================

-- Thang chấm tiêu chí nhà cung cấp là 1–5 (PRD MH-03 nêu tiêu chí, thang điểm là SUY LUẬN).
-- Không có ràng buộc này thì một ô nhập nhầm "50" sẽ lặng lẽ làm lệch mọi bảng xếp hạng.
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_rating_range" CHECK (
  ("rating_spec_conformity"   IS NULL OR "rating_spec_conformity"   BETWEEN 1 AND 5) AND
  ("rating_quality_stability" IS NULL OR "rating_quality_stability" BETWEEN 1 AND 5) AND
  ("rating_price"             IS NULL OR "rating_price"             BETWEEN 1 AND 5) AND
  ("rating_delivery"          IS NULL OR "rating_delivery"          BETWEEN 1 AND 5) AND
  ("rating_payment_terms"     IS NULL OR "rating_payment_terms"     BETWEEN 1 AND 5) AND
  ("rating_documents"         IS NULL OR "rating_documents"         BETWEEN 1 AND 5) AND
  ("rating_warranty"          IS NULL OR "rating_warranty"          BETWEEN 1 AND 5) AND
  ("rating_reputation"        IS NULL OR "rating_reputation"        BETWEEN 1 AND 5)
);--> statement-breakpoint

-- Ngừng giao dịch với một nhà cung cấp là quyết định phải giải trình được: lần sau có người
-- định mua lại của họ thì đọc được vì sao đã dừng (MH-03).
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_suspend_needs_reason" CHECK (
  "supplier_class" <> 'ngung_giao_dich' OR btrim(COALESCE("suspended_reason", '')) <> ''
);--> statement-breakpoint

-- Một đề nghị mua thuộc NHIỀU NHẤT một hồ sơ nguồn. Cả hai rỗng = mua cho văn phòng,
-- không gắn ngân sách công trình nào — đó là trường hợp hợp lệ, nên dùng `<= 1` chứ không
-- phải `= 1` như `project_budgets`.
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_one_source" CHECK (
  num_nonnulls("construction_site_id", "bidding_project_id") <= 1
);--> statement-breakpoint

ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_quantity_positive"
  CHECK ("quantity" > 0);--> statement-breakpoint

ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quantity_positive"
  CHECK ("quantity" > 0);--> statement-breakpoint

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_quantity_positive"
  CHECK ("quantity" > 0);--> statement-breakpoint

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_delivered_range"
  CHECK ("delivered_quantity" >= 0 AND "delivered_quantity" <= "quantity");--> statement-breakpoint

ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_quantities_not_negative"
  CHECK ("quantity_ok" >= 0 AND "quantity_issue" >= 0);--> statement-breakpoint

-- Ghi nhận có hàng không đạt thì phải nói rõ không đạt kiểu gì — MH-07 yêu cầu "xử lý và
-- ghi nhận trường hợp hàng thiếu/sai/hỏng", một con số trống nghĩa thì xử lý được gì.
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_issue_needs_type" CHECK (
  "quantity_issue" = 0 OR "issue_type" IS NOT NULL
);--> statement-breakpoint

-- Tỷ lệ lưu bằng điểm cơ bản, không âm và không quá 100% (10.000 điểm cơ bản).
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rates_range" CHECK (
  "tax_rate_bp" BETWEEN 0 AND 10000 AND "wastage_rate_bp" BETWEEN 0 AND 10000
);--> statement-breakpoint

-- Khoá ngoại còn nợ từ Module DA: `unit_prices.supplier_id` được khai từ migration 0020 với
-- ghi chú "chưa có khoá ngoại vì bảng suppliers thuộc Module MH". Giờ bảng đã có.
ALTER TABLE "unit_prices" ADD CONSTRAINT "unit_prices_supplier_id_fk"
  FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null;
