-- ============================================================================
-- Module BC mức đầy đủ — BC-02: Báo cáo lãi/lỗ theo công trình, truy ngược tới
-- chứng từ gốc (PRD Mục 7, BC-02).
--
-- KHÔNG sinh bảng mới — đúng như ghi chú đầu `db/src/schema/kt.ts`: "KT-07 báo cáo lãi/lỗ …
-- đọc từ project_budgets và các bảng ở đây chứ không sinh thêm bảng". Doanh thu lấy từ
-- `contracts.value`/`collected_amount` (đã có, KT/HD cập nhật khi có chứng từ); giá vốn lấy
-- từ `project_budgets` (đã có, MH/KT cập nhật `actual_amount`/`committed_amount` — xem
-- 0037_mh_rls.sql và 0043_kt_rls.sql). Một dòng "lợi nhuận mục tiêu" (`cost_group = 'loi_nhuan'`)
-- đã tồn tại sẵn trong `project_budgets` từ lúc ngân sách sinh ra ở DA-09/TK-07
-- (0021_da_rls.sql dòng ~934) — đây chính là "lãi/lỗ DỰ KIẾN" theo đúng dự toán đã duyệt,
-- không cần tính lại.
--
-- Ba con số trả về, đúng cách PRD KT-07 diễn đạt ("dự kiến VÀ thực tế"):
--   - `target_profit`   = lãi/lỗ dự kiến LÚC LẬP dự toán (dòng loi_nhuan, không đổi theo thời gian)
--   - `profit_actual`   = doanh thu hợp đồng − chi phí ĐÃ PHÁT SINH tới hiện tại
--   - `profit_forecast` = doanh thu hợp đồng − (đã phát sinh + đã cam kết + phần ngân sách
--                          còn lại CHƯA cam kết, giả định sẽ chi hết theo kế hoạch — đúng
--                          "dự kiến còn phải chi" mà TC-05/PRD KT-07 đã dùng)
-- `profit_actual`/`profit_forecast` để NULL khi công trình chưa gắn hợp đồng có giá trị —
-- 0 và "chưa có doanh thu để tính" là hai điều khác nhau (CLAUDE.md BC-06 "mức độ đầy đủ").
--
-- Cùng khuôn Mẫu D với `estimate_cost_breakdown` (0021_da_rls.sql): chặn CẢ HÀM bằng
-- `rls_sees_sensitive('profit')` thay vì che từng cột — báo cáo này CHỈ có ý nghĩa với lãi/lỗ,
-- không có phần "vô hại" nào để lộ ra cho vai trò khác. Ghi `sensitive_access_logs` MỘT lần
-- mỗi lượt gọi báo cáo (không phải một lần mỗi dòng công trình) — NEN-07 yêu cầu ghi lượt XEM,
-- không yêu cầu ghi từng dòng của một lượt xem.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.project_profit_loss(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  construction_site_id uuid,
  company_id            uuid,
  site_code              text,
  site_name              text,
  stage                  site_stage,
  contract_id            uuid,
  contract_value         bigint,
  collected_amount       bigint,
  budgeted_cost          bigint,
  actual_cost            bigint,
  committed_cost         bigint,
  target_profit          bigint,
  profit_actual          bigint,
  profit_forecast        bigint
)
-- KHÔNG khai STABLE: hàm ghi `sensitive_access_logs` (PERFORM log_sensitive_access), và
-- PostgREST mở giao dịch CHỈ ĐỌC cho hàm STABLE/IMMUTABLE — INSERT bên trong sẽ bị Postgres
-- từ chối bằng lỗi 25006 "cannot execute INSERT in a read-only transaction". Cùng lý do
-- `estimate_cost_breakdown` (0021_da_rls.sql) cũng không khai STABLE.
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.auth_can_view_module('BC') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không xem được báo cáo điều hành.';
  END IF;

  IF NOT public.rls_sees_sensitive('profit') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem lãi/lỗ. Liên hệ Ban Giám đốc hoặc Tài chính nếu cần số liệu này.';
  END IF;

  PERFORM public.log_sensitive_access('profit', 'profit_loss_report', NULL, 'view', p_company_id);

  RETURN QUERY
  WITH costs AS (
    SELECT b.construction_site_id AS site_id,
           COALESCE(SUM(b.budgeted_amount)  FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS budgeted_cost,
           COALESCE(SUM(b.actual_amount)    FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS actual_cost,
           COALESCE(SUM(b.committed_amount) FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS committed_cost,
           COALESCE(SUM(b.budgeted_amount)  FILTER (WHERE b.cost_group = 'loi_nhuan'), 0)::bigint  AS target_profit
      FROM public.project_budgets b
     WHERE b.deleted_at IS NULL
       AND b.construction_site_id IS NOT NULL
     GROUP BY b.construction_site_id
  )
  SELECT
    s.id, s.company_id, s.code::text, s.name, s.stage, s.contract_id,
    c.value, c.collected_amount,
    COALESCE(costs.budgeted_cost, 0), COALESCE(costs.actual_cost, 0), COALESCE(costs.committed_cost, 0),
    COALESCE(costs.target_profit, 0),
    CASE WHEN c.value IS NULL THEN NULL
         ELSE c.value - COALESCE(costs.actual_cost, 0) END,
    CASE WHEN c.value IS NULL THEN NULL
         ELSE c.value - (
           COALESCE(costs.actual_cost, 0) + COALESCE(costs.committed_cost, 0)
           + GREATEST(
               COALESCE(costs.budgeted_cost, 0) - COALESCE(costs.actual_cost, 0)
                 - COALESCE(costs.committed_cost, 0),
               0
             )
         ) END
    FROM public.construction_sites s
    LEFT JOIN public.contracts c ON c.id = s.contract_id
    LEFT JOIN costs ON costs.site_id = s.id
   WHERE s.deleted_at IS NULL
     AND public.rls_company_access(s.company_id)
     AND (p_company_id IS NULL OR s.company_id = p_company_id)
   ORDER BY s.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.project_profit_loss(uuid) IS
  'BC-02 — lãi/lỗ dự kiến và thực tế theo công trình, truy ngược tới project_budgets/contracts. Mẫu D (profit) — chỉ TGĐ/CFO/BGĐ/ADMIN.';
