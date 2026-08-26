CREATE TYPE "public"."amendment_stage" AS ENUM('de_xuat', 'cho_duyet', 'da_duyet', 'tu_choi', 'da_thuc_hien');--> statement-breakpoint
CREATE TYPE "public"."contract_source_type" AS ENUM('opportunities', 'bidding_projects', 'design_projects');--> statement-breakpoint
CREATE TYPE "public"."contract_stage" AS ENUM('nhap', 'cho_duyet', 'da_duyet', 'da_ky', 'hoan_thanh', 'huy');--> statement-breakpoint
CREATE TYPE "public"."contract_term_type" AS ENUM('pham_vi', 'gia_tri', 'tien_do_thanh_toan', 'tam_ung', 'bao_lanh', 'phat', 'bao_hanh', 'quyet_toan');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('thiet_ke', 'thi_cong', 'mua_ban', 'khoan_thau_phu');--> statement-breakpoint
CREATE TABLE "contract_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"code" varchar(40),
	"title" text NOT NULL,
	"stage" "amendment_stage" DEFAULT 'de_xuat' NOT NULL,
	"content" text NOT NULL,
	"reason" text NOT NULL,
	"value_change" bigint DEFAULT 0 NOT NULL,
	"schedule_impact_days" varchar(8),
	"quote_sent_at" timestamp with time zone,
	"customer_confirmed_at" timestamp with time zone,
	"customer_confirmed_by" varchar(128),
	"is_emergency" boolean DEFAULT false NOT NULL,
	"emergency_authorized_by" uuid,
	"emergency_reason" text,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"decision_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contract_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"term_type" "contract_term_type" NOT NULL,
	"description" text NOT NULL,
	"amount" bigint,
	"percent_value" varchar(16),
	"due_date" date,
	"completed_at" timestamp with time zone,
	"position" varchar(8) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"contract_number" varchar(64),
	"title" text NOT NULL,
	"type" "contract_type" NOT NULL,
	"stage" "contract_stage" DEFAULT 'nhap' NOT NULL,
	"source_type" "contract_source_type",
	"source_id" uuid,
	"estimate_id" uuid,
	"customer_id" uuid,
	"partner_name" varchar(255),
	"responsible_user_id" uuid,
	"value" bigint,
	"collected_amount" bigint DEFAULT 0 NOT NULL,
	"signed_date" date,
	"start_date" date,
	"end_date" date,
	"signed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"cancel_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "contracts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_emergency_authorized_by_users_id_fk" FOREIGN KEY ("emergency_authorized_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_terms" ADD CONSTRAINT "contract_terms_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_amendments_contract_idx" ON "contract_amendments" USING btree ("contract_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_amendments_code" ON "contract_amendments" USING btree ("code") WHERE "contract_amendments"."code" IS NOT NULL AND "contract_amendments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "contract_terms_contract_idx" ON "contract_terms" USING btree ("contract_id","term_type","position");--> statement-breakpoint
CREATE INDEX "contracts_company_stage_idx" ON "contracts" USING btree ("company_id","stage");--> statement-breakpoint
CREATE INDEX "contracts_source_idx" ON "contracts" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "contracts_customer_idx" ON "contracts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "contracts_estimate_idx" ON "contracts" USING btree ("estimate_id");--> statement-breakpoint
CREATE INDEX "contracts_responsible_idx" ON "contracts" USING btree ("responsible_user_id");--> statement-breakpoint
-- HD-04 yêu cầu "ghi nhận RÕ trường hợp khẩn cấp VÀ NGƯỜI PHÊ DUYỆT". Đánh dấu khẩn cấp mà
-- không chỉ ra ai cho phép chính là lỗ hổng mà điều khoản đó viết ra để bịt — nên hai cột
-- này ràng buộc thành một cặp ở tầng CSDL, không để ứng dụng tự nhớ.
ALTER TABLE "contract_amendments" ADD CONSTRAINT "contract_amendments_emergency_needs_authorizer"
  CHECK (NOT "is_emergency" OR "emergency_authorized_by" IS NOT NULL);--> statement-breakpoint
-- Hồ sơ nguồn: có loại thì phải có id, và ngược lại. Một nửa tham chiếu là tham chiếu hỏng.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_source_pair"
  CHECK (num_nonnulls("source_type", "source_id") <> 1);
