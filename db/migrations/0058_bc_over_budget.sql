-- ============================================================================
-- Module BC mức đầy đủ — BC-05 phần "vượt ngân sách" còn thiếu (BUILD_PLAN 3G).
--
-- Thẻ "Quá hạn" trên Dashboard cần gộp thêm rủi ro "công trình vượt ngân sách" cùng các
-- nguồn đã có (hồ sơ quá hạn theo module, công nợ quá hạn thu, phê duyệt để lâu — xem
-- `web/src/pages/dashboard.tsx`). Cái có sẵn là `construction_budget_status` (0035_tc_rls.sql)
-- — nhưng hàm đó đòi biết TRƯỚC `p_site_id`, nên gọi lặp theo từng công trình để dựng một thẻ
-- tổng trên Dashboard là N+1. Hàm dưới đây tổng hợp CẢ danh sách công trình trong một lượt gọi
-- — cùng khuôn `costs` CTE với `project_profit_loss` (0056_bc_profit_loss.sql): cộng theo
-- `construction_site_id`, loại dòng `cost_group = 'loi_nhuan'` (đó là lợi nhuận mục tiêu, không
-- phải chi phí).
--
-- KHÔNG chặn bằng `rls_sees_sensitive('profit')` như `project_profit_loss`: đây là tín hiệu rủi
-- ro chi phí/tiến độ, không phải con số lợi nhuận, và `construction_budget_status` (per-site,
-- TC-05) cũng không che các cột ngân sách/thực tế/cam kết với vai trò TC bất kỳ — chỉ Mẫu D ở
-- đúng dòng `loi_nhuan`. Chặn bằng `auth_can_view_module('BC')` (không phải 'TC') vì thẻ Dashboard
-- này hiện với "gần như mọi vai trò" có quyền xem BC, kể cả vai trò không có quyền TC.
--
-- Trả về TOÀN BỘ công trình (không chỉ công trình vượt ngân sách) kèm ba số gốc, để trình duyệt
-- tự tính `health` bằng đúng công thức `summarizeBudget()` (shared/src/tc.ts) — cùng ngưỡng 90%
-- dùng ở BudgetPanel (TC-05), không tính lại một công thức khác ở SQL rồi lệch nhau.
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
  committed_cost        bigint
)
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
  )
  SELECT
    s.id, s.company_id, s.code::text, s.name, s.stage,
    COALESCE(costs.budgeted_cost, 0), COALESCE(costs.actual_cost, 0), COALESCE(costs.committed_cost, 0)
    FROM public.construction_sites s
    LEFT JOIN costs ON costs.site_id = s.id
   WHERE s.deleted_at IS NULL
     AND public.rls_company_access(s.company_id)
     AND (p_company_id IS NULL OR s.company_id = p_company_id)
   ORDER BY s.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.sites_budget_status(uuid) IS
  'BC-05 — chi phí ngân sách/thực tế/cam kết của TOÀN BỘ công trình trong một lượt gọi (tránh N+1 so với construction_budget_status theo từng site). Trình duyệt tự tính health bằng summarizeBudget().';
