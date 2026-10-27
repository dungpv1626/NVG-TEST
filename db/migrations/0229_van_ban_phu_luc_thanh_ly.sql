-- 0229 — Soạn phụ lục hợp đồng và biên bản thanh lý từ mẫu (anh Dũng 27/10/2026: «soạn từ mẫu, tự điền»).
--
-- Bộ mẫu NVG gửi có DC-01 (phụ lục: điều chỉnh khối lượng / phát sinh, gia hạn, điều chỉnh nội dung khác — ba mẫu trong
-- một tệp, convert.py tách ra) và DC-03 (biên bản thanh lý). Văn bản hợp đồng chính (`contract_documents`) KHOÁ khi hợp
-- đồng đã ký — đúng, nhưng phụ lục và thanh lý sinh ra SAU khi ký, và một hợp đồng có nhiều phụ lục. Nên:
--
-- - `contract_templates.document_kind`: hop_dong (như cũ) · phu_luc · thanh_ly. Mẫu phụ lục / thanh lý không gắn loại hợp
--   đồng (`contract_type` rỗng) — ô chọn mẫu hợp đồng chính lọc theo loại nên không lẫn.
-- - Bảng riêng `contract_annex_documents`: văn bản đã điền, BẤT BIẾN, đánh số bản theo từng phụ lục / theo biên bản thanh lý
--   của hợp đồng; bản sau phải có lý do (NEN-05). Giá trị điền lưu ngay trên văn bản (`filled_values`) — mỗi phụ lục một
--   bộ, không dùng chung `contract_document_inputs` (một dòng một hợp đồng).
-- - Phụ lục: soạn khi phụ lục còn «Đề xuất», đúng người sửa được phụ lục (`rls_contract_writable` — như chính sách sửa
--   `contract_amendments`). Gửi duyệt rồi thì khoá: người duyệt xem đúng bản đã soạn.
-- - Thanh lý: hợp đồng đã ký / đã quyết toán; người chịu trách nhiệm hoặc Ban Giám đốc (`rls_contract_scan_uploader`).
-- - Tệp ở kho `contract-documents/<hợp đồng>/`: phụ lục tên `phu-luc-*`, thanh lý `thanh-ly-*`.

ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'hop_dong';

ALTER TABLE public.contract_templates DROP CONSTRAINT IF EXISTS contract_templates_document_kind_check;
ALTER TABLE public.contract_templates
  ADD CONSTRAINT contract_templates_document_kind_check
  CHECK (document_kind IN ('hop_dong', 'phu_luc', 'thanh_ly'));

ALTER TABLE public.contract_templates ALTER COLUMN contract_type DROP NOT NULL;
ALTER TABLE public.contract_templates DROP CONSTRAINT IF EXISTS contract_templates_type_for_contract;
ALTER TABLE public.contract_templates
  ADD CONSTRAINT contract_templates_type_for_contract
  CHECK (document_kind <> 'hop_dong' OR contract_type IS NOT NULL);

COMMENT ON COLUMN public.contract_templates.document_kind IS
  'hop_dong: mẫu hợp đồng chính · phu_luc: phụ lục hợp đồng · thanh_ly: biên bản thanh lý (0229).';

CREATE TABLE IF NOT EXISTS public.contract_annex_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  contract_id     uuid NOT NULL REFERENCES public.contracts (id) ON DELETE CASCADE,
  amendment_id    uuid REFERENCES public.contract_amendments (id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('phu_luc', 'thanh_ly')),
  template_id     uuid REFERENCES public.contract_templates (id) ON DELETE SET NULL,
  version         integer NOT NULL,
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  filled_values   jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields  text[] NOT NULL DEFAULT '{}',
  change_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT contract_annex_documents_amendment_kind
    CHECK ((kind = 'phu_luc') = (amendment_id IS NOT NULL)),
  CONSTRAINT contract_annex_documents_path CHECK (storage_path LIKE contract_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS contract_annex_documents_contract_idx
  ON public.contract_annex_documents (contract_id, kind, created_at DESC);

COMMENT ON TABLE public.contract_annex_documents IS
  'Phụ lục hợp đồng / biên bản thanh lý đã điền từ mẫu — bất biến, đánh số bản (0229).';

CREATE OR REPLACE FUNCTION public.contract_annex_documents_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
  v_amendment record;
BEGIN
  SELECT c.company_id, c.stage INTO v_contract
    FROM public.contracts c WHERE c.id = NEW.contract_id AND c.deleted_at IS NULL
     FOR UPDATE;  -- hai người lưu cùng lúc xếp hàng để số bản không trùng
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hợp đồng.';
  END IF;

  IF NEW.kind = 'phu_luc' THEN
    SELECT a.contract_id, a.stage INTO v_amendment
      FROM public.contract_amendments a WHERE a.id = NEW.amendment_id AND a.deleted_at IS NULL;
    IF NOT FOUND OR v_amendment.contract_id <> NEW.contract_id THEN
      RAISE EXCEPTION 'Phụ lục không thuộc hợp đồng này.';
    END IF;
    IF v_amendment.stage <> 'de_xuat' THEN
      RAISE EXCEPTION 'Phụ lục đã gửi phê duyệt — văn bản đã khoá theo bản đã gửi.';
    END IF;
  ELSE
    IF v_contract.stage::text NOT IN ('da_ky', 'hoan_thanh') THEN
      RAISE EXCEPTION 'Biên bản thanh lý chỉ lập cho hợp đồng đã ký.';
    END IF;
  END IF;

  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contract_templates t
     WHERE t.id = NEW.template_id AND t.company_id = v_contract.company_id AND t.document_kind = NEW.kind
  ) THEN
    RAISE EXCEPTION 'Mẫu đã chọn không phải mẫu % của pháp nhân này.',
      CASE NEW.kind WHEN 'phu_luc' THEN 'phụ lục' ELSE 'biên bản thanh lý' END;
  END IF;

  NEW.company_id := v_contract.company_id;
  NEW.created_by := public.auth_user_id();
  NEW.created_at := now();
  SELECT coalesce(max(d.version), 0) + 1 INTO NEW.version
    FROM public.contract_annex_documents d
   WHERE d.contract_id = NEW.contract_id AND d.kind = NEW.kind
     AND d.amendment_id IS NOT DISTINCT FROM NEW.amendment_id;
  IF NEW.version > 1 AND NULLIF(btrim(coalesce(NEW.change_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Vui lòng nhập nguyên nhân lập lại văn bản (đã có bản %).', NEW.version - 1;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'contract-documents' AND o.name = NEW.storage_path
  ) THEN
    RAISE EXCEPTION 'Chưa thấy tệp văn bản đã tải lên — thử lưu lại.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_annex_documents_before_insert ON public.contract_annex_documents;
CREATE TRIGGER contract_annex_documents_before_insert
  BEFORE INSERT ON public.contract_annex_documents
  FOR EACH ROW EXECUTE FUNCTION public.contract_annex_documents_before_insert();

ALTER TABLE public.contract_annex_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_annex_documents FROM anon;

DROP POLICY IF EXISTS contract_annex_documents_select ON public.contract_annex_documents;
CREATE POLICY contract_annex_documents_select ON public.contract_annex_documents
  FOR SELECT TO authenticated
  USING (public.rls_contract_readable(contract_id));

DROP POLICY IF EXISTS contract_annex_documents_insert ON public.contract_annex_documents;
CREATE POLICY contract_annex_documents_insert ON public.contract_annex_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE kind
      WHEN 'phu_luc' THEN public.rls_contract_writable(contract_id)
      ELSE public.rls_contract_scan_uploader(contract_id)
    END
  );

GRANT SELECT, INSERT ON public.contract_annex_documents TO authenticated;

-- Kho: thêm đường cho tệp thanh lý (người ghi ký / Ban Giám đốc trên hợp đồng đã ký). Phụ lục đi đường
-- `rls_contract_writable` có sẵn. Chép chính sách 0189, thêm một nhánh.
DROP POLICY IF EXISTS contract_documents_files_insert ON storage.objects;
CREATE POLICY contract_documents_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND (
      public.rls_contract_writable(public.try_uuid((storage.foldername(name))[1]))
      OR ((storage.filename(name) LIKE 'da-ky-%' OR storage.filename(name) LIKE 'thanh-ly-%')
          AND public.rls_contract_scan_uploader(public.try_uuid((storage.foldername(name))[1])))
    )
  );
