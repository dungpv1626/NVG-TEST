-- ============================================================================
-- Module BC — BC-07: "Báo cáo tổng hợp toàn NVG nhưng vẫn truy ngược được xuống từng pháp
-- nhân" (PRD Mục 7). BC-02 (lãi/lỗ) đã làm việc này từ 0056 — mỗi dòng vốn là MỘT công
-- trình nên chỉ cần thêm cột "Pháp nhân" ở màn hình, không phải đổi hàm CSDL.
--
-- BC-03 (hiệu quả kinh doanh) thì KHÁC: hai hàm nguồn `opportunity_funnel_by_source` và
-- `bidding_outcomes` (0059_bc_sales_effectiveness.sql) đã GỘP theo (nguồn khách, giai đoạn)
-- / (giai đoạn, nguyên nhân trượt) ngay ở CSDL — khi gọi với `p_company_id = NULL` ("Toàn
-- NVG"), dữ liệu của cả ba pháp nhân bị TRỘN LẪN vào cùng một dòng trước khi ra tới trình
-- duyệt, không có cách nào tách lại. Migration này thêm `company_id` vào cả hai hàm — CHỈ
-- thêm một cột vào nhóm gộp (`GROUP BY`), không đổi ý nghĩa số liệu đang có, và trình duyệt
-- tự quyết định có tách theo pháp nhân hay gộp lại tuỳ màn hình (`useCompanyScope`).
--
-- `CREATE OR REPLACE FUNCTION` KHÔNG áp dụng được ở đây — Postgres không cho đổi tập cột
-- của `RETURNS TABLE` bằng REPLACE, phải DROP rồi CREATE lại.
-- ============================================================================

DROP FUNCTION IF EXISTS public.opportunity_funnel_by_source(uuid);

CREATE FUNCTION public.opportunity_funnel_by_source(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  company_id       uuid,
  source           text,
  stage            opportunity_stage,
  opportunity_count bigint,
  estimated_value  bigint
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
  SELECT
    o.company_id,
    -- NULL (chưa từng ghi nguồn) tách riêng khỏi 'Khác' (đã chọn "Khác" một cách có chủ ý) —
    -- BC-06 yêu cầu phân biệt "chưa đo được" với "đã đo, kết quả là không xác định".
    COALESCE(c.source, 'Chưa ghi nhận')::text,
    o.stage,
    count(*)::bigint,
    COALESCE(sum(o.estimated_value), 0)::bigint
    FROM public.opportunities o
    JOIN public.customers c ON c.id = o.customer_id
   WHERE o.deleted_at IS NULL
     AND public.rls_company_access(o.company_id)
     AND (p_company_id IS NULL OR o.company_id = p_company_id)
   GROUP BY o.company_id, COALESCE(c.source, 'Chưa ghi nhận'), o.stage;
END;
$$;

COMMENT ON FUNCTION public.opportunity_funnel_by_source(uuid) IS
  'BC-03/BC-07 — số cơ hội và giá trị ước tính gộp theo (pháp nhân, nguồn khách, giai đoạn pipeline hiện tại). Trình duyệt tự pivot ra bảng nguồn khách, phễu bán hàng, và bảng theo pháp nhân khi xem "Toàn NVG".';

DROP FUNCTION IF EXISTS public.bidding_outcomes(uuid);

CREATE FUNCTION public.bidding_outcomes(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  company_id        uuid,
  stage             bidding_stage,
  lost_reason       text,
  bidding_count     bigint
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
  SELECT b.company_id, b.stage, b.lost_reason, count(*)::bigint
    FROM public.bidding_projects b
   WHERE b.deleted_at IS NULL
     AND b.stage IN ('trung_thau', 'truot_thau')
     AND public.rls_company_access(b.company_id)
     AND (p_company_id IS NULL OR b.company_id = p_company_id)
   GROUP BY b.company_id, b.stage, b.lost_reason;
END;
$$;

COMMENT ON FUNCTION public.bidding_outcomes(uuid) IS
  'BC-03/BC-07 — số gói thầu đã CÓ KẾT QUẢ (trúng/trượt), gộp theo pháp nhân, giai đoạn và nguyên nhân trượt. Trình duyệt tự tính tỷ lệ trúng thầu bằng conversionRate() và xếp hạng nguyên nhân trượt, tách theo pháp nhân khi xem "Toàn NVG".';
