-- 0228 — Chứng từ đính kèm đề nghị thanh toán (bộ quét giấy dùng chung — việc treo của 0189).
--
-- Vì sao: tab «Bộ chứng từ» của đề nghị thanh toán chỉ liệt kê hồ sơ liên quan (đơn hàng, hợp đồng). Hóa đơn, biên bản,
-- phiếu giao hàng bản giấy không có chỗ lưu — người duyệt phải xin bản chụp qua Zalo. Nay chụp / quét thành PDF bằng bộ
-- quét dùng chung (`DocumentScanner`) hoặc tải tệp lên ngay trên đề nghị.
--
-- Quyền, theo mẫu đính kèm khảo sát (0180):
-- - Xem: ai xem được đề nghị (`rls_payment_request_readable`).
-- - Thêm / xoá: khi đề nghị còn Nháp hoặc bị trả về, đúng người sửa được đề nghị (`rls_payment_request_draft_writable`).
--   Gửi duyệt rồi thì bộ chứng từ KHOÁ — người duyệt duyệt đúng bộ lúc gửi.
-- - Kế toán thêm được chứng từ chi (ủy nhiệm chi, phiếu chi) khi đề nghị đã duyệt / đã chi, không xoá.
-- Tệp không sửa được; nhầm thì xoá (khi còn Nháp) rồi tải lại.

CREATE TABLE IF NOT EXISTS public.payment_request_files (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id  uuid NOT NULL REFERENCES public.payment_requests (id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  storage_path        text NOT NULL,
  -- hoa_don: hóa đơn · chung_tu: biên bản, phiếu giao hàng, bảng kê · chi: ủy nhiệm chi, phiếu chi · khac
  kind                varchar(16) NOT NULL CHECK (kind IN ('hoa_don', 'chung_tu', 'chi', 'khac')),
  file_name           varchar(255) NOT NULL,
  mime_type           varchar(128) NOT NULL,
  size_bytes          bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT payment_request_files_path CHECK (storage_path LIKE payment_request_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS payment_request_files_request_idx
  ON public.payment_request_files (payment_request_id, created_at);

COMMENT ON TABLE public.payment_request_files IS
  'Hóa đơn, chứng từ, bản quét đính kèm đề nghị thanh toán (0228). Tệp ở kho payment-files/{payment_request_id}/….';

-- Kế toán thêm chứng từ chi sau khi duyệt.
CREATE OR REPLACE FUNCTION public.rls_payment_request_paid_doc_writable(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payment_requests pr
     WHERE pr.id = p_request_id
       AND pr.deleted_at IS NULL
       AND pr.stage IN ('da_duyet', 'da_chi')
       AND public.rls_company_access(pr.company_id)
       AND public.auth_can_edit_module('KT')
       AND public.rls_sees_finance()
  );
$$;

REVOKE ALL ON FUNCTION public.rls_payment_request_paid_doc_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_payment_request_paid_doc_writable(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.payment_request_files_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT pr.company_id INTO NEW.company_id FROM public.payment_requests pr WHERE pr.id = NEW.payment_request_id;
  NEW.created_at := now();
  NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
  -- Sau khi duyệt chỉ thêm được chứng từ chi.
  IF NOT public.rls_payment_request_draft_writable(NEW.payment_request_id)
     AND public.auth_user_id() IS NOT NULL AND NEW.kind <> 'chi' THEN
    RAISE EXCEPTION 'Đề nghị đã gửi duyệt — bộ chứng từ đã khoá. Sau khi duyệt chỉ thêm được chứng từ chi (ủy nhiệm chi, phiếu chi).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_request_files_before_write ON public.payment_request_files;
CREATE TRIGGER payment_request_files_before_write
  BEFORE INSERT ON public.payment_request_files
  FOR EACH ROW EXECUTE FUNCTION public.payment_request_files_before_write();

ALTER TABLE public.payment_request_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_request_files FROM anon;

DROP POLICY IF EXISTS payment_request_files_select ON public.payment_request_files;
CREATE POLICY payment_request_files_select ON public.payment_request_files
  FOR SELECT TO authenticated
  USING (public.rls_payment_request_readable(payment_request_id));

DROP POLICY IF EXISTS payment_request_files_insert ON public.payment_request_files;
CREATE POLICY payment_request_files_insert ON public.payment_request_files
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rls_payment_request_draft_writable(payment_request_id)
    OR public.rls_payment_request_paid_doc_writable(payment_request_id)
  );

DROP POLICY IF EXISTS payment_request_files_delete ON public.payment_request_files;
CREATE POLICY payment_request_files_delete ON public.payment_request_files
  FOR DELETE TO authenticated
  USING (public.rls_payment_request_draft_writable(payment_request_id));

GRANT SELECT, INSERT, DELETE ON public.payment_request_files TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-files', 'payment-files', false, 26214400,
        ARRAY[
          'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/xml', 'text/xml'
        ])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS payment_files_select ON storage.objects;
CREATE POLICY payment_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-files'
         AND public.rls_payment_request_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS payment_files_insert ON storage.objects;
CREATE POLICY payment_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-files'
              AND (public.rls_payment_request_draft_writable(public.try_uuid((storage.foldername(name))[1]))
                   OR public.rls_payment_request_paid_doc_writable(public.try_uuid((storage.foldername(name))[1]))));

DROP POLICY IF EXISTS payment_files_delete ON storage.objects;
CREATE POLICY payment_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payment-files'
         AND public.rls_payment_request_draft_writable(public.try_uuid((storage.foldername(name))[1])));
