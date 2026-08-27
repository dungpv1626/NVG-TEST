CREATE TYPE "public"."asset_condition" AS ENUM('tot', 'can_sua_chua', 'hong', 'da_thanh_ly');--> statement-breakpoint
CREATE TYPE "public"."asset_event_type" AS ENUM('cap_phat', 'dieu_chuyen', 'sua_chua', 'thu_hoi', 'thanh_ly');--> statement-breakpoint
CREATE TYPE "public"."attendance_kind" AS ENUM('lam_viec', 'nghi_co_phep', 'nghi_khong_phep', 'nghi_le', 'cong_tac');--> statement-breakpoint
CREATE TYPE "public"."candidate_stage" AS ENUM('moi', 'sang_loc', 'phong_van', 'danh_gia', 'moi_nhan_viec', 'nhan_viec', 'tu_choi');--> statement-breakpoint
CREATE TYPE "public"."checklist_item_group" AS ENUM('ho_so', 'tai_san', 'quyen_truy_cap', 'cong_viec');--> statement-breakpoint
CREATE TYPE "public"."checklist_kind" AS ENUM('tiep_nhan', 'nghi_viec');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('thu_viec', 'chinh_thuc', 'tam_nghi', 'da_nghi');--> statement-breakpoint
CREATE TYPE "public"."employment_contract_status" AS ENUM('nhap', 'dang_hieu_luc', 'da_ket_thuc', 'da_huy');--> statement-breakpoint
CREATE TYPE "public"."employment_contract_type" AS ENUM('thu_viec', 'xac_dinh_han', 'khong_xac_dinh_han', 'khoan_viec');--> statement-breakpoint
CREATE TYPE "public"."hr_document_type" AS ENUM('can_cuoc', 'chung_chi_hanh_nghe', 'chung_chi_an_toan', 'giay_phep_lai_xe', 'kham_suc_khoe', 'bao_hiem', 'khac');--> statement-breakpoint
CREATE TYPE "public"."insurance_status" AS ENUM('chua_tham_gia', 'dang_tham_gia', 'da_bao_giam');--> statement-breakpoint
CREATE TYPE "public"."labor_worker_status" AS ENUM('dang_lam', 'thieu_giay_to', 'da_nghi');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('nhap', 'cho_duyet', 'da_duyet', 'tu_choi', 'da_huy');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('phep_nam', 'khong_luong', 'om_dau', 'thai_san', 'viec_rieng');--> statement-breakpoint
CREATE TYPE "public"."payroll_adjustment_kind" AS ENUM('thuong', 'phat');--> statement-breakpoint
CREATE TYPE "public"."recruitment_position_status" AS ENUM('nhap', 'cho_duyet', 'dang_tuyen', 'da_tuyen_du', 'dung_tuyen');--> statement-breakpoint
CREATE TYPE "public"."salary_type" AS ENUM('thang', 'ngay_cong', 'san_pham', 'khoan_khoi_luong');--> statement-breakpoint
CREATE TYPE "public"."timesheet_period_status" AS ENUM('dang_ghi', 'cho_xac_nhan', 'da_xac_nhan', 'da_chot');--> statement-breakpoint
CREATE TYPE "public"."work_block" AS ENUM('van_phong', 'cong_truong', 'xuong');--> statement-breakpoint
CREATE TABLE "asset_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"type" "asset_event_type" NOT NULL,
	"event_date" date NOT NULL,
	"from_employee_id" uuid,
	"to_employee_id" uuid,
	"condition" "asset_condition",
	"amount" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"name" varchar(255) NOT NULL,
	"serial_number" varchar(64),
	"category" varchar(64),
	"value" bigint,
	"purchase_date" date,
	"condition" "asset_condition" DEFAULT 'tot' NOT NULL,
	"current_holder_id" uuid,
	"location" varchar(128),
	"construction_site_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"full_name" varchar(128) NOT NULL,
	"user_id" uuid,
	"block" "work_block" DEFAULT 'van_phong' NOT NULL,
	"department" varchar(128),
	"position" varchar(128) NOT NULL,
	"manager_user_id" uuid,
	"construction_site_id" uuid,
	"status" "employee_status" DEFAULT 'thu_viec' NOT NULL,
	"hire_date" date,
	"probation_end_date" date,
	"termination_date" date,
	"phone" varchar(32),
	"email" varchar(255),
	"date_of_birth" date,
	"address" text,
	"id_number" varchar(32),
	"id_issued_date" date,
	"id_issued_place" varchar(128),
	"salary_type" "salary_type" DEFAULT 'thang' NOT NULL,
	"base_salary" bigint,
	"allowance" bigint,
	"insurance_salary" bigint,
	"health_notes" text,
	"discipline_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "employment_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"code" varchar(40),
	"type" "employment_contract_type" DEFAULT 'thu_viec' NOT NULL,
	"status" "employment_contract_status" DEFAULT 'nhap' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"signed_date" date,
	"signed_by" uuid,
	"salary_amount" bigint,
	"insurance_status" "insurance_status" DEFAULT 'chua_tham_gia' NOT NULL,
	"insurance_number" varchar(32),
	"insurance_from_date" date,
	"insurance_to_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hr_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hr_checklist_id" uuid NOT NULL,
	"item_group" "checklist_item_group" NOT NULL,
	"title" varchar(255) NOT NULL,
	"asset_id" uuid,
	"assignee_user_id" uuid,
	"done_at" timestamp with time zone,
	"done_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "hr_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "checklist_kind" NOT NULL,
	"effective_date" date NOT NULL,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "hr_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid,
	"labor_worker_id" uuid,
	"type" "hr_document_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"document_number" varchar(64),
	"issued_date" date,
	"expiry_date" date,
	"original_location" varchar(128),
	"last_reminded_stage" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "labor_workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subcontractor_id" uuid,
	"construction_site_id" uuid,
	"full_name" varchar(128) NOT NULL,
	"phone" varchar(32),
	"trade" varchar(64),
	"status" "labor_worker_status" DEFAULT 'dang_lam' NOT NULL,
	"start_date" date,
	"end_date" date,
	"safety_commitment_signed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"code" varchar(40),
	"type" "leave_type" DEFAULT 'phep_nam' NOT NULL,
	"status" "leave_request_status" DEFAULT 'nhap' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"day_count" numeric(5, 2) DEFAULT '1' NOT NULL,
	"reason" text NOT NULL,
	"covering_user_id" uuid,
	"approval_id" uuid,
	"decided_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payroll_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"kind" "payroll_adjustment_kind" NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recruitment_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recruitment_position_id" uuid NOT NULL,
	"full_name" varchar(128) NOT NULL,
	"phone" varchar(32),
	"email" varchar(255),
	"stage" "candidate_stage" DEFAULT 'moi' NOT NULL,
	"applied_date" date,
	"interview_at" timestamp with time zone,
	"evaluation" text,
	"reject_reason" text,
	"employee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recruitment_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"title" varchar(255) NOT NULL,
	"department" varchar(128),
	"block" "work_block" DEFAULT 'van_phong' NOT NULL,
	"status" "recruitment_position_status" DEFAULT 'nhap' NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"hired_count" integer DEFAULT 0 NOT NULL,
	"needed_by_date" date,
	"requirements" text,
	"requested_by" uuid,
	"approval_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "timesheet_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timesheet_id" uuid NOT NULL,
	"field" varchar(32) NOT NULL,
	"old_value" numeric(14, 3),
	"new_value" numeric(14, 3),
	"reason" text NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"timesheet_period_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"kind" "attendance_kind" DEFAULT 'lam_viec' NOT NULL,
	"hours" numeric(5, 2),
	"overtime_hours" numeric(5, 2),
	"output_quantity" numeric(14, 3),
	"subcontractor_id" uuid,
	"construction_site_id" uuid,
	"source" varchar(8) DEFAULT 'tay' NOT NULL,
	"leave_request_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "timesheet_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"source_type" "work_block" NOT NULL,
	"status" timesheet_period_status DEFAULT 'dang_ghi' NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"timesheet_period_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"source_type" "work_block" NOT NULL,
	"workdays" numeric(6, 2) DEFAULT '0' NOT NULL,
	"worked_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"overtime_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"leave_days" integer DEFAULT 0 NOT NULL,
	"unpaid_absence_days" integer DEFAULT 0 NOT NULL,
	"holiday_days" integer DEFAULT 0 NOT NULL,
	"business_trip_days" integer DEFAULT 0 NOT NULL,
	"output_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"bonus_amount" bigint DEFAULT 0 NOT NULL,
	"penalty_amount" bigint DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transferred_at" timestamp with time zone,
	"transferred_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_from_employee_id_employees_id_fk" FOREIGN KEY ("from_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_to_employee_id_employees_id_fk" FOREIGN KEY ("to_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_current_holder_id_employees_id_fk" FOREIGN KEY ("current_holder_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_hr_checklist_id_hr_checklists_id_fk" FOREIGN KEY ("hr_checklist_id") REFERENCES "public"."hr_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_done_by_users_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_workers" ADD CONSTRAINT "labor_workers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_workers" ADD CONSTRAINT "labor_workers_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_workers" ADD CONSTRAINT "labor_workers_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_workers" ADD CONSTRAINT "labor_workers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_workers" ADD CONSTRAINT "labor_workers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_covering_user_id_users_id_fk" FOREIGN KEY ("covering_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_recruitment_position_id_recruitment_positions_id_fk" FOREIGN KEY ("recruitment_position_id") REFERENCES "public"."recruitment_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_candidates" ADD CONSTRAINT "recruitment_candidates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_positions" ADD CONSTRAINT "recruitment_positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_positions" ADD CONSTRAINT "recruitment_positions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_positions" ADD CONSTRAINT "recruitment_positions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_positions" ADD CONSTRAINT "recruitment_positions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_adjustments" ADD CONSTRAINT "timesheet_adjustments_timesheet_id_timesheets_id_fk" FOREIGN KEY ("timesheet_id") REFERENCES "public"."timesheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_adjustments" ADD CONSTRAINT "timesheet_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_period_id_timesheet_periods_id_fk" FOREIGN KEY ("timesheet_period_id") REFERENCES "public"."timesheet_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_timesheet_period_id_timesheet_periods_id_fk" FOREIGN KEY ("timesheet_period_id") REFERENCES "public"."timesheet_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_transferred_by_users_id_fk" FOREIGN KEY ("transferred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "asset_events_asset_idx" ON "asset_events" USING btree ("asset_id","event_date");--> statement-breakpoint
CREATE INDEX "assets_company_idx" ON "assets" USING btree ("company_id","condition");--> statement-breakpoint
CREATE INDEX "assets_holder_idx" ON "assets" USING btree ("current_holder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_code_unique" ON "assets" USING btree ("code") WHERE deleted_at IS NULL AND code IS NOT NULL;--> statement-breakpoint
CREATE INDEX "employees_company_idx" ON "employees" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "employees_block_idx" ON "employees" USING btree ("company_id","block");--> statement-breakpoint
CREATE INDEX "employees_user_idx" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employees_site_idx" ON "employees" USING btree ("construction_site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_code_unique" ON "employees" USING btree ("code") WHERE deleted_at IS NULL AND code IS NOT NULL;--> statement-breakpoint
CREATE INDEX "employment_contracts_employee_idx" ON "employment_contracts" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "employment_contracts_expiry_idx" ON "employment_contracts" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "hr_checklist_items_idx" ON "hr_checklist_items" USING btree ("hr_checklist_id","item_group");--> statement-breakpoint
CREATE INDEX "hr_checklists_employee_idx" ON "hr_checklists" USING btree ("employee_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "hr_checklists_unique" ON "hr_checklists" USING btree ("employee_id","kind");--> statement-breakpoint
CREATE INDEX "hr_documents_employee_idx" ON "hr_documents" USING btree ("employee_id","expiry_date");--> statement-breakpoint
CREATE INDEX "hr_documents_worker_idx" ON "hr_documents" USING btree ("labor_worker_id");--> statement-breakpoint
CREATE INDEX "hr_documents_expiry_idx" ON "hr_documents" USING btree ("company_id","expiry_date");--> statement-breakpoint
CREATE INDEX "labor_workers_site_idx" ON "labor_workers" USING btree ("construction_site_id","status");--> statement-breakpoint
CREATE INDEX "labor_workers_team_idx" ON "labor_workers" USING btree ("subcontractor_id");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id","from_date");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "payroll_adjustments_period_idx" ON "payroll_adjustments" USING btree ("employee_id","year","month");--> statement-breakpoint
CREATE INDEX "recruitment_candidates_position_idx" ON "recruitment_candidates" USING btree ("recruitment_position_id","stage");--> statement-breakpoint
CREATE INDEX "recruitment_candidates_company_idx" ON "recruitment_candidates" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "recruitment_positions_company_idx" ON "recruitment_positions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "timesheet_adjustments_idx" ON "timesheet_adjustments" USING btree ("timesheet_id","approved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_entries_unique" ON "timesheet_entries" USING btree ("timesheet_period_id","employee_id","work_date");--> statement-breakpoint
CREATE INDEX "timesheet_entries_employee_idx" ON "timesheet_entries" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "timesheet_entries_site_idx" ON "timesheet_entries" USING btree ("construction_site_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_periods_unique" ON "timesheet_periods" USING btree ("company_id","year","month","source_type");--> statement-breakpoint
CREATE INDEX "timesheet_periods_status_idx" ON "timesheet_periods" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheets_unique" ON "timesheets" USING btree ("employee_id","year","month");--> statement-breakpoint
CREATE INDEX "timesheets_period_idx" ON "timesheets" USING btree ("timesheet_period_id");--> statement-breakpoint
CREATE INDEX "timesheets_transfer_idx" ON "timesheets" USING btree ("company_id","transferred_at");