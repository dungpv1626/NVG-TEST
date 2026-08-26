CREATE TYPE "public"."asset_location_type" AS ENUM('kho', 'cong_trinh', 'khach_thue');--> statement-breakpoint
CREATE TYPE "public"."scaffolding_condition" AS ENUM('moi', 'con_dung_duoc', 'hong_cho_sua', 'cho_thanh_ly');--> statement-breakpoint
CREATE TYPE "public"."scaffolding_event_type" AS ENUM('sua_chua', 'mat_mat', 'thanh_ly');--> statement-breakpoint
CREATE TYPE "public"."stock_issue_reason" AS ENUM('cong_trinh', 'san_xuat', 'cho_thue', 'khac');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('nhap', 'xuat', 'dieu_chuyen', 'kiem_ke');--> statement-breakpoint
CREATE TYPE "public"."stocktake_status" AS ENUM('dang_kiem', 'cho_duyet', 'da_dieu_chinh', 'huy');--> statement-breakpoint
CREATE TYPE "public"."warehouse_type" AS ENUM('vat_tu_xay_dung', 'nguyen_lieu_xuong', 'gian_giao_thanh_pham', 'cong_cu_dung_cu', 'kho_cong_trinh');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity_on_hand" numeric(18, 3) DEFAULT '0' NOT NULL,
	"min_quantity" numeric(18, 3),
	"average_cost" bigint DEFAULT 0 NOT NULL,
	"last_movement_at" timestamp with time zone,
	"location" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"group_code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"specification" text,
	"unit" varchar(32) NOT NULL,
	"cost_group" "cost_group" DEFAULT 'vat_tu' NOT NULL,
	"is_scaffolding" boolean DEFAULT false NOT NULL,
	"barcode" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "materials_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "scaffolding_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_code" varchar(64) NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"condition" "scaffolding_condition" DEFAULT 'moi' NOT NULL,
	"location_type" "asset_location_type" DEFAULT 'kho' NOT NULL,
	"warehouse_id" uuid,
	"construction_site_id" uuid,
	"renter_name" varchar(255),
	"purchase_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scaffolding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"scaffolding_asset_id" uuid NOT NULL,
	"event_type" "scaffolding_event_type" NOT NULL,
	"event_date" date NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"result_condition" "scaffolding_condition",
	"amount" bigint DEFAULT 0 NOT NULL,
	"responsible_party" varchar(255),
	"reason" text NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_movement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_movement_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_cost" bigint DEFAULT 0 NOT NULL,
	"condition_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"movement_type" "stock_movement_type" NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"target_warehouse_id" uuid,
	"movement_date" date NOT NULL,
	"issue_reason" "stock_issue_reason",
	"construction_site_id" uuid,
	"delivery_id" uuid,
	"purchase_order_id" uuid,
	"client_generated_id" varchar(64),
	"performed_by" uuid,
	"counterpart_name" varchar(128),
	"stocktake_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stocktake_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stocktake_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"book_quantity" numeric(18, 3) NOT NULL,
	"counted_quantity" numeric(18, 3),
	"variance_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stocktakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40),
	"warehouse_id" uuid NOT NULL,
	"status" "stocktake_status" DEFAULT 'dang_kiem' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"counted_at" timestamp with time zone,
	"adjusted_at" timestamp with time zone,
	"performed_by" uuid,
	"variance_reason" text,
	"closed_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"warehouse_type" "warehouse_type" NOT NULL,
	"construction_site_id" uuid,
	"address" text,
	"manager_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_assets" ADD CONSTRAINT "scaffolding_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_assets" ADD CONSTRAINT "scaffolding_assets_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_assets" ADD CONSTRAINT "scaffolding_assets_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_assets" ADD CONSTRAINT "scaffolding_assets_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_assets" ADD CONSTRAINT "scaffolding_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_assets" ADD CONSTRAINT "scaffolding_assets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_events" ADD CONSTRAINT "scaffolding_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_events" ADD CONSTRAINT "scaffolding_events_scaffolding_asset_id_scaffolding_assets_id_fk" FOREIGN KEY ("scaffolding_asset_id") REFERENCES "public"."scaffolding_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_events" ADD CONSTRAINT "scaffolding_events_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_events" ADD CONSTRAINT "scaffolding_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scaffolding_events" ADD CONSTRAINT "scaffolding_events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_items" ADD CONSTRAINT "stock_movement_items_stock_movement_id_stock_movements_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_items" ADD CONSTRAINT "stock_movement_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_items" ADD CONSTRAINT "stock_movement_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_items" ADD CONSTRAINT "stock_movement_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_target_warehouse_id_warehouses_id_fk" FOREIGN KEY ("target_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_stocktake_id_stocktakes_id_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_warehouse_material" ON "inventory_items" USING btree ("warehouse_id","material_id");--> statement-breakpoint
CREATE INDEX "inventory_items_material_idx" ON "inventory_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "inventory_items_alert_idx" ON "inventory_items" USING btree ("company_id","last_movement_at");--> statement-breakpoint
CREATE INDEX "materials_group_idx" ON "materials" USING btree ("group_code","name");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_barcode" ON "materials" USING btree ("barcode") WHERE "materials"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "scaffolding_assets_company_idx" ON "scaffolding_assets" USING btree ("company_id","condition");--> statement-breakpoint
CREATE INDEX "scaffolding_assets_material_idx" ON "scaffolding_assets" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scaffolding_assets_code" ON "scaffolding_assets" USING btree ("asset_code") WHERE "scaffolding_assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scaffolding_events_idx" ON "scaffolding_events" USING btree ("scaffolding_asset_id","event_date");--> statement-breakpoint
CREATE INDEX "stock_movement_items_idx" ON "stock_movement_items" USING btree ("stock_movement_id");--> statement-breakpoint
CREATE INDEX "stock_movement_items_material_idx" ON "stock_movement_items" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "stock_movements_warehouse_idx" ON "stock_movements" USING btree ("warehouse_id","movement_date");--> statement-breakpoint
CREATE INDEX "stock_movements_type_idx" ON "stock_movements" USING btree ("company_id","movement_type","movement_date");--> statement-breakpoint
CREATE INDEX "stock_movements_site_idx" ON "stock_movements" USING btree ("construction_site_id");--> statement-breakpoint
CREATE INDEX "stock_movements_delivery_idx" ON "stock_movements" USING btree ("delivery_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_code" ON "stock_movements" USING btree ("code") WHERE "stock_movements"."code" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_client_id" ON "stock_movements" USING btree ("client_generated_id") WHERE "stock_movements"."client_generated_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stocktake_items_unique" ON "stocktake_items" USING btree ("stocktake_id","material_id");--> statement-breakpoint
CREATE INDEX "stocktake_items_idx" ON "stocktake_items" USING btree ("stocktake_id");--> statement-breakpoint
CREATE INDEX "stocktakes_warehouse_idx" ON "stocktakes" USING btree ("warehouse_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stocktakes_code" ON "stocktakes" USING btree ("code") WHERE "stocktakes"."code" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stocktakes_one_open_per_warehouse" ON "stocktakes" USING btree ("warehouse_id") WHERE "stocktakes"."status" IN ('dang_kiem', 'cho_duyet') AND "stocktakes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "warehouses_company_idx" ON "warehouses" USING btree ("company_id","warehouse_type");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_code" ON "warehouses" USING btree ("code") WHERE "warehouses"."deleted_at" IS NULL;--> statement-breakpoint
-- ============================================================================
-- Ràng buộc viết tay — drizzle-kit không sinh được CHECK và khoá ngoại vòng
-- ============================================================================

-- Tồn kho không âm. Đây là ràng buộc quan trọng nhất của module: một dòng tồn âm nghĩa là
-- đã xuất thứ không có trong kho, và mọi báo cáo phía sau đều sai theo.
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_quantity_not_negative"
  CHECK ("quantity_on_hand" >= 0);--> statement-breakpoint

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_min_quantity_not_negative"
  CHECK ("min_quantity" IS NULL OR "min_quantity" >= 0);--> statement-breakpoint

-- Số lượng trên phiếu LUÔN DƯƠNG; chiều tăng/giảm do loại phiếu quyết định. Cho số âm thì
-- một phiếu xuất mang số âm sẽ lặng lẽ thành phiếu nhập mà không ai đọc bảng thấy.
ALTER TABLE "stock_movement_items" ADD CONSTRAINT "stock_movement_items_quantity_positive"
  CHECK ("quantity" > 0);--> statement-breakpoint

ALTER TABLE "stocktake_items" ADD CONSTRAINT "stocktake_items_quantities_not_negative"
  CHECK ("book_quantity" >= 0 AND ("counted_quantity" IS NULL OR "counted_quantity" >= 0));--> statement-breakpoint

ALTER TABLE "scaffolding_assets" ADD CONSTRAINT "scaffolding_assets_quantity_not_negative"
  CHECK ("quantity" >= 0);--> statement-breakpoint

ALTER TABLE "scaffolding_events" ADD CONSTRAINT "scaffolding_events_quantity_positive"
  CHECK ("quantity" > 0);--> statement-breakpoint

-- Điều chuyển phải có kho nhận, và kho nhận phải KHÁC kho xuất; ba loại phiếu còn lại thì
-- không được có kho nhận. Thiếu ràng buộc này thì một phiếu điều chuyển về chính nó sẽ chạy
-- qua trót lọt và không đổi gì, nhưng vẫn nằm trong sổ như một lần giao dịch có thật.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transfer_target" CHECK (
  ("movement_type" = 'dieu_chuyen' AND "target_warehouse_id" IS NOT NULL
   AND "target_warehouse_id" <> "warehouse_id")
  OR ("movement_type" <> 'dieu_chuyen' AND "target_warehouse_id" IS NULL)
);--> statement-breakpoint

-- Lý do xuất chỉ có nghĩa với phiếu xuất (KHO-04).
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_issue_reason" CHECK (
  "issue_reason" IS NULL OR "movement_type" = 'xuat'
);--> statement-breakpoint

-- Kho tại công trình phải trỏ về một công trình; bốn loại kho còn lại thì không.
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_site_link" CHECK (
  ("warehouse_type" = 'kho_cong_trinh' AND "construction_site_id" IS NOT NULL)
  OR ("warehouse_type" <> 'kho_cong_trinh')
);--> statement-breakpoint

-- Khoá ngoại vòng: `stock_movements.stocktake_id` → `stocktakes`, mà `stocktakes` sinh ra
-- phiếu điều chỉnh nên hai bảng tham chiếu nhau. Khai ở tầng Drizzle sẽ tạo vòng import,
-- nên thêm ở đây — cùng cách `project_budgets.construction_site_id` đã làm.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stocktake_id_fk"
  FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktakes"("id") ON DELETE set null;
