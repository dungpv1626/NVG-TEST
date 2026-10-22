-- ============================================================================
-- Đợt 5 — 5D: NVS cho thuê (phần không bị chặn — doc/KE_HOACH_LAM_HO.md).
--
--  1. Nhắc hết hạn thuê: `scan_rental_expiry_reminders()` (cron đêm). Đơn đang thuê quá ngày trả dự
--     kiến thì luôn báo; báo trước N ngày theo `sx.rental_remind_days` (để TRỐNG — NVG chưa quyết).
--     Người nhận: người lập đơn + Xưởng (quyền sửa SX) của pháp nhân. Đổi ngày trả dự kiến thì
--     nhắc lại từ đầu.
--  2. Phiếu giao hàng khách ký nhận trên điện thoại — cùng cách ký của biên bản thu hồi (0145): hai
--     chữ ký trên màn hình HOẶC ảnh phiếu giấy đã ký; tệp ở kho `rental-delivery-docs`, thư mục đầu
--     = đơn thuê; `sign_rental_delivery` ký một lần; cột ký chỉ đổi qua hàm (trigger).
--  3. Báo giá thuê (PRD CRM-11): `rental_available_stock` cho biết tồn kho cho thuê được theo mã
--     (mới + còn dùng được, đúng cách `create_rental_agreement` lấy hàng); đơn giá thuê / ngày đọc
--     tham số `sx.rental_daily_rate` phạm vi SẢN PHẨM — chưa cấu hình thì màn hình ghi «Chưa cấu
--     hình», không tự đặt. Bảng giá bồi thường KHÔNG điền (câu 17).
-- Chạy lại được.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Nhắc hết hạn thuê
-- ----------------------------------------------------------------------------
ALTER TABLE public.rental_agreements
  ADD COLUMN IF NOT EXISTS expiry_reminded_stage smallint,
  ADD COLUMN IF NOT EXISTS delivery_customer_representative varchar(255),
  ADD COLUMN IF NOT EXISTS delivery_customer_signature_path text,
  ADD COLUMN IF NOT EXISTS delivery_nvg_signature_path text,
  ADD COLUMN IF NOT EXISTS delivery_paper_scan_path text,
  ADD COLUMN IF NOT EXISTS delivery_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_signed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rental_agreements.delivery_signed_at IS
  'Khách ký nhận phiếu giao hàng (5D) — qua sign_rental_delivery, một lần.';

CREATE OR REPLACE FUNCTION public.rental_agreements_delivery_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.expected_end_date IS DISTINCT FROM OLD.expected_end_date THEN
    NEW.expiry_reminded_stage := NULL;
  END IF;
  IF current_setting('nvg.rental_delivery_sign', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.delivery_customer_representative IS DISTINCT FROM OLD.delivery_customer_representative
     OR NEW.delivery_customer_signature_path IS DISTINCT FROM OLD.delivery_customer_signature_path
     OR NEW.delivery_nvg_signature_path IS DISTINCT FROM OLD.delivery_nvg_signature_path
     OR NEW.delivery_paper_scan_path IS DISTINCT FROM OLD.delivery_paper_scan_path
     OR NEW.delivery_signed_at IS DISTINCT FROM OLD.delivery_signed_at
     OR NEW.delivery_signed_by IS DISTINCT FROM OLD.delivery_signed_by THEN
    RAISE EXCEPTION 'Chữ ký phiếu giao hàng chỉ ghi qua «Ký phiếu giao», không sửa tay.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rental_agreements_delivery_guard ON public.rental_agreements;
CREATE TRIGGER rental_agreements_delivery_guard
  BEFORE UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.rental_agreements_delivery_guard();

INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT v.k, 'global', NULL, v.u, v.l, v.d
FROM (VALUES
  ('sx.rental_remind_days', 'ngày', 'Nhắc trước ngày trả giàn giáo dự kiến (ngày)',
   'Báo người lập đơn và Xưởng trước N ngày. Để trống = chỉ báo khi đơn thuê đã quá ngày trả dự kiến.'),
  ('sx.rental_daily_rate', 'đồng/ngày', 'Đơn giá thuê giàn giáo / ngày theo mã sản phẩm',
   'Khai theo phạm vi SẢN PHẨM (mỗi mã vật tư một dòng). Màn hình báo giá thuê đọc giá này; mã chưa khai ghi «Chưa cấu hình».')
) AS v(k, u, l, d)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p WHERE p.param_key = v.k AND p.scope_type = 'global'
);

CREATE OR REPLACE FUNCTION public.scan_rental_expiry_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_lead  numeric := public.system_parameter_number('sx.rental_remind_days');
  r       record;
  v_stage smallint;
  v_sent  integer := 0;
BEGIN
  FOR r IN
    SELECT ra.*, c.name AS customer_name
    FROM public.rental_agreements ra
    LEFT JOIN public.customers c ON c.id = ra.customer_id
    WHERE ra.deleted_at IS NULL AND ra.status = 'dang_thue' AND ra.expected_end_date IS NOT NULL
  LOOP
    v_stage := CASE
      WHEN r.expected_end_date < v_today THEN 0
      WHEN v_lead IS NOT NULL AND r.expected_end_date - v_today <= v_lead THEN 1
      ELSE NULL END;
    CONTINUE WHEN v_stage IS NULL;
    CONTINUE WHEN r.expiry_reminded_stage IS NOT NULL AND r.expiry_reminded_stage <= v_stage;

    PERFORM public.create_notification(
      u.id, r.company_id, 'rental_expiry',
      CASE WHEN v_stage = 0 THEN
        format('Đơn thuê %s (%s) đã quá ngày trả dự kiến %s — liên hệ khách thu hồi hoặc gia hạn.',
               r.code, COALESCE(r.customer_name, 'khách'), to_char(r.expected_end_date, 'DD/MM/YYYY'))
      ELSE
        format('Đơn thuê %s (%s) tới ngày trả dự kiến %s, còn %s ngày.', r.code,
               COALESCE(r.customer_name, 'khách'), to_char(r.expected_end_date, 'DD/MM/YYYY'),
               r.expected_end_date - v_today)
      END,
      'rental_agreements', r.id, '/sx/tai-san-cho-thue/' || r.id::text
    )
    FROM public.users u
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (u.id = r.created_by OR EXISTS (
        SELECT 1 FROM public.user_companies uc
        JOIN public.permissions pm ON pm.role_id = uc.role_id
        WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = r.company_id
          AND pm.module_code = 'SX' AND pm.can_edit));

    UPDATE public.rental_agreements SET expiry_reminded_stage = v_stage WHERE id = r.id;
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_rental_expiry_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_rental_expiry_reminders() TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Phiếu giao hàng khách ký nhận
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_rental_delivery_signable(p_rental_agreement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_agreements ra
    WHERE ra.id = p_rental_agreement_id AND ra.deleted_at IS NULL
      AND ra.delivery_signed_at IS NULL AND ra.status = 'dang_thue'
      AND public.rls_company_access(ra.company_id)
      AND public.auth_can_edit_module('SX')
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_rental_agreement_readable(p_rental_agreement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_agreements ra
    WHERE ra.id = p_rental_agreement_id AND ra.deleted_at IS NULL
      AND public.rls_rental_readable(ra.company_id)
  );
$$;

REVOKE ALL ON FUNCTION public.rls_rental_delivery_signable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rls_rental_agreement_readable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_rental_delivery_signable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_rental_agreement_readable(uuid) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rental-delivery-docs', 'rental-delivery-docs', false, 20971520,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS rental_delivery_docs_select ON storage.objects;
CREATE POLICY rental_delivery_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rental-delivery-docs'
         AND public.rls_rental_agreement_readable(public.try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS rental_delivery_docs_insert ON storage.objects;
CREATE POLICY rental_delivery_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rental-delivery-docs'
              AND public.rls_rental_delivery_signable(public.try_uuid((storage.foldername(name))[1])));

CREATE OR REPLACE FUNCTION public.sign_rental_delivery(
  p_rental_agreement_id uuid,
  p_customer_representative text,
  p_customer_signature_path text DEFAULT NULL,
  p_nvg_signature_path text DEFAULT NULL,
  p_paper_scan_path text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ra      record;
  v_cust  text := NULLIF(btrim(p_customer_signature_path), '');
  v_nvg   text := NULLIF(btrim(p_nvg_signature_path), '');
  v_scan  text := NULLIF(btrim(p_paper_scan_path), '');
  v_rep   text := NULLIF(btrim(p_customer_representative), '');
  v_path  text;
  v_at    timestamptz;
BEGIN
  SELECT * INTO ra FROM public.rental_agreements
   WHERE id = p_rental_agreement_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_company_access(ra.company_id)
     OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Ký phiếu giao hàng do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF ra.delivery_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Phiếu giao của đơn % đã ký, không ký lại được.', ra.code;
  END IF;
  IF ra.status <> 'dang_thue' THEN
    RAISE EXCEPTION 'Đơn thuê không còn ở trạng thái đang thuê.';
  END IF;
  IF v_rep IS NULL THEN
    RAISE EXCEPTION 'Ghi họ tên người đại diện bên thuê nhận hàng.';
  END IF;
  IF NOT ((v_cust IS NOT NULL AND v_nvg IS NOT NULL) OR v_scan IS NOT NULL) THEN
    RAISE EXCEPTION 'Cần đủ chữ ký của hai bên, hoặc ảnh phiếu giao giấy đã ký.';
  END IF;
  FOREACH v_path IN ARRAY ARRAY[v_cust, v_nvg, v_scan] LOOP
    CONTINUE WHEN v_path IS NULL;
    IF left(v_path, length(ra.id::text) + 1) <> ra.id::text || '/'
       OR NOT EXISTS (SELECT 1 FROM storage.objects
                      WHERE bucket_id = 'rental-delivery-docs' AND name = v_path) THEN
      RAISE EXCEPTION 'Chữ ký hoặc ảnh phiếu giao chưa tải lên được. Kiểm tra mạng rồi ký lại.';
    END IF;
  END LOOP;

  PERFORM set_config('nvg.rental_delivery_sign', 'on', true);
  UPDATE public.rental_agreements
     SET delivery_customer_representative = v_rep,
         delivery_customer_signature_path = v_cust,
         delivery_nvg_signature_path = v_nvg,
         delivery_paper_scan_path = v_scan,
         delivery_signed_at = now(),
         delivery_signed_by = public.auth_user_id(),
         updated_at = now(), updated_by = public.auth_user_id()
   WHERE id = ra.id
   RETURNING delivery_signed_at INTO v_at;
  PERFORM set_config('nvg.rental_delivery_sign', 'off', true);
  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_rental_delivery(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_rental_delivery(uuid, text, text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Tồn kho cho thuê được — cho màn hình báo giá thuê
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rental_available_stock(p_company_id uuid)
RETURNS TABLE (
  material_id uuid,
  code        text,
  name        text,
  specification text,
  unit        text,
  available   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.code::text, m.name::text, m.specification::text, m.unit::text,
         COALESCE(sum(s.quantity) FILTER (
           WHERE s.location_type = 'kho' AND s.condition IN ('con_dung_duoc', 'moi')
             AND s.deleted_at IS NULL), 0)
  FROM public.materials m
  LEFT JOIN public.scaffolding_assets s ON s.material_id = m.id AND s.company_id = p_company_id
  WHERE public.rls_rental_readable(p_company_id)
    AND m.is_scaffolding AND m.is_active AND m.deleted_at IS NULL
  GROUP BY m.id
  ORDER BY m.code;
$$;

REVOKE ALL ON FUNCTION public.rental_available_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_available_stock(uuid) TO authenticated;
