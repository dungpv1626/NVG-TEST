-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `build_budget_lines`
-- (DA-09, chuyển dự toán thành ngân sách thi công) có thể ÂM THẦM BỎ SÓT
-- `overhead_cost`/`contingency_cost`/`profit_amount` của dự toán.
--
-- `COST_GROUPS` (shared/src/da.ts) và dropdown chọn nhóm chi phí ở dòng dự toán
-- (estimate-panel.tsx) cho phép người lập giá gán TRỰC TIẾP 3 nhóm `chi_phi_chung`/
-- `du_phong`/`loi_nhuan` cho một DÒNG dự toán — không chỉ dành riêng cho 3 cột tổng nhập ở
-- `save_estimate_costs`. Khi đó:
--   1. INSERT đầu (gộp theo `estimate_items.cost_group`) đã tạo sẵn một dòng ngân sách với
--      `cost_code = upper('chi_phi_chung') = 'CHI_PHI_CHUNG'` — TRÙNG với mã cố định INSERT
--      thứ hai dùng cho `e.overhead_cost`.
--   2. Điều kiện `NOT EXISTS` ở INSERT thứ hai đúng nghĩa "mã này đã có" → số `overhead_cost`
--      nhập ở màn hình tổng kết dự toán bị BỎ HẲN, không cộng vào, không báo lỗi, không log.
-- Đây không phải double-count (NOT EXISTS đã chặn đúng việc đó) mà là "cái nào tồn tại trước
-- thì cái kia biến mất" — ngân sách thi công thiếu tiền chi phí chung/dự phòng/lợi nhuận mà
-- không ai biết cho tới khi đối chiếu bằng tay.
--
-- Vá: khi mã trùng đã tồn tại (từ dòng dự toán dùng đúng 1 trong 3 nhóm này), CỘNG DỒN số
-- tiền tổng của dự toán vào thay vì bỏ qua — đảm bảo `overhead_cost`/`contingency_cost`/
-- `profit_amount` không bao giờ bị mất, bất kể người lập dự toán có dùng 3 nhóm này ở dòng
-- chi tiết hay không. Không thay đổi việc dòng dự toán chi tiết có được phép dùng 3 nhóm này
-- hay không — đó là câu hỏi riêng cho tầng dự toán/frontend, không phải phạm vi vá lỗi này.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.build_budget_lines(
  p_bidding_project_id uuid,
  p_design_project_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  e         record;
  v_rows    integer;
BEGIN
  IF num_nonnulls(p_bidding_project_id, p_design_project_id) <> 1 THEN
    RAISE EXCEPTION 'Ngân sách phải thuộc đúng một hồ sơ: gói thầu hoặc dự án thiết kế.';
  END IF;

  SELECT company_id INTO v_company
    FROM public.bidding_projects
   WHERE id = p_bidding_project_id AND deleted_at IS NULL;

  IF v_company IS NULL THEN
    SELECT company_id INTO v_company
      FROM public.design_projects
     WHERE id = p_design_project_id AND deleted_at IS NULL;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn của ngân sách.';
  END IF;

  -- Chỉ bản dự toán ĐANG HIỆU LỰC và ĐÃ DUYỆT mới thành ngân sách (DA-09, PRD Mục 7).
  SELECT * INTO e FROM public.estimates
   WHERE (p_bidding_project_id IS NOT NULL AND bidding_project_id = p_bidding_project_id
          OR p_design_project_id IS NOT NULL AND design_project_id = p_design_project_id)
     AND is_current_version AND deleted_at IS NULL AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chưa có bản dự toán được phê duyệt để chuyển thành ngân sách.';
  END IF;

  -- Chi phí trực tiếp: gộp theo nhóm từ các dòng dự toán, giữ nguyên cách phân nhóm của
  -- người lập giá thay vì tự chia lại.
  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, design_project_id, estimate_id,
    cost_group, cost_code, name, budgeted_amount
  )
  SELECT v_company, p_bidding_project_id, p_design_project_id, e.id, i.cost_group,
         upper(i.cost_group::text),
         initcap(replace(i.cost_group::text, '_', ' ')),
         sum(i.amount)
    FROM public.estimate_items i
   WHERE i.estimate_id = e.id AND i.deleted_at IS NULL
   GROUP BY i.cost_group;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Các khoản không nằm trong dòng chi tiết nhưng DA-09 liệt kê thành mã chi phí riêng. Nếu
  -- mã đã tồn tại (dòng dự toán chi tiết trùng đúng 1 trong 3 nhóm này) thì CỘNG DỒN vào,
  -- không bỏ qua (0080) — tránh mất số overhead_cost/contingency_cost/profit_amount.
  UPDATE public.project_budgets b
     SET budgeted_amount = b.budgeted_amount + g.amount
    FROM (
      VALUES
        ('CHI_PHI_CHUNG', COALESCE(e.overhead_cost, 0)),
        ('DU_PHONG',      COALESCE(e.contingency_cost, 0)),
        ('LOI_NHUAN',     COALESCE(e.profit_amount, 0))
    ) AS g(cost_code, amount)
   WHERE b.cost_code = g.cost_code AND b.deleted_at IS NULL AND g.amount > 0
     AND (b.bidding_project_id IS NOT DISTINCT FROM p_bidding_project_id)
     AND (b.design_project_id  IS NOT DISTINCT FROM p_design_project_id);

  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, design_project_id, estimate_id,
    cost_group, cost_code, name, budgeted_amount
  )
  SELECT v_company, p_bidding_project_id, p_design_project_id, e.id,
         g.cost_group, g.cost_code, g.name, g.amount
    FROM (
      VALUES
        ('chi_phi_chung'::cost_group, 'CHI_PHI_CHUNG', 'Chi phí chung', COALESCE(e.overhead_cost, 0)),
        ('du_phong'::cost_group,      'DU_PHONG',      'Dự phòng rủi ro', COALESCE(e.contingency_cost, 0)),
        ('loi_nhuan'::cost_group,     'LOI_NHUAN',     'Lợi nhuận mục tiêu', COALESCE(e.profit_amount, 0))
    ) AS g(cost_group, cost_code, name, amount)
   WHERE g.amount > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.project_budgets b
       WHERE b.cost_code = g.cost_code AND b.deleted_at IS NULL
         AND (b.bidding_project_id IS NOT DISTINCT FROM p_bidding_project_id)
         AND (b.design_project_id  IS NOT DISTINCT FROM p_design_project_id)
     );

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.build_budget_lines(uuid, uuid) IS
  'Chuyển dự toán đã duyệt thành các dòng ngân sách theo nhóm chi phí (DA-09). Chi phí chung/dự phòng/lợi nhuận mục tiêu CỘNG DỒN vào dòng cùng mã nếu đã có từ dòng dự toán chi tiết, không bị bỏ qua (0080).';
