-- ============================================================================
-- Bảng phê duyệt DÙNG CHUNG cho mọi module + loại nghiệp vụ 'quote_price'
--
-- Xem giải thích vì sao dùng MỘT bảng chung thay vì price_approvals /
-- contract_approvals riêng ở đầu file db/src/schema/approvals.ts.
--
-- Lưu ý kỹ thuật: `ALTER TYPE ... ADD VALUE` chạy được trong giao dịch (Postgres 12+),
-- nhưng giá trị mới KHÔNG dùng được trong CÙNG giao dịch. Vì vậy mọi câu lệnh so sánh
-- hoặc ghi dữ liệu với 'quote_price' phải nằm ở migration sau, không nằm ở đây.
-- Thân hàm plpgsql thì được, vì chỉ diễn giải lúc chạy.
-- ============================================================================

ALTER TYPE "public"."approval_subject" ADD VALUE 'quote_price';--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_id" uuid NOT NULL,
	"step" integer DEFAULT 1 NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"note" text,
	"approver_limit_at_time" bigint,
	"approver_unlimited" boolean DEFAULT false NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"subject" "approval_subject" NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_code" varchar(40),
	"title" text NOT NULL,
	"amount" bigint,
	"reason" text,
	"current_step" integer DEFAULT 1 NOT NULL,
	"status" "status_group" DEFAULT 'pending_approval' NOT NULL,
	"final_decision" "approval_decision",
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_decisions_idx" ON "approval_decisions" USING btree ("approval_id","decided_at");--> statement-breakpoint
CREATE INDEX "approvals_pending_idx" ON "approvals" USING btree ("company_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "approvals_entity_idx" ON "approvals" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_one_pending_per_entity" ON "approvals" USING btree ("entity_type","entity_id") WHERE "approvals"."status" = 'pending_approval' AND "approvals"."deleted_at" IS NULL;