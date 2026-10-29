-- ============================================================================
-- 0244 — Giá bán có giá vốn và lợi nhuận khi duyệt; lợi nhuận tối thiểu → Tổng Giám đốc;
--        báo giá thiết kế / thi công tách riêng (kế hoạch khớp khảo sát anh Thi, gói G1 = A1 +
--        NVO việc 2; anh Dũng duyệt 29/10/2026).
--
-- Căn cứ (hồ sơ khảo sát): Ban Giám đốc NVO bước 6 «duyệt giá, biên độ lợi nhuận, điều kiện thanh
-- toán trước khi gửi khách»; bảng phê duyệt «phải thể hiện doanh thu, chi phí, lợi nhuận, dòng tiền
-- và rủi ro»; Phòng Dự án NVC bước 5 «phê duyệt giá, lợi nhuận dự kiến… và rủi ro trước khi nộp».
--
-- 1. Giá vốn của báo giá CRM là Mẫu D (CLAUDE.md 3.4) — bảng RIÊNG `quote_item_costs` (đơn giá vốn
--    từng hạng mục), không cột trên `quote_items` mà ai trong pháp nhân cũng đọc. Bảng KHÔNG mở
--    quyền nào cho trình duyệt: đọc / ghi chỉ qua hàm, mỗi lượt ghi `sensitive_access_logs`.
--    Hoặc lấy giá vốn từ một dự toán ĐÃ DUYỆT của gói thầu / hồ sơ thiết kế gắn cơ hội
--    (`quotes.cost_estimate_id`).
--    Ai nhập: vai trò qua `rls_sees_sensitive('cost')` (Ban Giám đốc, Tài chính, Dự toán, Thiết kế,
--    Mua hàng; KSNB chỉ xem) — khi báo giá còn Nháp HOẶC đang chờ duyệt (người duyệt nhập ngay trong
--    hộp duyệt). Kinh doanh KHÔNG thấy giá vốn, lợi nhuận, cả % lợi nhuận — cùng cách
--    `estimate_cost_breakdown` (0021) trả lợi nhuận chung cửa với giá vốn.
-- 2. Tham số `min_margin_percent` theo pháp nhân, để TRỐNG. Có số mà lợi nhuận dưới mức — hoặc chưa
--    nhập đủ giá vốn nên chưa kiểm được — thì hồ sơ duyệt mang loại `low_margin_price` (hạn mức:
--    chỉ Tổng Giám đốc, nạp ở seed). Không sửa `decide_approval` / `rls_can_approve`: loại nghiệp vụ
--    chọn lúc mở hồ sơ duyệt (như CRM-05 chọn `special_discount`), và đổi lại khi giá vốn nhập
--    trong lúc chờ duyệt. Lưới an toàn: trigger trên `approval_decisions` tính lại lúc duyệt.
--    Mức áp dụng chụp vào hồ sơ lúc gửi duyệt (`min_margin_applied`) — đổi tham số không hồi tố.
-- 3. Ghi chú rủi ro của người gửi: `quotes.risk_note`, `estimates.risk_note` (tham số mới của hàm
--    gửi duyệt). Hộp duyệt đọc qua `price_margin_brief` (doanh thu, giá vốn, lợi nhuận, %, điều kiện
--    thanh toán của văn bản báo giá, rủi ro).
-- 4. `quotes.scope_kind` (thiet_ke · thi_cong · tron_goi, rỗng = báo giá chung — NVS, báo giá cũ).
--    Mỗi (cơ hội, loại) một bản đang hiệu lực; trọn gói không đi cùng thiết kế / thi công (gương
--    `contracts_one_per_kind`, 0243). Báo giá rỗng loại cũ bị thay bởi bản mới bất kỳ loại nào.
--    Soạn hợp đồng từ cơ hội lấy giá trị từ báo giá đúng loại.
-- 5. Dự toán thầu (`estimate_price`) áp cùng mức tối thiểu và ghi chú rủi ro.
--
-- Hàm chép bản mới nhất, chỉ đổi phần cần: quotes_assign_version (0030), quotes_open_approval (0013),
-- request_quote_approval (0239), create_quote_version (0239), request_estimate_approval (0025),
-- create_contract_from_source (0243), _site_budget_source_quote (0235). Chạy lại được.
--
-- ⚠️ Giá trị enum mới `low_margin_price` chỉ dùng TRONG THÂN hàm plpgsql (chạy lúc gọi) và so dạng
-- `text` — trình chạy migration gói mọi tệp trong một giao dịch, giá trị enum vừa thêm chưa dùng
-- được ở câu lệnh cùng giao dịch.
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'low_margin_price';

-- --- 2. Tham số ------------------------------------------------------------------------------
INSERT INTO public.system_parameters (param_key, scope_type, scope_id, value, unit, label, description, is_sensitive)
SELECT 'min_margin_percent', 'company', c.id, NULL, '%',
       'Lợi nhuận tối thiểu của giá bán (%)',
       'Báo giá / giá dự thầu có lợi nhuận dưới mức này (hoặc chưa nhập đủ giá vốn) thì chỉ Tổng Giám đốc '
       'duyệt. Để trống = không áp, hộp duyệt chỉ hiện lợi nhuận.',
       true
  FROM public.companies c
 WHERE c.code IN ('NVC', 'NVO', 'NVS')
   AND NOT EXISTS (SELECT 1 FROM public.system_parameters p
                    WHERE p.param_key = 'min_margin_percent' AND p.scope_type = 'company'
                      AND p.scope_id = c.id);

-- --- 1 + 4. Cột -----------------------------------------------------------------------------
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS scope_kind text,
  ADD COLUMN IF NOT EXISTS risk_note text,
  ADD COLUMN IF NOT EXISTS cost_estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS min_margin_applied numeric(6, 2);

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_scope_kind_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_scope_kind_check
  CHECK (scope_kind IS NULL OR scope_kind IN ('thiet_ke', 'thi_cong', 'tron_goi'));
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_risk_note_length;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_risk_note_length
  CHECK (risk_note IS NULL OR char_length(risk_note) <= 2000);

COMMENT ON COLUMN public.quotes.scope_kind IS
  'Báo giá thiết kế / thi công / trọn gói (0244). Rỗng = báo giá chung (NVS, báo giá trước 0244). '
  'Mỗi (cơ hội, loại) một bản đang hiệu lực; trọn gói không đi cùng loại khác.';
COMMENT ON COLUMN public.quotes.risk_note IS 'Rủi ro người gửi nêu khi gửi phê duyệt (0244).';
COMMENT ON COLUMN public.quotes.cost_estimate_id IS
  'Giá vốn lấy từ dự toán đã duyệt này (0244) thay cho giá vốn từng hạng mục. Chỉ ghi qua save_quote_costs.';
COMMENT ON COLUMN public.quotes.min_margin_applied IS
  'Lợi nhuận tối thiểu (%) áp lúc gửi duyệt — chụp từ tham số min_margin_percent, đổi tham số không hồi tố (0244).';

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS risk_note text,
  ADD COLUMN IF NOT EXISTS min_margin_applied numeric(6, 2);
ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_risk_note_length;
ALTER TABLE public.estimates ADD CONSTRAINT estimates_risk_note_length
  CHECK (risk_note IS NULL OR char_length(risk_note) <= 2000);
COMMENT ON COLUMN public.estimates.risk_note IS 'Rủi ro người trình nêu khi gửi duyệt giá (0244).';
COMMENT ON COLUMN public.estimates.min_margin_applied IS
  'Lợi nhuận tối thiểu (%) áp lúc gửi duyệt giá (0244) — không hồi tố.';
-- `estimates` cấp quyền theo cột (0021): hai cột mới chỉ ĐỌC; ghi qua request_estimate_approval.
GRANT SELECT (risk_note, min_margin_applied) ON public.estimates TO authenticated;

-- Ba cột chỉ hàm nghiệp vụ ghi (SECURITY DEFINER, chủ `postgres`); loại báo giá không đổi sau khi lập
-- (đổi loại là đổi chuỗi phiên bản — lập báo giá mới đúng loại).
CREATE OR REPLACE FUNCTION public.quotes_margin_columns_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user = 'authenticated' THEN
      NEW.cost_estimate_id := NULL;
      NEW.min_margin_applied := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.scope_kind IS DISTINCT FROM OLD.scope_kind THEN
    RAISE EXCEPTION 'Không đổi được loại báo giá (thiết kế / thi công / trọn gói) sau khi lập. Lập báo giá mới đúng loại.';
  END IF;
  IF current_user = 'authenticated'
     AND (NEW.cost_estimate_id IS DISTINCT FROM OLD.cost_estimate_id
          OR NEW.min_margin_applied IS DISTINCT FROM OLD.min_margin_applied) THEN
    RAISE EXCEPTION 'Giá vốn và mức lợi nhuận tối thiểu chỉ ghi qua khối «Giá vốn» và nút gửi phê duyệt.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_margin_columns_guard ON public.quotes;
CREATE TRIGGER quotes_margin_columns_guard
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_margin_columns_guard();

-- --- 4. Một bản đang hiệu lực cho mỗi (cơ hội, loại) ----------------------------------------
DROP INDEX IF EXISTS public.quotes_one_current_version;
CREATE UNIQUE INDEX quotes_one_current_version ON public.quotes
  (opportunity_id, (COALESCE(scope_kind, '')))
  WHERE is_current_version AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.quote_scope_kind_label(p_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'thiet_ke' THEN 'báo giá thiết kế'
    WHEN 'thi_cong' THEN 'báo giá thi công'
    WHEN 'tron_goi' THEN 'báo giá thiết kế – thi công trọn gói'
    ELSE 'báo giá'
  END;
$$;

-- Bản 0030 (= 0013) + phạm vi theo loại:
--  · số phiên bản / mã: trong cùng loại (loại rỗng là một chuỗi riêng) — bản đầu của một loại lấy mã BG mới;
--  · hạ cờ hiệu lực: bản cùng loại, và bản loại RỖNG (báo giá chung / trước 0244 — bản mới thay nó);
--    bản mới loại rỗng thay mọi bản đang hiệu lực;
--  · trọn gói không đi cùng thiết kế / thi công đang hiệu lực (0243).
CREATE OR REPLACE FUNCTION public.quotes_assign_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_version integer;
  v_base_code    text;
  v_company_code text;
  v_conf         record;
BEGIN
  -- Hai người lập cùng lúc cho một cơ hội không cùng lọt phép kiểm trọn gói dưới đây.
  PERFORM pg_advisory_xact_lock(hashtext('quotes_assign_version:' || NEW.opportunity_id::text));

  IF NEW.scope_kind IS NOT NULL THEN
    SELECT q.code, q.scope_kind INTO v_conf
      FROM public.quotes q
     WHERE q.opportunity_id = NEW.opportunity_id AND q.is_current_version AND q.deleted_at IS NULL
       AND q.scope_kind IS NOT NULL AND q.scope_kind <> NEW.scope_kind
       AND (q.scope_kind = 'tron_goi' OR NEW.scope_kind = 'tron_goi')
     ORDER BY q.created_at
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Cơ hội này đang có % %. Báo giá trọn gói thay cho cả báo giá thiết kế lẫn báo giá thi công nên không đi cùng báo giá khác — lập phiên bản mới của báo giá hiện có.',
        public.quote_scope_kind_label(v_conf.scope_kind), v_conf.code;
    END IF;
  END IF;

  SELECT COALESCE(max(version), 0) INTO v_prev_version
  FROM public.quotes
  WHERE opportunity_id = NEW.opportunity_id AND deleted_at IS NULL
    AND scope_kind IS NOT DISTINCT FROM NEW.scope_kind;

  NEW.version := v_prev_version + 1;

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    IF v_prev_version = 0 THEN
      SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = NEW.company_id;
      NEW.code := public.next_record_code(v_company_code, 'BG');
    ELSE
      SELECT regexp_replace(q.code, '-V[0-9]+$', '') INTO v_base_code
      FROM public.quotes q
      WHERE q.opportunity_id = NEW.opportunity_id AND q.deleted_at IS NULL
        AND q.scope_kind IS NOT DISTINCT FROM NEW.scope_kind
      ORDER BY q.version
      LIMIT 1;
      NEW.code := format('%s-V%s', v_base_code, NEW.version);
    END IF;
  END IF;

  -- Đúng một bản đang hiệu lực cho mỗi loại (NEN-05) — chỉ số duy nhất
  -- `quotes_one_current_version` là lưới an toàn nếu chỗ nào đó lách qua trigger này.
  UPDATE public.quotes
     SET is_current_version = false
   WHERE opportunity_id = NEW.opportunity_id AND is_current_version AND deleted_at IS NULL
     AND (scope_kind IS NOT DISTINCT FROM NEW.scope_kind OR scope_kind IS NULL OR NEW.scope_kind IS NULL);

  NEW.is_current_version := true;
  -- Phiên bản mới luôn bắt đầu ở trạng thái nháp, chưa gửi và chưa có phản hồi:
  -- không thừa hưởng chữ ký phê duyệt của bản trước.
  NEW.status              := 'draft';
  NEW.sent_to_customer_at := NULL;
  NEW.customer_response   := NULL;
  NEW.responded_at        := NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.quotes_assign_version() IS
  'Cấp số phiên bản, mã báo giá và giữ đúng một bản đang hiệu lực cho mỗi (cơ hội, loại báo giá) (NEN-05, CRM-04, 0244).';

-- --- 1. Giá vốn từng hạng mục ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_item_costs (
  quote_item_id uuid PRIMARY KEY REFERENCES public.quote_items(id) ON DELETE CASCADE,
  quote_id      uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  unit_cost     bigint NOT NULL CHECK (unit_cost >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS quote_item_costs_quote_idx ON public.quote_item_costs (quote_id);
COMMENT ON TABLE public.quote_item_costs IS
  'Đơn giá vốn từng hạng mục báo giá (0244) — Mẫu D. Không mở quyền cho trình duyệt: save_quote_costs / quote_cost_lines.';

CREATE TABLE IF NOT EXISTS public.quote_cost_changes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  quote_item_id  uuid,
  cost_estimate_id uuid,
  old_unit_cost  bigint,
  new_unit_cost  bigint,
  changed_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_cost_changes_quote_idx ON public.quote_cost_changes (quote_id, changed_at);
COMMENT ON TABLE public.quote_cost_changes IS
  'Lịch sử sửa giá vốn của báo giá (0244) — một dòng mỗi hạng mục đổi giá vốn / mỗi lần đổi dự toán nguồn. Mẫu D.';

ALTER TABLE public.quote_item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_cost_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_item_costs FROM anon, authenticated;
REVOKE ALL ON public.quote_cost_changes FROM anon, authenticated;

-- Dự toán nguồn được gắn: ĐÃ DUYỆT, cùng pháp nhân, thuộc gói thầu / hồ sơ thiết kế của cơ hội.
CREATE OR REPLACE FUNCTION public._quote_estimate_ok(p_quote_id uuid, p_estimate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.quotes q
      JOIN public.estimates e ON e.id = p_estimate_id AND e.deleted_at IS NULL
                             AND e.status = 'completed' AND e.company_id = q.company_id
     WHERE q.id = p_quote_id
       AND (EXISTS (SELECT 1 FROM public.bidding_projects b
                     WHERE b.id = e.bidding_project_id AND b.opportunity_id = q.opportunity_id
                       AND b.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.design_projects d
                        WHERE d.id = e.design_project_id AND d.opportunity_id = q.opportunity_id
                          AND d.deleted_at IS NULL))
  );
$$;
REVOKE ALL ON FUNCTION public._quote_estimate_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Trạng thái lợi nhuận của một báo giá — NỘI BỘ (không cấp cho trình duyệt), mọi cửa đọc đi qua đây.
--  · doanh thu = giá trị báo giá trước thuế (total_value − tiền thuế);
--  · giá vốn = từ dự toán đã gắn, hoặc tổng khối lượng × đơn giá vốn khi MỌI hạng mục đã có giá vốn;
--  · mức tối thiểu: Nháp đọc tham số hiện hành, đã gửi duyệt dùng mức đã chụp (không hồi tố).
--    Tham số rỗng = không áp (min_margin NULL → needs_ceo false) — không dựng mặc định.
CREATE OR REPLACE FUNCTION public._quote_margin_state(
  p_quote_id uuid,
  OUT revenue bigint,
  OUT cost bigint,
  OUT profit bigint,
  OUT margin_percent numeric,
  OUT cost_complete boolean,
  OUT cost_source text,
  OUT min_margin numeric,
  OUT needs_ceo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q        record;
  v_items  integer;
  v_costed integer;
  v_sum    numeric;
  e        record;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  revenue := CASE WHEN q.total_value IS NULL THEN NULL ELSE q.total_value - COALESCE(q.vat_amount, 0) END;
  cost_complete := false;

  IF q.cost_estimate_id IS NOT NULL THEN
    cost_source := 'du_toan';
    SELECT direct_cost, overhead_cost, contingency_cost, finance_cost INTO e
      FROM public.estimates WHERE id = q.cost_estimate_id;
    IF FOUND AND (e.direct_cost IS NOT NULL OR e.overhead_cost IS NOT NULL
                  OR e.contingency_cost IS NOT NULL OR e.finance_cost IS NOT NULL) THEN
      cost := COALESCE(e.direct_cost, 0) + COALESCE(e.overhead_cost, 0)
            + COALESCE(e.contingency_cost, 0) + COALESCE(e.finance_cost, 0);
      cost_complete := true;
    END IF;
  ELSE
    cost_source := 'hang_muc';
    SELECT count(*), count(c.quote_item_id), sum(round(i.quantity * c.unit_cost))
      INTO v_items, v_costed, v_sum
      FROM public.quote_items i
      LEFT JOIN public.quote_item_costs c ON c.quote_item_id = i.id
     WHERE i.quote_id = q.id;
    IF v_costed > 0 THEN
      cost := v_sum::bigint;
    END IF;
    cost_complete := v_items > 0 AND v_costed = v_items;
  END IF;

  IF cost_complete AND revenue IS NOT NULL THEN
    profit := revenue - cost;
    IF revenue > 0 THEN
      margin_percent := round(profit::numeric * 100 / revenue, 2);
    END IF;
  END IF;

  min_margin := CASE WHEN q.status = 'draft'
                     THEN public.system_parameter_number('min_margin_percent', 'company', q.company_id)
                     ELSE q.min_margin_applied END;
  needs_ceo := min_margin IS NOT NULL AND (margin_percent IS NULL OR margin_percent < min_margin);
END;
$$;
REVOKE ALL ON FUNCTION public._quote_margin_state(uuid) FROM PUBLIC, anon, authenticated;

-- Loại hồ sơ duyệt của một báo giá: dưới mức tối thiểu → Tổng Giám đốc (`low_margin_price`, theo
-- tổng giá trị); có giảm giá → `special_discount` theo mức giảm (CRM-05); còn lại `quote_price`.
CREATE OR REPLACE FUNCTION public._quote_approval_route(p_quote_id uuid, OUT subject text, OUT amount bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q  record;
  st record;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id;
  st := public._quote_margin_state(p_quote_id);
  IF st.needs_ceo THEN
    subject := 'low_margin_price';
    amount := q.total_value;
  ELSIF COALESCE(q.discount_amount, 0) > 0 THEN
    subject := 'special_discount';
    amount := q.discount_amount;
  ELSE
    subject := 'quote_price';
    amount := q.total_value;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._quote_approval_route(uuid) FROM PUBLIC, anon, authenticated;

-- Bản 0013 — loại nghiệp vụ và số tiền lấy từ `_quote_approval_route`.
CREATE OR REPLACE FUNCTION public.quotes_open_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route    record;
  v_opp_name text;
  v_actor    uuid := COALESCE(public.auth_user_id(), NEW.updated_by, NEW.created_by);
BEGIN
  IF NEW.status = 'pending_approval' AND OLD.status IS DISTINCT FROM 'pending_approval' THEN
    SELECT o.name INTO v_opp_name
    FROM public.opportunities o WHERE o.id = NEW.opportunity_id;

    -- CRM-04 / CRM-05 / 0244: loại chọn TẠI ĐÂY, không để ứng dụng truyền vào — để ứng dụng chọn
    -- thì báo giá giảm giá hay dưới mức lợi nhuận tối thiểu né được Tổng Giám đốc.
    v_route := public._quote_approval_route(NEW.id);

    INSERT INTO public.approvals (
      company_id, subject, entity_type, entity_id, entity_code,
      title, amount, reason, requested_by, created_by, updated_by
    )
    VALUES (
      NEW.company_id, v_route.subject::approval_subject, 'quotes', NEW.id, NEW.code,
      format('%s — %s phiên bản %s', COALESCE(v_opp_name, 'Cơ hội kinh doanh'),
             public.quote_scope_kind_label(NEW.scope_kind), NEW.version),
      v_route.amount, NEW.discount_reason, v_actor, v_actor, v_actor
    );
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.quotes_open_approval() IS
  'Mở hồ sơ trong Hộp thư Phê duyệt khi báo giá chuyển sang chờ duyệt. Có giảm giá → Tổng Giám đốc (CRM-05); '
  'dưới lợi nhuận tối thiểu / chưa đủ giá vốn khi tham số có số → Tổng Giám đốc (0244).';

-- Giá vốn nhập trong lúc chờ duyệt → hồ sơ duyệt đang mở đổi loại cho đúng.
CREATE OR REPLACE FUNCTION public._quote_reroute_approval(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route record;
BEGIN
  v_route := public._quote_approval_route(p_quote_id);
  UPDATE public.approvals
     SET subject = v_route.subject::approval_subject, amount = v_route.amount, updated_at = now()
   WHERE entity_type = 'quotes' AND entity_id = p_quote_id
     AND status = 'pending_approval' AND deleted_at IS NULL
     AND (subject::text <> v_route.subject OR amount IS DISTINCT FROM v_route.amount);
END;
$$;
REVOKE ALL ON FUNCTION public._quote_reroute_approval(uuid) FROM PUBLIC, anon, authenticated;

-- Nhập / sửa giá vốn. p_items: [{quote_item_id, unit_cost}] (unit_cost rỗng = xoá giá vốn dòng ấy).
-- p_estimate_id có giá trị = lấy giá vốn từ dự toán đó (bỏ qua p_items).
CREATE OR REPLACE FUNCTION public.save_quote_costs(
  p_quote_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_estimate_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
  v_item jsonb;
  v_iid  uuid;
  v_cost bigint;
  v_old  bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_company_access(q.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;
  IF NOT public.rls_sees_sensitive('cost') OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được nhập giá vốn. Ban Giám đốc hoặc Dự toán nhập giá vốn của báo giá.';
  END IF;
  IF q.status NOT IN ('draft', 'pending_approval') OR q.sent_to_customer_at IS NOT NULL
     OR NOT q.is_current_version THEN
    RAISE EXCEPTION 'Báo giá đã duyệt hoặc không còn là bản đang soạn nên không sửa được giá vốn.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'quotes', q.id, 'edit', q.company_id);

  IF p_estimate_id IS NOT NULL THEN
    IF NOT public._quote_estimate_ok(q.id, p_estimate_id) THEN
      RAISE EXCEPTION 'Chỉ lấy được giá vốn từ dự toán đã duyệt của gói thầu / hồ sơ thiết kế thuộc cơ hội này.';
    END IF;
    IF q.cost_estimate_id IS DISTINCT FROM p_estimate_id THEN
      UPDATE public.quotes SET cost_estimate_id = p_estimate_id WHERE id = q.id;
      INSERT INTO public.quote_cost_changes (quote_id, company_id, cost_estimate_id, changed_by)
      VALUES (q.id, q.company_id, p_estimate_id, v_user);
    END IF;
  ELSE
    IF q.cost_estimate_id IS NOT NULL THEN
      UPDATE public.quotes SET cost_estimate_id = NULL WHERE id = q.id;
      INSERT INTO public.quote_cost_changes (quote_id, company_id, cost_estimate_id, changed_by)
      VALUES (q.id, q.company_id, NULL, v_user);
    END IF;
    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_iid := NULLIF(v_item ->> 'quote_item_id', '')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.quote_items WHERE id = v_iid AND quote_id = q.id) THEN
          RAISE EXCEPTION 'Hạng mục không thuộc báo giá này.';
        END IF;
        v_cost := NULLIF(v_item ->> 'unit_cost', '')::bigint;
        IF v_cost < 0 THEN
          RAISE EXCEPTION 'Đơn giá vốn không được là số âm.';
        END IF;
        SELECT unit_cost INTO v_old FROM public.quote_item_costs WHERE quote_item_id = v_iid;
        IF NOT FOUND THEN
          v_old := NULL;
        END IF;
        CONTINUE WHEN v_old IS NOT DISTINCT FROM v_cost;
        IF v_cost IS NULL THEN
          DELETE FROM public.quote_item_costs WHERE quote_item_id = v_iid;
        ELSE
          INSERT INTO public.quote_item_costs (quote_item_id, quote_id, company_id, unit_cost, created_by, updated_by)
          VALUES (v_iid, q.id, q.company_id, v_cost, v_user, v_user)
          ON CONFLICT (quote_item_id) DO UPDATE
            SET unit_cost = EXCLUDED.unit_cost, updated_at = now(), updated_by = v_user;
        END IF;
        INSERT INTO public.quote_cost_changes (quote_id, company_id, quote_item_id, old_unit_cost, new_unit_cost, changed_by)
        VALUES (q.id, q.company_id, v_iid, v_old, v_cost, v_user);
      END LOOP;
    END IF;
  END IF;

  IF q.status = 'pending_approval' THEN
    PERFORM public._quote_reroute_approval(q.id);
  END IF;
END;
$$;
COMMENT ON FUNCTION public.save_quote_costs(uuid, jsonb, uuid) IS
  'Nhập giá vốn báo giá (0244) — Mẫu D: vai trò qua rls_sees_sensitive(cost), ghi nhật ký; chờ duyệt thì đổi loại hồ sơ duyệt cho đúng.';
REVOKE ALL ON FUNCTION public.save_quote_costs(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quote_costs(uuid, jsonb, uuid) TO authenticated;

-- Giá vốn từng hạng mục để nhập / xem — chỉ vai trò xem giá vốn, mỗi lượt một dòng nhật ký.
CREATE OR REPLACE FUNCTION public.quote_cost_lines(p_quote_id uuid)
RETURNS TABLE (quote_item_id uuid, unit_cost bigint, cost_amount bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  q record;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(q.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;
  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem giá vốn.';
  END IF;
  PERFORM public.log_sensitive_access('cost', 'quotes', q.id, 'view', q.company_id);
  RETURN QUERY
  SELECT i.id, c.unit_cost, CASE WHEN c.unit_cost IS NULL THEN NULL ELSE round(i.quantity * c.unit_cost)::bigint END
    FROM public.quote_items i
    LEFT JOIN public.quote_item_costs c ON c.quote_item_id = i.id
   WHERE i.quote_id = q.id
   ORDER BY i.position;
END;
$$;
REVOKE ALL ON FUNCTION public.quote_cost_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_cost_lines(uuid) TO authenticated;

-- Dự toán đã duyệt gắn được làm nguồn giá vốn — chỉ vai trò xem giá vốn.
CREATE OR REPLACE FUNCTION public.quote_cost_estimate_options(p_quote_id uuid)
RETURNS TABLE (estimate_id uuid, code text, version integer, source_label text, total_cost bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  q record;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(q.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;
  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được xem giá vốn.';
  END IF;
  PERFORM public.log_sensitive_access('cost', 'quotes', q.id, 'view', q.company_id);
  RETURN QUERY
  SELECT e.id, e.code::text, e.version,
         COALESCE('Gói thầu ' || b.name, 'Hồ sơ thiết kế ' || d.name),
         CASE WHEN e.direct_cost IS NULL AND e.overhead_cost IS NULL AND e.contingency_cost IS NULL
                   AND e.finance_cost IS NULL THEN NULL
              ELSE COALESCE(e.direct_cost, 0) + COALESCE(e.overhead_cost, 0)
                 + COALESCE(e.contingency_cost, 0) + COALESCE(e.finance_cost, 0) END
    FROM public.estimates e
    LEFT JOIN public.bidding_projects b ON b.id = e.bidding_project_id
    LEFT JOIN public.design_projects d ON d.id = e.design_project_id
   WHERE public._quote_estimate_ok(q.id, e.id)
   ORDER BY e.approved_at DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.quote_cost_estimate_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_cost_estimate_options(uuid) TO authenticated;

-- --- 3. Gửi phê duyệt — chép 0239, thêm ghi chú rủi ro + chụp mức lợi nhuận tối thiểu ---------
DROP FUNCTION IF EXISTS public.request_quote_approval(uuid);
CREATE OR REPLACE FUNCTION public.request_quote_approval(p_quote_id uuid, p_risk_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotes
  WHERE id = p_quote_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  IF NOT public.rls_quote_writable(q.opportunity_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội và quản lý trực tiếp mới gửi được báo giá này đi phê duyệt.';
  END IF;

  IF q.sent_to_customer_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá này đã gửi khách hàng. Tạo phiên bản mới nếu cần thay đổi giá.';
  END IF;

  IF q.status = 'pending_approval' THEN
    RAISE EXCEPTION 'Báo giá này đang chờ phê duyệt.';
  END IF;

  IF q.status = 'completed' THEN
    RAISE EXCEPTION 'Báo giá này đã được phê duyệt.';
  END IF;

  -- 0239: báo giá lập bằng hạng mục — phải có hạng mục, giảm giá không quá tổng hạng mục.
  IF q.line_items_based THEN
    IF NOT EXISTS (SELECT 1 FROM public.quote_items i WHERE i.quote_id = q.id) THEN
      RAISE EXCEPTION 'Vui lòng thêm ít nhất một hạng mục trước khi gửi phê duyệt.';
    END IF;
    IF COALESCE(q.discount_amount, 0) > COALESCE(q.subtotal_value, 0) THEN
      RAISE EXCEPTION 'Mức giảm giá không được lớn hơn tổng các hạng mục.';
    END IF;
  END IF;

  IF q.total_value IS NULL OR q.total_value <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị báo giá trước khi gửi phê duyệt.';
  END IF;

  -- CRM-05: giảm giá phải có căn cứ, vì đây chính là thứ Tổng Giám đốc cần để quyết định.
  IF COALESCE(q.discount_amount, 0) > 0
     AND (q.discount_reason IS NULL OR btrim(q.discount_reason) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do giảm giá trước khi gửi phê duyệt.';
  END IF;

  IF COALESCE(q.discount_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Mức giảm giá không được là số âm.';
  END IF;

  IF COALESCE(q.discount_amount, 0) > q.total_value THEN
    RAISE EXCEPTION 'Mức giảm giá không được lớn hơn giá trị báo giá.';
  END IF;

  IF char_length(btrim(COALESCE(p_risk_note, ''))) > 2000 THEN
    RAISE EXCEPTION 'Ghi chú rủi ro dài quá 2.000 ký tự.';
  END IF;

  -- 0244: chụp mức lợi nhuận tối thiểu hiện hành (rỗng = không áp) — trigger `quotes_open_approval`
  -- đọc mức đã chụp để chọn người duyệt.
  UPDATE public.quotes
     SET status = 'pending_approval',
         risk_note = COALESCE(NULLIF(btrim(p_risk_note), ''), risk_note),
         min_margin_applied = public.system_parameter_number('min_margin_percent', 'company', q.company_id),
         updated_at = now(), updated_by = v_user
   WHERE id = p_quote_id;
END;
$$;

COMMENT ON FUNCTION public.request_quote_approval(uuid, text) IS
  'Gửi báo giá đi phê duyệt nội bộ (CRM-04), kèm ghi chú rủi ro (0244). Hồ sơ duyệt do trigger quotes_open_approval tạo.';
REVOKE ALL ON FUNCTION public.request_quote_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_quote_approval(uuid, text) TO authenticated;

-- --- 4. Lập phiên bản kèm hạng mục — chép 0239, thêm loại báo giá ---------------------------
DROP FUNCTION IF EXISTS public.create_quote_version(uuid, uuid, jsonb, bigint, text, numeric, boolean, date, text);
CREATE OR REPLACE FUNCTION public.create_quote_version(
  p_opportunity_id uuid,
  p_company_id uuid,
  p_items jsonb,
  p_discount_amount bigint DEFAULT NULL,
  p_discount_reason text DEFAULT NULL,
  p_vat_rate numeric DEFAULT NULL,
  p_vat_included boolean DEFAULT NULL,
  p_valid_until date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_scope_kind text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_item jsonb;
  v_pos integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Vui lòng thêm ít nhất một hạng mục cho báo giá.';
  END IF;
  IF p_scope_kind IS NOT NULL AND p_scope_kind NOT IN ('thiet_ke', 'thi_cong', 'tron_goi') THEN
    RAISE EXCEPTION 'Loại báo giá không hợp lệ.';
  END IF;

  INSERT INTO public.quotes (opportunity_id, company_id, discount_amount, discount_reason,
                             vat_rate, vat_included, valid_until, notes, line_items_based, scope_kind)
  VALUES (p_opportunity_id, p_company_id, NULLIF(p_discount_amount, 0),
          CASE WHEN COALESCE(p_discount_amount, 0) > 0 THEN NULLIF(btrim(p_discount_reason), '') END,
          p_vat_rate, CASE WHEN p_vat_rate IS NULL THEN NULL ELSE COALESCE(p_vat_included, false) END,
          p_valid_until, NULLIF(btrim(p_notes), ''), true, p_scope_kind)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_pos := v_pos + 1;
    INSERT INTO public.quote_items (quote_id, company_id, position, description, unit, quantity, unit_price)
    VALUES (v_id, p_company_id, v_pos, v_item ->> 'description', v_item ->> 'unit',
            (v_item ->> 'quantity')::numeric, (v_item ->> 'unit_price')::bigint);
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_quote_version(uuid, uuid, jsonb, bigint, text, numeric, boolean, date, text, text) IS
  'Lập phiên bản báo giá kèm hạng mục trong một giao dịch (0239), có loại thiết kế / thi công / trọn gói (0244). INVOKER — RLS quyết.';
REVOKE ALL ON FUNCTION public.create_quote_version(uuid, uuid, jsonb, bigint, text, numeric, boolean, date, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quote_version(uuid, uuid, jsonb, bigint, text, numeric, boolean, date, text, text)
  TO authenticated;

-- --- 5. Dự toán thầu ------------------------------------------------------------------------
-- Lợi nhuận của dự toán: tỷ lệ người lập ghi (`profit_margin_percent`); không ghi thì lợi nhuận ÷ giá
-- trước thuế. Không có cả hai = chưa kiểm được.
CREATE OR REPLACE FUNCTION public._estimate_margin_state(
  p_estimate_id uuid,
  OUT revenue bigint,
  OUT cost bigint,
  OUT profit bigint,
  OUT margin_percent numeric,
  OUT cost_complete boolean,
  OUT min_margin numeric,
  OUT needs_ceo boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e record;
BEGIN
  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  revenue := CASE WHEN e.bid_price IS NULL THEN NULL ELSE e.bid_price - COALESCE(e.tax_amount, 0) END;
  cost_complete := e.direct_cost IS NOT NULL OR e.overhead_cost IS NOT NULL
                   OR e.contingency_cost IS NOT NULL OR e.finance_cost IS NOT NULL;
  IF cost_complete THEN
    cost := COALESCE(e.direct_cost, 0) + COALESCE(e.overhead_cost, 0)
          + COALESCE(e.contingency_cost, 0) + COALESCE(e.finance_cost, 0);
  END IF;
  profit := COALESCE(e.profit_amount, CASE WHEN cost_complete AND revenue IS NOT NULL THEN revenue - cost END);
  margin_percent := COALESCE(e.profit_margin_percent,
                             CASE WHEN profit IS NOT NULL AND revenue > 0
                                  THEN round(profit::numeric * 100 / revenue, 2) END);
  min_margin := CASE WHEN e.status = 'draft'
                     THEN public.system_parameter_number('min_margin_percent', 'company', e.company_id)
                     ELSE e.min_margin_applied END;
  needs_ceo := min_margin IS NOT NULL AND (margin_percent IS NULL OR margin_percent < min_margin);
END;
$$;
REVOKE ALL ON FUNCTION public._estimate_margin_state(uuid) FROM PUBLIC, anon, authenticated;

-- Bản 0025 + ghi chú rủi ro + mức tối thiểu (chụp lúc gửi) + loại `low_margin_price` khi dưới mức.
DROP FUNCTION IF EXISTS public.request_estimate_approval(uuid);
CREATE OR REPLACE FUNCTION public.request_estimate_approval(p_estimate_id uuid, p_risk_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  e          record;
  v_name     text;
  v_due      timestamptz;
  v_approval uuid;
  v_min      numeric;
  st         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO e FROM public.estimates WHERE id = p_estimate_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy bản dự toán này.';
  END IF;

  IF NOT public.rls_estimate_parent_writable(e.bidding_project_id, e.design_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên hồ sơ này.';
  END IF;

  IF e.status <> 'draft' THEN
    RAISE EXCEPTION 'Bản dự toán này đã được trình duyệt.';
  END IF;

  IF e.bid_price IS NULL OR e.bid_price <= 0 THEN
    RAISE EXCEPTION 'Chưa có giá dự thầu. Nhập giá trước khi gửi phê duyệt.';
  END IF;

  IF char_length(btrim(COALESCE(p_risk_note, ''))) > 2000 THEN
    RAISE EXCEPTION 'Ghi chú rủi ro dài quá 2.000 ký tự.';
  END IF;

  IF e.bidding_project_id IS NOT NULL THEN
    -- Hạn duyệt bám hạn nộp thầu: duyệt sau khi đã quá hạn nộp thì không còn ý nghĩa gì.
    SELECT p.name, p.submission_deadline::timestamptz INTO v_name, v_due
      FROM public.bidding_projects p WHERE p.id = e.bidding_project_id;
  ELSE
    -- Với NVO, hạn duyệt bám hạn bàn giao hồ sơ thi công.
    SELECT p.name, p.handover_deadline::timestamptz INTO v_name, v_due
      FROM public.design_projects p WHERE p.id = e.design_project_id;
  END IF;

  -- 0244: chụp mức tối thiểu (rỗng = không áp) TRƯỚC khi đổi trạng thái, rồi đọc trạng thái lợi nhuận
  -- theo mức đã chụp.
  v_min := public.system_parameter_number('min_margin_percent', 'company', e.company_id);
  UPDATE public.estimates
     SET status = 'pending_approval',
         risk_note = COALESCE(NULLIF(btrim(p_risk_note), ''), risk_note),
         min_margin_applied = v_min
   WHERE id = p_estimate_id;
  st := public._estimate_margin_state(p_estimate_id);

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    e.company_id,
    (CASE WHEN st.needs_ceo THEN 'low_margin_price' ELSE 'estimate_price' END)::approval_subject,
    'estimates', e.id, e.code,
    format('Giá dự thầu %s — %s', e.code, v_name),
    e.bid_price, e.basis_notes, 'pending_approval', v_user, v_due
  )
  RETURNING id INTO v_approval;

  IF e.bidding_project_id IS NOT NULL THEN
    UPDATE public.bidding_projects SET stage = 'cho_duyet_gia' WHERE id = e.bidding_project_id;
  END IF;

  RETURN v_approval;
END;
$$;
COMMENT ON FUNCTION public.request_estimate_approval(uuid, text) IS
  'Trình duyệt giá dự thầu (DA-07) kèm ghi chú rủi ro; dưới lợi nhuận tối thiểu → Tổng Giám đốc (0244).';
REVOKE ALL ON FUNCTION public.request_estimate_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_estimate_approval(uuid, text) TO authenticated;

-- --- 2. Lưới an toàn lúc duyệt ---------------------------------------------------------------
-- Tính lại lúc ĐỒNG Ý: hồ sơ đang mang loại thường mà lợi nhuận dưới mức đã chụp → không cho duyệt.
-- Không sửa `decide_approval` (~300 dòng): trigger chạy trong cùng giao dịch, lỗi là cả lượt duyệt hủy.
CREATE OR REPLACE FUNCTION public.approval_decisions_margin_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a  record;
  v_needs boolean;
BEGIN
  IF NEW.decision <> 'approved' THEN
    RETURN NEW;
  END IF;
  SELECT subject::text AS subject, entity_type, entity_id INTO a FROM public.approvals WHERE id = NEW.approval_id;
  IF a.subject = 'low_margin_price' OR a.entity_type NOT IN ('quotes', 'estimates') THEN
    RETURN NEW;
  END IF;
  IF a.entity_type = 'quotes' THEN
    v_needs := (public._quote_margin_state(a.entity_id)).needs_ceo;
  ELSE
    v_needs := (public._estimate_margin_state(a.entity_id)).needs_ceo;
  END IF;
  IF v_needs THEN
    RAISE EXCEPTION 'Lợi nhuận dưới mức tối thiểu của pháp nhân (hoặc chưa đủ giá vốn để kiểm) nên chỉ Tổng Giám đốc duyệt được hồ sơ này.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_decisions_margin_gate ON public.approval_decisions;
CREATE TRIGGER approval_decisions_margin_gate
  BEFORE INSERT ON public.approval_decisions
  FOR EACH ROW EXECUTE FUNCTION public.approval_decisions_margin_gate();

-- --- 3. Nội dung hộp duyệt -------------------------------------------------------------------
-- Một dòng cho báo giá hoặc dự toán. Ai thấy hồ sơ (cùng pháp nhân, hoặc là người gửi / người duyệt
-- được) thì đọc rủi ro, điều kiện thanh toán, loại, có phải chuyển Tổng Giám đốc. Giá vốn / lợi nhuận /
-- % chỉ trả cho vai trò qua rls_sees_sensitive('cost') — kèm một dòng nhật ký; vai khác nhận rỗng.
CREATE OR REPLACE FUNCTION public.price_margin_brief(p_entity_type text, p_entity_id uuid)
RETURNS TABLE (
  entity_type text,
  scope_kind text,
  revenue bigint,
  vat_amount bigint,
  discount_amount bigint,
  sees_cost boolean,
  cost bigint,
  profit bigint,
  margin_percent numeric,
  cost_complete boolean,
  cost_source text,
  min_margin numeric,
  needs_ceo boolean,
  routed_to_ceo boolean,
  risk_note text,
  payment_terms text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_sees    boolean := public.rls_sees_sensitive('cost');
  v_visible boolean;
  q         record;
  e         record;
  st        record;
  v_routed  boolean;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF p_entity_type = 'quotes' THEN
    SELECT * INTO q FROM public.quotes WHERE id = p_entity_id AND deleted_at IS NULL;
    v_company := q.company_id;
  ELSIF p_entity_type = 'estimates' THEN
    SELECT * INTO e FROM public.estimates WHERE id = p_entity_id AND deleted_at IS NULL;
    v_company := e.company_id;
  END IF;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ.';
  END IF;

  v_visible := EXISTS (
    SELECT 1 FROM public.approvals a
     WHERE a.entity_type = p_entity_type AND a.entity_id = p_entity_id AND a.deleted_at IS NULL
       AND (a.requested_by = public.auth_user_id() OR public.rls_can_approve(a.subject, a.company_id, a.amount))
  );
  -- Không đọc biến bản ghi của nhánh kia: record chưa gán thì plpgsql báo lỗi.
  IF NOT v_visible THEN
    IF p_entity_type = 'quotes' THEN
      v_visible := public.rls_company_access(v_company);
    ELSE
      v_visible := public.rls_estimate_parent_readable(e.bidding_project_id, e.design_project_id);
    END IF;
  END IF;
  IF NOT v_visible THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ.';
  END IF;

  SELECT COALESCE(bool_or(a.subject::text = 'low_margin_price'), false) INTO v_routed
    FROM public.approvals a
   WHERE a.entity_type = p_entity_type AND a.entity_id = p_entity_id
     AND a.status = 'pending_approval' AND a.deleted_at IS NULL;

  IF v_sees THEN
    PERFORM public.log_sensitive_access('cost', p_entity_type, p_entity_id, 'view', v_company);
  END IF;

  IF p_entity_type = 'quotes' THEN
    st := public._quote_margin_state(p_entity_id);
    RETURN QUERY SELECT
      'quotes'::text, q.scope_kind, st.revenue, q.vat_amount, q.discount_amount, v_sees,
      CASE WHEN v_sees THEN st.cost END,
      CASE WHEN v_sees THEN st.profit END,
      CASE WHEN v_sees THEN st.margin_percent END,
      st.cost_complete, st.cost_source,
      CASE WHEN v_sees THEN st.min_margin END,
      CASE WHEN v_sees THEN st.needs_ceo END,
      v_routed, q.risk_note,
      (SELECT t.texts ->> 'dieu_khoan_thanh_toan' FROM public.quote_texts t WHERE t.quote_id = q.id);
  ELSE
    st := public._estimate_margin_state(p_entity_id);
    RETURN QUERY SELECT
      'estimates'::text, NULL::text, st.revenue, e.tax_amount, NULL::bigint, v_sees,
      CASE WHEN v_sees THEN st.cost END,
      CASE WHEN v_sees THEN st.profit END,
      CASE WHEN v_sees THEN st.margin_percent END,
      st.cost_complete, 'du_toan'::text,
      CASE WHEN v_sees THEN st.min_margin END,
      CASE WHEN v_sees THEN st.needs_ceo END,
      v_routed, e.risk_note, NULL::text;
  END IF;
END;
$$;
COMMENT ON FUNCTION public.price_margin_brief(text, uuid) IS
  'Doanh thu, giá vốn, lợi nhuận, %, mức tối thiểu, rủi ro, điều kiện thanh toán của báo giá / dự toán cho hộp duyệt (0244). '
  'Số giá vốn chỉ cho vai trò xem giá vốn, có ghi nhật ký.';
REVOKE ALL ON FUNCTION public.price_margin_brief(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.price_margin_brief(text, uuid) TO authenticated;

-- --- 4. Soạn hợp đồng từ cơ hội lấy báo giá đúng loại (bản 0243) -----------------------------
CREATE OR REPLACE FUNCTION public.create_contract_from_source(
  p_source_type contract_source_type,
  p_source_id uuid,
  p_type contract_type,
  p_title text DEFAULT NULL,
  p_scope_kind text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := public.auth_user_id();
  v_company     uuid;
  v_customer    uuid;
  v_name        text;
  v_value       bigint;
  v_estimate    uuid;
  v_estimate_price bigint;
  v_company_code text;
  v_code        text;
  v_contract    uuid;
  v_quote_kind  text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF p_scope_kind IS NOT NULL AND p_scope_kind NOT IN ('thiet_ke', 'thi_cong', 'tron_goi') THEN
    RAISE EXCEPTION 'Loại hợp đồng không hợp lệ.';
  END IF;
  IF p_scope_kind = 'tron_goi' AND p_type::text <> 'thi_cong' THEN
    RAISE EXCEPTION 'Hợp đồng trọn gói soạn theo loại hợp đồng thi công.';
  END IF;

  -- Lấy dữ liệu nguồn. Giá trị ưu tiên bản dự toán ĐÃ DUYỆT đang hiệu lực; không có thì
  -- mới dùng con số ước tính, và khi đó `estimate_id` để rỗng chứ không trỏ bừa.
  IF p_source_type = 'opportunities' THEN
    SELECT o.company_id, o.customer_id, o.name INTO v_company, v_customer, v_name
      FROM public.opportunities o WHERE o.id = p_source_id AND o.deleted_at IS NULL;

    -- Với cơ hội, giá trị đến từ báo giá đang hiệu lực đã được duyệt (CRM-04) — 0244: của ĐÚNG loại
    -- (hợp đồng thiết kế ← báo giá thiết kế…); không có thì báo giá chung (loại rỗng).
    v_quote_kind := COALESCE(p_scope_kind, CASE WHEN p_type::text IN ('thiet_ke', 'thi_cong') THEN p_type::text END);
    SELECT q.total_value INTO v_value
      FROM public.quotes q
     WHERE q.opportunity_id = p_source_id
       AND q.is_current_version AND q.deleted_at IS NULL AND q.status = 'completed'
       AND (v_quote_kind IS NULL OR q.scope_kind IS NULL OR q.scope_kind = v_quote_kind)
     ORDER BY (q.scope_kind IS NOT DISTINCT FROM v_quote_kind) DESC, q.created_at DESC
     LIMIT 1;

  ELSIF p_source_type = 'bidding_projects' THEN
    SELECT b.company_id, b.customer_id, b.name, b.estimated_value
      INTO v_company, v_customer, v_name, v_value
      FROM public.bidding_projects b WHERE b.id = p_source_id AND b.deleted_at IS NULL;

    -- Không dùng "INTO v_estimate, v_value" trực tiếp: khi không có dòng nào khớp, SELECT
    -- INTO không STRICT đặt lại TẤT CẢ biến đích về NULL — kể cả v_value vừa gán ở trên (0087).
    SELECT e.id, e.bid_price INTO v_estimate, v_estimate_price
      FROM public.estimates e
     WHERE e.bidding_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';

    IF v_estimate IS NOT NULL THEN
      v_value := v_estimate_price;
    END IF;

  ELSE
    SELECT d.company_id, d.customer_id, d.name INTO v_company, v_customer, v_name
      FROM public.design_projects d WHERE d.id = p_source_id AND d.deleted_at IS NULL;

    SELECT e.id, e.bid_price INTO v_estimate, v_estimate_price
      FROM public.estimates e
     WHERE e.design_project_id = p_source_id
       AND e.is_current_version AND e.deleted_at IS NULL AND e.status = 'completed';

    IF v_estimate IS NOT NULL THEN
      v_value := v_estimate_price;
    END IF;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn, hoặc hồ sơ đã bị xóa.';
  END IF;

  IF NOT public.auth_can_create_in('HD', v_company) THEN
    RAISE EXCEPTION 'Vai trò hiện tại không được soạn hợp đồng trong pháp nhân này.';
  END IF;

  -- 0243: một hợp đồng mỗi loại (thiết kế / thi công / trọn gói) do trigger
  -- `contracts_one_per_kind` chặn — áp cho mọi đường ghi, không riêng hàm này.

  SELECT code INTO v_company_code FROM public.companies WHERE id = v_company;
  v_code := public.next_record_code(v_company_code, 'HD');

  INSERT INTO public.contracts (
    company_id, code, title, type, scope_kind, source_type, source_id, estimate_id,
    customer_id, responsible_user_id, value
  )
  VALUES (
    v_company, v_code, COALESCE(NULLIF(btrim(p_title), ''), v_name), p_type, p_scope_kind,
    p_source_type, p_source_id, v_estimate, v_customer, v_user, v_value
  )
  RETURNING id INTO v_contract;

  RETURN v_contract;
END;
$$;

COMMENT ON FUNCTION public.create_contract_from_source(contract_source_type, uuid, contract_type, text, text) IS
  'Soạn hợp đồng từ cơ hội / gói thầu / dự án thiết kế, lấy sẵn khách hàng và giá đã duyệt — không nhập lại (HD-01). '
  'p_scope_kind = tron_goi cho hợp đồng thiết kế – thi công trọn gói (0243); giá trị từ báo giá đúng loại (0244).';

-- Ngân sách công trình lấy báo giá đúng loại của hợp đồng (bản 0235 + điều kiện loại).
CREATE OR REPLACE FUNCTION public._site_budget_source_quote(p_site_id uuid)
RETURNS TABLE (quote_id uuid, quote_code text, quote_value bigint, contract_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.code::text, q.total_value, c.code::text
    FROM public.construction_sites s
    JOIN public.contracts c ON c.id = s.contract_id AND c.deleted_at IS NULL
    JOIN public.quotes q ON q.opportunity_id = c.source_id AND q.deleted_at IS NULL
   WHERE s.id = p_site_id
     AND c.source_type = 'opportunities'
     AND q.company_id = s.company_id
     AND q.status = 'completed'
     AND q.sent_to_customer_at IS NOT NULL
     AND (q.scope_kind IS NULL OR c.scope_kind IS NULL OR q.scope_kind = c.scope_kind)
   ORDER BY (q.scope_kind IS NOT DISTINCT FROM c.scope_kind) DESC,
            q.is_current_version DESC, q.sent_to_customer_at DESC
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._site_budget_source_quote(uuid) FROM authenticated, anon, public;
