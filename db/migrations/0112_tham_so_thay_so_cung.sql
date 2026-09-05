/**
 * Bốn con số hết nằm cứng trong mã nguồn — đọc từ `system_parameters` (NEN-12).
 *
 * Ba trong bốn là SUY LUẬN của đội triển khai, không phải quy chế của NVG, và cả hai phiếu
 * khảo sát cuối (Xưởng, Công trường) đều KHÔNG xác nhận con số nào:
 *
 *   · cửa sổ sửa nhật ký 24 giờ    — chỉ được ủng hộ gián tiếp (báo cáo ngày gửi trước 20 giờ)
 *   · ngưỡng cảnh báo ngân sách 90%
 *   · thang đánh giá tổ đội 1–5
 *
 * Con số thứ tư — 8 giờ một ngày công — có căn cứ pháp lý (Bộ luật Lao động 2019 Điều 105),
 * nhưng phiếu Xưởng để trống cả hình thức chấm công lẫn cách tính lương nên chưa loại trừ được
 * ca 12 giờ. Nó cũng phải cấu hình được.
 *
 * ## Vì sao `coalesce` nằm ở nơi GỌI, không nằm trong hàm đọc
 *
 * `system_parameter_number()` trả NULL khi chưa cấu hình và CỐ Ý không tự dựng lại giá trị mặc
 * định (bài học 0046: mặc định dựng lại trong SQL khiến việc xoá hết cấu hình trông như thể cấu
 * hình vẫn còn hiệu lực). Đổi lại, mỗi nơi gọi phải viết `coalesce(..., <giá trị hiện tại>)` —
 * hơi lặp, nhưng người đọc hàm thấy ngay hệ thống chạy bằng số nào khi bảng tham số trống.
 *
 * ## Đổi tham số KHÔNG hồi tố
 *
 * Ba tham số đầu là ngưỡng ĐÁNH GIÁ, tính lại mỗi lần đọc nên đổi là áp dụng ngay — đúng ý
 * NEN-12, vì chúng không nằm trên chứng từ nào. `hours_per_workday` thì khác: `timesheets` LƯU
 * `workdays` đã quy đổi, nên kỳ chấm công ĐÃ CHỐT giữ nguyên số công cũ. Đó là hành vi đúng
 * ("không làm thay đổi hồi tố các chứng từ đã phát hành"), không phải thiếu sót.
 *
 * ## Thang điểm tổ đội: bỏ CHECK, chuyển sang trigger
 *
 * `subcontractors_rating_range` (0034) chốt cứng 1–5 vào lược đồ. Thang là quy ước đánh giá,
 * không phải cấu trúc dữ liệu — nhưng phải nói rõ một điều mà cấu hình được dễ khiến người ta
 * quên: ĐỔI THANG KHÔNG QUY ĐỔI LẠI ĐIỂM ĐÃ CHẤM. Một điểm 4 chấm theo thang 5 vẫn là số 4 sau
 * khi đổi sang thang 10. Vì vậy trigger chỉ chặn điểm mới vượt thang hiện hành, không đụng dữ
 * liệu cũ, và mô tả tham số ở 0111 ghi thẳng điều này.
 */

-- ---------------------------------------------------------------------------
-- 1. Cửa sổ sửa nhật ký công trường (0035)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.site_logs_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_window integer;
BEGIN
  -- Hàm nghiệp vụ SECURITY DEFINER đi qua tự do (cùng cách nhận biết ở migration 0028).
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF public.auth_has_role('ADMIN') THEN
    RETURN NEW;
  END IF;

  IF OLD.logged_by IS DISTINCT FROM public.auth_user_id() THEN
    RAISE EXCEPTION
      'Không sửa được nhật ký do người khác ghi. Ghi một mục nhật ký mới để bổ sung thông tin.';
  END IF;

  -- Cửa sổ sửa đọc từ tham số hệ thống (NEN-12). `coalesce` đặt ở ĐÂY chứ không giấu trong hàm
  -- đọc, để giá trị dự phòng nhìn thấy được ngay tại chỗ dùng — xem mục 4 của migration 0111.
  v_window := COALESCE(public.system_parameter_number('site_log_edit_window_hours')::integer, 24);

  IF OLD.created_at < now() - make_interval(hours => v_window) THEN
    RAISE EXCEPTION
      'Không sửa được nhật ký đã ghi quá % giờ. Ghi một mục nhật ký mới để bổ sung hoặc đính chính.', v_window;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.site_logs_edit_window() IS
  'Nhật ký công trường chỉ người ghi sửa được, trong cửa sổ đọc từ tham số site_log_edit_window_hours (NEN-12) — để nhật ký còn giá trị truy vết (TC-08).';

-- ---------------------------------------------------------------------------
-- 2. Cảnh báo sắp vượt ngân sách (0067)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.budget_overrun_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s          record;
  v_before   numeric;
  v_after    numeric;
  -- Ngưỡng cảnh báo đọc từ tham số hệ thống (NEN-12); 0.9 là giá trị dự phòng khi chưa cấu hình.
  v_threshold constant numeric := COALESCE(public.system_parameter_number('budget_warning_threshold'), 0.9);
BEGIN
  IF NEW.construction_site_id IS NULL OR NEW.budgeted_amount IS NULL OR NEW.budgeted_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_before := (COALESCE(OLD.actual_amount, 0) + COALESCE(OLD.committed_amount, 0))::numeric
              / NEW.budgeted_amount;
  v_after  := (COALESCE(NEW.actual_amount, 0) + COALESCE(NEW.committed_amount, 0))::numeric
              / NEW.budgeted_amount;

  IF v_before >= v_threshold OR v_after < v_threshold THEN
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = NEW.construction_site_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_notification(
    recipient.id, s.company_id, 'budget_exceeded',
    format('Công trình %s: mã chi phí %s đã dùng %s%% ngân sách (gồm cả phần đã cam kết).',
           s.code, NEW.cost_code, round(v_after * 100)),
    'construction_sites', s.id,
    format('/tc/cong-trinh/%s?tab=ngan-sach', s.id)
  )
  FROM (
    SELECT DISTINCT u.id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (uc.company_id = s.company_id OR r.sees_all_companies)
      AND (r.code IN ('TC', 'CFO', 'TGD') OR u.id = s.responsible_user_id)
  ) recipient;

  RETURN NEW;
END;
$$;
-- ---------------------------------------------------------------------------
-- 3. Bảng tình trạng ngân sách nhiều công trình (0073)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sites_budget_status(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  construction_site_id uuid,
  company_id            uuid,
  site_code             text,
  site_name             text,
  stage                 site_stage,
  budgeted_cost         bigint,
  actual_cost           bigint,
  committed_cost        bigint,
  health                text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold numeric := COALESCE(public.system_parameter_number('budget_warning_threshold'), 0.9);
  v_user         uuid := public.auth_user_id();
  v_cost_sighted boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.auth_can_view_module('BC') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không xem được báo cáo điều hành.';
  END IF;

  v_cost_sighted := public.rls_sees_sensitive('cost') OR public.auth_can_edit_module('TC');

  -- Một lượt gọi = một lượt xem giá vốn tổng hợp nhiều công trình cùng lúc, không phải một
  -- dòng mỗi công trình — cùng cách `inventory_items_cost` ghi MỘT log cho cả đợt xem
  -- (0064_lock_down_inventory_cost.sql). Chỉ ghi cho vai trò xem giá vốn thật sự
  -- (`rls_sees_sensitive('cost')`) — KHÔNG ghi khi chỉ huy trưởng xem đúng công trình mình
  -- quản lý, cùng quyết định 0069 đã đặt cho `construction_budget_status` và cùng lý do: hàm
  -- này gọi ở MỌI lượt mở Dashboard/danh sách Công trình, ghi log mọi lượt sẽ phình bảng rất
  -- nhanh cho một thao tác vận hành bình thường (0073).
  IF public.rls_sees_sensitive('cost') THEN
    PERFORM public.log_sensitive_access('cost', 'construction_sites', NULL, 'view', p_company_id);
  END IF;

  RETURN QUERY
  WITH costs AS (
    SELECT b.construction_site_id AS site_id,
           COALESCE(SUM(b.budgeted_amount)  FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS budgeted_cost,
           COALESCE(SUM(b.actual_amount)    FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS actual_cost,
           COALESCE(SUM(b.committed_amount) FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS committed_cost
      FROM public.project_budgets b
     WHERE b.deleted_at IS NULL
       AND b.construction_site_id IS NOT NULL
     GROUP BY b.construction_site_id
  ),
  joined AS (
    SELECT
      s.id AS construction_site_id, s.company_id, s.code::text AS site_code, s.name AS site_name,
      s.stage, s.created_at,
      COALESCE(costs.budgeted_cost, 0)  AS budgeted_cost,
      COALESCE(costs.actual_cost, 0)    AS actual_cost,
      COALESCE(costs.committed_cost, 0) AS committed_cost
      FROM public.construction_sites s
      LEFT JOIN costs ON costs.site_id = s.id
     WHERE s.deleted_at IS NULL
       AND public.rls_company_access(s.company_id)
       AND (p_company_id IS NULL OR s.company_id = p_company_id)
  )
  SELECT
    j.construction_site_id, j.company_id, j.site_code, j.site_name, j.stage,
    CASE WHEN v_cost_sighted THEN j.budgeted_cost  END,
    CASE WHEN v_cost_sighted THEN j.actual_cost    END,
    CASE WHEN v_cost_sighted THEN j.committed_cost END,
    -- Ngưỡng đọc từ tham số `budget_warning_threshold` (NEN-12). `BUDGET_WARNING_THRESHOLD`
    -- ở shared/src/tc.ts nay chỉ là giá trị dự phòng của giao diện khi chưa cấu hình.
    (CASE
       WHEN j.budgeted_cost > 0
            AND (j.actual_cost + j.committed_cost) > j.budgeted_cost THEN 'vuot_ngan_sach'
       WHEN j.budgeted_cost > 0
            AND (j.actual_cost + j.committed_cost)::numeric / j.budgeted_cost >= v_threshold THEN 'sap_vuot'
       WHEN j.budgeted_cost = 0 AND (j.actual_cost + j.committed_cost) > 0 THEN 'vuot_ngan_sach'
       ELSE 'trong_ngan_sach'
     END)
    FROM joined j
   ORDER BY j.created_at DESC;
END;
$$;
-- ---------------------------------------------------------------------------
-- 4. Quy giờ ra ngày công khi chốt kỳ chấm công (0049)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consolidate_timesheets(
  p_company_id uuid,
  p_year integer,
  p_month integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v_hours_per_day numeric := COALESCE(public.system_parameter_number('hours_per_workday'), 8);
  v_periods  integer;
  v_pending  integer;
  v_closed   integer;
  v_rows     integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT (public.rls_company_access(p_company_id) AND public.rls_hr_manages()) THEN
    RAISE EXCEPTION 'Chỉ Phòng Hành chính – Nhân sự chốt được kỳ chấm công.';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status <> 'da_xac_nhan'),
         count(*) FILTER (WHERE status = 'da_chot')
    INTO v_periods, v_pending, v_closed
    FROM public.timesheet_periods
   WHERE company_id = p_company_id AND year = p_year AND month = p_month;

  IF v_periods = 0 THEN
    RAISE EXCEPTION 'Chưa có kỳ chấm công nào của tháng %/%.', p_month, p_year;
  END IF;

  IF v_closed > 0 THEN
    RAISE EXCEPTION 'Kỳ chấm công tháng %/% đã chốt. Điều chỉnh sau khi chốt phải nêu lý do và người phê duyệt.', p_month, p_year;
  END IF;

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Còn % khối chưa được trưởng đơn vị xác nhận. Chốt được khi cả ba khối đã xác nhận.', v_pending;
  END IF;

  /*
   * Quy giờ ra ngày công: số giờ một công đọc từ tham số `hours_per_workday` (NEN-12), dự
   * phòng 8 giờ theo Bộ luật Lao động 2019 Điều 105. Ngày công tác không có
   * giờ ghi nhận thì tính đủ một công — người đi công tác không bấm máy chấm công được, và
   * trừ công của họ là sai bản chất.
   */
  INSERT INTO public.timesheets (
    company_id, timesheet_period_id, employee_id, year, month, source_type,
    workdays, worked_hours, overtime_hours, leave_days, unpaid_absence_days,
    holiday_days, business_trip_days, output_quantity,
    bonus_amount, penalty_amount, closed_at, created_by, updated_by
  )
  SELECT
    p.company_id, p.id, e.employee_id, p.year, p.month, p.source_type,
    round(e.worked_hours / v_hours_per_day, 2),
    e.worked_hours,
    e.overtime_hours,
    e.leave_days,
    e.unpaid_absence_days,
    e.holiday_days,
    e.business_trip_days,
    e.output_quantity,
    COALESCE(adj.bonus, 0),
    COALESCE(adj.penalty, 0),
    now(), v_user, v_user
  FROM public.timesheet_periods p
  JOIN LATERAL (
    SELECT
      te.employee_id,
      COALESCE(SUM(
        CASE te.kind
          WHEN 'lam_viec' THEN COALESCE(te.hours, 0)
          WHEN 'cong_tac' THEN COALESCE(te.hours, v_hours_per_day)
          ELSE 0
        END
      ), 0)::numeric                                                        AS worked_hours,
      COALESCE(SUM(COALESCE(te.overtime_hours, 0)), 0)::numeric             AS overtime_hours,
      COALESCE(SUM(COALESCE(te.output_quantity, 0)), 0)::numeric            AS output_quantity,
      count(*) FILTER (WHERE te.kind = 'nghi_co_phep')::int                 AS leave_days,
      count(*) FILTER (WHERE te.kind = 'nghi_khong_phep')::int              AS unpaid_absence_days,
      count(*) FILTER (WHERE te.kind = 'nghi_le')::int                      AS holiday_days,
      count(*) FILTER (WHERE te.kind = 'cong_tac')::int                     AS business_trip_days
    FROM public.timesheet_entries te
    WHERE te.timesheet_period_id = p.id
    GROUP BY te.employee_id
  ) e ON true
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'thuong'), 0)::bigint AS bonus,
      COALESCE(SUM(pa.amount) FILTER (WHERE pa.kind = 'phat'), 0)::bigint   AS penalty
    FROM public.payroll_adjustments pa
    WHERE pa.employee_id = e.employee_id
      AND pa.year = p.year AND pa.month = p.month
      AND pa.deleted_at IS NULL
  ) adj ON true
  WHERE p.company_id = p_company_id AND p.year = p_year AND p.month = p_month;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.timesheet_periods
     SET status = 'da_chot', closed_by = v_user, closed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE company_id = p_company_id AND year = p_year AND month = p_month;

  -- Kế toán là người chờ số liệu này để tính lương (NS-05) — báo đúng họ, không báo cả công ty.
  PERFORM public.create_notification(
    u.id, p_company_id, 'timesheet_closed',
    format('Bảng chấm công tháng %s/%s đã chốt, %s người. Số liệu sẵn sàng để tính lương.',
           p_month, p_year, v_rows),
    'timesheet_periods', NULL, '/ns/cham-cong'
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = p_company_id
    AND r.code = 'KT';

  RETURN v_rows;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Thang đánh giá tổ đội
-- ---------------------------------------------------------------------------

ALTER TABLE public.subcontractors DROP CONSTRAINT IF EXISTS subcontractors_rating_range;

-- Biên dưới và tính nguyên vẫn là ràng buộc CẤU TRÚC: không thang đánh giá nào bắt đầu từ 0 hay
-- số âm. Chỉ biên TRÊN mới là quy ước cấu hình được.
ALTER TABLE public.subcontractors
  ADD CONSTRAINT subcontractors_rating_positive
  CHECK (quality_rating IS NULL OR quality_rating >= 1);

CREATE OR REPLACE FUNCTION public.subcontractor_rating_scale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  IF NEW.quality_rating IS NULL THEN
    RETURN NEW;
  END IF;

  v_max := COALESCE(public.system_parameter_number('crew_rating_scale_max')::integer, 5);

  IF NEW.quality_rating > v_max THEN
    RAISE EXCEPTION 'Điểm đánh giá tổ đội tối đa là %. Sửa thang điểm trong Quản trị hệ thống nếu cần thang rộng hơn.', v_max;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER subcontractors_rating_scale
  BEFORE INSERT OR UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.subcontractor_rating_scale();

COMMENT ON FUNCTION public.subcontractor_rating_scale() IS
  'Chặn điểm đánh giá tổ đội vượt thang cấu hình (crew_rating_scale_max, NEN-12). Đổi thang KHÔNG quy đổi lại điểm đã chấm.';
