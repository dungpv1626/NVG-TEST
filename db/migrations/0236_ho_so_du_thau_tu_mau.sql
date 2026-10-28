-- 0236 — Bộ biểu mẫu hồ sơ dự thầu tự điền (phần còn lại của câu 19, anh Dũng 27/10/2026: «làm luôn»).
--
-- Bộ dự thảo NVC-DT-01 của NVG chuyển thành HAI mẫu (db/seed-assets/bid-templates/convert_bid.py):
--   · ho_so_du_thau — danh mục kiểm tra + Mẫu 01 → 10, lập trước khi nộp thầu;
--   · thuong_thao   — Mẫu 11 Biên bản thương thảo hợp đồng, lập sau khi trúng thầu.
--
-- 1. Mẫu nằm ở `contract_templates` (thêm hai `document_kind`), KHÔNG mở bảng mẫu thứ hai: cùng một chỗ quản lý mẫu
--    (màn hình Mẫu hợp đồng — Ban Giám đốc / Quản trị tải lên, ngừng dùng), cùng trigger giữ tệp + chỗ trống bất biến,
--    cùng kho `contract-templates`, cùng đường nạp của seed. Quyền ĐỌC mẫu hợp đồng đang theo phân hệ HD; mẫu hồ sơ
--    dự thầu thêm nhánh theo phân hệ DA — Đấu thầu đọc được kể cả khi về sau mất quyền xem HD, còn Thi công (không HD,
--    không DA) vẫn không thấy mẫu nào.
-- 2. `bid_form_documents`: văn bản đã điền, BẤT BIẾN, đánh số bản theo (gói thầu, loại); bản sau phải ghi lý do
--    (NEN-05). Lưu `filled_values` + `missing_fields`. Tệp ở kho riêng `bid-documents/<gói thầu>/…`.
--    - Hồ sơ dự thầu: chỉ lập khi gói thầu CHƯA nộp (đã nộp thì bộ trên hệ thống phải là bộ đã gửi — DA-08).
--    - Biên bản thương thảo: chỉ lập khi gói thầu đã TRÚNG thầu.
-- 3. `bid_form_inputs`: ô người lập đang điền, lưu dần theo (gói thầu, loại) — tải lại trang không mất (CLAUDE.md 5.4).
-- 4. `bid_form_experience`: hợp đồng đã ký / đã quyết toán của pháp nhân cho Mẫu 06 (kèm ngày khởi công – hoàn thành,
--    có bản đã ký / biên bản thanh lý chưa). SECURITY DEFINER như `bid_experience_candidates` (0208) — Đấu thầu không
--    xem hết hợp đồng của pháp nhân; hàm chỉ trả cột không nhạy cảm.
--
-- KHÔNG đụng `stage_readiness`, `submit_bid`, `rls_bidding_project_writable`. Chạy lại được.

-- 1. Mẫu ------------------------------------------------------------------------------------------

ALTER TABLE public.contract_templates DROP CONSTRAINT IF EXISTS contract_templates_document_kind_check;
ALTER TABLE public.contract_templates
  ADD CONSTRAINT contract_templates_document_kind_check
  CHECK (document_kind IN ('hop_dong', 'phu_luc', 'thanh_ly', 'ho_so_du_thau', 'thuong_thao'));

COMMENT ON COLUMN public.contract_templates.document_kind IS
  'hop_dong: mẫu hợp đồng chính · phu_luc: phụ lục hợp đồng · thanh_ly: biên bản thanh lý (0229) · '
  'ho_so_du_thau: bộ biểu mẫu hồ sơ dự thầu · thuong_thao: biên bản thương thảo hợp đồng sau trúng thầu (0236).';

CREATE OR REPLACE FUNCTION public.is_bid_form_kind(p_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_kind IN ('ho_so_du_thau', 'thuong_thao');
$$;

DROP POLICY IF EXISTS contract_templates_select ON public.contract_templates;
CREATE POLICY contract_templates_select ON public.contract_templates
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('HD')
      OR (public.is_bid_form_kind(document_kind) AND public.auth_can_view_module('DA'))
    )
  );

-- Tệp mẫu hồ sơ dự thầu: đọc theo dòng mẫu (đường dẫn tệp chỉ mang pháp nhân, không mang loại mẫu).
DROP POLICY IF EXISTS bid_form_templates_files_select ON storage.objects;
CREATE POLICY bid_form_templates_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contract-templates'
    AND public.auth_can_view_module('DA')
    AND EXISTS (
      SELECT 1 FROM public.contract_templates t
       WHERE t.storage_path = storage.objects.name
         AND public.is_bid_form_kind(t.document_kind)
         AND public.rls_company_access(t.company_id)
    )
  );

-- 2. Ai lập được văn bản của gói thầu -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_bid_form_writable(p_project_id uuid, p_kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bidding_projects p
     WHERE p.id = p_project_id
       AND p.deleted_at IS NULL
       AND public.rls_company_access(p.company_id)
       AND public.auth_can_edit_module('DA')
       AND NOT public.auth_is_read_only()
       AND CASE p_kind
             -- Đã nộp thì bộ hồ sơ trên hệ thống phải là bộ đã gửi chủ đầu tư (DA-08).
             WHEN 'ho_so_du_thau' THEN p.submitted_at IS NULL
                  AND p.stage NOT IN ('nop_thau', 'trung_thau', 'truot_thau')
             WHEN 'thuong_thao' THEN p.stage = 'trung_thau'
             ELSE false
           END
  );
$$;

COMMENT ON FUNCTION public.rls_bid_form_writable(uuid, text) IS
  'Lập / lưu nháp văn bản từ mẫu của gói thầu: quyền sửa DA, đúng pháp nhân; hồ sơ dự thầu khi chưa nộp, biên bản '
  'thương thảo khi đã trúng thầu (0236).';

REVOKE ALL ON FUNCTION public.rls_bid_form_writable(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_bid_form_writable(uuid, text) TO authenticated;

-- 3. Văn bản đã điền -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bid_form_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  bidding_project_id uuid NOT NULL REFERENCES public.bidding_projects (id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('ho_so_du_thau', 'thuong_thao')),
  template_id        uuid REFERENCES public.contract_templates (id) ON DELETE SET NULL,
  version            integer NOT NULL,
  storage_path       text NOT NULL,
  file_name          text NOT NULL,
  filled_values      jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields     text[] NOT NULL DEFAULT '{}',
  change_reason      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT bid_form_documents_path CHECK (storage_path LIKE bidding_project_id::text || '/%'),
  CONSTRAINT bid_form_documents_version_unique UNIQUE (bidding_project_id, kind, version)
);

CREATE INDEX IF NOT EXISTS bid_form_documents_project_idx
  ON public.bid_form_documents (bidding_project_id, kind, created_at DESC);

COMMENT ON TABLE public.bid_form_documents IS
  'Hồ sơ dự thầu / biên bản thương thảo đã điền từ mẫu — bất biến, đánh số bản (0236).';

CREATE OR REPLACE FUNCTION public.bid_form_documents_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
BEGIN
  SELECT p.company_id, p.stage, p.submitted_at INTO v_project
    FROM public.bidding_projects p
   WHERE p.id = NEW.bidding_project_id AND p.deleted_at IS NULL
     FOR UPDATE;  -- hai người lưu cùng lúc xếp hàng để số bản không trùng
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy gói thầu.';
  END IF;

  IF NEW.kind = 'ho_so_du_thau'
     AND (v_project.submitted_at IS NOT NULL OR v_project.stage IN ('nop_thau', 'trung_thau', 'truot_thau')) THEN
    RAISE EXCEPTION 'Gói thầu đã nộp — hồ sơ dự thầu giữ đúng bộ đã nộp, không lập bản mới.';
  END IF;
  IF NEW.kind = 'thuong_thao' AND v_project.stage <> 'trung_thau' THEN
    RAISE EXCEPTION 'Biên bản thương thảo chỉ lập khi gói thầu đã trúng thầu.';
  END IF;

  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_templates t
     WHERE t.id = NEW.template_id AND t.company_id = v_project.company_id AND t.document_kind = NEW.kind
  ) THEN
    RAISE EXCEPTION 'Mẫu đã chọn không phải mẫu % của pháp nhân này.',
      CASE NEW.kind WHEN 'ho_so_du_thau' THEN 'hồ sơ dự thầu' ELSE 'biên bản thương thảo' END;
  END IF;

  NEW.company_id := v_project.company_id;
  NEW.created_by := public.auth_user_id();
  NEW.created_at := now();
  SELECT coalesce(max(d.version), 0) + 1 INTO NEW.version
    FROM public.bid_form_documents d
   WHERE d.bidding_project_id = NEW.bidding_project_id AND d.kind = NEW.kind;
  IF NEW.version > 1 AND NULLIF(btrim(coalesce(NEW.change_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân lập lại văn bản (đã có bản %).', NEW.version - 1;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'bid-documents' AND o.name = NEW.storage_path
  ) THEN
    RAISE EXCEPTION 'Chưa thấy tệp văn bản đã tải lên — thử lưu lại.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bid_form_documents_before_insert ON public.bid_form_documents;
CREATE TRIGGER bid_form_documents_before_insert
  BEFORE INSERT ON public.bid_form_documents
  FOR EACH ROW EXECUTE FUNCTION public.bid_form_documents_before_insert();

ALTER TABLE public.bid_form_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_form_documents FROM anon;

DROP POLICY IF EXISTS bid_form_documents_select ON public.bid_form_documents;
CREATE POLICY bid_form_documents_select ON public.bid_form_documents
  FOR SELECT TO authenticated
  USING (public.rls_bidding_project_readable(bidding_project_id));

DROP POLICY IF EXISTS bid_form_documents_insert ON public.bid_form_documents;
CREATE POLICY bid_form_documents_insert ON public.bid_form_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_bid_form_writable(bidding_project_id, kind));

-- Không có UPDATE / DELETE: văn bản đã lưu là căn cứ truy vết.
GRANT SELECT, INSERT ON public.bid_form_documents TO authenticated;

-- 4. Ô đang điền (nháp) -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bid_form_inputs (
  bidding_project_id uuid NOT NULL REFERENCES public.bidding_projects (id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('ho_so_du_thau', 'thuong_thao')),
  company_id         uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  "values"           jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES public.users (id) ON DELETE SET NULL,
  PRIMARY KEY (bidding_project_id, kind)
);

COMMENT ON TABLE public.bid_form_inputs IS
  'Ô người lập đang điền cho văn bản từ mẫu của gói thầu — lưu dần, mở lại soạn tiếp (0236).';

CREATE OR REPLACE FUNCTION public.bid_form_inputs_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.company_id INTO NEW.company_id
    FROM public.bidding_projects p WHERE p.id = NEW.bidding_project_id;
  NEW.updated_at := now();
  NEW.updated_by := public.auth_user_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bid_form_inputs_before_write ON public.bid_form_inputs;
CREATE TRIGGER bid_form_inputs_before_write
  BEFORE INSERT OR UPDATE ON public.bid_form_inputs
  FOR EACH ROW EXECUTE FUNCTION public.bid_form_inputs_before_write();

ALTER TABLE public.bid_form_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bid_form_inputs FROM anon;

DROP POLICY IF EXISTS bid_form_inputs_select ON public.bid_form_inputs;
CREATE POLICY bid_form_inputs_select ON public.bid_form_inputs
  FOR SELECT TO authenticated
  USING (public.rls_bidding_project_readable(bidding_project_id));

DROP POLICY IF EXISTS bid_form_inputs_insert ON public.bid_form_inputs;
CREATE POLICY bid_form_inputs_insert ON public.bid_form_inputs
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_bid_form_writable(bidding_project_id, kind));

DROP POLICY IF EXISTS bid_form_inputs_update ON public.bid_form_inputs;
CREATE POLICY bid_form_inputs_update ON public.bid_form_inputs
  FOR UPDATE TO authenticated
  USING (public.rls_bid_form_writable(bidding_project_id, kind))
  WITH CHECK (public.rls_bid_form_writable(bidding_project_id, kind));

GRANT SELECT, INSERT, UPDATE ON public.bid_form_inputs TO authenticated;

-- 5. Kho tệp -------------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bid-documents', 'bid-documents', false, 10485760,
        ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS bid_documents_files_select ON storage.objects;
CREATE POLICY bid_documents_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bid-documents'
    AND public.rls_bidding_project_readable(public.try_uuid((storage.foldername(name))[1]))
  );

-- Tên tệp mang loại văn bản (`ho-so-du-thau-*` / `thuong-thao-*`) — quyền tải lên theo đúng loại ấy.
DROP POLICY IF EXISTS bid_documents_files_insert ON storage.objects;
CREATE POLICY bid_documents_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bid-documents'
    AND (
      (storage.filename(name) LIKE 'ho-so-du-thau-%'
       AND public.rls_bid_form_writable(public.try_uuid((storage.foldername(name))[1]), 'ho_so_du_thau'))
      OR (storage.filename(name) LIKE 'thuong-thao-%'
       AND public.rls_bid_form_writable(public.try_uuid((storage.foldername(name))[1]), 'thuong_thao'))
    )
  );
-- Không có policy xoá / sửa tệp: văn bản đã lưu là căn cứ truy vết.

-- 6. Hợp đồng tương tự cho Mẫu 06 ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bid_form_experience(p_company_id uuid)
RETURNS TABLE (
  contract_id uuid,
  code text,
  contract_number text,
  title text,
  customer_name text,
  value bigint,
  start_date date,
  end_date date,
  signed_date date,
  location text,
  has_signed_scan boolean,
  has_liquidation boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.code::text, c.contract_number::text, c.title::text, COALESCE(cu.name, c.partner_name)::text,
         c.value, c.start_date, c.end_date, COALESCE(c.signed_date, c.signed_at::date), c.project_location::text,
         c.signed_scan_path IS NOT NULL,
         EXISTS (SELECT 1 FROM public.contract_annex_documents a
                  WHERE a.contract_id = c.id AND a.kind = 'thanh_ly')
    FROM public.contracts c
    LEFT JOIN public.customers cu ON cu.id = c.customer_id
   WHERE public.auth_can_view_module('DA') AND public.rls_company_access(p_company_id)
     AND c.company_id = p_company_id AND c.deleted_at IS NULL
     AND c.stage IN ('da_ky', 'hoan_thanh')
     -- Hợp đồng NVG NHẬN việc thi công / thiết kế — mua bán, cho thuê, giao thầu phụ không phải «hợp đồng tương tự».
     AND c.type IN ('thi_cong', 'thiet_ke')
   ORDER BY COALESCE(c.end_date, c.signed_date, c.signed_at::date) DESC NULLS LAST, c.title;
$$;

REVOKE ALL ON FUNCTION public.bid_form_experience(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bid_form_experience(uuid) TO authenticated;

COMMENT ON FUNCTION public.bid_form_experience(uuid) IS
  'Hợp đồng đã ký / đã quyết toán (NVG nhận việc thi công, thiết kế) cho bảng kê hợp đồng tương tự — không trả '
  'điều khoản, giá vốn (0236).';
