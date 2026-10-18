-- ============================================================================
-- 0180 — Đính kèm của biên bản khảo sát Kinh doanh (Đợt 1, bổ sung 1D — chủ dự án 18/10/2026)
--
--   site_survey_attachments — ảnh / video hiện trạng, ảnh phiếu khảo sát giấy đã điền tay,
--                             tài liệu khách gửi (PDF, Word, Excel, bản vẽ). Tệp ở kho riêng
--                             `survey-files`, thư mục đầu = id biên bản (giống `survey-audio`).
--
-- Quyền dùng lại đúng hai hàm của 0175: đọc = `rls_survey_readable` (cần xem được CRM — ảnh nhà
-- khách là dữ liệu khách hàng, Thi công cùng pháp nhân không xem), ghi / xoá = `rls_survey_writable`
-- (người phụ trách cơ hội / lãnh đạo, báo cáo còn Nháp hoặc bị trả về). Báo cáo đã gửi duyệt thì
-- đính kèm khoá cùng biên bản: Ban Giám đốc duyệt đúng bộ ảnh đang thấy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.site_survey_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id     uuid NOT NULL REFERENCES public.site_surveys(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  storage_path  text NOT NULL,
  -- anh: ảnh hiện trạng · video · phieu: ảnh / bản quét phiếu khảo sát giấy · tai_lieu: tệp khác
  kind          varchar(16) NOT NULL CHECK (kind IN ('anh', 'video', 'phieu', 'tai_lieu')),
  file_name     varchar(255) NOT NULL,
  mime_type     varchar(128) NOT NULL,
  size_bytes    bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  caption       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT site_survey_attachments_path CHECK (storage_path LIKE survey_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS site_survey_attachments_survey_idx
  ON public.site_survey_attachments (survey_id, created_at);

COMMENT ON TABLE public.site_survey_attachments IS
  'Ảnh / video hiện trạng, ảnh phiếu giấy, tài liệu đính kèm biên bản khảo sát Kinh doanh (0180). Tệp ở kho survey-files/{survey_id}/….';

CREATE OR REPLACE FUNCTION public.site_survey_attachments_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT o.company_id INTO NEW.company_id
    FROM public.site_surveys s JOIN public.opportunities o ON o.id = s.opportunity_id
    WHERE s.id = NEW.survey_id;
    NEW.created_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
    RETURN NEW;
  END IF;
  -- Sửa: chỉ chú thích và loại (ví dụ đổi «ảnh» thành «phiếu giấy»); tệp không đổi được.
  NEW.survey_id := OLD.survey_id;
  NEW.company_id := OLD.company_id;
  NEW.storage_path := OLD.storage_path;
  NEW.file_name := OLD.file_name;
  NEW.mime_type := OLD.mime_type;
  NEW.size_bytes := OLD.size_bytes;
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_survey_attachments_before_write ON public.site_survey_attachments;
CREATE TRIGGER site_survey_attachments_before_write
  BEFORE INSERT OR UPDATE ON public.site_survey_attachments
  FOR EACH ROW EXECUTE FUNCTION public.site_survey_attachments_before_write();

ALTER TABLE public.site_survey_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_survey_attachments FROM anon;

DROP POLICY IF EXISTS site_survey_attachments_select ON public.site_survey_attachments;
CREATE POLICY site_survey_attachments_select ON public.site_survey_attachments
  FOR SELECT TO authenticated
  USING (public.rls_survey_readable(survey_id));

DROP POLICY IF EXISTS site_survey_attachments_insert ON public.site_survey_attachments;
CREATE POLICY site_survey_attachments_insert ON public.site_survey_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_survey_writable(survey_id));

DROP POLICY IF EXISTS site_survey_attachments_update ON public.site_survey_attachments;
CREATE POLICY site_survey_attachments_update ON public.site_survey_attachments
  FOR UPDATE TO authenticated
  USING (public.rls_survey_writable(survey_id))
  WITH CHECK (public.rls_survey_writable(survey_id));

DROP POLICY IF EXISTS site_survey_attachments_delete ON public.site_survey_attachments;
CREATE POLICY site_survey_attachments_delete ON public.site_survey_attachments
  FOR DELETE TO authenticated
  USING (public.rls_survey_writable(survey_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_survey_attachments TO authenticated;

-- Kho tệp: riêng tư, 50 MB một tệp. Danh sách loại tệp khớp `SURVEY_ATTACHMENT_ACCEPT` ở web.
-- Bản vẽ DWG: trình duyệt hay để trống loại tệp, giao diện tự gán `image/vnd.dwg` theo đuôi.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('survey-files', 'survey-files', false, 52428800,
        ARRAY[
          'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
          'video/mp4', 'video/quicktime',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/vnd.dwg', 'image/vnd.dxf'
        ])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS survey_files_select ON storage.objects;
CREATE POLICY survey_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'survey-files'
         AND public.rls_survey_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS survey_files_insert ON storage.objects;
CREATE POLICY survey_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'survey-files'
              AND public.rls_survey_writable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS survey_files_delete ON storage.objects;
CREATE POLICY survey_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'survey-files'
         AND public.rls_survey_writable(public.try_uuid((storage.foldername(name))[1])));
