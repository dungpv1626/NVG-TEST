-- ============================================================================
-- Đợt 2 — 2F: phiếu bảo hành (doc/KE_HOACH_LAM_HO.md).
--
-- Khách báo → người tiếp nhận nói (ghi âm → chữ) hoặc gõ nhanh thành phiếu, kèm ảnh hiện trạng →
-- phiếu TỰ GIAO cho chỉ huy trưởng của công trình (đổi được), có HẠN xử lý → người phụ trách bắt
-- đầu xử lý, sửa xong chụp ảnh xác nhận → hoàn tất.
--
-- Trước 0193: `warranty_claims` có sẵn nhưng giao diện đổi trạng thái tự do bằng ô chọn (nhảy
-- thẳng «Đã xử lý» không cần kết quả, không ảnh), không giao ai, không hạn, không ảnh.
--
--   · cột mới: mã phiếu (BH), hạn xử lý, đoạn ghi âm + bản chép chữ (kho `site-log-audio`,
--     cùng thư mục công trình — 0190), ảnh trước / sau (kho `construction-photos`,
--     `<công trình>/bao-hanh/…` — 0135), người hoàn tất, người phía khách xác nhận;
--   · hạn xử lý: người tiếp nhận đặt; để trống thì lấy ngày tiếp nhận + tham số
--     `tc.warranty_response_days` — tham số để TRỐNG (NVG chưa quyết, CLAUDE.md 5.2) thì phiếu
--     không có hạn, không bịa;
--   · trigger: giao mặc định, báo người được giao, chặn đóng phiếu thiếu kết quả / ảnh sau sửa,
--     từ chối phải có lý do, máy ghi giờ + người hoàn tất (trình duyệt không tự khai);
--   · phiếu đã đóng (đã xử lý / từ chối) không sửa được nữa.
-- ============================================================================

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS code                 varchar(40),
  ADD COLUMN IF NOT EXISTS due_date             date,
  ADD COLUMN IF NOT EXISTS voice_path           text,
  ADD COLUMN IF NOT EXISTS voice_transcript     text,
  ADD COLUMN IF NOT EXISTS before_photo_paths   text[],
  ADD COLUMN IF NOT EXISTS after_photo_paths    text[],
  ADD COLUMN IF NOT EXISTS started_at           timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_confirmed_by varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS warranty_claims_code_unique
  ON public.warranty_claims (code) WHERE code IS NOT NULL;

COMMENT ON COLUMN public.warranty_claims.due_date IS
  'Hạn xử lý phiếu (2F, 0193): người tiếp nhận đặt, hoặc ngày tiếp nhận + tc.warranty_response_days nếu NVG đã đặt tham số.';
COMMENT ON COLUMN public.warranty_claims.after_photo_paths IS
  'Ảnh xác nhận đã sửa xong — bắt buộc khi hoàn tất phiếu (`construction-photos`, `<công trình>/bao-hanh/…`).';

INSERT INTO public.system_parameters (param_key, scope_type, value, label, description)
SELECT 'tc.warranty_response_days', 'global', NULL, 'Hạn xử lý phiếu bảo hành (ngày)',
       'Số ngày từ lúc tiếp nhận tới hạn xử lý, khi người tiếp nhận không tự đặt hạn. Để trống = phiếu không có hạn mặc định.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_parameters p
  WHERE p.param_key = 'tc.warranty_response_days' AND p.scope_type = 'global'
);

-- ----------------------------------------------------------------------------
-- Trước khi ghi: mã, giao mặc định, hạn, kiểm tệp, quy tắc đóng phiếu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.warranty_claims_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w       record;
  s       record;
  v_days  numeric;
  v_path  text;
  v_user  uuid := public.auth_user_id();
BEGIN
  SELECT * INTO w FROM public.warranties WHERE id = NEW.warranty_id;
  SELECT * INTO s FROM public.construction_sites WHERE id = w.construction_site_id;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('da_xu_ly', 'tu_choi') AND v_user IS NOT NULL THEN
    RAISE EXCEPTION 'Phiếu bảo hành đã đóng — không sửa được. Khách báo lại thì lập phiếu mới.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.code IS NULL THEN
      NEW.code := public.issue_record_code(
        (SELECT c.code FROM public.companies c WHERE c.id = NEW.company_id), 'BH');
    END IF;
    IF NEW.assigned_user_id IS NULL THEN
      NEW.assigned_user_id := s.responsible_user_id;
    END IF;
    IF NEW.due_date IS NULL THEN
      v_days := public.system_parameter_number('tc.warranty_response_days');
      IF v_days IS NOT NULL AND v_days > 0 THEN
        NEW.due_date := NEW.reported_date + v_days::int;
      END IF;
    END IF;
    -- Phiếu mới luôn bắt đầu ở «Tiếp nhận» — trình duyệt không lập phiếu đã xong sẵn.
    IF v_user IS NOT NULL THEN
      NEW.status := 'tiep_nhan';
      NEW.resolved_at := NULL;
      NEW.resolved_by := NULL;
      NEW.started_at := NULL;
    END IF;
  ELSE
    IF NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'Mã phiếu bảo hành không đổi được.';
    END IF;
  END IF;

  -- Tệp phải nằm dưới thư mục của đúng công trình (như nhật ký — 0135, 0190).
  IF NEW.voice_path IS NOT NULL
     AND left(NEW.voice_path, length(s.id::text) + 1) <> s.id::text || '/' THEN
    RAISE EXCEPTION 'Đoạn ghi âm không thuộc công trình của phiếu bảo hành này.';
  END IF;
  FOREACH v_path IN ARRAY COALESCE(NEW.before_photo_paths, '{}') || COALESCE(NEW.after_photo_paths, '{}') LOOP
    IF v_path IS NULL OR left(v_path, length(s.id::text) + 1) <> s.id::text || '/' THEN
      RAISE EXCEPTION 'Ảnh đính kèm không thuộc công trình của phiếu bảo hành này.';
    END IF;
  END LOOP;

  IF v_user IS NOT NULL AND NEW.assigned_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.site_commander_candidates(NEW.company_id) c
                      WHERE c.id = NEW.assigned_user_id) THEN
    RAISE EXCEPTION 'Người phụ trách phiếu bảo hành phải là người của Thi công.';
  END IF;

  -- Chuyển trạng thái: máy ghi giờ và người; đóng phiếu phải đủ căn cứ.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'tiep_nhan' THEN
      RAISE EXCEPTION 'Phiếu đã nhận xử lý không quay lại «Tiếp nhận» được.';
    END IF;
    IF NEW.status = 'dang_xu_ly' THEN
      NEW.started_at := now();
    END IF;
    IF NEW.status = 'da_xu_ly' THEN
      IF COALESCE(btrim(NEW.resolution), '') = '' THEN
        RAISE EXCEPTION 'Ghi kết quả xử lý trước khi hoàn tất phiếu.';
      END IF;
      IF COALESCE(array_length(NEW.after_photo_paths, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Chụp ít nhất một ảnh sau khi sửa xong để xác nhận.';
      END IF;
    END IF;
    IF NEW.status = 'tu_choi' AND COALESCE(btrim(NEW.resolution), '') = '' THEN
      RAISE EXCEPTION 'Ghi lý do từ chối bảo hành (ví dụ: ngoài phạm vi, do người dùng).';
    END IF;
    IF NEW.status IN ('da_xu_ly', 'tu_choi') THEN
      NEW.resolved_at := now();
      NEW.resolved_by := v_user;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND v_user IS NOT NULL THEN
    NEW.resolved_at := OLD.resolved_at;
    NEW.resolved_by := OLD.resolved_by;
    NEW.started_at := OLD.started_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warranty_claims_guard ON public.warranty_claims;
CREATE TRIGGER warranty_claims_guard
  BEFORE INSERT OR UPDATE ON public.warranty_claims
  FOR EACH ROW EXECUTE FUNCTION public.warranty_claims_guard();

-- Báo người được giao (lúc lập và lúc đổi người) — không báo chính người tự giao cho mình.
CREATE OR REPLACE FUNCTION public.warranty_claims_notify_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  IF NEW.assigned_user_id IS NULL
     OR NEW.assigned_user_id IS NOT DISTINCT FROM public.auth_user_id()
     OR (TG_OP = 'UPDATE' AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id) THEN
    RETURN NEW;
  END IF;
  SELECT cs.* INTO s FROM public.construction_sites cs
    JOIN public.warranties w ON w.construction_site_id = cs.id
   WHERE w.id = NEW.warranty_id;
  PERFORM public.create_notification(
    NEW.assigned_user_id, NEW.company_id, 'warranty_claim_assigned',
    format('Phiếu bảo hành %s — công trình %s: %s%s', NEW.code, s.code,
           left(NEW.description, 120),
           CASE WHEN NEW.due_date IS NOT NULL THEN ' · hạn ' || to_char(NEW.due_date, 'DD/MM/YYYY') ELSE '' END),
    'warranty_claims', NEW.id,
    format('/tc/cong-trinh/%s?tab=bao-hanh', s.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warranty_claims_notify_assignee ON public.warranty_claims;
CREATE TRIGGER warranty_claims_notify_assignee
  AFTER INSERT OR UPDATE OF assigned_user_id ON public.warranty_claims
  FOR EACH ROW EXECUTE FUNCTION public.warranty_claims_notify_assignee();

-- ----------------------------------------------------------------------------
-- Bảng theo dõi của Trưởng phòng (0191) thêm phiếu bảo hành đang mở / quá hạn, và hiện cả
-- công trình đang bảo hành khi còn phiếu mở (công trình bảo hành không có mốc, không nhật ký).
-- Đổi kiểu trả về → DROP rồi tạo lại.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tc_site_board();
CREATE FUNCTION public.tc_site_board()
RETURNS TABLE (
  site_id                  uuid,
  company_id               uuid,
  code                     text,
  name                     text,
  stage                    public.site_stage,
  responsible_user_id      uuid,
  responsible_name         text,
  planned_end_date         date,
  site_overdue             boolean,
  milestones_total         integer,
  milestones_passed        integer,
  current_milestone_label  text,
  current_milestone_status public.site_milestone_status,
  current_milestone_due    date,
  current_milestone_overdue boolean,
  milestones_waiting_check integer,
  last_log_date            date,
  logged_today             boolean,
  open_requests            integer,
  overdue_requests         integer,
  open_warranty_claims     integer,
  overdue_warranty_claims  integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
  ),
  wc AS (
    SELECT w.construction_site_id,
           count(*)::int AS open_n,
           count(*) FILTER (WHERE c.due_date < (SELECT d FROM today))::int AS overdue_n
      FROM public.warranty_claims c
      JOIN public.warranties w ON w.id = c.warranty_id
     WHERE c.deleted_at IS NULL AND c.status IN ('tiep_nhan', 'dang_xu_ly')
     GROUP BY w.construction_site_id
  ),
  sites AS (
    SELECT s.*
      FROM public.construction_sites s
     WHERE s.deleted_at IS NULL
       AND (s.stage IN ('chuan_bi', 'dang_thi_cong', 'nghiem_thu', 'tam_dung')
            OR (s.stage = 'bao_hanh' AND EXISTS (SELECT 1 FROM wc WHERE wc.construction_site_id = s.id)))
  ),
  ms AS (
    SELECT m.construction_site_id,
           count(*)::int AS total,
           count(*) FILTER (WHERE m.status = 'dat')::int AS passed,
           count(*) FILTER (WHERE m.status = 'cho_ky_thuat')::int AS waiting
      FROM public.site_milestones m
     WHERE m.construction_site_id IN (SELECT id FROM sites)
     GROUP BY m.construction_site_id
  ),
  cur AS (
    SELECT DISTINCT ON (m.construction_site_id)
           m.construction_site_id, m.label, m.status, m.planned_end_date
      FROM public.site_milestones m
     WHERE m.construction_site_id IN (SELECT id FROM sites)
       AND m.status <> 'dat'
     ORDER BY m.construction_site_id, m.position
  ),
  logs AS (
    SELECT l.construction_site_id, max(l.log_date) AS last_date
      FROM public.site_logs l
     WHERE l.deleted_at IS NULL
       AND l.construction_site_id IN (SELECT id FROM sites)
     GROUP BY l.construction_site_id
  ),
  req AS (
    SELECT r.site_id,
           count(*)::int AS open_n,
           count(*) FILTER (WHERE r.needed_date < (SELECT d FROM today))::int AS overdue_n
      FROM public.site_request_tracker(NULL, false) r
     WHERE NOT r.is_closed
     GROUP BY r.site_id
  )
  SELECT
    s.id,
    s.company_id,
    s.code::text,
    s.name::text,
    s.stage,
    s.responsible_user_id,
    u.full_name::text,
    s.planned_end_date,
    s.stage NOT IN ('tam_dung', 'bao_hanh') AND s.planned_end_date < (SELECT d FROM today),
    coalesce(ms.total, 0),
    coalesce(ms.passed, 0),
    cur.label,
    cur.status,
    cur.planned_end_date,
    coalesce(cur.planned_end_date < (SELECT d FROM today), false),
    coalesce(ms.waiting, 0),
    logs.last_date,
    coalesce(logs.last_date >= (SELECT d FROM today), false),
    coalesce(req.open_n, 0),
    coalesce(req.overdue_n, 0),
    coalesce(wc.open_n, 0),
    coalesce(wc.overdue_n, 0)
  FROM sites s
  LEFT JOIN public.users u ON u.id = s.responsible_user_id
  LEFT JOIN ms ON ms.construction_site_id = s.id
  LEFT JOIN cur ON cur.construction_site_id = s.id
  LEFT JOIN logs ON logs.construction_site_id = s.id
  LEFT JOIN req ON req.site_id = s.id
  LEFT JOIN wc ON wc.construction_site_id = s.id
  ORDER BY s.code;
$$;

REVOKE ALL ON FUNCTION public.tc_site_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tc_site_board() TO authenticated;

COMMENT ON FUNCTION public.tc_site_board() IS
  'Đợt 2 — 2E/2F: mỗi công trình đang chạy (và công trình bảo hành còn phiếu mở) một dòng — mốc, nhật ký, mốc chờ kiểm, đề nghị, phiếu bảo hành mở / quá hạn. SECURITY INVOKER: RLS quyết phạm vi.';
