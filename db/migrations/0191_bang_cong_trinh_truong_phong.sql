-- ============================================================================
-- Đợt 2 — 2E: bảng công trình của Trưởng phòng Thi công (doc/KE_HOACH_LAM_HO.md).
--
-- Tiêu chí xong của Đợt 2: «Trưởng phòng thấy công trình nào chậm không cần gọi». Mỗi công trình
-- đang chạy (Chuẩn bị / Đang thi công / Nghiệm thu / Tạm dừng) một dòng:
--   · mốc hiện tại (mốc đầu tiên chưa đạt theo thứ tự), đã đạt bao nhiêu / tổng, hạn của mốc;
--   · nhật ký: hôm nay đã ghi chưa, lần ghi gần nhất;
--   · mốc chờ Trưởng phòng / Ban Giám đốc kiểm (lớp 3, 0182);
--   · đề nghị đang mở (vật tư + làm rõ bản vẽ, cùng nguồn `site_request_tracker`), bao nhiêu đã
--     quá ngày cần.
--
-- «Chậm» chỉ tính từ NGÀY ĐÃ KHAI (hạn công trình, hạn mốc, ngày cần của đề nghị) — không tự đặt
-- ngưỡng «bao nhiêu ngày không ghi nhật ký là chậm» (NVG chưa quyết, CLAUDE.md 5.2): bảng hiện
-- lần ghi gần nhất, người xem tự đánh giá.
--
-- SECURITY INVOKER: RLS của construction_sites / site_milestones / site_logs quyết ai thấy công
-- trình nào (Mẫu A + E) — chỉ huy trưởng chỉ thấy công trình được giao, như mọi màn hình khác.
-- `site_request_tracker` vốn SECURITY DEFINER và tự lọc theo quyền đọc.
-- Ngày «hôm nay» theo giờ Việt Nam (như `contractDisplayStatus`).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tc_site_board()
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
  overdue_requests         integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
  ),
  sites AS (
    SELECT s.*
      FROM public.construction_sites s
     WHERE s.deleted_at IS NULL
       AND s.stage IN ('chuan_bi', 'dang_thi_cong', 'nghiem_thu', 'tam_dung')
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
    s.stage <> 'tam_dung' AND s.planned_end_date < (SELECT d FROM today),
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
    coalesce(req.overdue_n, 0)
  FROM sites s
  LEFT JOIN public.users u ON u.id = s.responsible_user_id
  LEFT JOIN ms ON ms.construction_site_id = s.id
  LEFT JOIN cur ON cur.construction_site_id = s.id
  LEFT JOIN logs ON logs.construction_site_id = s.id
  LEFT JOIN req ON req.site_id = s.id
  ORDER BY s.code;
$$;

REVOKE ALL ON FUNCTION public.tc_site_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tc_site_board() TO authenticated;

COMMENT ON FUNCTION public.tc_site_board() IS
  'Đợt 2 — 2E: mỗi công trình đang chạy một dòng — mốc hiện tại, nhật ký hôm nay, mốc chờ kiểm, đề nghị đang mở / quá ngày cần. SECURITY INVOKER: RLS quyết phạm vi.';
