-- ============================================================================
-- Rà soát phân quyền — Đợt 3 tiếp tục (BUILD_PLAN 4B). Tìm thêm một chỗ rò rỉ giá vốn,
-- cùng lớp lỗi (b) đã định nghĩa: hàm trả cột nhạy cảm mà không qua `rls_sees_sensitive`.
--
-- `sites_budget_status()` (0058_bc_over_budget.sql, BC-05 "vượt ngân sách" trên Dashboard +
-- cột/bộ lọc Ngân sách ở danh sách Công trình) trả THẲNG `budgeted_cost`/`actual_cost`/
-- `committed_cost` — tiền thật — cho BẤT KỲ ai có quyền `BC: VIEW`. Đó là gần như mọi vai
-- trò, kể cả **Kinh doanh (KD)** — vai trò KHÔNG nằm trong danh sách được xem giá vốn
-- (CLAUDE.md 6.6: "TGĐ/CFO/BGĐ/Admin + DA_DT, TKE, MH"). Migration gốc có ghi chú CỐ Ý không
-- chặn bằng `rls_sees_sensitive('cost')` — nhưng lý do ghi ở đó là "đây là tín hiệu RỦI RO,
-- không phải giá vốn", trong khi ba cột trả về LÀ giá vốn nguyên vẹn (đơn vị đồng), không
-- phải một cờ rủi ro đã được làm mờ. `web/src/hooks/use-reports.ts` còn ghi nhầm "Không phải
-- dữ liệu nhạy cảm" — sai, đây đúng là Mẫu D.
--
-- Hai điều khoản của BUILD_PLAN 0058 CÓ chủ đích, không đổi ở đây: gate gọi hàm vẫn là
-- `auth_can_view_module('BC')` (không phải 'TC') — thẻ "vượt ngân sách" vẫn phải hiện được
-- cho "gần như mọi vai trò xem BC", kể cả người không có quyền TC (đúng nguyên văn comment cũ).
-- Tách hai việc: TÍNH TRẠNG (health: trong ngân sách/sắp vượt/vượt) là tín hiệu rủi ro, hợp
-- lý để hiện rộng — GIỮ NGUYÊN hiện cho mọi vai trò xem BC. SỐ TIỀN THẬT thì không — chỉ trả
-- cho vai trò xem được giá vốn (`rls_sees_sensitive('cost')`) hoặc chính người phụ trách thi
-- công (`auth_can_edit_module('TC')`, cùng điều kiện `construction_budget_status` dùng sau
-- 0069, vì chỉ huy trưởng cần theo dõi ngân sách công trình mình quản lý).
--
-- Cách làm: thêm cột `health` tính SẴN trong SQL (đúng công thức `summarizeBudget()` ở
-- `shared/src/tc.ts` — ngưỡng 90% khớp `BUDGET_WARNING_THRESHOLD`, xem ghi chú tương tự ở
-- `budget_overrun_alert`/0035), để màn hình không cần các cột tiền mới tính được badge. Ba
-- cột tiền trả NULL cho vai trò không đủ quyền — `EntityTable`/`BudgetPanel` không đọc thẳng
-- ba cột này ở hai màn hình đang gọi hàm (`dashboard.tsx`, `tc/site-list.tsx`, xác nhận bằng
-- grep), chỉ dùng `health`, nên đổi sang NULL không cần sửa gì thêm ở hai nơi đó ngoài việc
-- ngừng tự tính `summarizeBudget()` từ ba cột (đổi sang đọc thẳng `health`).
-- ============================================================================

-- Thêm cột `health` vào tập cột trả về — Postgres không cho `CREATE OR REPLACE` đổi tập cột
-- của một hàm đã tồn tại (cùng lý do 0060_bc_sales_effectiveness_by_company.sql phải DROP).
DROP FUNCTION IF EXISTS public.sites_budget_status(uuid);

CREATE FUNCTION public.sites_budget_status(p_company_id uuid DEFAULT NULL)
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
  -- (0064_lock_down_inventory_cost.sql). Không ghi cho vai trò không đủ quyền: họ không nhận
  -- được số tiền thật nào để mà cần truy vết.
  IF v_cost_sighted THEN
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
  'BC-05 — trạng thái ngân sách (health) của TOÀN BỘ công trình trong một lượt gọi, hiện cho mọi vai trò xem BC. Số tiền thật (budgeted/actual/committed) chỉ trả cho vai trò xem giá vốn hoặc chính Thi công — Mẫu D (0071).';

-- `DROP FUNCTION` xoá luôn quyền EXECUTE cũ đã cấp cho `authenticated`, và kể từ
-- 0062_lock_down_anon_functions.sql, hàm MỚI tạo không còn tự động mở cho PUBLIC (mặc định
-- Postgres đã bị đổi bằng `ALTER DEFAULT PRIVILEGES`) — phải cấp lại tường minh.
REVOKE ALL ON FUNCTION public.sites_budget_status(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.sites_budget_status(uuid) TO authenticated;
