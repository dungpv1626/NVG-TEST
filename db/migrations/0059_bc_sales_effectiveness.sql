-- ============================================================================
-- Module BC mức đầy đủ — BC-03: Báo cáo hiệu quả kinh doanh (PRD Mục 7, BC-03).
--
-- PRD BC-03 nguyên văn liệt kê BỐN chỉ số: "nguồn khách, tỷ lệ chuyển đổi theo phễu bán hàng,
-- tỷ lệ trúng thầu và nguyên nhân trượt thầu, hiệu suất nhân sự/tổ đội/nhà cung cấp".
--
-- Migration này CHỈ làm BA chỉ số đầu — có nguồn dữ liệu rõ ràng, đã tồn tại sẵn
-- (`customers.source`, `opportunities.stage`, `bidding_projects.stage`/`lost_reason`).
--
-- ⚠️ GIẢ ĐỊNH CHỜ HAAN XÁC NHẬN — "hiệu suất nhân sự/tổ đội/nhà cung cấp" CỐ Ý CHƯA làm:
-- PRD không nói rõ đo bằng gì (số cơ hội/hợp đồng phụ trách? doanh thu quy về từng người?
-- tổ đội thi công lấy từ đâu — TC chưa có bảng phân công tổ đội; nhà cung cấp lấy điểm ở đâu —
-- MH chưa có sổ đánh giá nhà cung cấp). Làm ẩu chỉ số này sẽ tạo ra một "bảng xếp hạng nhân
-- sự" không có cơ sở, đúng thứ CLAUDE.md 5.1 cấm ("KHÔNG để phần mềm tự quyết định... quyết
-- định nhân sự"). Cần hỏi lại Haan trước khi thêm.
--
-- Hai hàm dưới đây theo ĐÚNG khuôn `sites_budget_status` (0058_bc_over_budget.sql): chặn bằng
-- `auth_can_view_module('BC')` — KHÔNG có sensitivity gate nào, vì nguồn khách/giai đoạn
-- pipeline/kết quả đấu thầu không phải dữ liệu Mẫu D (không phải giá vốn/lương/lợi nhuận) —
-- đúng như RLS gốc của `opportunities`/`bidding_projects` (0009/0021) đã không che các cột
-- này với bất kỳ vai trò có quyền xem module nào.
--
-- Cả hai hàm trả về DÒNG THÔ đã gộp nhóm, KHÔNG tính sẵn tỷ lệ phần trăm — trình duyệt tự
-- tính bằng `conversionRate()` (shared/src/bc.ts), đúng nguyên tắc "một công thức duy nhất"
-- đã áp dụng cho `summarizeBudget()`.
-- ============================================================================

-- BC-03 phần 1+2: nguồn khách VÀ phễu bán hàng trong CÙNG một hàm — cả hai đều là phép gộp
-- (nguồn khách, giai đoạn) của đúng một bảng `opportunities`. Trình duyệt tự pivot: gộp theo
-- `source` ra bảng "nguồn khách", gộp theo `stage` ra phễu bán hàng.
--
-- Đơn giản hoá CÓ CHỦ Ý: đếm theo GIAI ĐOẠN HIỆN TẠI của cơ hội, không phải chuyển đổi luỹ
-- tiến qua lịch sử (`opportunity_stage_history` — bảng này đã có sẵn đúng cho việc đó, xem
-- 0008_crm_pipeline.sql). Phễu kiểu "bao nhiêu % cơ hội ở bước N tới được bước N+1" cần dựng
-- trên lịch sử chuyển bước, phức tạp hơn nhiều và PRD CRM-09 gắn nó với báo cáo pipeline
-- (module CRM) chứ không chỉ riêng Dashboard điều hành. Bản snapshot theo giai đoạn hiện tại
-- vẫn cho BGĐ thấy cơ hội đang ứ ở đâu — nâng cấp lên bản lịch sử đầy đủ sau nếu cần.
CREATE OR REPLACE FUNCTION public.opportunity_funnel_by_source(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
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
   GROUP BY COALESCE(c.source, 'Chưa ghi nhận'), o.stage;
END;
$$;

COMMENT ON FUNCTION public.opportunity_funnel_by_source(uuid) IS
  'BC-03 — số cơ hội và giá trị ước tính gộp theo (nguồn khách, giai đoạn pipeline hiện tại). Trình duyệt tự pivot ra bảng nguồn khách và phễu bán hàng.';

-- BC-03 phần 3: tỷ lệ trúng thầu VÀ nguyên nhân trượt thầu trong CÙNG một hàm — chỉ khác nhau
-- ở cách trình duyệt đọc: đếm theo `stage` ra tỷ lệ trúng/trượt, đếm riêng các dòng
-- `stage = 'truot_thau'` theo `lost_reason` ra bảng nguyên nhân. Chỉ lấy hai giai đoạn KẾT
-- THÚC (`trung_thau`/`truot_thau`) — gói thầu đang xử lý dở chưa có kết quả để tính tỷ lệ,
-- gộp vào sẽ làm mẫu số phồng lên và tỷ lệ trúng thầu bị pha loãng sai.
CREATE OR REPLACE FUNCTION public.bidding_outcomes(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
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
  SELECT b.stage, b.lost_reason, count(*)::bigint
    FROM public.bidding_projects b
   WHERE b.deleted_at IS NULL
     AND b.stage IN ('trung_thau', 'truot_thau')
     AND public.rls_company_access(b.company_id)
     AND (p_company_id IS NULL OR b.company_id = p_company_id)
   GROUP BY b.stage, b.lost_reason;
END;
$$;

COMMENT ON FUNCTION public.bidding_outcomes(uuid) IS
  'BC-03 — số gói thầu đã CÓ KẾT QUẢ (trúng/trượt), gộp theo giai đoạn và nguyên nhân trượt. Trình duyệt tự tính tỷ lệ trúng thầu bằng conversionRate() và xếp hạng nguyên nhân trượt.';
