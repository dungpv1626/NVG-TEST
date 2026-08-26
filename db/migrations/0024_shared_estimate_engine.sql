ALTER TABLE "boq_items" ALTER COLUMN "bidding_project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "estimates" ALTER COLUMN "bidding_project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "boq_items" ADD COLUMN "design_project_id" uuid;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "design_project_id" uuid;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boq_items_design_project_idx" ON "boq_items" USING btree ("design_project_id","position");--> statement-breakpoint
CREATE INDEX "estimates_design_project_idx" ON "estimates" USING btree ("design_project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "estimates_one_current_per_design_project" ON "estimates" USING btree ("design_project_id") WHERE "estimates"."is_current_version" AND "estimates"."deleted_at" IS NULL;--> statement-breakpoint
-- Đúng MỘT hồ sơ cha, không được cả hai và không được rỗng cả hai (TK-07).
-- Không có ràng buộc này thì một dòng khối lượng có thể vừa thuộc gói thầu vừa thuộc dự án
-- thiết kế, và tổng dự toán của cả hai bên đều sai mà không ai thấy.
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_one_parent"
  CHECK (num_nonnulls("bidding_project_id", "design_project_id") = 1);--> statement-breakpoint
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_one_parent"
  CHECK (num_nonnulls("bidding_project_id", "design_project_id") = 1);
