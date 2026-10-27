-- 0227 — Dòng tiền tuần không đếm hai lần một đợt thu (Đợt 3 — 3C còn treo).
--
-- Vì sao: `cash_flow_forecast_items` (0197) tính đợt thu của hợp đồng (`thu_dot`) và công nợ phải thu (`thu_cong_no`).
-- Đợt chỉ bị loại khi đã thành công nợ qua đề nghị thu tiền (3B). Kế toán tự lập khoản phải thu cho cùng đợt (trang Công
-- nợ) thì đợt ấy bị đếm HAI lần — tuần đó thu ảo gấp đôi. Công nợ không có cột nào nói nó thuộc đợt nào, nên máy không
-- loại được mà không đoán.
--
-- - `receivables_payables.contract_term_id`: công nợ phải thu thuộc đợt thu nào của hợp đồng. Trang Công nợ cho chọn;
--   «Ghi công nợ» từ đề nghị thu tự gắn; công nợ cũ lập từ đề nghị thu được gắn lại theo đề nghị (dữ kiện có thật).
-- - Dòng tiền loại đợt đã có công nợ gắn vào.
-- - Công nợ phải thu gắn hợp đồng mà CHƯA chọn đợt thì không đoán — `cash_flow_unlinked_receivables` liệt kê để trang
--   dòng tiền báo «có thể trùng» và Kế toán gắn đợt.

ALTER TABLE public.receivables_payables
  ADD COLUMN IF NOT EXISTS contract_term_id uuid REFERENCES public.contract_terms (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS receivables_payables_contract_term_idx
  ON public.receivables_payables (contract_term_id) WHERE contract_term_id IS NOT NULL;

COMMENT ON COLUMN public.receivables_payables.contract_term_id IS
  'Đợt thu của hợp đồng mà khoản phải thu này thu — dòng tiền tuần không đếm đợt hai lần (0227).';

-- Đợt phải thuộc đúng hợp đồng của công nợ, chỉ cho công nợ phải thu, và chỉ đợt thu tiền (tạm ứng, tiến độ, quyết toán).
CREATE OR REPLACE FUNCTION public.receivables_contract_term_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t record;
BEGIN
  IF NEW.contract_term_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.direction <> 'phai_thu' THEN
    RAISE EXCEPTION 'Chỉ công nợ phải thu mới gắn được với đợt thu của hợp đồng.';
  END IF;
  SELECT ct.contract_id, ct.term_type INTO t
    FROM public.contract_terms ct WHERE ct.id = NEW.contract_term_id AND ct.deleted_at IS NULL;
  IF NOT FOUND OR t.term_type NOT IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan') THEN
    RAISE EXCEPTION 'Đợt thu đã chọn không còn trên hợp đồng. Chọn lại đợt thu.';
  END IF;
  IF NEW.contract_id IS NULL THEN
    NEW.contract_id := t.contract_id;
  ELSIF NEW.contract_id <> t.contract_id THEN
    RAISE EXCEPTION 'Đợt thu đã chọn thuộc hợp đồng khác. Chọn đợt của đúng hợp đồng.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receivables_contract_term_guard ON public.receivables_payables;
CREATE TRIGGER receivables_contract_term_guard
  BEFORE INSERT OR UPDATE OF contract_term_id, contract_id, direction ON public.receivables_payables
  FOR EACH ROW EXECUTE FUNCTION public.receivables_contract_term_guard();

-- «Ghi công nợ» từ đề nghị thu (`record_collection_receivable`, 0196) gắn công nợ vào đề nghị. Không chép lại hàm —
-- trigger trên đề nghị thu chép đợt sang công nợ vừa gắn.
CREATE OR REPLACE FUNCTION public.collection_requests_link_term()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.receivable_id IS NOT NULL AND NEW.contract_term_id IS NOT NULL
     AND NEW.receivable_id IS DISTINCT FROM OLD.receivable_id THEN
    UPDATE public.receivables_payables
       SET contract_term_id = NEW.contract_term_id
     WHERE id = NEW.receivable_id AND contract_term_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_requests_link_term ON public.collection_requests;
CREATE TRIGGER collection_requests_link_term
  AFTER UPDATE OF receivable_id ON public.collection_requests
  FOR EACH ROW EXECUTE FUNCTION public.collection_requests_link_term();

-- Công nợ đã lập từ đề nghị thu trước 0227.
UPDATE public.receivables_payables rp
   SET contract_term_id = cr.contract_term_id
  FROM public.collection_requests cr
 WHERE cr.receivable_id = rp.id AND cr.contract_term_id IS NOT NULL AND rp.contract_term_id IS NULL;

-- cash_flow_forecast_items — chép nguyên văn 0197, thêm điều kiện loại đợt đã có công nợ gắn vào.
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
     -- Kế toán tự lập công nợ phải thu cho chính đợt này (0227) thì đợt đã nằm ở «thu_cong_no».
     AND NOT EXISTS (SELECT 1 FROM public.receivables_payables rpt
                      WHERE rpt.contract_term_id = ct.id AND rpt.deleted_at IS NULL)
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
  'Khoản tiền dự kiến theo ngày cho dòng tiền 4–8 tuần (3C, 0197; 0227 loại đợt đã có công nợ gắn vào). SECURITY INVOKER — RLS lọc trước; trình duyệt chia tuần.';

-- Công nợ phải thu còn mở, gắn hợp đồng mà chưa chọn đợt, trong khi hợp đồng còn đợt thu đang tính ở dòng tiền: có thể
-- trùng. Không tự gắn (đoán) — trang dòng tiền liệt kê để Kế toán chọn đợt. SECURITY INVOKER, cùng cửa với dòng tiền.
CREATE OR REPLACE FUNCTION public.cash_flow_unlinked_receivables(p_company_id uuid DEFAULT NULL)
RETURNS TABLE (receivable_id uuid, receivable_code text, contract_id uuid, contract_code text, amount bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT public.rls_sees_finance() THEN
    RAISE EXCEPTION 'Không xem được dòng tiền. Chỉ Ban Giám đốc, Giám đốc Tài chính, Kế toán và Kiểm soát nội bộ xem được.';
  END IF;
  RETURN QUERY
  SELECT rp.id, rp.code::text, c.id, c.code::text, (rp.amount - rp.settled_amount)::bigint
    FROM public.receivables_payables rp
    JOIN public.contracts c ON c.id = rp.contract_id AND c.deleted_at IS NULL
   WHERE rp.deleted_at IS NULL AND rp.direction = 'phai_thu' AND rp.amount > rp.settled_amount
     AND rp.contract_term_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.collection_requests cr WHERE cr.receivable_id = rp.id)
     AND c.stage IN ('da_ky', 'hoan_thanh')
     AND EXISTS (SELECT 1 FROM public.contract_terms ct
                  WHERE ct.contract_id = c.id AND ct.deleted_at IS NULL AND ct.completed_at IS NULL
                    AND ct.term_type IN ('tam_ung', 'tien_do_thanh_toan', 'quyet_toan')
                    AND NOT EXISTS (SELECT 1 FROM public.receivables_payables x
                                     WHERE x.contract_term_id = ct.id AND x.deleted_at IS NULL))
     AND (p_company_id IS NULL OR rp.company_id = p_company_id)
   ORDER BY c.code, rp.code;
END;
$$;

REVOKE ALL ON FUNCTION public.cash_flow_unlinked_receivables(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_flow_unlinked_receivables(uuid) TO authenticated;
