-- ============================================================================
-- BC-02 — «Lãi/lỗ thực tế» ghi doanh thu theo giá trị ĐÃ NGHIỆM THU với chủ đầu tư.
--
-- Haan chốt 30/09/2026. Công thức cũ (0056): lãi thực tế = TOÀN BỘ giá trị hợp đồng − chi phí đã
-- phát sinh. Một nhà xưởng hợp đồng 6,5 tỷ mới xong phần móng hiện «lãi thực tế 5,66 tỷ» — con
-- số ghi nhận doanh thu của cả công trình ngay từ ngày đầu.
--
-- Nay: lãi thực tế = doanh thu đã nghiệm thu với chủ đầu tư (biên bản chưa huỷ) − chi phí đã
-- phát sinh. Thêm cột `accepted_revenue` để màn hình hiện rõ doanh thu đó. `profit_forecast`
-- (lãi dự kiến khi hoàn thành) giữ nguyên: nó vốn tính trên cả hợp đồng và đúng như vậy.
--
-- Đổi kiểu trả về nên phải DROP rồi tạo lại; quyền cấp khôi phục đúng như trước (0056).
-- ============================================================================

DROP FUNCTION public.project_profit_loss(uuid);

CREATE OR REPLACE FUNCTION public.project_profit_loss(p_company_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(construction_site_id uuid, company_id uuid, site_code text, site_name text, stage site_stage, contract_id uuid, contract_value bigint, collected_amount bigint, accepted_revenue bigint, budgeted_cost bigint, actual_cost bigint, committed_cost bigint, target_profit bigint, profit_actual bigint, profit_forecast bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
  WITH accepted AS (
    -- Doanh thu TỚI HIỆN TẠI = giá trị đã nghiệm thu với chủ đầu tư, biên bản chưa huỷ — căn
    -- cứ thu tiền theo hợp đồng (TC-04), cũng là cách ngành xây dựng ghi doanh thu theo khối
    -- lượng hoàn thành. Nghiệm thu nội bộ và với tổ đội không phải doanh thu.
    SELECT ar.construction_site_id AS site_id, COALESCE(SUM(ar.value), 0)::bigint AS revenue
    FROM public.acceptance_records ar
    WHERE ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu'
    GROUP BY ar.construction_site_id
  ),
  costs AS (
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
    c.value, c.collected_amount, COALESCE(accepted.revenue, 0),
    COALESCE(costs.budgeted_cost, 0), COALESCE(costs.actual_cost, 0), COALESCE(costs.committed_cost, 0),
    COALESCE(costs.target_profit, 0),
    -- 0137: trước đây lấy TOÀN BỘ giá trị hợp đồng trừ chi phí đã phát sinh — công trình mới
    -- xong móng đã hiện lãi gần bằng cả hợp đồng. Nay: đã nghiệm thu − đã phát sinh.
    CASE WHEN c.value IS NULL THEN NULL
         ELSE COALESCE(accepted.revenue, 0) - COALESCE(costs.actual_cost, 0) END,
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
    LEFT JOIN accepted ON accepted.site_id = s.id
   WHERE s.deleted_at IS NULL
     AND public.rls_company_access(s.company_id)
     AND (p_company_id IS NULL OR s.company_id = p_company_id)
   ORDER BY s.created_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.project_profit_loss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_profit_loss(uuid) TO authenticated;

COMMENT ON FUNCTION public.project_profit_loss(uuid) IS
  'BC-02 — lãi/lỗ dự kiến và thực tế theo công trình. Thực tế = đã nghiệm thu với chủ đầu tư − chi phí đã phát sinh (0137). Mẫu D (profit) — chỉ TGĐ/CFO/BGĐ/ADMIN.';
