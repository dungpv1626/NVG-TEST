-- 0189 — Bản hợp đồng đã ký: quét bổ sung sau khi ký + link xem có hạn cho khách.
--
-- Anh Dũng 22/10/2026: Kinh doanh đưa sếp ký, đóng dấu trên giấy rồi quét (bộ quét trên trình
-- duyệt ghép ra một PDF khổ A4) để báo cáo, gửi khách, lưu trữ.
--
--  1. Cột `contracts.signed_scan_path` chỉ đổi qua hai cửa: lúc ghi nhận ký (`sign_contract`,
--     bước da_duyet → da_ky) và hàm `attach_signed_scan` dưới đây. Sau khi ký, RLS
--     `contracts_update` (chỉ bước Nháp) đã chặn ghi thẳng; trigger này chặn thêm ở bước Nháp —
--     bản đã ký là căn cứ thay chữ ký trên hệ thống, không được có đường dẫn tự gõ.
--  2. `attach_signed_scan`: hợp đồng ký mà chưa có bản (Ban Giám đốc ghi nhận không kèm bản chụp,
--     như «AB») thì người chịu trách nhiệm / Ban Giám đốc bổ sung. Thay bản ĐÃ CÓ (quét lại cho rõ)
--     thì phải ghi lý do, ghi nhật ký kiểm toán, Ban Giám đốc được báo — người chịu trách nhiệm tự
--     thay được (anh Dũng 22/10/2026: chỉ BGĐ thay thì Kinh doanh quét lại cho rõ cũng bị kẹt).
--  3. `contract_scan_shares`: link xem bản đã ký gửi khách — theo mẫu link thư viện mẫu (0179):
--     có thời hạn (tối đa một năm), thu hồi được, mỗi lượt xem ghi lại. Trang công khai chỉ đọc
--     qua `contract_scan_public` (khoá service, Worker), chỉ trả tên / số / ngày ký và tệp — không
--     giá trị, không điều khoản.
--
-- Chạy lại được.

-- ----------------------------------------------------------------------------
-- 1. Canh cột bản đã ký
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contracts_signed_scan_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN RETURN NEW; END IF;  -- hệ thống / seed
  IF NEW.signed_scan_path IS NOT DISTINCT FROM OLD.signed_scan_path
     AND NEW.signed_recorded_by IS NOT DISTINCT FROM OLD.signed_recorded_by THEN
    RETURN NEW;
  END IF;
  -- Lúc ghi nhận ký: quyền do `contracts_stage_permissions` (0187) kiểm.
  IF OLD.stage = 'da_duyet' AND NEW.stage = 'da_ky' THEN RETURN NEW; END IF;
  IF current_setting('nvg.attach_signed_scan', true) = NEW.id::text THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Bản hợp đồng đã ký chỉ thêm bằng nút «Quét / thêm bản đã ký» trên hợp đồng.';
END;
$$;

DROP TRIGGER IF EXISTS contracts_signed_scan_guard ON public.contracts;
CREATE TRIGGER contracts_signed_scan_guard
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_signed_scan_guard();

-- ----------------------------------------------------------------------------
-- 2. Bổ sung / thay bản đã ký
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_signed_scan(
  p_contract_id uuid,
  p_path text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  v_approver boolean;
  c record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id) OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;
  IF c.stage::text NOT IN ('da_ky', 'hoan_thanh') THEN
    RAISE EXCEPTION 'Chỉ thêm bản đã ký cho hợp đồng đã ký. Hợp đồng chưa ký thì đính bản quét lúc «Ghi nhận đã ký».';
  END IF;

  v_approver := public.auth_can_approve_module('HD');
  IF NOT v_approver AND NOT (
       public.auth_can_edit_module('HD')
       AND public.rls_owner_can_write(c.company_id, c.responsible_user_id)
     ) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm hợp đồng hoặc Ban Giám đốc thêm được bản đã ký.';
  END IF;

  IF c.signed_scan_path IS NOT NULL THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'Ghi lý do thay bản đã ký.';
    END IF;
  END IF;

  IF p_path IS NULL OR split_part(p_path, '/', 1) <> c.id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o
                     WHERE o.bucket_id = 'contract-documents' AND o.name = p_path) THEN
    RAISE EXCEPTION 'Không thấy bản đã ký vừa tải lên — tải lại tệp rồi thử lại.';
  END IF;

  PERFORM set_config('nvg.attach_signed_scan', c.id::text, true);
  UPDATE public.contracts
     SET signed_scan_path = p_path,
         updated_at = now(), updated_by = v_user
   WHERE id = c.id;
  PERFORM set_config('nvg.attach_signed_scan', '', true);

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, c.company_id,
          CASE WHEN c.signed_scan_path IS NULL THEN 'attach_signed_scan' ELSE 'replace_signed_scan' END,
          'contracts', c.id,
          jsonb_build_object('signed_scan_path', c.signed_scan_path),
          jsonb_build_object('signed_scan_path', p_path),
          NULLIF(btrim(p_reason), ''));

  -- Người khác Ban Giám đốc thêm bản → báo Ban Giám đốc (cùng loại thông báo với lúc ghi nhận ký).
  IF NOT v_approver THEN
    PERFORM public.create_notification(
      u.id, c.company_id, 'contract_signed_recorded',
      CASE WHEN c.signed_scan_path IS NULL
        THEN format('Hợp đồng %s: %s đã thêm bản hợp đồng đã ký.',
                    COALESCE(c.contract_number, c.code), (SELECT full_name FROM public.users WHERE id = v_user))
        ELSE format('Hợp đồng %s: %s đã thay bản hợp đồng đã ký (lý do: %s).',
                    COALESCE(c.contract_number, c.code), (SELECT full_name FROM public.users WHERE id = v_user),
                    btrim(p_reason))
      END,
      'contracts', c.id,
      format('/hd/hop-dong/%s', c.id)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    JOIN public.permissions pm ON pm.role_id = uc.role_id AND pm.module_code = 'HD' AND pm.can_approve
    WHERE u.is_active AND u.deleted_at IS NULL AND u.id <> v_user
      AND (uc.company_id = c.company_id OR r.sees_all_companies)
    GROUP BY u.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_signed_scan(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_signed_scan(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Link xem bản đã ký cho khách
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_scan_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  note        text,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT contract_scan_shares_future CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS contract_scan_shares_contract_idx
  ON public.contract_scan_shares (contract_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.contract_scan_share_views (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id  uuid NOT NULL REFERENCES public.contract_scan_shares(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_scan_share_views_share_idx
  ON public.contract_scan_share_views (share_id, viewed_at DESC);

COMMENT ON TABLE public.contract_scan_shares IS
  'Link xem bản hợp đồng đã ký gửi khách (0189): có hạn (tối đa một năm), thu hồi được. Trang công khai đọc qua contract_scan_public.';

/** Ai gửi / thu hồi được link của một hợp đồng: người chịu trách nhiệm hoặc Ban Giám đốc, hợp đồng đã ký và đã có bản. */
CREATE OR REPLACE FUNCTION public.rls_contract_scan_sharer(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = p_contract_id AND c.deleted_at IS NULL
       AND c.stage::text IN ('da_ky', 'hoan_thanh')
       AND c.signed_scan_path IS NOT NULL
       AND public.rls_company_access(c.company_id)
       AND NOT public.auth_is_read_only()
       AND (public.auth_can_approve_module('HD')
            OR (public.auth_can_edit_module('HD')
                AND public.rls_owner_can_write(c.company_id, c.responsible_user_id)))
  );
$$;

CREATE OR REPLACE FUNCTION public.contract_scan_shares_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN RETURN NEW; END IF;
  NEW.updated_at := now();
  NEW.updated_by := public.auth_user_id();
  IF TG_OP = 'INSERT' THEN
    NEW.company_id := (SELECT company_id FROM public.contracts WHERE id = NEW.contract_id);
    NEW.created_by := public.auth_user_id();
    NEW.created_at := now();
    NEW.revoked_at := NULL;
    NEW.token := encode(extensions.gen_random_bytes(18), 'hex');
    IF NEW.expires_at > now() + interval '366 days' THEN
      RAISE EXCEPTION 'Thời hạn link tối đa một năm.';
    END IF;
    RETURN NEW;
  END IF;
  -- Sửa: chỉ thu hồi; không đổi hợp đồng, mã link, thời hạn.
  NEW.token := OLD.token;
  NEW.contract_id := OLD.contract_id;
  NEW.company_id := OLD.company_id;
  NEW.expires_at := OLD.expires_at;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.revoked_at IS NOT NULL THEN NEW.revoked_at := OLD.revoked_at; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_scan_shares_guard ON public.contract_scan_shares;
CREATE TRIGGER contract_scan_shares_guard
  BEFORE INSERT OR UPDATE ON public.contract_scan_shares
  FOR EACH ROW EXECUTE FUNCTION public.contract_scan_shares_guard();

ALTER TABLE public.contract_scan_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_scan_share_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_scan_shares FROM anon;
REVOKE ALL ON public.contract_scan_share_views FROM anon, authenticated;

DROP POLICY IF EXISTS contract_scan_shares_select ON public.contract_scan_shares;
CREATE POLICY contract_scan_shares_select ON public.contract_scan_shares
  FOR SELECT TO authenticated
  USING (public.rls_contract_readable(contract_id));

DROP POLICY IF EXISTS contract_scan_shares_insert ON public.contract_scan_shares;
CREATE POLICY contract_scan_shares_insert ON public.contract_scan_shares
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_contract_scan_sharer(contract_id));

DROP POLICY IF EXISTS contract_scan_shares_update ON public.contract_scan_shares;
CREATE POLICY contract_scan_shares_update ON public.contract_scan_shares
  FOR UPDATE TO authenticated
  USING (public.rls_contract_scan_sharer(contract_id))
  WITH CHECK (public.rls_contract_scan_sharer(contract_id));

GRANT SELECT, INSERT, UPDATE ON public.contract_scan_shares TO authenticated;
GRANT SELECT ON public.contract_scan_share_views TO authenticated;

DROP POLICY IF EXISTS contract_scan_share_views_select ON public.contract_scan_share_views;
CREATE POLICY contract_scan_share_views_select ON public.contract_scan_share_views
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contract_scan_shares s WHERE s.id = share_id));

-- Trang công khai — chỉ Worker (khoá service) gọi.
CREATE OR REPLACE FUNCTION public.contract_scan_public(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  SELECT sh.id, sh.expires_at, sh.revoked_at,
         c.title, c.contract_number, c.signed_date, c.signed_scan_path, c.deleted_at,
         co.short_name AS company_name, co.legal_name AS company_full_name
    INTO s
    FROM public.contract_scan_shares sh
    JOIN public.contracts c ON c.id = sh.contract_id
    JOIN public.companies co ON co.id = sh.company_id
   WHERE sh.token = p_token;
  IF s.id IS NULL OR s.deleted_at IS NOT NULL OR s.signed_scan_path IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF s.revoked_at IS NOT NULL OR s.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  INSERT INTO public.contract_scan_share_views (share_id) VALUES (s.id);

  RETURN jsonb_build_object(
    'status', 'ok',
    'title', s.title,
    'contract_number', s.contract_number,
    'signed_date', s.signed_date,
    'company_name', COALESCE(s.company_full_name, s.company_name),
    'expires_at', s.expires_at,
    'path', s.signed_scan_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.contract_scan_public(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contract_scan_public(text) TO service_role;
COMMENT ON FUNCTION public.contract_scan_public(text) IS
  'Trang xem bản hợp đồng đã ký (Worker gọi bằng khoá service): link hợp lệ thì trả tên / số / ngày ký + đường dẫn tệp, ghi một lượt xem (0189).';

-- ----------------------------------------------------------------------------
-- 4. Ai tải được TỆP bản đã ký lên kho
-- ----------------------------------------------------------------------------
-- Kho `contract-documents` theo `rls_contract_writable` (quyền SỬA hợp đồng, trước khi ký).
-- Ban Giám đốc chỉ có quyền PHÊ DUYỆT hợp đồng nên bị chặn ngay bước tải bản quét — «quét xong
-- lưu thì báo lỗi» (anh Dũng, tài khoản TGĐ, 22/10/2026); người chịu trách nhiệm cũng không tải
-- được sau khi hợp đồng quyết toán. Riêng tệp `da-ky-*` (bản đã ký): người chịu trách nhiệm hoặc
-- Ban Giám đốc, hợp đồng đã duyệt / đã ký / đã quyết toán. Văn bản khác giữ nguyên quyền cũ.
CREATE OR REPLACE FUNCTION public.rls_contract_scan_uploader(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = p_contract_id AND c.deleted_at IS NULL
       AND c.stage::text IN ('da_duyet', 'da_ky', 'hoan_thanh')
       AND public.rls_company_access(c.company_id)
       AND NOT public.auth_is_read_only()
       AND (public.auth_can_approve_module('HD')
            OR (public.auth_can_edit_module('HD')
                AND public.rls_owner_can_write(c.company_id, c.responsible_user_id)))
  );
$$;

DROP POLICY IF EXISTS contract_documents_files_insert ON storage.objects;
CREATE POLICY contract_documents_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND (
      public.rls_contract_writable(public.try_uuid((storage.foldername(name))[1]))
      OR (
        storage.filename(name) LIKE 'da-ky-%'
        AND public.rls_contract_scan_uploader(public.try_uuid((storage.foldername(name))[1]))
      )
    )
  );
