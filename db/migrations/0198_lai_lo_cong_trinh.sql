-- ============================================================================
-- Đợt 3 — 3D: lãi / lỗ từng công trình — SỐ QUẢN TRỊ (doc/KE_HOACH_LAM_HO.md).
--
-- Báo cáo BC-02 (`project_profit_loss`, 0056 → 0138) lấy doanh thu hợp đồng chỉ từ giá trị ký ban
-- đầu: phát sinh đã duyệt (`contract_amendments.value_change`) không vào — công trình có 300 triệu
-- phát sinh hiện lỗ dự kiến dù thực tế lãi. Và báo cáo dừng ở con số, không cho thấy chứng từ nào
-- tạo ra chi phí.
--
-- Hai hàm MỚI (không sửa `project_profit_loss` — báo cáo BC giữ nguyên):
--   site_profit_loss_list(company)  mỗi công trình một dòng:
--       doanh thu hợp đồng = giá trị ký + phát sinh đã duyệt / đã thực hiện
--       đã nghiệm thu (biên bản chủ đầu tư), đã thu
--       chi phí thực tế / đã cam kết / ngân sách (project_budgets — cập nhật theo chứng từ chi,
--       mua hàng, xuất kho như nay)
--       lãi / lỗ đến nay = đã nghiệm thu − chi phí thực tế (cùng cách Haan chốt ở 0137)
--       lãi / lỗ dự kiến khi xong = doanh thu hợp đồng − (thực tế + cam kết + ngân sách còn lại)
--   site_profit_loss_detail(site)   thêm: phát sinh từng dòng, chi phí theo nhóm, chứng từ chi đã
--                                   phân bổ cho công trình (truy ngược).
-- Công trình CHƯA có dòng ngân sách / chi phí nào thì hai cột lãi / lỗ là NULL («Chưa đủ dữ
-- liệu»): đã nghiệm thu − 0 đồng chi phí là con số đẹp giả, không phải lãi (CLAUDE.md 5.2).
-- Đây là số QUẢN TRỊ, không thay sổ kế toán (KT-08) — màn hình ghi rõ.
--
-- Mẫu D: chặn CẢ HÀM bằng `rls_sees_sensitive('profit')` (Ban Giám đốc, Tài chính, KSNB), ghi
-- `sensitive_access_logs` một lần mỗi lượt xem. Không khai STABLE vì có ghi nhật ký (xem 0056).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.site_profit_guard(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  IF NOT public.rls_sees_sensitive('profit') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem lãi / lỗ. Ban Giám đốc, Giám đốc Tài chính và Kiểm soát nội bộ xem được.';
  END IF;
  IF p_company_id IS NOT NULL AND NOT public.rls_company_access(p_company_id) THEN
    RAISE EXCEPTION 'Không có quyền xem pháp nhân này.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.site_profit_guard(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.site_profit_loss_list(uuid);
CREATE OR REPLACE FUNCTION public.site_profit_loss_list(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  construction_site_id uuid,
  company_id           uuid,
  site_code            text,
  site_name            text,
  stage                text,
  contract_id          uuid,
  contract_code        text,
  contract_value       bigint,
  amendments_value     bigint,
  revenue_contract     bigint,
  accepted_revenue     bigint,
  collected_amount     bigint,
  budgeted_cost        bigint,
  actual_cost          bigint,
  committed_cost       bigint,
  profit_to_date       bigint,
  profit_forecast      bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.site_profit_guard(p_company_id);
  PERFORM public.log_sensitive_access('profit', 'site_profit_loss_list', NULL, 'view', p_company_id);

  RETURN QUERY
  WITH accepted AS (
    SELECT ar.construction_site_id AS site_id, COALESCE(SUM(ar.value), 0)::bigint AS revenue
      FROM public.acceptance_records ar
     WHERE ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu' AND ar.deleted_at IS NULL
     GROUP BY ar.construction_site_id
  ),
  amend AS (
    SELECT a.contract_id, COALESCE(SUM(a.value_change), 0)::bigint AS total
      FROM public.contract_amendments a
     WHERE a.deleted_at IS NULL AND a.stage IN ('da_duyet', 'da_thuc_hien')
     GROUP BY a.contract_id
  ),
  costs AS (
    SELECT b.construction_site_id AS site_id,
           COALESCE(SUM(b.budgeted_amount)  FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS budgeted,
           COALESCE(SUM(b.actual_amount)    FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS actual,
           COALESCE(SUM(b.committed_amount) FILTER (WHERE b.cost_group <> 'loi_nhuan'), 0)::bigint AS committed
      FROM public.project_budgets b
     WHERE b.deleted_at IS NULL AND b.construction_site_id IS NOT NULL
     GROUP BY b.construction_site_id
  )
  SELECT s.id, s.company_id, s.code::text, s.name, s.stage::text, c.id, c.code::text,
         c.value, COALESCE(amend.total, 0),
         CASE WHEN c.value IS NULL THEN NULL ELSE c.value + COALESCE(amend.total, 0) END,
         COALESCE(accepted.revenue, 0), c.collected_amount,
         COALESCE(costs.budgeted, 0), COALESCE(costs.actual, 0), COALESCE(costs.committed, 0),
         CASE WHEN c.value IS NULL OR costs.site_id IS NULL THEN NULL
              ELSE COALESCE(accepted.revenue, 0) - COALESCE(costs.actual, 0) END,
         CASE WHEN c.value IS NULL OR costs.site_id IS NULL THEN NULL
              ELSE c.value + COALESCE(amend.total, 0) - (
                COALESCE(costs.actual, 0) + COALESCE(costs.committed, 0)
                + GREATEST(COALESCE(costs.budgeted, 0) - COALESCE(costs.actual, 0) - COALESCE(costs.committed, 0), 0)
              ) END
    FROM public.construction_sites s
    LEFT JOIN public.contracts c ON c.id = s.contract_id AND c.deleted_at IS NULL
    LEFT JOIN amend ON amend.contract_id = c.id
    LEFT JOIN accepted ON accepted.site_id = s.id
    LEFT JOIN costs ON costs.site_id = s.id
   WHERE s.deleted_at IS NULL
     AND public.rls_company_access(s.company_id)
     AND (p_company_id IS NULL OR s.company_id = p_company_id)
   ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.site_profit_loss_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_profit_loss_list(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.site_profit_loss_detail(uuid);
CREATE OR REPLACE FUNCTION public.site_profit_loss_detail(p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  v jsonb;
BEGIN
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    PERFORM public.site_profit_guard(NULL);
    RAISE EXCEPTION 'Không tìm thấy công trình.';
  END IF;
  PERFORM public.site_profit_guard(s.company_id);
  PERFORM public.log_sensitive_access('profit', 'construction_sites', s.id, 'view', s.company_id);

  SELECT jsonb_build_object(
    'amendments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'code', a.code, 'title', a.title, 'stage', a.stage,
               'value_change', a.value_change, 'is_emergency', a.is_emergency,
               'approved_at', a.approved_at, 'executed_at', a.executed_at)
             ORDER BY a.requested_at)
        FROM public.contract_amendments a
       WHERE a.contract_id = s.contract_id AND a.deleted_at IS NULL
         AND a.stage IN ('da_duyet', 'da_thuc_hien')), '[]'::jsonb),
    'cost_groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'cost_group', g.cost_group, 'budgeted', g.budgeted, 'actual', g.actual,
               'committed', g.committed) ORDER BY g.actual DESC)
        FROM (SELECT b.cost_group::text AS cost_group,
                     SUM(b.budgeted_amount)::bigint AS budgeted,
                     SUM(b.actual_amount)::bigint AS actual,
                     SUM(b.committed_amount)::bigint AS committed
                FROM public.project_budgets b
               WHERE b.construction_site_id = s.id AND b.deleted_at IS NULL AND b.cost_group <> 'loi_nhuan'
               GROUP BY b.cost_group) g), '[]'::jsonb),
    'cost_documents', COALESCE((
      SELECT jsonb_agg(d ORDER BY d->>'paid_date' DESC NULLS LAST)
        FROM (SELECT jsonb_build_object(
                       'payment_request_id', pr.id, 'code', pr.code, 'title', pr.title,
                       'paid_date', pr.paid_date, 'stage', pr.stage,
                       'cost_group', al.cost_group, 'amount', al.amount) AS d
                FROM public.payment_request_allocations al
                JOIN public.payment_requests pr ON pr.id = al.payment_request_id
               WHERE al.construction_site_id = s.id AND pr.deleted_at IS NULL
                 AND pr.stage IN ('da_chi', 'da_hach_toan')
               LIMIT 300) docs), '[]'::jsonb),
    'acceptances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'code', ar.code, 'stage_name', ar.stage_name, 'value', ar.value,
               'accepted_date', ar.accepted_date, 'signed', ar.signed_at IS NOT NULL)
             ORDER BY ar.accepted_date)
        FROM public.acceptance_records ar
       WHERE ar.construction_site_id = s.id AND ar.acceptance_type = 'khach_hang'
         AND ar.status = 'da_nghiem_thu' AND ar.deleted_at IS NULL), '[]'::jsonb)
  ) INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.site_profit_loss_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_profit_loss_detail(uuid) TO authenticated;
