-- ============================================================================
-- Đợt 2 — 2D: biên bản nghiệm thu ký hai bên trên điện thoại → chuyển Kế toán
-- (doc/KE_HOACH_LAM_HO.md).
--
-- Trước đây biên bản «đã nghiệm thu» ngay lúc lập: chỉ có ô gõ tên người ký phía đối tác, không
-- chữ ký, không in được; Kế toán nhận thông báo lúc LẬP, đường dẫn trỏ vào trang Thi công mà
-- vai trò KT không có quyền xem.
--
-- Nay:
--   · Lập biên bản như cũ (danh mục kiểm tra, ảnh) → biên bản «Chưa ký».
--   · «Ký hai bên» là bước riêng (khách / tổ đội thường ký lúc gặp tại công trường): hai chữ ký vẽ
--     trên cùng điện thoại, HOẶC bản giấy đã ký quét bằng bộ quét — cùng khuôn biên bản thu hồi
--     giàn giáo (0145). Ký xong thì khoá phần ký.
--   · Kế toán được báo khi biên bản ĐÃ KÝ (khách hàng → căn cứ thu tiền; tổ đội → căn cứ trả
--     tiền), mở thẳng danh sách của phân hệ Kế toán; xem biên bản qua `acceptance_document`
--     (không cần quyền xem phân hệ Thi công). Kế toán đánh dấu «đã ghi nhận công nợ».
--
-- Biên bản lập trước 0192 coi như đã ký (ngày ký = ngày lập, không có tệp chữ ký) để Kế toán
-- không nhận lại việc cũ và các báo cáo giữ nguyên.
-- ============================================================================

-- Thêm cột và gán «đã ký» cho biên bản cũ CHỈ lần đầu (cột chưa có): chạy lại tệp này trên máy
-- không được đánh dấu nhầm biên bản mới đang chờ ký.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'acceptance_records' AND column_name = 'signed_at'
  ) THEN
    ALTER TABLE public.acceptance_records
      ADD COLUMN counterpart_signer_name    varchar(128),
      ADD COLUMN counterpart_signer_title   varchar(128),
      ADD COLUMN nvg_signature_path         text,
      ADD COLUMN counterpart_signature_path text,
      ADD COLUMN paper_scan_path            text,
      ADD COLUMN signed_at                  timestamptz,
      ADD COLUMN signed_by                  uuid REFERENCES public.users(id) ON DELETE SET NULL,
      ADD COLUMN billing_recorded_at        timestamptz,
      ADD COLUMN billing_recorded_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
      ADD COLUMN billing_note               text;

    -- Biên bản cũ: coi như đã ký VÀ Kế toán đã xử lý (đã được báo lúc lập theo luồng cũ).
    UPDATE public.acceptance_records
       SET signed_at = accepted_at,
           signed_by = accepted_by,
           billing_recorded_at = CASE WHEN acceptance_type IN ('khach_hang', 'thau_phu') THEN accepted_at END,
           billing_note = CASE WHEN acceptance_type IN ('khach_hang', 'thau_phu')
                               THEN 'Lập trước khi có ký trên hệ thống (0192).' END
     WHERE status = 'da_nghiem_thu' AND accepted_at IS NOT NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.acceptance_records.signed_at IS
  'Hai bên đã ký (vẽ trên điện thoại hoặc bản giấy quét) — 2D, 0192. Biên bản lập trước 0192: = accepted_at, không có tệp.';
COMMENT ON COLUMN public.acceptance_records.billing_recorded_at IS
  'Kế toán đã ghi nhận công nợ / đề nghị thanh toán từ biên bản này.';

-- Phần ký chỉ ghi qua `sign_acceptance_record`, ghi một lần; phần Kế toán chỉ qua
-- `mark_acceptance_billed`. Bảng không cho trình duyệt sửa biên bản đã nghiệm thu (RLS 0035), trigger
-- này giữ cho chính các hàm cũng không ghi đè chữ ký.
CREATE OR REPLACE FUNCTION public.acceptance_records_signature_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL AND (
       NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.signed_by IS DISTINCT FROM OLD.signed_by
    OR NEW.counterpart_signer_name IS DISTINCT FROM OLD.counterpart_signer_name
    OR NEW.counterpart_signer_title IS DISTINCT FROM OLD.counterpart_signer_title
    OR NEW.nvg_signature_path IS DISTINCT FROM OLD.nvg_signature_path
    OR NEW.counterpart_signature_path IS DISTINCT FROM OLD.counterpart_signature_path
    OR NEW.paper_scan_path IS DISTINCT FROM OLD.paper_scan_path) THEN
    RAISE EXCEPTION 'Biên bản đã ký hai bên — không sửa được phần ký. Cần đính chính thì lập biên bản mới.';
  END IF;
  IF OLD.billing_recorded_at IS NOT NULL AND (
       NEW.billing_recorded_at IS DISTINCT FROM OLD.billing_recorded_at
    OR NEW.billing_recorded_by IS DISTINCT FROM OLD.billing_recorded_by) THEN
    RAISE EXCEPTION 'Kế toán đã ghi nhận biên bản này.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acceptance_records_signature_frozen ON public.acceptance_records;
CREATE TRIGGER acceptance_records_signature_frozen
  BEFORE UPDATE ON public.acceptance_records
  FOR EACH ROW EXECUTE FUNCTION public.acceptance_records_signature_frozen();

-- ----------------------------------------------------------------------------
-- Ai đọc được biên bản: người xem công trình (Mẫu A + E), HOẶC Kế toán của pháp nhân khi biên
-- bản đã ký và là căn cứ thu / trả tiền. Một hàm cho cả kho tệp lẫn hàm xem biên bản.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rls_acceptance_readable(p_acceptance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.acceptance_records a
     WHERE a.id = p_acceptance_id AND a.deleted_at IS NULL
       AND (
         public.rls_site_readable(a.construction_site_id)
         OR (a.signed_at IS NOT NULL
             AND a.acceptance_type IN ('khach_hang', 'thau_phu')
             AND a.status = 'da_nghiem_thu'
             AND public.rls_company_access(a.company_id)
             AND public.auth_can_view_module('KT'))
       )
  );
$$;

REVOKE ALL ON FUNCTION public.rls_acceptance_readable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_acceptance_readable(uuid) TO authenticated;

-- Kho chữ ký / bản giấy: `<công trình>/<biên bản>/<loại>-<uuid>.<đuôi>`. Tải lên khi biên bản
-- còn chưa ký và người tải được ghi công trình; không xoá (bằng chứng).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('acceptance-docs', 'acceptance-docs', false, 20971520,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.rls_acceptance_signable(p_site_id uuid, p_acceptance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only()
     AND public.auth_can_edit_module('TC')
     AND public.rls_site_writable(p_site_id)
     AND EXISTS (
       SELECT 1 FROM public.acceptance_records a
        WHERE a.id = p_acceptance_id AND a.construction_site_id = p_site_id
          AND a.deleted_at IS NULL AND a.status = 'da_nghiem_thu' AND a.signed_at IS NULL
     );
$$;

REVOKE ALL ON FUNCTION public.rls_acceptance_signable(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_acceptance_signable(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS acceptance_docs_select ON storage.objects;
CREATE POLICY acceptance_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'acceptance-docs'
         AND public.rls_acceptance_readable(public.try_uuid((storage.foldername(name))[2])));

DROP POLICY IF EXISTS acceptance_docs_insert ON storage.objects;
CREATE POLICY acceptance_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'acceptance-docs'
              AND public.rls_acceptance_signable(
                    public.try_uuid((storage.foldername(name))[1]),
                    public.try_uuid((storage.foldername(name))[2])));

-- ----------------------------------------------------------------------------
-- record_acceptance — chép NGUYÊN VĂN bản 0136, chỉ bỏ thông báo Kế toán lúc lập: Kế toán được
-- báo khi biên bản đã ký (`sign_acceptance_record`).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_acceptance(p_site_id uuid, p_acceptance_type acceptance_type, p_stage_name text, p_value bigint DEFAULT NULL::bigint, p_scope text DEFAULT NULL::text, p_accepted_date date DEFAULT NULL::date, p_subcontractor_id uuid DEFAULT NULL::uuid, p_counterpart_signed_by text DEFAULT NULL::text, p_outstanding_issues text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_user         uuid := public.auth_user_id();
  s              record;
  v_company_code text;
  v_id           uuid;
  v_code         text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = p_site_id AND deleted_at IS NULL;

  -- 0136: thêm Mẫu E — trước đây chỉ huy trưởng lập được biên bản cho công trình KHÔNG được
  -- giao, vì hàm chỉ kiểm pháp nhân và quyền sửa phân hệ.
  IF NOT FOUND OR NOT public.rls_company_access(s.company_id)
     OR NOT public.auth_can_edit_module('TC')
     OR NOT public.rls_site_in_scope(p_site_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên công trình này.';
  END IF;

  IF s.stage = 'hoan_thanh' THEN
    RAISE EXCEPTION 'Công trình đã kết thúc, không lập thêm biên bản nghiệm thu.';
  END IF;

  IF COALESCE(btrim(p_stage_name), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập giai đoạn hoặc hạng mục được nghiệm thu.';
  END IF;

  IF p_acceptance_type = 'thau_phu' AND p_subcontractor_id IS NULL THEN
    RAISE EXCEPTION 'Vui lòng chọn tổ đội được nghiệm thu.';
  END IF;

  IF p_subcontractor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subcontractors sc
     WHERE sc.id = p_subcontractor_id AND sc.construction_site_id = p_site_id
       AND sc.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tổ đội được chọn không thuộc công trình này.';
  END IF;

  IF p_acceptance_type = 'khach_hang' AND COALESCE(p_value, 0) <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị khối lượng được nghiệm thu để Kế toán có căn cứ thu tiền.';
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = s.company_id;
  v_code := public.next_record_code(v_company_code, 'NT');

  INSERT INTO public.acceptance_records (
    company_id, construction_site_id, code, acceptance_type, status,
    stage_name, scope, value, subcontractor_id,
    accepted_date, accepted_at, accepted_by, counterpart_signed_by, outstanding_issues
  )
  VALUES (
    s.company_id, p_site_id, v_code, p_acceptance_type, 'da_nghiem_thu',
    btrim(p_stage_name), p_scope, p_value, p_subcontractor_id,
    COALESCE(p_accepted_date, current_date), now(), v_user,
    NULLIF(btrim(COALESCE(p_counterpart_signed_by, '')), ''), p_outstanding_issues
  )
  RETURNING id INTO v_id;

  -- 0192: thông báo Kế toán chuyển sang lúc hai bên ký (`sign_acceptance_record`).

  RETURN v_id;
END;
$fn$;

-- ----------------------------------------------------------------------------
-- Ký hai bên
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sign_acceptance_record(
  p_acceptance_id              uuid,
  p_counterpart_name           text,
  p_counterpart_title          text DEFAULT NULL,
  p_nvg_signature_path         text DEFAULT NULL,
  p_counterpart_signature_path text DEFAULT NULL,
  p_paper_scan_path            text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  a        record;
  s        record;
  v_prefix text;
  v_path   text;
  v_now    timestamptz := now();
  v_msg    text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO a FROM public.acceptance_records WHERE id = p_acceptance_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_acceptance_signable(a.construction_site_id, a.id) THEN
    IF FOUND AND a.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Biên bản này đã ký hai bên.';
    END IF;
    RAISE EXCEPTION 'Chỉ người được ghi công trình này ký được biên bản, và chỉ khi biên bản chưa hủy, chưa ký.';
  END IF;

  IF COALESCE(btrim(p_counterpart_name), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập họ tên người ký phía bên kia.';
  END IF;
  IF p_paper_scan_path IS NULL
     AND (p_nvg_signature_path IS NULL OR p_counterpart_signature_path IS NULL) THEN
    RAISE EXCEPTION 'Cần đủ hai chữ ký, hoặc bản giấy đã ký quét lên.';
  END IF;

  v_prefix := a.construction_site_id::text || '/' || a.id::text || '/';
  FOREACH v_path IN ARRAY ARRAY[p_nvg_signature_path, p_counterpart_signature_path, p_paper_scan_path] LOOP
    CONTINUE WHEN v_path IS NULL;
    IF left(v_path, length(v_prefix)) <> v_prefix
       OR NOT EXISTS (SELECT 1 FROM storage.objects o
                       WHERE o.bucket_id = 'acceptance-docs' AND o.name = v_path) THEN
      RAISE EXCEPTION 'Tệp chữ ký / bản giấy không thuộc biên bản này — ký lại.';
    END IF;
  END LOOP;

  UPDATE public.acceptance_records
     SET counterpart_signer_name    = btrim(p_counterpart_name),
         counterpart_signer_title   = NULLIF(btrim(COALESCE(p_counterpart_title, '')), ''),
         nvg_signature_path         = p_nvg_signature_path,
         counterpart_signature_path = p_counterpart_signature_path,
         paper_scan_path            = p_paper_scan_path,
         signed_at                  = v_now,
         signed_by                  = v_user
   WHERE id = a.id;

  IF a.acceptance_type IN ('khach_hang', 'thau_phu') THEN
    SELECT * INTO s FROM public.construction_sites WHERE id = a.construction_site_id;
    v_msg := CASE a.acceptance_type
      WHEN 'khach_hang' THEN format(
        'Biên bản %s — công trình %s nghiệm thu %s với chủ đầu tư đã ký hai bên, giá trị %s đồng — căn cứ thu tiền theo hợp đồng.',
        a.code, s.code, a.stage_name, to_char(a.value, 'FM999,999,999,999'))
      ELSE format(
        'Biên bản %s — công trình %s nghiệm thu tổ đội (%s) đã ký hai bên%s — căn cứ thanh toán cho tổ đội.',
        a.code, s.code, a.stage_name,
        CASE WHEN a.value IS NOT NULL THEN ', giá trị ' || to_char(a.value, 'FM999,999,999,999') || ' đồng' ELSE '' END)
    END;
    PERFORM public.create_notification(
      recipient.id, a.company_id, 'acceptance_billing', v_msg,
      'acceptance_records', a.id, '/kt/bien-ban-nghiem-thu'
    )
    FROM (
      SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = a.company_id OR r.sees_all_companies)
        AND r.code IN ('KT', 'CFO')
    ) recipient;
  END IF;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.sign_acceptance_record(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_acceptance_record(uuid, text, text, text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- Nội dung biên bản để in / xem — dùng chung cho Thi công và Kế toán.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acceptance_document(p_acceptance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.rls_acceptance_readable(p_acceptance_id) THEN
    RAISE EXCEPTION 'Không có quyền xem biên bản này.';
  END IF;
  SELECT jsonb_build_object(
    'id', a.id, 'code', a.code, 'acceptance_type', a.acceptance_type, 'status', a.status,
    'stage_name', a.stage_name, 'scope', a.scope, 'value', a.value,
    'accepted_date', a.accepted_date, 'outstanding_issues', a.outstanding_issues,
    'counterpart_signed_by', a.counterpart_signed_by,
    'counterpart_signer_name', a.counterpart_signer_name,
    'counterpart_signer_title', a.counterpart_signer_title,
    'nvg_signature_path', a.nvg_signature_path,
    'counterpart_signature_path', a.counterpart_signature_path,
    'paper_scan_path', a.paper_scan_path,
    'signed_at', a.signed_at,
    'signer_name', (SELECT full_name FROM public.users WHERE id = a.signed_by),
    'accepted_by_name', (SELECT full_name FROM public.users WHERE id = a.accepted_by),
    'billing_recorded_at', a.billing_recorded_at, 'billing_note', a.billing_note,
    'site', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name,
                               'address', s.site_address),
    'company', jsonb_build_object('code', c.code, 'name', c.legal_name),
    'subcontractor_name', (SELECT sc.name FROM public.subcontractors sc WHERE sc.id = a.subcontractor_id),
    'checklist', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'label', r.item_label, 'result', r.result, 'note', r.note,
               'photos', COALESCE(array_length(r.photo_paths, 1), 0))
             ORDER BY r.position)
        FROM public.acceptance_checklist_results r WHERE r.acceptance_record_id = a.id), '[]'::jsonb)
  )
  INTO v
  FROM public.acceptance_records a
  JOIN public.construction_sites s ON s.id = a.construction_site_id
  JOIN public.companies c ON c.id = a.company_id
  WHERE a.id = p_acceptance_id;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.acceptance_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acceptance_document(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Danh sách của Kế toán + đánh dấu đã ghi nhận
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kt_signed_acceptances()
RETURNS TABLE (
  id uuid, company_id uuid, code text, acceptance_type public.acceptance_type,
  stage_name text, value bigint, accepted_date date, signed_at timestamptz,
  counterpart_name text, site_id uuid, site_code text, site_name text,
  subcontractor_name text, billing_recorded_at timestamptz, billing_recorded_by_name text,
  billing_note text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.company_id, a.code::text, a.acceptance_type, a.stage_name, a.value,
         a.accepted_date, a.signed_at,
         COALESCE(a.counterpart_signer_name, a.counterpart_signed_by)::text,
         s.id, s.code::text, s.name::text,
         (SELECT sc.name FROM public.subcontractors sc WHERE sc.id = a.subcontractor_id)::text,
         a.billing_recorded_at,
         (SELECT full_name FROM public.users WHERE id = a.billing_recorded_by)::text,
         a.billing_note
    FROM public.acceptance_records a
    JOIN public.construction_sites s ON s.id = a.construction_site_id
   WHERE a.deleted_at IS NULL
     AND a.status = 'da_nghiem_thu'
     AND a.signed_at IS NOT NULL
     AND a.acceptance_type IN ('khach_hang', 'thau_phu')
     AND public.auth_can_view_module('KT')
     AND public.rls_company_access(a.company_id)
   ORDER BY (a.billing_recorded_at IS NOT NULL), a.signed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.kt_signed_acceptances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kt_signed_acceptances() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_acceptance_billed(p_acceptance_id uuid, p_note text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  v_now  timestamptz := now();
BEGIN
  SELECT * INTO a FROM public.acceptance_records WHERE id = p_acceptance_id AND deleted_at IS NULL;
  IF v_user IS NULL OR NOT FOUND OR public.auth_is_read_only()
     OR NOT public.auth_can_edit_module('KT') OR NOT public.rls_company_access(a.company_id) THEN
    RAISE EXCEPTION 'Chỉ Kế toán của pháp nhân ghi nhận được biên bản này.';
  END IF;
  IF a.signed_at IS NULL OR a.status <> 'da_nghiem_thu'
     OR a.acceptance_type NOT IN ('khach_hang', 'thau_phu') THEN
    RAISE EXCEPTION 'Chỉ ghi nhận biên bản nghiệm thu khách hàng / tổ đội đã ký hai bên.';
  END IF;
  IF a.billing_recorded_at IS NOT NULL THEN
    RAISE EXCEPTION 'Biên bản này đã được ghi nhận.';
  END IF;
  UPDATE public.acceptance_records
     SET billing_recorded_at = v_now, billing_recorded_by = v_user,
         billing_note = NULLIF(btrim(COALESCE(p_note, '')), '')
   WHERE id = a.id;
  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_acceptance_billed(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_acceptance_billed(uuid, text) TO authenticated;
