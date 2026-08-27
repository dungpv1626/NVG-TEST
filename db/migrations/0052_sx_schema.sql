CREATE TYPE "public"."production_order_status" AS ENUM('nhap', 'dang_san_xuat', 'hoan_thanh', 'huy');--> statement-breakpoint
CREATE TYPE "public"."rental_agreement_status" AS ENUM('dang_thue', 'da_thu_hoi', 'huy');--> statement-breakpoint
CREATE TABLE "material_consumption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"product" text NOT NULL,
	"unit" text,
	"quantity" numeric(18, 3) NOT NULL,
	"status" "production_order_status" DEFAULT 'nhap' NOT NULL,
	"planned_start_date" date,
	"planned_end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "production_orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rental_agreement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_agreement_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity_out" numeric(18, 3) NOT NULL,
	"daily_rate" bigint DEFAULT 0 NOT NULL,
	"quantity_returned_ok" numeric(18, 3) DEFAULT '0' NOT NULL,
	"quantity_damaged" numeric(18, 3) DEFAULT '0' NOT NULL,
	"quantity_lost" numeric(18, 3) DEFAULT '0' NOT NULL,
	"compensation_amount" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "rental_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"customer_id" uuid NOT NULL,
	"construction_site_id" uuid,
	"site_address" text,
	"start_date" date NOT NULL,
	"expected_end_date" date,
	"actual_return_date" date,
	"status" "rental_agreement_status" DEFAULT 'dang_thue' NOT NULL,
	"deposit_amount" bigint DEFAULT 0 NOT NULL,
	"total_revenue" bigint,
	"total_compensation" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "rental_agreements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "scaffolding_assets" ADD COLUMN "current_rental_agreement_id" uuid;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement_items" ADD CONSTRAINT "rental_agreement_items_rental_agreement_id_rental_agreements_id_fk" FOREIGN KEY ("rental_agreement_id") REFERENCES "public"."rental_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement_items" ADD CONSTRAINT "rental_agreement_items_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement_items" ADD CONSTRAINT "rental_agreement_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement_items" ADD CONSTRAINT "rental_agreement_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_construction_site_id_construction_sites_id_fk" FOREIGN KEY ("construction_site_id") REFERENCES "public"."construction_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_consumption_order_idx" ON "material_consumption" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "production_orders_company_idx" ON "production_orders" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "rental_agreement_items_agreement_idx" ON "rental_agreement_items" USING btree ("rental_agreement_id");--> statement-breakpoint
CREATE INDEX "rental_agreements_company_idx" ON "rental_agreements" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "rental_agreements_customer_idx" ON "rental_agreements" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "scaffolding_assets_rental_idx" ON "scaffolding_assets" USING btree ("current_rental_agreement_id");