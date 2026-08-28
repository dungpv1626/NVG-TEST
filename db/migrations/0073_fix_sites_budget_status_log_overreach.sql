-- ============================================================================
-- Rà soát trước khi commit (backend-code-review) lộ ra một chỗ 0071 tự mâu thuẫn với chính
-- tiền lệ 0069 đã đặt ra cho cùng một loại quyết định.
--
-- 0069 (`construction_budget_status`) CỐ Ý chỉ ghi `sensitive_access_logs` khi
-- `rls_sees_sensitive('cost')` đúng — KHÔNG ghi khi chỉ huy trưởng (`auth_can_edit_module('TC')`)
-- xem đúng ngân sách công trình mình quản lý, vì đó là thao tác vận hành bình thường họ mở
-- nhiều lần mỗi ngày, ghi log mọi lượt sẽ làm bảng phình rất nhanh (xem ghi chú đầy đủ ở 0069).
--
-- `sites_budget_status` (0071) lẽ ra phải theo đúng tiền lệ đó nhưng lại dùng `v_cost_sighted`
-- (gồm CẢ `auth_can_edit_module('TC')`) làm điều kiện ghi log — và hàm này được gọi ở TẦN SUẤT
-- CAO HƠN `construction_budget_status` nhiều: mọi lượt mở Dashboard (thẻ "vượt ngân sách", BC-05)
-- VÀ mọi lượt mở danh sách Công trình (cột/bộ lọc "Ngân sách") đều gọi, trong khi
-- `construction_budget_status` chỉ gọi khi mở đúng tab Ngân sách của MỘT công trình cụ thể.
-- Giữ nguyên như 0071 nghĩa là mỗi lần chỉ huy trưởng mở Dashboard sẽ ghi thêm một dòng
-- `sensitive_access_logs` — đúng kiểu phình bảng mà 0069 đã tránh cho hàm anh em của nó.
--
-- Sửa: tách hai điều kiện. `v_cost_sighted` (gồm TC) vẫn quyết định AI THẤY SỐ TIỀN THẬT — giữ
-- nguyên, không đổi hành vi hiển thị dữ liệu. Ghi log chỉ còn xét `rls_sees_sensitive('cost')`
-- — đúng khuôn 0069, không ghi cho lượt xem thường ngày của chỉ huy trưởng với công trình mình.
-- ============================================================================

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
    -- Ngưỡng 90% khớp `BUDGET_WARNING_THRESHOLD` (shared/src/tc.ts) — đổi cả hai chỗ nếu sửa.
    (CASE
       WHEN j.budgeted_cost > 0
            AND (j.actual_cost + j.committed_cost) > j.budgeted_cost THEN 'vuot_ngan_sach'
       WHEN j.budgeted_cost > 0
            AND (j.actual_cost + j.committed_cost)::numeric / j.budgeted_cost >= 0.9 THEN 'sap_vuot'
       WHEN j.budgeted_cost = 0 AND (j.actual_cost + j.committed_cost) > 0 THEN 'vuot_ngan_sach'
       ELSE 'trong_ngan_sach'
     END)
    FROM joined j
   ORDER BY j.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.sites_budget_status(uuid) IS
  'BC-05 — trạng thái ngân sách (health) của TOÀN BỘ công trình trong một lượt gọi, hiện cho mọi vai trò xem BC. Số tiền thật (budgeted/actual/committed) chỉ trả cho vai trò xem giá vốn hoặc chính Thi công — Mẫu D (0071). Chỉ ghi sensitive_access_logs cho vai trò xem giá vốn thật sự, không ghi cho lượt xem thường ngày của chỉ huy trưởng — cùng quyết định construction_budget_status (0069/0073).';

REVOKE ALL ON FUNCTION public.sites_budget_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sites_budget_status(uuid) TO authenticated;
