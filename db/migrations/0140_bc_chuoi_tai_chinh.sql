-- ============================================================================
-- BC — chuỗi số liệu tài chính theo NGÀY cho biểu đồ Dashboard / Tổng quan tài chính.
--
-- Haan 30/09/2026: Tổng Giám đốc cần biểu đồ theo tháng / quý / năm và so với kỳ trước. Hàm trả
-- tổng theo NGÀY (chỉ những ngày có phát sinh — thưa, nhẹ); trình duyệt gom thành tháng / quý /
-- năm và so kỳ bằng cùng một hàm (`shared/src/bc-series.ts`), nên đổi cách chia kỳ không cần
-- migration.
--
-- Mọi cột theo NGÀY NGHIỆP VỤ, không theo `created_at` — biên bản nghiệm thu nhập bù hôm nay cho
-- việc tháng trước phải rơi vào tháng trước:
--   revenue_accepted  biên bản nghiệm thu VỚI CHỦ ĐẦU TƯ đã nghiệm thu (`accepted_date`)
--   rental_revenue    tiền thuê giàn giáo đã tất toán (`actual_return_date`)
--   contracts_signed  giá trị hợp đồng đã ký (`signed_date`)
--   collected         tiền đã thu của khoản phải thu (`receivable_settlements.settled_date`)
--   paid_out          tiền đã chi của đề nghị thanh toán (`paid_date`)
--
-- Quyền: cùng nhóm với thẻ Dòng tiền / Công nợ (`rls_sees_finance`) — vai trò khác bị TỪ CHỐI
-- (ném lỗi), không trả rỗng: rỗng đọc như «không có doanh thu». Phạm vi pháp nhân qua
-- `rls_company_access`. Chưa loại giao dịch thuê nội bộ (QĐ-6): CSDL chưa có cột đánh dấu nội bộ.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finance_daily(
  p_from date,
  p_to date,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  day date,
  company_id uuid,
  revenue_accepted bigint,
  rental_revenue bigint,
  contracts_signed bigint,
  collected bigint,
  paid_out bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem báo cáo.';
  END IF;
  IF NOT public.rls_sees_finance() THEN
    RAISE EXCEPTION 'Không xem được số liệu tài chính. Chỉ Ban Giám đốc, Giám đốc Tài chính và Kế toán xem được — liên hệ quản trị hệ thống nếu công việc cần.';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Khoảng thời gian báo cáo không hợp lệ.';
  END IF;

  RETURN QUERY
  WITH facts AS (
    SELECT ar.accepted_date AS d, ar.company_id AS cid,
           ar.value AS revenue_accepted, 0::bigint AS rental_revenue, 0::bigint AS contracts_signed,
           0::bigint AS collected, 0::bigint AS paid_out
      FROM public.acceptance_records ar
     WHERE ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu'
       AND ar.deleted_at IS NULL AND ar.accepted_date IS NOT NULL
    UNION ALL
    SELECT ra.actual_return_date, ra.company_id, 0, COALESCE(ra.total_revenue, 0), 0, 0, 0
      FROM public.rental_agreements ra
     WHERE ra.deleted_at IS NULL AND ra.actual_return_date IS NOT NULL
       AND COALESCE(ra.total_revenue, 0) <> 0
    UNION ALL
    SELECT c.signed_date, c.company_id, 0, 0, c.value, 0, 0
      FROM public.contracts c
     WHERE c.deleted_at IS NULL AND c.signed_date IS NOT NULL AND c.stage IN ('da_ky', 'hoan_thanh')
    UNION ALL
    SELECT rs.settled_date, rp.company_id, 0, 0, 0, rs.amount, 0
      FROM public.receivable_settlements rs
      JOIN public.receivables_payables rp ON rp.id = rs.receivable_id
     WHERE rp.direction = 'phai_thu' AND rp.deleted_at IS NULL
    UNION ALL
    SELECT pr.paid_date, pr.company_id, 0, 0, 0, 0, COALESCE(pr.paid_amount, pr.amount)
      FROM public.payment_requests pr
     WHERE pr.deleted_at IS NULL AND pr.paid_date IS NOT NULL AND pr.stage IN ('da_chi', 'da_hach_toan')
  )
  SELECT f.d, f.cid,
         SUM(f.revenue_accepted)::bigint, SUM(f.rental_revenue)::bigint,
         SUM(f.contracts_signed)::bigint, SUM(f.collected)::bigint, SUM(f.paid_out)::bigint
    FROM facts f
   WHERE f.d BETWEEN p_from AND p_to
     AND (p_company_id IS NULL OR f.cid = p_company_id)
     AND public.rls_company_access(f.cid)
   GROUP BY f.d, f.cid
   ORDER BY f.d, f.cid;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_daily(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_daily(date, date, uuid) TO authenticated;

COMMENT ON FUNCTION public.finance_daily(date, date, uuid) IS
  'Tổng tài chính theo ngày nghiệp vụ (doanh thu nghiệm thu, tiền thuê, hợp đồng ký, đã thu, đã chi) cho biểu đồ BC. Chỉ vai trò rls_sees_finance.';
