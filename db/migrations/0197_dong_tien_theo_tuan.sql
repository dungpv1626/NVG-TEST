-- ============================================================================
-- Đợt 3 — 3C: dòng tiền 4–8 tuần (doc/KE_HOACH_LAM_HO.md).
--
-- Màn hình Dòng tiền cũ (`cash_flow_current`, 0043) cộng một kỳ thành một con số. Giám đốc Tài
-- chính cần thấy TUẦN NÀO thiếu tiền trước khi tới. Hàm này trả từng KHOẢN tiền dự kiến kèm ngày;
-- trình duyệt chia tuần bằng một hàm thuần (`shared/src/kt-cash-forecast.ts`, có phép thử) — đổi
-- số tuần không cần migration.
--
-- Các khoản, chỉ từ số có thật trên hệ thống:
--   opening      số dư đầu kỳ Tài chính NHẬP TAY gần nhất (`cash_flow_plans`, không gắn công trình).
--                Chưa nhập thì không có dòng này — màn hình ghi «Chưa có số dư đầu kỳ», không bịa.
--   da_thu       tiền đã thu từ ngày số dư đó tới hôm nay (chứng từ thu công nợ phải thu).
--   da_chi       tiền đã chi từ ngày số dư đó (đề nghị chi đã chi; trả công nợ không qua đề nghị).
--   thu_cong_no  phần còn lại của công nợ phải thu, theo hạn.
--   thu_dot      đợt thu của hợp đồng đã ký chưa thành công nợ (3A): theo ngày hạn; đến hạn theo
--                mốc / biên bản mà chưa ghi ngày thì tính hôm nay.
--   chi_de_nghi  đề nghị chi ĐÃ DUYỆT chưa chi (phần chưa chi), theo hạn.
--   chi_cong_no  phần còn lại của công nợ phải trả chưa có đề nghị chi đã duyệt, theo hạn.
-- Không tính kế hoạch thu – chi nhập tay theo kỳ (planned_in / planned_out): số gộp cả kỳ, không
-- có ngày, cộng vào sẽ đếm trùng các khoản trên.
--
-- Quyền: SECURITY INVOKER — RLS của từng bảng lọc trước khi cộng (cùng lẽ `cash_flow_current`);
-- thêm cửa `rls_sees_finance` (Ban Giám đốc, Tài chính, Kế toán, KSNB) — vai trò khác bị TỪ CHỐI
-- rõ ràng thay vì nhận bảng rỗng đọc như «không có tiền».
-- ============================================================================

DROP FUNCTION IF EXISTS public.cash_flow_forecast_items(uuid);
CREATE OR REPLACE FUNCTION public.cash_flow_forecast_items(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  kind       text,
  company_id uuid,
  item_date  date,
  label      text,
  amount     bigint,
  ref_type   text,
  ref_id     uuid
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem dòng tiền.';
  END IF;
  IF NOT public.rls_sees_finance() THEN
    RAISE EXCEPTION 'Không xem được dòng tiền. Chỉ Ban Giám đốc, Giám đốc Tài chính, Kế toán và Kiểm soát nội bộ xem được.';
  END IF;

  RETURN QUERY
  WITH opening AS (
    SELECT DISTINCT ON (p.company_id) p.company_id, p.period_start, p.opening_balance, p.balance_note, p.id
      FROM public.cash_flow_plans p
     WHERE p.deleted_at IS NULL AND p.construction_site_id IS NULL
       AND p.period_start <= v_today
       AND (p_company_id IS NULL OR p.company_id = p_company_id)
     ORDER BY p.company_id, p.period_start DESC, p.created_at DESC
  )
  SELECT 'opening', o.company_id, o.period_start,
         COALESCE(NULLIF(btrim(o.balance_note), ''), 'Số dư đầu kỳ nhập tay'),
         o.opening_balance, 'cash_flow_plans', o.id
    FROM opening o
  UNION ALL
  SELECT 'da_thu', rp.company_id, rs.settled_date,
         COALESCE(rp.party_name, 'Thu công nợ') || COALESCE(' — ' || rp.code, ''),
         rs.amount, 'receivables_payables', rp.id
    FROM public.receivable_settlements rs
    JOIN public.receivables_payables rp ON rp.id = rs.receivable_id
    JOIN opening o ON o.company_id = rp.company_id
   WHERE rp.deleted_at IS NULL AND rp.direction = 'phai_thu'
     AND rs.settled_date >= o.period_start AND rs.settled_date <= v_today
  UNION ALL
  SELECT 'da_chi', pr.company_id, pr.paid_date, pr.title,
         COALESCE(NULLIF(pr.paid_amount, 0), pr.amount), 'payment_requests', pr.id
    FROM public.payment_requests pr
    JOIN opening o ON o.company_id = pr.company_id
   WHERE pr.deleted_at IS NULL AND pr.stage IN ('da_chi', 'da_hach_toan')
     AND pr.paid_date >= o.period_start AND pr.paid_date <= v_today
  UNION ALL
  SELECT 'da_chi', rp.company_id, rs.settled_date,
         COALESCE(rp.party_name, 'Trả công nợ') || COALESCE(' — ' || rp.code, ''),
         rs.amount, 'receivables_payables', rp.id
    FROM public.receivable_settlements rs
    JOIN public.receivables_payables rp ON rp.id = rs.receivable_id
    JOIN opening o ON o.company_id = rp.company_id
   WHERE rp.deleted_at IS NULL AND rp.direction = 'phai_tra' AND rs.payment_request_id IS NULL
     AND rs.settled_date >= o.period_start AND rs.settled_date <= v_today
  UNION ALL
  SELECT 'thu_cong_no', rp.company_id, rp.due_date,
         COALESCE(rp.party_name, 'Công nợ phải thu') || COALESCE(' — ' || rp.code, ''),
         rp.amount - rp.settled_amount, 'receivables_payables', rp.id
    FROM public.receivables_payables rp
   WHERE rp.deleted_at IS NULL AND rp.direction = 'phai_thu' AND rp.amount > rp.settled_amount
     AND (p_company_id IS NULL OR rp.company_id = p_company_id)
  UNION ALL
  SELECT 'thu_dot', c.company_id,
         COALESCE(ct.due_date, CASE WHEN ct.collection_due_at IS NOT NULL THEN v_today END),
         c.code || ' — ' || btrim(ct.description),
         public.contract_term_amount(ct.amount, ct.percent_value, c.value), 'contracts', c.id
    FROM public.contract_terms ct
    JOIN public.contracts c ON c.id = ct.contract_id
   WHERE ct.deleted_at IS NULL AND c.deleted_at IS NULL
     AND ct.term_type IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan')
     AND ct.completed_at IS NULL AND c.stage IN ('da_ky', 'hoan_thanh')
     AND public.contract_term_amount(ct.amount, ct.percent_value, c.value) IS NOT NULL
     -- Đã thành công nợ qua đề nghị thu (3B) thì đã nằm ở «thu_cong_no».
     AND NOT EXISTS (SELECT 1 FROM public.collection_requests cr
                      WHERE cr.status = 'da_ghi_cong_no'
                        AND (cr.contract_term_id = ct.id
                             OR (ct.acceptance_record_id IS NOT NULL
                                 AND cr.acceptance_record_id = ct.acceptance_record_id)))
     AND (p_company_id IS NULL OR c.company_id = p_company_id)
  UNION ALL
  SELECT 'chi_de_nghi', pr.company_id, pr.due_date,
         pr.title || COALESCE(' — ' || pr.code, ''),
         pr.amount - COALESCE(pr.paid_amount, 0), 'payment_requests', pr.id
    FROM public.payment_requests pr
   WHERE pr.deleted_at IS NULL AND pr.stage = 'da_duyet' AND pr.amount > COALESCE(pr.paid_amount, 0)
     AND (p_company_id IS NULL OR pr.company_id = p_company_id)
  UNION ALL
  SELECT 'chi_cong_no', rp.company_id, rp.due_date,
         COALESCE(rp.party_name, 'Công nợ phải trả') || COALESCE(' — ' || rp.code, ''),
         rp.amount - rp.settled_amount, 'receivables_payables', rp.id
    FROM public.receivables_payables rp
   WHERE rp.deleted_at IS NULL AND rp.direction = 'phai_tra' AND rp.amount > rp.settled_amount
     AND NOT EXISTS (SELECT 1 FROM public.payment_requests pr
                      WHERE pr.receivable_id = rp.id AND pr.deleted_at IS NULL AND pr.stage = 'da_duyet')
     AND (p_company_id IS NULL OR rp.company_id = p_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cash_flow_forecast_items(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_flow_forecast_items(uuid) TO authenticated;

COMMENT ON FUNCTION public.cash_flow_forecast_items(uuid) IS
  'Khoản tiền dự kiến theo ngày cho dòng tiền 4–8 tuần (3C, 0197). SECURITY INVOKER — RLS lọc trước; trình duyệt chia tuần.';
