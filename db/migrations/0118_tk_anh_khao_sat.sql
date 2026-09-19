/**
 * Ảnh và video hiện trạng đính kèm biên bản khảo sát (TK-02, CRM-03 phần "ảnh hiện trạng").
 *
 * Hồ sơ thật của NVG có 15–86 tấm ảnh và vài video hiện trạng cho MỖI công trình
 * (`doc/design/13-ho-so-thuc-te.md` 13.1), trong khi hệ thống mới có đường vào cho ảnh trích
 * lục. Ảnh là chứng cứ chính của khảo sát — nút chụp phải nằm ngay trên biên bản, không ẩn
 * sau menu (AFD 4.8).
 *
 * ## Vì sao KHÔNG qua Worker
 *
 * Đọc/ghi một bảng + một bucket, quyền diễn đạt được bằng RLS → trình duyệt gọi thẳng Supabase
 * (CLAUDE.md 3.1). Tệp nằm trong bucket RIÊNG `design-site-photos`, không chung với bucket
 * artifact: artifact là dữ liệu máy đọc do Worker giữ khoá service_role, còn ảnh hiện trạng là
 * hồ sơ do người dùng tải lên dưới phiên của chính họ.
 *
 * ## Quy ước đường dẫn tệp — chính là cơ chế phân quyền
 *
 *     <design_project_id>/<design_survey_id>/<uuid>.<đuôi>
 *
 * Policy trên `storage.objects` đọc thư mục đầu tiên làm mã dự án và hỏi
 * `rls_design_project_readable/writable` — cùng hai hàm mà mọi bảng con của TK đang dùng.
 * Đường dẫn không theo quy ước (thư mục đầu không phải UUID) thì `try_uuid` trả NULL và
 * policy từ chối: sai quy ước dẫn tới thấy ÍT đi, không phải thấy nhiều hơn.
 *
 * Bảng `design_survey_photos` mang cột hiện trường theo BSD 1.4: `client_created_at` (bấm lúc
 * nào), `client_generated_id` (khử trùng khi đồng bộ lại).
 */

CREATE TABLE "design_survey_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"design_project_id" uuid NOT NULL,
	"design_survey_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" bigint,
	"caption" text,
	"taken_at" timestamp with time zone,
	"client_created_at" timestamp with time zone,
	"client_generated_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "design_survey_photos_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "design_survey_photos_client_generated_id_unique" UNIQUE("client_generated_id")
);
--> statement-breakpoint
ALTER TABLE "design_survey_photos" ADD CONSTRAINT "design_survey_photos_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "design_survey_photos" ADD CONSTRAINT "design_survey_photos_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "design_survey_photos" ADD CONSTRAINT "design_survey_photos_design_survey_id_design_surveys_id_fk" FOREIGN KEY ("design_survey_id") REFERENCES "public"."design_surveys"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "design_survey_photos" ADD CONSTRAINT "design_survey_photos_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "design_survey_photos" ADD CONSTRAINT "design_survey_photos_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "design_survey_photos_survey_idx" ON "design_survey_photos" USING btree ("design_survey_id","created_at");
--> statement-breakpoint
CREATE INDEX "design_survey_photos_project_idx" ON "design_survey_photos" USING btree ("design_project_id");
--> statement-breakpoint
SELECT public.attach_audit_touch('public.design_survey_photos');
--> statement-breakpoint
ALTER TABLE public.design_survey_photos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY design_survey_photos_select ON public.design_survey_photos
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_design_project_readable(design_project_id));
--> statement-breakpoint
CREATE POLICY design_survey_photos_insert ON public.design_survey_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.rls_design_project_writable(design_project_id)
    -- Ảnh phải treo dưới một biên bản của ĐÚNG dự án đó, và tệp phải nằm đúng thư mục
    -- dự án — nếu không policy đọc tệp và policy đọc dòng nói hai điều khác nhau.
    AND EXISTS (
      SELECT 1 FROM public.design_surveys s
      WHERE s.id = design_survey_id AND s.design_project_id = design_survey_photos.design_project_id
    )
    AND split_part(storage_path, '/', 1) = design_project_id::text
  );
--> statement-breakpoint
-- Sửa chú thích hoặc xoá mềm. Không có policy DELETE: ảnh hiện trạng là chứng cứ, xoá là ẩn.
CREATE POLICY design_survey_photos_update ON public.design_survey_photos
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_design_project_writable(design_project_id))
  WITH CHECK (public.rls_design_project_writable(design_project_id));
--> statement-breakpoint
-- ── Bucket và policy tệp ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'design-site-photos',
  'design-site-photos',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.try_uuid(p_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.try_uuid(text) IS
  'Đổi chuỗi sang uuid, sai định dạng thì NULL thay vì lỗi — để policy trên storage.objects từ chối đường dẫn sai quy ước một cách im lặng và an toàn.';
--> statement-breakpoint
CREATE POLICY design_site_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'design-site-photos'
    AND public.rls_design_project_readable(public.try_uuid((storage.foldername(name))[1]))
  );
--> statement-breakpoint
CREATE POLICY design_site_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'design-site-photos'
    AND public.rls_design_project_writable(public.try_uuid((storage.foldername(name))[1]))
  );
