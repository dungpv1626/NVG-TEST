CREATE TYPE "public"."acceptance_status" AS ENUM('nhap', 'da_nghiem_thu', 'huy');--> statement-breakpoint
CREATE TYPE "public"."acceptance_type" AS ENUM('noi_bo', 'thau_phu', 'khach_hang');--> statement-breakpoint
CREATE TYPE "public"."site_log_type" AS ENUM('tien_do', 'khoi_luong', 'vuong_mac', 'an_toan', 'su_viec');--> statement-breakpoint
CREATE TYPE "public"."site_stage" AS ENUM('chuan_bi', 'dang_thi_cong', 'nghiem_thu', 'bao_hanh', 'hoan_thanh', 'tam_dung');--> statement-breakpoint
CREATE TYPE "public"."subcontract_form" AS ENUM('hop_dong', 'don_gia_khoan');--> statement-breakpoint
CREATE TYPE "public"."subcontractor_status" AS ENUM('dang_thuc_hien', 'tam_dung', 'hoan_thanh');--> statement-breakpoint
CREATE TYPE "public"."warranty_claim_status" AS ENUM('tiep_nhan', 'dang_xu_ly', 'da_xu_ly', 'tu_choi');--> statement-breakpoint
CREATE TYPE "public"."warranty_status" AS ENUM('con_han', 'dang_xu_ly', 'het_han');--> statement-breakpoint
CREATE TABLE "acceptance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"construction_site_id" uuid NOT NULL,
	"code" varchar(40),
	"acceptance_type" "acceptance_type" NOT NULL,
	"status" "acceptance_status" DEFAULT 'nhap' NOT NULL,
	"stage_name" text NOT NULL,
	"scope" text,
	"value" bigint,
	"subcontractor_id" uuid,
	"accepted_date" date,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"counterpart_signed_by" varchar(128),
	"outstanding_issues" text,
	"cancel_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "construction_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"contract_id" uuid,
	"bidding_project_id" uuid,
	"design_project_id" uuid,
	"stage" "site_stage" DEFAULT 'chuan_bi' NOT NULL,
	"responsible_user_id" uuid,
	"site_address" text,
	"planned_start_date" date,
	"planned_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"progress_percent" numeric(5, 2),
	"handed_over_at" timestamp with time zone,
	"pause_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "construction_sites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "site_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"construction_site_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"log_type" "site_log_type" DEFAULT 'tien_do' NOT NULL,
	"content" text NOT NULL,
	"workforce_count" integer,
	"weather" varchar(64),
	"photo_urls" text[],
	"logged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"construction_site_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_name" varchar(128),
	"contact_phone" varchar(32),
	"scope_of_work" text NOT NULL,
	"form" "subcontract_form" DEFAULT 'don_gia_khoan' NOT NULL,
	"status" "subcontractor_status" DEFAULT 'dang_thuc_hien' NOT NULL,
	"contract_value" bigint,
	"contract_id" uuid,
	"responsible_user_id" uuid,
	"start_date" date,
	"end_date" date,
	"quality_rating" integer,
	"quality_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"construction_site_id" uuid NOT NULL,
	"item" text NOT NULL,
	"status" "warranty_status" DEFAULT 'con_han' NOT NULL,
	"start_date" date,
	"warranty_until" date,
	"duration_months" integer,
	"subcontractor_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warranty_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"warranty_id" uuid NOT NULL,
	"status" "warranty_claim_status" DEFAULT 'tiep_nhan' NOT NULL,
	"description" text NOT NULL,
	"reported_date" date NOT NULL,
	"reported_by" varchar(128),
	"assigned_user_id" uuid,
	"root_cause" text,
	"resolution" text,
	"cost" bigint,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "project_budgets" ALTER COLUMN "bidding_project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD COLUMN "design_project_id" uuid;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD COLUMN "construction_site_id" uuid;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_records" ADD CONSTRAINT "acceptance_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_bidding_project_id_bidding_projects_id_fk" FOREIGN KEY ("bidding_project_id") REFERENCES "public"."bidding_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_logs" ADD CONSTRAINT "site_logs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_warranty_id_warranties_id_fk" FOREIGN KEY ("warranty_id") REFERENCES "public"."warranties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acceptance_records_site_idx" ON "acceptance_records" USING btree ("construction_site_id","acceptance_type");--> statement-breakpoint
CREATE INDEX "acceptance_records_subcontractor_idx" ON "acceptance_records" USING btree ("subcontractor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_records_code" ON "acceptance_records" USING btree ("code") WHERE "acceptance_records"."code" IS NOT NULL AND "acceptance_records"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "construction_sites_company_stage_idx" ON "construction_sites" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "construction_sites_contract_idx" ON "construction_sites" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "construction_sites_bidding_idx" ON "construction_sites" USING btree ("bidding_project_id");--> statement-breakpoint
CREATE INDEX "construction_sites_design_idx" ON "construction_sites" USING btree ("design_project_id");--> statement-breakpoint
CREATE INDEX "construction_sites_responsible_idx" ON "construction_sites" USING btree ("responsible_user_id");--> statement-breakpoint
CREATE INDEX "site_logs_site_date_idx" ON "site_logs" USING btree ("construction_site_id","log_date");--> statement-breakpoint
CREATE INDEX "site_logs_type_idx" ON "site_logs" USING btree ("construction_site_id","log_type");--> statement-breakpoint
CREATE INDEX "subcontractors_site_idx" ON "subcontractors" USING btree ("construction_site_id","status");--> statement-breakpoint
CREATE INDEX "subcontractors_contract_idx" ON "subcontractors" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "warranties_site_idx" ON "warranties" USING btree ("construction_site_id","status");--> statement-breakpoint
CREATE INDEX "warranties_until_idx" ON "warranties" USING btree ("warranty_until");--> statement-breakpoint
CREATE INDEX "warranty_claims_warranty_idx" ON "warranty_claims" USING btree ("warranty_id","status");--> statement-breakpoint
CREATE INDEX "warranty_claims_assigned_idx" ON "warranty_claims" USING btree ("assigned_user_id");--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_budgets_design_project_idx" ON "project_budgets" USING btree ("design_project_id","cost_group");--> statement-breakpoint
CREATE INDEX "project_budgets_site_idx" ON "project_budgets" USING btree ("construction_site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_budgets_design_cost_code" ON "project_budgets" USING btree ("design_project_id","cost_code") WHERE "project_budgets"."deleted_at" IS NULL;
--> statement-breakpoint
-- ============================================================================
-- Ràng buộc viết tay — Drizzle không sinh được CHECK và khoá ngoại vòng.
-- ============================================================================

-- Ngân sách thuộc ĐÚNG MỘT hồ sơ cha: gói thầu (NVC/NVS) hoặc dự án thiết kế (NVO trọn
-- gói). Giống hệt ràng buộc đã đặt cho `estimates` và `boq_items` ở migration 0024 — không
-- có nó thì một dòng ngân sách có thể treo lơ lửng không thuộc hồ sơ nào, hoặc thuộc cả
-- hai và bị cộng hai lần vào lãi/lỗ.
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_one_owner"
  CHECK (num_nonnulls("bidding_project_id", "design_project_id") = 1);--> statement-breakpoint

-- Khoá ngoại vòng: `project_budgets` (da.ts) và `design_projects` (tk.ts) đều trỏ tới
-- `construction_sites` (tc.ts), mà tc.ts đã import ngược từ hai file kia. Khai ở tầng
-- Drizzle sẽ tạo vòng import và TypeScript mất kiểu, nên ràng buộc thật đặt ở đây.
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_construction_site_id_fk"
  FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id")
  ON DELETE set null;--> statement-breakpoint

ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_construction_site_id_fk"
  FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id")
  ON DELETE set null;--> statement-breakpoint

-- Công trình lấy ngân sách từ TỐI ĐA một hồ sơ cha. Cho phép cả hai rỗng: công trình nội
-- bộ (sửa chữa văn phòng, kho bãi) không đi qua đấu thầu lẫn thiết kế nhưng vẫn cần nhật
-- ký và nghiệm thu.
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_one_source"
  CHECK (num_nonnulls("bidding_project_id", "design_project_id") <= 1);--> statement-breakpoint

-- Tiến độ là phần trăm, không phải một con số bất kỳ.
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_progress_range"
  CHECK ("progress_percent" IS NULL OR ("progress_percent" >= 0 AND "progress_percent" <= 100));--> statement-breakpoint

-- Thang đánh giá tổ đội 1–5 (TC-06). Không ràng buộc thì mỗi công trình chấm một thang
-- khác nhau và cột này mất nghĩa ngay trong quý đầu.
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_rating_range"
  CHECK ("quality_rating" IS NULL OR ("quality_rating" BETWEEN 1 AND 5));
