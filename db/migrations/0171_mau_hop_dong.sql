-- ============================================================================
-- GĐ4 đợt cải tiến UX — mẫu hợp đồng Word tự điền (vấn đề 5 của chủ dự án).
--
-- Người soạn mẫu tải tệp `.docx` có chỗ trống lên; người chịu trách nhiệm hợp đồng điền từ hồ sơ
-- ngay trên trình duyệt, xem trước, tải về và lưu thành một phiên bản văn bản của hợp đồng. Điền
-- chạy ở trình duyệt nên dữ liệu hợp đồng (hạng 1) không đi qua dịch vụ nào khác.
--
--   1. Cột còn thiếu mà mẫu nào cũng cần: hình thức giá (Luật Xây dựng 2025 Điều 82 khoản 2),
--      thuế suất GTGT, địa điểm thực hiện; tài khoản ngân hàng + chức vụ người đại diện của pháp
--      nhân; người đại diện + chức vụ của khách hàng. KHÔNG thêm CCCD của khách cá nhân — dữ liệu
--      cá nhân, chờ chủ dự án quyết; mẫu để trống điền tay.
--   2. `contract_templates` — mẫu theo pháp nhân × loại hợp đồng × (tuỳ) hình thức giá. Không
--      xoá; thay mẫu = tải bản mới, bản cũ «ngừng dùng». Ai quản lý: người có quyền PHÊ DUYỆT
--      Module HD (Ban Giám đốc) hoặc Quản trị hệ thống — mặc định chờ chủ dự án xác nhận.
--   3. `contract_documents` — văn bản đã điền, đánh số phiên bản, BẤT BIẾN (không có policy sửa /
--      xoá). Lưu kèm giá trị đã điền (`filled_values`): đổi hồ sơ sau này không làm văn bản cũ nói
--      khác đi (CLAUDE.md 5.2 — chứng từ lưu giá trị đã áp dụng). Hợp đồng đã ký thì khoá, không
--      lập thêm bản điền mới.
--   4. Hai bucket riêng tư: `contract-templates` (`<pháp nhân>/<uuid>.docx`) và
--      `contract-documents` (`<hợp đồng>/<uuid>.docx`); quyền tệp đi theo thư mục đầu, cùng hàm
--      với bảng (mẫu 0135).
--
-- Không dùng `documents` / `document_versions`: hai bảng đó theo Mẫu A (cả pháp nhân xem được),
-- trong khi Thi công KHÔNG xem Module Hợp đồng (chủ dự án giữ nguyên, 0165) — văn bản hợp đồng
-- phải theo đúng quyền của hợp đồng.
-- ============================================================================

-- 1. Cột còn thiếu ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contract_price_form') THEN
    CREATE TYPE public.contract_price_form AS ENUM (
      'tron_goi', 'don_gia_co_dinh', 'don_gia_dieu_chinh', 'theo_thoi_gian', 'chi_phi_cong_phi',
      'theo_ket_qua_dau_ra', 'theo_ty_le_phan_tram', 'hon_hop', 'khac'
    );
  END IF;
END $$;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS price_form public.contract_price_form,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5, 2),
  ADD COLUMN IF NOT EXISTS project_location text;

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_vat_rate_range;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_vat_rate_range
  CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100));

COMMENT ON COLUMN public.contracts.price_form IS
  'Hình thức giá (Luật Xây dựng 2025 Điều 82 khoản 2; Nghị định 210/2026 Điều 6). Rỗng = chưa khai.';
COMMENT ON COLUMN public.contracts.vat_rate IS
  'Thuế suất GTGT (%) mà `value` ĐÃ GỒM. Rỗng = chưa khai — văn bản không tự tách thuế.';
COMMENT ON COLUMN public.contracts.project_location IS 'Địa điểm thực hiện, in lên văn bản hợp đồng.';

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS representative_title varchar(128),
  ADD COLUMN IF NOT EXISTS bank_account_number varchar(32),
  ADD COLUMN IF NOT EXISTS bank_name text;

COMMENT ON COLUMN public.companies.bank_account_number IS
  'Tài khoản ngân hàng CỦA PHÁP NHÂN, in lên hợp đồng. Không phải tài khoản cá nhân (CLAUDE.md 5.2).';

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS representative_name varchar(128),
  ADD COLUMN IF NOT EXISTS representative_title varchar(128);

COMMENT ON COLUMN public.customers.representative_name IS
  'Người đại diện KÝ hợp đồng (doanh nghiệp) — khác người liên hệ.';


-- 2. Ai quản lý mẫu --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_can_manage_contract_templates(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_company_id IS NOT NULL
     AND public.rls_company_access(p_company_id)
     AND NOT public.auth_is_read_only()
     AND (public.auth_can_approve_module('HD') OR public.auth_has_role('ADMIN'));
$$;

COMMENT ON FUNCTION public.auth_can_manage_contract_templates(uuid) IS
  'Tải lên / ngừng dùng mẫu hợp đồng của một pháp nhân: người có quyền phê duyệt HD hoặc Quản trị (0171).';


-- 3. Mẫu hợp đồng ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  title text NOT NULL,
  contract_type public.contract_type NOT NULL,
  -- Rỗng = dùng cho mọi hình thức giá của loại hợp đồng này.
  price_form public.contract_price_form,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  -- Chỗ trống đọc được lúc tải lên — để liệt kê ô thiếu mà không phải mở lại tệp.
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT contract_templates_path_in_company
    CHECK (left(storage_path, 37) = company_id::text || '/')
);

CREATE INDEX IF NOT EXISTS contract_templates_lookup_idx
  ON public.contract_templates (company_id, contract_type, is_active);

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_templates_select ON public.contract_templates;
CREATE POLICY contract_templates_select ON public.contract_templates
  FOR SELECT TO authenticated
  USING (public.rls_company_access(company_id) AND public.auth_can_view_module('HD'));

DROP POLICY IF EXISTS contract_templates_insert ON public.contract_templates;
CREATE POLICY contract_templates_insert ON public.contract_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_manage_contract_templates(company_id));

DROP POLICY IF EXISTS contract_templates_update ON public.contract_templates;
CREATE POLICY contract_templates_update ON public.contract_templates
  FOR UPDATE TO authenticated
  USING (public.auth_can_manage_contract_templates(company_id))
  WITH CHECK (public.auth_can_manage_contract_templates(company_id));

-- Sửa mẫu chỉ là đổi tên / ghi chú / ngừng dùng — tệp và chỗ trống của một mẫu không đổi được,
-- nếu không văn bản đã điền từ mẫu đó mất đường truy về đúng tệp đã dùng.
CREATE OR REPLACE FUNCTION public.contract_templates_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := public.auth_user_id();
    NEW.updated_by := NEW.created_by;
    RETURN NEW;
  END IF;
  IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.tags IS DISTINCT FROM OLD.tags
     OR NEW.file_name IS DISTINCT FROM OLD.file_name THEN
    RAISE EXCEPTION 'Không sửa được tệp của một mẫu đã tải lên. Tải mẫu mới rồi ngừng dùng mẫu cũ.';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := public.auth_user_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_templates_guard ON public.contract_templates;
CREATE TRIGGER contract_templates_guard
  BEFORE INSERT OR UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.contract_templates_guard();


-- 4. Văn bản hợp đồng đã điền ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.contract_templates(id) ON DELETE SET NULL,
  version integer NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  filled_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields text[] NOT NULL DEFAULT '{}',
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT contract_documents_version_unique UNIQUE (contract_id, version),
  CONSTRAINT contract_documents_path_in_contract
    CHECK (left(storage_path, 37) = contract_id::text || '/')
);

CREATE INDEX IF NOT EXISTS contract_documents_contract_idx
  ON public.contract_documents (contract_id, version DESC);

ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_documents_select ON public.contract_documents;
CREATE POLICY contract_documents_select ON public.contract_documents
  FOR SELECT TO authenticated
  USING (public.rls_contract_readable(contract_id));

DROP POLICY IF EXISTS contract_documents_insert ON public.contract_documents;
CREATE POLICY contract_documents_insert ON public.contract_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_contract_writable(contract_id));
-- Không có policy UPDATE / DELETE: văn bản đã lập là bất biến.

CREATE OR REPLACE FUNCTION public.contract_documents_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
BEGIN
  SELECT c.company_id, c.stage INTO v_contract
  FROM public.contracts c
  WHERE c.id = NEW.contract_id
  FOR UPDATE;  -- hai người lưu cùng lúc phải xếp hàng để số phiên bản không trùng
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hợp đồng.';
  END IF;

  IF v_contract.stage NOT IN ('nhap', 'cho_duyet', 'da_duyet') THEN
    RAISE EXCEPTION 'Hợp đồng đã ký: văn bản đã khoá, không lập thêm bản điền mới. Thay đổi sau ký đi qua phát sinh / phụ lục.';
  END IF;

  NEW.company_id := v_contract.company_id;
  NEW.created_by := public.auth_user_id();
  NEW.created_at := now();

  SELECT coalesce(max(version), 0) + 1 INTO NEW.version
  FROM public.contract_documents WHERE contract_id = NEW.contract_id;

  -- NEN-05: bản sau phải nêu nguyên nhân thay đổi.
  IF NEW.version > 1 AND (NEW.change_reason IS NULL OR btrim(NEW.change_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân lập lại văn bản (đã có bản %).', NEW.version - 1;
  END IF;

  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_templates t
    WHERE t.id = NEW.template_id AND t.company_id = v_contract.company_id
  ) THEN
    RAISE EXCEPTION 'Mẫu hợp đồng không thuộc pháp nhân của hợp đồng này.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_documents_before_insert ON public.contract_documents;
CREATE TRIGGER contract_documents_before_insert
  BEFORE INSERT ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.contract_documents_before_insert();

GRANT SELECT, INSERT, UPDATE ON public.contract_templates TO authenticated;
GRANT SELECT, INSERT ON public.contract_documents TO authenticated;


-- 5. Kho tệp ---------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('contract-templates', 'contract-templates', false, 10485760,
   ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('contract-documents', 'contract-documents', false, 10485760,
   ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS contract_templates_files_select ON storage.objects;
CREATE POLICY contract_templates_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contract-templates'
    AND public.rls_company_access(public.try_uuid((storage.foldername(name))[1]))
    AND public.auth_can_view_module('HD')
  );

DROP POLICY IF EXISTS contract_templates_files_insert ON storage.objects;
CREATE POLICY contract_templates_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contract-templates'
    AND public.auth_can_manage_contract_templates(public.try_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS contract_documents_files_select ON storage.objects;
CREATE POLICY contract_documents_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contract-documents'
    AND public.rls_contract_readable(public.try_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS contract_documents_files_insert ON storage.objects;
CREATE POLICY contract_documents_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND public.rls_contract_writable(public.try_uuid((storage.foldername(name))[1]))
  );
-- Không có policy xoá tệp ở cả hai bucket: mẫu và văn bản là căn cứ truy vết.
