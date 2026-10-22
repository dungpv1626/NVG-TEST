-- ============================================================================
-- Đợt 5 — 5F: Hành chính (doc/KE_HOACH_LAM_HO.md).
--
--  1. `company_documents` — giấy tờ có thời hạn CỦA PHÁP NHÂN (không phải của từng nhân sự —
--     cái đó ở `hr_documents`): giấy phép, bảo hiểm, đăng kiểm phương tiện / thiết bị. Mỗi giấy
--     tờ có người phụ trách, ngày hết hạn, tệp bản chụp (kho riêng `company-docs`, thư mục đầu =
--     pháp nhân, thư mục hai = giấy tờ). Bảng dựng sẵn cột `module` để Đợt 5C (kho hồ sơ năng lực
--     của Đấu thầu) dùng chung bảng — một giấy đăng ký kinh doanh không được có hai bản.
--  2. Nhắc hạn: `scan_company_document_reminders()` (cron đêm của Worker). Số ngày nhắc TRƯỚC là
--     tham số `hc.document_remind_days` để TRỐNG (NVG chưa quyết — CLAUDE.md 5.2): trống thì chỉ
--     báo khi ĐÃ hết hạn; đã hết hạn thì luôn báo (một lần cho mỗi lần hết hạn).
--  3. Tài sản cấp phát ký nhận: biên bản cấp phát / điều chuyển / thu hồi (`asset_events`, NS-08)
--     có chữ ký người nhận vẽ trên điện thoại (`sign_asset_event`, kho `asset-signatures`). Ký một
--     lần, không sửa.
-- Chạy lại được.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Giấy tờ của pháp nhân
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  category            varchar(32) NOT NULL,
  module              varchar(8) NOT NULL DEFAULT 'NS',
  title               varchar(255) NOT NULL,
  document_number     varchar(64),
  issuer              varchar(255),
  issued_date         date,
  expiry_date         date,
  fiscal_year         integer CHECK (fiscal_year IS NULL OR fiscal_year BETWEEN 1990 AND 2100),
  asset_id            uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  responsible_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  file_path           text,
  file_name           varchar(255),
  notes               text,
  last_reminded_stage smallint,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,
  CONSTRAINT company_documents_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT company_documents_dates CHECK (
    issued_date IS NULL OR expiry_date IS NULL OR expiry_date >= issued_date
  )
);

-- Danh mục loại giấy tờ — mở rộng ở migration sau (5C, 0208) bằng cách thay ràng buộc này. Chỉ đặt
-- khi chưa có: chạy lại tệp này sau 0208 không được thu hẹp danh mục về bốn loại (dòng loại 5C vi phạm).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'company_documents_category'
                    AND conrelid = 'public.company_documents'::regclass) THEN
    ALTER TABLE public.company_documents ADD CONSTRAINT company_documents_category
      CHECK (category IN ('giay_phep', 'bao_hiem', 'dang_kiem', 'hanh_chinh_khac'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS company_documents_company_idx
  ON public.company_documents (company_id, expiry_date) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.company_documents IS
  'Giấy tờ có thời hạn của pháp nhân (5F): giấy phép, bảo hiểm, đăng kiểm… — nhắc hạn bằng scan_company_document_reminders. Cột module = phân hệ quản lý loại giấy đó.';

/** Phân hệ quản lý một loại giấy tờ. 5C thay hàm này khi thêm loại hồ sơ năng lực. */
CREATE OR REPLACE FUNCTION public.company_document_module(p_category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'NS'::text;
$$;

CREATE OR REPLACE FUNCTION public.company_documents_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.module := public.company_document_module(NEW.category);
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := COALESCE(public.auth_user_id(), NEW.created_by);
    NEW.last_reminded_stage := NULL;
  ELSE
    NEW.company_id := OLD.company_id;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    -- Gia hạn (đổi ngày hết hạn) thì nhắc lại từ đầu cho lần hết hạn mới.
    IF NEW.expiry_date IS DISTINCT FROM OLD.expiry_date THEN
      NEW.last_reminded_stage := NULL;
    END IF;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(public.auth_user_id(), NEW.updated_by);
  IF NEW.file_path IS NOT NULL
     AND NEW.file_path NOT LIKE NEW.company_id::text || '/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'Tệp đính kèm không thuộc giấy tờ này. Tải lại tệp từ đúng giấy tờ.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_documents_before_write ON public.company_documents;
CREATE TRIGGER company_documents_before_write
  BEFORE INSERT OR UPDATE ON public.company_documents
  FOR EACH ROW EXECUTE FUNCTION public.company_documents_before_write();

/** Ai đọc / ghi được một giấy tờ — dùng cho bảng và kho tệp. 5C thêm điều kiện Mẫu D. */
CREATE OR REPLACE FUNCTION public.rls_company_document_readable(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_documents d
    WHERE d.id = p_document_id AND d.deleted_at IS NULL
      AND public.rls_company_access(d.company_id)
      AND public.auth_can_view_module(d.module)
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_company_document_writable(p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_documents d
    WHERE d.id = p_document_id AND d.deleted_at IS NULL
      AND public.rls_company_access(d.company_id)
      AND public.auth_can_edit_module(d.module)
      AND NOT public.auth_is_read_only()
  );
$$;

REVOKE ALL ON FUNCTION public.rls_company_document_readable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_company_document_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_company_document_readable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_company_document_writable(uuid) TO authenticated;

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_documents FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.company_documents TO authenticated;
REVOKE DELETE ON public.company_documents FROM authenticated;

DROP POLICY IF EXISTS company_documents_select ON public.company_documents;
CREATE POLICY company_documents_select ON public.company_documents
  FOR SELECT TO authenticated
  -- Điều kiện viết thẳng trên cột (không qua hàm đọc lại bảng): INSERT … RETURNING kiểm dòng mới
  -- mà hàm STABLE chưa thấy được trong cùng câu lệnh.
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module(module)
  );

DROP POLICY IF EXISTS company_documents_insert ON public.company_documents;
CREATE POLICY company_documents_insert ON public.company_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_can_create_in(public.company_document_module(category), company_id)
    AND NOT public.auth_is_read_only()
  );

DROP POLICY IF EXISTS company_documents_update ON public.company_documents;
CREATE POLICY company_documents_update ON public.company_documents
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module(module)
    AND NOT public.auth_is_read_only()
  )
  WITH CHECK (
    public.rls_company_access(company_id)
    AND public.auth_can_edit_module(public.company_document_module(category))
  );

-- Kho tệp: `<pháp nhân>/<giấy tờ>/<tệp>` — quyền theo giấy tờ ở thư mục hai.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-docs', 'company-docs', false, 26214400,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS company_docs_select ON storage.objects;
CREATE POLICY company_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'company-docs'
         AND public.rls_company_document_readable(public.try_uuid((storage.foldername(name))[2])));

DROP POLICY IF EXISTS company_docs_insert ON storage.objects;
CREATE POLICY company_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-docs'
              AND public.rls_company_document_writable(public.try_uuid((storage.foldername(name))[2])));

-- Tham số số ngày nhắc trước — TRỐNG (NVG chưa quyết).
INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'hc.document_remind_days', 'global', NULL,
       'Nhắc trước khi giấy tờ pháp nhân hết hạn (ngày)',
       'Số ngày trước ngày hết hạn thì báo người phụ trách. Để trống = chỉ báo khi đã hết hạn.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'hc.document_remind_days' AND p.scope_type = 'global'
);

/**
 * Quét giấy tờ pháp nhân: đã hết hạn → báo (mốc 0); còn ≤ N ngày (N = tham số, nếu có) → báo
 * (mốc 1). Mỗi mốc báo một lần cho một ngày hết hạn; gia hạn thì đặt lại. Người nhận: người
 * phụ trách; chưa giao ai thì người có quyền sửa phân hệ đó trong pháp nhân.
 */
CREATE OR REPLACE FUNCTION public.scan_company_document_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       record;
  v_days  integer;
  v_lead  numeric := public.system_parameter_number('hc.document_remind_days');
  v_stage smallint;
  v_sent  integer := 0;
  v_url   text;
BEGIN
  FOR d IN
    SELECT * FROM public.company_documents
    WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
  LOOP
    v_days := d.expiry_date - (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
    v_stage := CASE
      WHEN v_days < 0 THEN 0
      WHEN v_lead IS NOT NULL AND v_days <= v_lead THEN 1
      ELSE NULL
    END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN d.last_reminded_stage IS NOT NULL AND d.last_reminded_stage <= v_stage;

    v_url := CASE d.module WHEN 'DA' THEN '/da/ho-so-nang-luc' ELSE '/ns/giay-to-phap-nhan' END;

    PERFORM public.create_notification(
      u.id, d.company_id, 'company_document_expiry',
      CASE WHEN v_stage = 0 THEN
        format('%s đã hết hạn ngày %s — gia hạn và cập nhật ngày mới.', d.title,
               to_char(d.expiry_date, 'DD/MM/YYYY'))
      ELSE
        format('%s hết hạn ngày %s, còn %s ngày.', d.title,
               to_char(d.expiry_date, 'DD/MM/YYYY'), v_days)
      END,
      'company_documents', d.id, v_url
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (
        u.id = d.responsible_user_id
        OR (d.responsible_user_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_companies uc
          JOIN public.permissions pm ON pm.role_id = uc.role_id
          WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = d.company_id
            AND pm.module_code = d.module AND pm.can_edit
        ))
      );

    UPDATE public.company_documents SET last_reminded_stage = v_stage WHERE id = d.id;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_company_document_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_company_document_reminders() TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Tài sản cấp phát — ký nhận trên điện thoại
-- ----------------------------------------------------------------------------
ALTER TABLE public.asset_events
  ADD COLUMN IF NOT EXISTS receiver_signer_name    varchar(128),
  ADD COLUMN IF NOT EXISTS receiver_signature_path text,
  ADD COLUMN IF NOT EXISTS signed_at               timestamptz,
  ADD COLUMN IF NOT EXISTS signed_by               uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.asset_events.receiver_signature_path IS
  'Chữ ký người nhận / người trả (PNG) ở kho asset-signatures, `<pháp nhân>/<tài sản>/<biên bản>/…` (5F).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('asset-signatures', 'asset-signatures', false, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS asset_signatures_select ON storage.objects;
CREATE POLICY asset_signatures_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'asset-signatures'
         AND public.rls_company_access(public.try_uuid((storage.foldername(name))[1]))
         AND public.auth_can_view_module('NS'));

DROP POLICY IF EXISTS asset_signatures_insert ON storage.objects;
CREATE POLICY asset_signatures_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'asset-signatures'
              AND public.rls_company_access(public.try_uuid((storage.foldername(name))[1]))
              AND public.rls_hr_manages());

CREATE OR REPLACE FUNCTION public.sign_asset_event(
  p_event_id uuid,
  p_signer_name text,
  p_signature_path text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e   record;
  a   record;
  v_at timestamptz;
BEGIN
  SELECT * INTO e FROM public.asset_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy biên bản tài sản.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO a FROM public.assets WHERE id = e.asset_id;
  IF NOT public.rls_company_access(a.company_id) OR NOT public.rls_hr_manages() THEN
    RAISE EXCEPTION 'Không ghi được chữ ký: chỉ Hành chính – Nhân sự của pháp nhân này thực hiện được.'
      USING ERRCODE = '42501';
  END IF;
  IF e.type NOT IN ('cap_phat', 'dieu_chuyen', 'thu_hoi') THEN
    RAISE EXCEPTION 'Chỉ biên bản cấp phát, điều chuyển, thu hồi mới cần ký nhận.';
  END IF;
  IF e.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Biên bản này đã ký nhận, không ký lại được.';
  END IF;
  IF p_signer_name IS NULL OR btrim(p_signer_name) = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi tên người ký nhận.';
  END IF;
  IF p_signature_path IS NULL
     OR p_signature_path NOT LIKE a.company_id::text || '/' || a.id::text || '/' || e.id::text || '/%' THEN
    RAISE EXCEPTION 'Chữ ký không thuộc biên bản này. Ký lại từ đúng biên bản.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o
                 WHERE o.bucket_id = 'asset-signatures' AND o.name = p_signature_path) THEN
    RAISE EXCEPTION 'Chưa tải được chữ ký lên. Ký lại rồi lưu.';
  END IF;

  UPDATE public.asset_events
     SET receiver_signer_name = btrim(p_signer_name),
         receiver_signature_path = p_signature_path,
         signed_at = now(),
         signed_by = public.auth_user_id(),
         updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = p_event_id
   RETURNING signed_at INTO v_at;
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_asset_event(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_asset_event(uuid, text, text) TO authenticated;
