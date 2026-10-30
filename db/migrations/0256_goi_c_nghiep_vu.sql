-- ============================================================================
-- 0256 — Gói C (30/10/2026, anh Dũng đồng ý bốn đề xuất sau lượt chạy thử NVS)
--
-- 1. (Câu 14) Báo giá thuê lập TRONG cơ hội NVS, nhập một lần:
--    - `rental_quotes.opportunity_id` (có sẵn từ 0245) nay là đường chính: khách lấy từ cơ hội, chỉ lập
--      khi cơ hội ở Báo giá / Đàm phán (dùng lại trigger `quotes_require_quote_stage` của 0184).
--    - Quyền: báo giá gắn cơ hội theo quyền sửa báo giá của cơ hội (`rls_quote_writable` — người chịu
--      trách nhiệm và quản lý trực tiếp, Mẫu B); báo giá CŨ không gắn cơ hội giữ quyền Xưởng như 0245.
--    - Gửi khách có kênh (`send_rental_quote_to_customer`, Zalo / Email / Gửi tận tay / Khác); gửi xong
--      cơ hội ở Báo giá tự sang Đàm phán (`_offer_sent_to_negotiation`, 0162). «Gửi qua Zalo» ghi luôn.
--    - Hợp đồng cho thuê soạn từ cơ hội lấy giá trị từ báo giá thuê đã duyệt; đơn thuê lập từ hợp đồng
--      ưu tiên báo giá thuê của chính cơ hội nguồn.
--    - Thông báo duyệt / từ chối báo giá thuê gắn cơ hội mở tab Báo giá của cơ hội.
--    - Kinh doanh đọc danh mục giàn giáo (mã, tên, đơn vị) để lập báo giá.
-- 2. (Câu 15) Hợp đồng cho thuê: giá trị ký giữ nguyên, tiền thuê thực tế = tiền thuê + bồi thường của
--    biên bản thu hồi ĐÃ KÝ; quyết toán chỉ khi mọi đơn thuê đã tất toán, ghi `settled_value`; thực tế
--    vượt giá trị ký quá `sx.rental_contract_overrun_percent` (TRỐNG) thì báo người chịu trách nhiệm.
-- 3. (Câu 17) Ngày trả thực tế trên biên bản thu hồi (và ngày điều chuyển khi ký) không sau hôm nay.
-- 4. (Câu 5) Bàn giao thiết kế sang thi công: đầu bài phải đã xác nhận; chưa khảo sát thiết kế thì phải
--    ghi lý do bỏ qua (`waive_design_survey`). Hồ sơ đã bàn giao không bị ảnh hưởng.
--
-- KHÔNG sửa `stage_readiness`, `decide_approval`, `send_quote_to_customer` (gói A). Chạy lại được.
-- ============================================================================

-- ============================================================================
-- 1. Báo giá thuê trong cơ hội
-- ============================================================================
ALTER TABLE public.rental_quotes
  ADD COLUMN IF NOT EXISTS sent_to_customer_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_channel text;
ALTER TABLE public.rental_quotes DROP CONSTRAINT IF EXISTS rental_quotes_sent_channel_check;
ALTER TABLE public.rental_quotes ADD CONSTRAINT rental_quotes_sent_channel_check
  CHECK (sent_channel IS NULL OR sent_channel IN ('zalo', 'email', 'tan_tay', 'khac'));
CREATE INDEX IF NOT EXISTS rental_quotes_opportunity_idx
  ON public.rental_quotes (opportunity_id) WHERE opportunity_id IS NOT NULL;

COMMENT ON COLUMN public.rental_quotes.sent_to_customer_at IS
  'Báo giá thuê đã gửi khách (0256) — qua send_rental_quote_to_customer; gửi xong cơ hội ở Báo giá tự sang Đàm phán.';
COMMENT ON COLUMN public.rental_quotes.sent_channel IS
  'Kênh gửi khách (0256): zalo / email / tan_tay / khac.';

/** Ai sửa / gửi được một báo giá thuê: gắn cơ hội → quyền sửa báo giá của cơ hội; không → Xưởng (0245). */
CREATE OR REPLACE FUNCTION public.rls_rental_quote_row_writable(p_company_id uuid, p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only() AND CASE
    WHEN p_opportunity_id IS NOT NULL THEN
      public.rls_quote_writable(p_opportunity_id)
      AND EXISTS (SELECT 1 FROM public.opportunities o
                   WHERE o.id = p_opportunity_id AND o.company_id = p_company_id)
    ELSE public.rls_company_access(p_company_id) AND public.auth_can_edit_module('SX')
  END;
$$;
REVOKE ALL ON FUNCTION public.rls_rental_quote_row_writable(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_rental_quote_row_writable(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.rls_rental_quote_row_writable(uuid, uuid) IS
  'Báo giá thuê gắn cơ hội: người chịu trách nhiệm cơ hội / quản lý trực tiếp (Mẫu B, như báo giá CRM). Báo giá cũ không gắn cơ hội: Xưởng sửa phân hệ SX (0245). 0256.';

-- Chép 0245, đổi điều kiện quyền sang hàm trên.
CREATE OR REPLACE FUNCTION public.rls_rental_quote_editable(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_quotes q
     WHERE q.id = p_quote_id AND q.deleted_at IS NULL AND q.status IN ('nhap', 'tu_choi')
       -- 0256: quyền theo cơ hội khi báo giá gắn cơ hội.
       AND public.rls_rental_quote_row_writable(q.company_id, q.opportunity_id)
  );
$$;

DROP POLICY IF EXISTS rental_quotes_insert ON public.rental_quotes;
CREATE POLICY rental_quotes_insert ON public.rental_quotes
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_rental_quote_row_writable(company_id, opportunity_id));

DROP POLICY IF EXISTS rental_quotes_update ON public.rental_quotes;
CREATE POLICY rental_quotes_update ON public.rental_quotes
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_rental_quote_row_writable(company_id, opportunity_id))
  WITH CHECK (public.rls_company_access(company_id));

-- Gắn cơ hội: khách lấy từ cơ hội (không chọn tay), cùng pháp nhân; không đổi cơ hội sau khi lập.
CREATE OR REPLACE FUNCTION public.rental_quotes_opportunity_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id AND public.auth_user_id() IS NOT NULL THEN
      RAISE EXCEPTION 'Không đổi cơ hội của báo giá thuê đã lập. Lập báo giá mới trong cơ hội cần báo giá.';
    END IF;
    IF (NEW.sent_to_customer_at, NEW.sent_channel) IS DISTINCT FROM (OLD.sent_to_customer_at, OLD.sent_channel)
       AND current_setting('nvg.rental_quote_send', true) IS DISTINCT FROM '1'
       AND public.auth_user_id() IS NOT NULL THEN
      RAISE EXCEPTION 'Ghi đã gửi khách bằng nút «Đã gửi khách» để hệ thống kiểm báo giá đã duyệt.';
    END IF;
    RETURN NEW;
  END IF;

  IF public.auth_user_id() IS NOT NULL THEN
    NEW.sent_to_customer_at := NULL;
    NEW.sent_channel := NULL;
  END IF;
  IF NEW.opportunity_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id, company_id, customer_id, deleted_at INTO o
    FROM public.opportunities WHERE id = NEW.opportunity_id;
  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Không tìm thấy cơ hội của báo giá thuê.';
  END IF;
  IF o.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Báo giá thuê phải cùng pháp nhân với cơ hội.';
  END IF;
  NEW.customer_id := o.customer_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_quotes_opportunity_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rental_quotes_opportunity_link ON public.rental_quotes;
CREATE TRIGGER rental_quotes_opportunity_link
  BEFORE INSERT OR UPDATE ON public.rental_quotes
  FOR EACH ROW EXECUTE FUNCTION public.rental_quotes_opportunity_link();

-- Chỉ lập báo giá thuê khi cơ hội ở Báo giá / Đàm phán — cùng hàm, cùng câu với báo giá CRM (0184).
DROP TRIGGER IF EXISTS rental_quotes_require_quote_stage ON public.rental_quotes;
CREATE TRIGGER rental_quotes_require_quote_stage
  BEFORE INSERT ON public.rental_quotes
  FOR EACH ROW EXECUTE FUNCTION public.quotes_require_quote_stage();

-- Chép nguyên văn 0252, chỉ đổi dòng kiểm quyền (0256).
CREATE OR REPLACE FUNCTION public.submit_rental_quote(p_quote_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := public.auth_user_id();
  q            record;
  it           record;
  v_list       numeric;
  v_days       integer;
  v_total      bigint := 0;
  v_special    boolean := false;
  v_limit      numeric;
  v_open       bigint;
  v_exceeded   boolean := false;
  v_reason     text := '';
  v_customer   text;
  v_approval   uuid;
  v_has_rent   boolean;
  v_subject    public.approval_subject := 'rental_quote';
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Chưa đăng nhập.'; END IF;
  SELECT * INTO q FROM public.rental_quotes WHERE id = p_quote_id AND deleted_at IS NULL FOR UPDATE;
  -- 0256: báo giá gắn cơ hội do người chịu trách nhiệm cơ hội gửi; báo giá cũ do Xưởng gửi.
  IF q.id IS NULL OR NOT public.rls_rental_quote_row_writable(q.company_id, q.opportunity_id) THEN
    RAISE EXCEPTION 'Gửi báo giá thuê do người chịu trách nhiệm cơ hội (Kinh doanh) thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF q.status NOT IN ('nhap', 'tu_choi') THEN
    RAISE EXCEPTION 'Báo giá % đã gửi.', q.code;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rental_quote_items WHERE rental_quote_id = q.id) THEN
    RAISE EXCEPTION 'Báo giá chưa có dòng hàng nào.';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.rental_quote_items WHERE rental_quote_id = q.id AND kind = 'thue')
    INTO v_has_rent;
  IF v_has_rent AND (q.needed_date IS NULL OR q.expected_end_date IS NULL) THEN
    RAISE EXCEPTION 'Nhập ngày cần hàng và ngày dự kiến trả để tính tiền thuê.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rental_quote_items WHERE rental_quote_id = q.id AND unit_price <= 0) THEN
    RAISE EXCEPTION 'Mỗi dòng phải có đơn giá lớn hơn 0.';
  END IF;
  v_days := CASE WHEN v_has_rent THEN (q.expected_end_date - q.needed_date) + 1 END;

  FOR it IN
    SELECT i.*, m.code AS material_code FROM public.rental_quote_items i
      JOIN public.materials m ON m.id = i.material_id
     WHERE i.rental_quote_id = q.id ORDER BY i.created_at
  LOOP
    IF it.kind = 'thue' THEN
      v_list := public.system_parameter_number('sx.rental_daily_rate', 'product', it.material_id);
      UPDATE public.rental_quote_items SET list_price = CASE WHEN v_list > 0 THEN round(v_list)::bigint END
       WHERE id = it.id;
      IF v_list > 0 AND it.unit_price < v_list THEN
        v_special := true;
        v_reason := v_reason || format('Giá đặc biệt: %s %s đồng/ngày (bảng giá %s đồng/ngày). ',
          it.material_code, public.vn_number(it.unit_price), public.vn_number(round(v_list)));
      END IF;
      v_total := v_total + round(it.unit_price * it.quantity * v_days)::bigint;
    ELSE
      v_total := v_total + round(it.unit_price * it.quantity)::bigint;
    END IF;
  END LOOP;

  -- Hạn mức công nợ: riêng khách thay thế mức chung (0111). Rỗng = không kiểm.
  v_limit := public.system_parameter_number('sx.customer_credit_limit', 'customer', q.customer_id);
  v_open := public.customer_open_receivable(q.company_id, q.customer_id);
  IF v_limit IS NOT NULL AND v_open + v_total > v_limit THEN
    v_exceeded := true;
    v_reason := v_reason || format('Công nợ còn phải thu %s đồng + báo giá %s đồng vượt hạn mức %s đồng.',
      public.vn_number(v_open), public.vn_number(v_total),
      public.vn_number(round(v_limit)));
  END IF;

  IF v_special OR v_exceeded THEN
    SELECT name INTO v_customer FROM public.customers WHERE id = q.customer_id;
    INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                  title, amount, reason, status, requested_by)
    VALUES (q.company_id, v_subject, 'rental_quotes', q.id, q.code,
            format('Báo giá thuê giàn giáo %s — %s', q.code, COALESCE(v_customer, '')),
            v_total, btrim(v_reason), 'pending_approval', v_user)
    RETURNING id INTO v_approval;
  END IF;

  UPDATE public.rental_quotes
     SET status = CASE WHEN v_approval IS NULL THEN 'da_duyet' ELSE 'cho_duyet' END,
         special_price = v_special, credit_limit_applied = round(v_limit)::bigint,
         outstanding_at_submit = v_open, credit_exceeded = v_exceeded, estimated_total = v_total,
         approval_id = v_approval, submitted_at = now(), submitted_by = v_user,
         decided_at = CASE WHEN v_approval IS NULL THEN now() END, decision_note = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = q.id;

  RETURN CASE WHEN v_approval IS NULL THEN 'da_duyet' ELSE 'cho_duyet' END;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_rental_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rental_quote(uuid) TO authenticated;

/** Ghi báo giá thuê đã duyệt đã gửi khách, kèm kênh (0256). */
CREATE OR REPLACE FUNCTION public.send_rental_quote_to_customer(p_quote_id uuid, p_channel text DEFAULT NULL)
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
  IF p_channel IS NOT NULL AND p_channel NOT IN ('zalo', 'email', 'tan_tay', 'khac') THEN
    RAISE EXCEPTION 'Kênh gửi không hợp lệ — chọn Zalo, Email, Gửi tận tay hoặc Khác.';
  END IF;
  SELECT * INTO q FROM public.rental_quotes WHERE id = p_quote_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá thuê.';
  END IF;
  IF NOT public.rls_rental_quote_row_writable(q.company_id, q.opportunity_id) THEN
    RAISE EXCEPTION 'Chỉ người chịu trách nhiệm cơ hội hoặc quản lý trực tiếp mới ghi được báo giá đã gửi khách.'
      USING ERRCODE = '42501';
  END IF;
  IF q.sent_to_customer_at IS NOT NULL THEN
    RAISE EXCEPTION 'Báo giá thuê % đã được ghi là gửi khách.', q.code;
  END IF;
  IF q.status <> 'da_duyet' THEN
    RAISE EXCEPTION 'Báo giá thuê chưa được duyệt nên chưa gửi được cho khách hàng.';
  END IF;
  PERFORM set_config('nvg.rental_quote_send', '1', true);
  UPDATE public.rental_quotes
     SET sent_to_customer_at = now(), sent_channel = p_channel, updated_at = now(), updated_by = v_user
   WHERE id = q.id;
  PERFORM set_config('nvg.rental_quote_send', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.send_rental_quote_to_customer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_rental_quote_to_customer(uuid, text) TO authenticated;

-- Báo giá thuê đã duyệt tới tay khách → cơ hội ở Báo giá sang Đàm phán (như báo giá CRM, 0162).
CREATE OR REPLACE FUNCTION public.rental_quotes_sent_sync_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sent_to_customer_at IS NOT NULL AND OLD.sent_to_customer_at IS NULL
     AND NEW.opportunity_id IS NOT NULL AND NEW.deleted_at IS NULL AND NEW.status = 'da_duyet' THEN
    PERFORM public._offer_sent_to_negotiation(
      NEW.opportunity_id, 'Báo giá thuê ' || COALESCE(NEW.code, '') || ' đã gửi khách');
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_quotes_sent_sync_opportunity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rental_quotes_sent_sync_opportunity ON public.rental_quotes;
CREATE TRIGGER rental_quotes_sent_sync_opportunity
  AFTER UPDATE OF sent_to_customer_at ON public.rental_quotes
  FOR EACH ROW EXECUTE FUNCTION public.rental_quotes_sent_sync_opportunity();

-- Mở Zalo gửi báo giá thuê đã duyệt → ghi đã gửi qua Zalo (gương `outbound_shares_quote_sent`, 0253).
CREATE OR REPLACE FUNCTION public.outbound_shares_rental_quote_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q record;
BEGIN
  IF NEW.entity_type <> 'rental_quotes' OR NEW.channel <> 'zalo' OR NEW.simulated THEN
    RETURN NULL;
  END IF;
  SELECT id, status, sent_to_customer_at, sent_channel INTO q
    FROM public.rental_quotes WHERE id = NEW.entity_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  BEGIN
    IF q.sent_to_customer_at IS NULL AND q.status = 'da_duyet' THEN
      PERFORM public.send_rental_quote_to_customer(q.id, 'zalo');
    ELSIF q.sent_to_customer_at IS NOT NULL AND q.sent_channel IS NULL THEN
      PERFORM set_config('nvg.rental_quote_send', '1', true);
      UPDATE public.rental_quotes SET sent_channel = 'zalo' WHERE id = q.id;
      PERFORM set_config('nvg.rental_quote_send', '', true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Không ghi được kênh gửi báo giá thuê %: %', q.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.outbound_shares_rental_quote_sent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS outbound_shares_rental_quote_sent ON public.outbound_shares;
CREATE TRIGGER outbound_shares_rental_quote_sent
  AFTER INSERT ON public.outbound_shares
  FOR EACH ROW EXECUTE FUNCTION public.outbound_shares_rental_quote_sent();

-- Chép nguyên văn 0252, chỉ đổi nhánh `rental_quotes` (0256: thêm người chịu trách nhiệm cơ hội).
CREATE OR REPLACE FUNCTION public.rls_outbound_share_writable(p_type text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.auth_is_read_only() AND CASE p_type
    WHEN 'quotes' THEN EXISTS (
      SELECT 1 FROM public.quotes q
        JOIN public.opportunities o ON o.id = q.opportunity_id
       WHERE q.id = p_id AND q.deleted_at IS NULL AND o.deleted_at IS NULL
         AND q.status = 'completed'
         AND public.rls_company_access(q.company_id)
         AND public.rls_owner_can_write(o.company_id, o.owner_id))
    WHEN 'contracts' THEN EXISTS (
      SELECT 1 FROM public.contracts c
       WHERE c.id = p_id AND c.deleted_at IS NULL
         AND c.stage::text IN ('da_duyet', 'da_ky', 'hoan_thanh')
         AND c.approved_document_id IS NOT NULL
         AND public.rls_company_access(c.company_id)
         AND (public.auth_can_approve_module('HD')
              OR (public.auth_can_edit_module('HD')
                  AND public.rls_owner_can_write(c.company_id, c.responsible_user_id))))
    WHEN 'contract_signed_scan' THEN public.rls_contract_scan_sharer(p_id)
    WHEN 'showcase_shares' THEN EXISTS (
      SELECT 1 FROM public.showcase_shares s
       WHERE s.id = p_id AND s.revoked_at IS NULL AND s.expires_at > now()
         AND (s.created_by = public.auth_user_id() OR public.auth_manages_all_companies()))
    -- Báo giá thuê (0252): đã duyệt; người sửa được phân hệ SX của pháp nhân (nhóm lập và gửi báo giá thuê).
    -- 0256: báo giá gắn cơ hội thì người chịu trách nhiệm cơ hội / quản lý trực tiếp.
    WHEN 'rental_quotes' THEN EXISTS (
      SELECT 1 FROM public.rental_quotes rq
       WHERE rq.id = p_id AND rq.deleted_at IS NULL AND rq.status = 'da_duyet'
         AND public.rls_company_access(rq.company_id)
         AND (public.auth_can_edit_module('SX')
              OR (rq.opportunity_id IS NOT NULL AND public.rls_quote_writable(rq.opportunity_id))))
    ELSE false
  END;
$$;

-- Thông báo duyệt / từ chối báo giá thuê (`decide_approval` dẫn tới /sx/bao-gia-thue): báo giá gắn cơ hội
-- thì mở tab Báo giá của cơ hội — Kinh doanh không chắc xem được phân hệ Xưởng.
CREATE OR REPLACE FUNCTION public.notifications_rental_quote_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp uuid;
BEGIN
  SELECT opportunity_id INTO v_opp FROM public.rental_quotes WHERE id = NEW.related_entity_id;
  IF v_opp IS NOT NULL THEN
    NEW.action_url := '/crm/co-hoi/' || v_opp::text || '?tab=bao-gia';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notifications_rental_quote_opportunity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_rental_quote_opportunity ON public.notifications;
CREATE TRIGGER notifications_rental_quote_opportunity
  BEFORE INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.related_entity_type = 'rental_quotes')
  EXECUTE FUNCTION public.notifications_rental_quote_opportunity();

-- Kinh doanh (xem CRM) đọc danh mục giàn giáo để lập báo giá thuê — chỉ dòng giàn giáo, chỉ đọc.
DROP POLICY IF EXISTS materials_select_scaffolding ON public.materials;
CREATE POLICY materials_select_scaffolding ON public.materials
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND is_scaffolding
         AND (public.auth_can_view_module('CRM') OR public.auth_can_view_module('SX')));

-- Hợp đồng cho thuê soạn từ cơ hội: giá trị lấy từ báo giá thuê đã duyệt của cơ hội (ưu tiên bản đã
-- gửi khách) khi chưa có giá trị (`create_contract_from_source` chỉ đọc báo giá CRM).
CREATE OR REPLACE FUNCTION public.contracts_rental_quote_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
BEGIN
  IF NEW.type::text <> 'cho_thue' OR NEW.source_type::text <> 'opportunities' OR NEW.source_id IS NULL
     OR COALESCE(NEW.value, 0) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT rq.estimated_total INTO v_total
    FROM public.rental_quotes rq
   WHERE rq.opportunity_id = NEW.source_id AND rq.deleted_at IS NULL AND rq.status = 'da_duyet'
   ORDER BY (rq.sent_to_customer_at IS NOT NULL) DESC, rq.decided_at DESC NULLS LAST, rq.created_at DESC
   LIMIT 1;
  IF v_total IS NOT NULL AND v_total > 0 THEN
    NEW.value := v_total;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.contracts_rental_quote_value() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contracts_rental_quote_value ON public.contracts;
CREATE TRIGGER contracts_rental_quote_value
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_rental_quote_value();

-- Chép nguyên văn 0245, chỉ đổi cách chọn báo giá kèm: ưu tiên báo giá thuê của CHÍNH cơ hội nguồn
-- của hợp đồng (0256); hợp đồng không từ cơ hội giữ cách cũ (báo giá đã duyệt mới nhất cùng khách).
CREATE OR REPLACE FUNCTION public.rental_contracts_ready(p_company_id uuid)
RETURNS TABLE (
  contract_id     uuid,
  code            text,
  contract_number text,
  title           text,
  customer_id     uuid,
  customer_name   text,
  start_date      date,
  end_date        date,
  agreements      integer,
  quote_id        uuid,
  quote_code      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (public.rls_company_access(p_company_id) AND public.auth_can_view_module('SX')) THEN
    RETURN;
  END IF;
  -- Xưởng (SX) không xem phân hệ Hợp đồng: hàm chỉ trả phần cần để lập đơn thuê — không giá trị,
  -- không điều khoản.
  RETURN QUERY
  SELECT k.id, k.code::text, k.contract_number::text, k.title, k.customer_id, c.name,
         k.start_date, k.end_date,
         (SELECT count(*)::int FROM public.rental_agreements ra
           WHERE ra.contract_id = k.id AND ra.deleted_at IS NULL),
         q.id, q.code::text
    FROM public.contracts k
    LEFT JOIN public.customers c ON c.id = k.customer_id
    LEFT JOIN LATERAL (
      SELECT rq.id, rq.code FROM public.rental_quotes rq
       WHERE rq.company_id = k.company_id AND rq.customer_id = k.customer_id
         AND rq.status = 'da_duyet' AND rq.deleted_at IS NULL
       -- 0256: báo giá của chính cơ hội nguồn đứng trước.
       ORDER BY (k.source_type::text = 'opportunities' AND rq.opportunity_id = k.source_id) DESC,
                (rq.sent_to_customer_at IS NOT NULL) DESC,
                rq.decided_at DESC NULLS LAST, rq.created_at DESC LIMIT 1
    ) q ON true
   WHERE k.company_id = p_company_id AND k.deleted_at IS NULL
     AND k.type = 'cho_thue' AND k.stage = 'da_ky' AND k.customer_id IS NOT NULL
   ORDER BY k.signed_date DESC NULLS LAST, k.code;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_contracts_ready(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_contracts_ready(uuid) TO authenticated;

-- ============================================================================
-- 2. Hợp đồng cho thuê: giá trị ký, tiền thuê thực tế, quyết toán
-- ============================================================================
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS settled_value bigint;
COMMENT ON COLUMN public.contracts.settled_value IS
  'Giá trị quyết toán (0256) — hợp đồng cho thuê: tổng tiền thuê + bồi thường của biên bản thu hồi đã ký, máy ghi lúc quyết toán. Cạnh `value` (giá trị ký), không ghi đè.';

INSERT INTO public.system_parameters (param_key, scope_type, value, unit, label, description)
SELECT 'sx.rental_contract_overrun_percent', 'global', NULL, '%',
       'Ngưỡng vượt giá trị hợp đồng cho thuê',
       'Tiền thuê + bồi thường thực tế (biên bản thu hồi đã ký) vượt giá trị ký của hợp đồng cho thuê quá mức này (%) thì báo người chịu trách nhiệm hợp đồng làm phụ lục điều chỉnh giá trị — báo một lần mỗi bậc vượt. Để trống = không báo.'
WHERE NOT EXISTS (SELECT 1 FROM public.system_parameters
                   WHERE param_key = 'sx.rental_contract_overrun_percent' AND scope_type = 'global');

CREATE TABLE IF NOT EXISTS public.contract_rental_overrun_notices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  level        integer NOT NULL CHECK (level > 0),
  actual_total bigint NOT NULL,
  signed_value bigint NOT NULL,
  threshold_percent numeric NOT NULL,
  notified_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, level)
);
COMMENT ON TABLE public.contract_rental_overrun_notices IS
  'Các lần báo hợp đồng cho thuê vượt giá trị ký (0256): bậc = phần vượt (%) chia ngưỡng, làm tròn xuống. Mỗi bậc báo một lần. Chỉ trigger ghi.';
ALTER TABLE public.contract_rental_overrun_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contract_rental_overrun_notices FROM anon, authenticated;
GRANT SELECT ON public.contract_rental_overrun_notices TO authenticated;
DROP POLICY IF EXISTS contract_rental_overrun_notices_select ON public.contract_rental_overrun_notices;
CREATE POLICY contract_rental_overrun_notices_select ON public.contract_rental_overrun_notices
  FOR SELECT TO authenticated USING (public.rls_contract_readable(contract_id));

/** Mọi đơn thuê thuộc một hợp đồng cho thuê — kể cả đơn mở ra do điều chuyển (0245) từ đơn của nó. */
CREATE OR REPLACE FUNCTION public._contract_rental_agreement_ids(p_contract_id uuid)
RETURNS TABLE (agreement_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT ra.id FROM public.rental_agreements ra
     WHERE ra.contract_id = p_contract_id AND ra.deleted_at IS NULL
    UNION
    SELECT ra.id FROM public.rental_agreements ra
      JOIN tree t ON ra.transferred_from_id = t.id
     WHERE ra.deleted_at IS NULL
  )
  SELECT id FROM tree;
$$;
REVOKE ALL ON FUNCTION public._contract_rental_agreement_ids(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._contract_rental_totals(p_contract_id uuid)
RETURNS TABLE (rent bigint, compensation bigint, deposit_offset bigint,
               agreements integer, open_agreements integer, open_codes text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a AS (
    SELECT ra.* FROM public.rental_agreements ra
     WHERE ra.id IN (SELECT agreement_id FROM public._contract_rental_agreement_ids(p_contract_id))
       AND ra.status::text <> 'huy'
  )
  SELECT COALESCE((SELECT sum(rr.revenue) FROM public.rental_returns rr
                    WHERE rr.rental_agreement_id IN (SELECT id FROM a) AND rr.signed_at IS NOT NULL), 0)::bigint,
         COALESCE((SELECT sum(rr.compensation) FROM public.rental_returns rr
                    WHERE rr.rental_agreement_id IN (SELECT id FROM a) AND rr.signed_at IS NOT NULL), 0)::bigint,
         COALESCE((SELECT sum(settlement_deposit_offset) FROM a), 0)::bigint,
         (SELECT count(*)::int FROM a),
         (SELECT count(*)::int FROM a WHERE settled_at IS NULL),
         (SELECT string_agg(code, ', ' ORDER BY code) FROM a WHERE settled_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public._contract_rental_totals(uuid) FROM PUBLIC, anon, authenticated;

/** Trang hợp đồng cho thuê: giá trị ký, tiền thuê thực tế đến nay, đơn chưa tất toán (0256). */
CREATE OR REPLACE FUNCTION public.contract_rental_actuals(p_contract_id uuid)
RETURNS TABLE (
  signed_value      bigint,
  actual_rent       bigint,
  actual_compensation bigint,
  actual_total      bigint,
  deposit_offset    bigint,
  agreements        integer,
  open_agreements   integer,
  open_codes        text,
  settled_value     bigint,
  overrun_percent_limit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  k record;
  t record;
BEGIN
  SELECT c.id, c.company_id, c.type, c.value, c.settled_value, c.deleted_at INTO k
    FROM public.contracts c WHERE c.id = p_contract_id;
  IF NOT FOUND OR k.deleted_at IS NOT NULL OR k.type::text <> 'cho_thue'
     OR NOT public.rls_contract_readable(p_contract_id) THEN
    RETURN;
  END IF;
  SELECT * INTO t FROM public._contract_rental_totals(p_contract_id);
  RETURN QUERY SELECT k.value, t.rent, t.compensation, t.rent + t.compensation, t.deposit_offset,
                      t.agreements, t.open_agreements, t.open_codes, k.settled_value,
                      public.system_parameter_number('sx.rental_contract_overrun_percent', 'company', k.company_id);
END;
$$;
REVOKE ALL ON FUNCTION public.contract_rental_actuals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_rental_actuals(uuid) TO authenticated;

/** Vì sao hợp đồng cho thuê chưa quyết toán được — NULL là được (0256). */
CREATE OR REPLACE FUNCTION public.contract_rental_settlement_problem(p_contract_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
BEGIN
  SELECT * INTO t FROM public._contract_rental_totals(p_contract_id);
  IF t.open_agreements > 0 THEN
    RETURN format('còn %s đơn thuê chưa tất toán (%s)', t.open_agreements, t.open_codes);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.contract_rental_settlement_problem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_rental_settlement_problem(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.contracts_rental_settlement_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_problem text;
  t         record;
  v_settling boolean := NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage::text = 'hoan_thanh';
BEGIN
  -- Giá trị quyết toán chỉ máy ghi lúc quyết toán.
  IF NEW.settled_value IS DISTINCT FROM OLD.settled_value AND NOT v_settling
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'Giá trị quyết toán do hệ thống ghi lúc quyết toán, không sửa tay được.';
  END IF;
  IF NOT v_settling OR NEW.type::text <> 'cho_thue' THEN
    RETURN NEW;
  END IF;
  -- Tác vụ hệ thống (dọn dữ liệu, migration) không mang người dùng — như cổng 0253.
  IF public.auth_user_id() IS NOT NULL THEN
    v_problem := public.contract_rental_settlement_problem(NEW.id);
    IF v_problem IS NOT NULL THEN
      RAISE EXCEPTION 'Chưa quyết toán được hợp đồng cho thuê: %. Kế toán tất toán từng đơn thuê trước.', v_problem;
    END IF;
  END IF;
  SELECT * INTO t FROM public._contract_rental_totals(NEW.id);
  NEW.settled_value := t.rent + t.compensation;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.contracts_rental_settlement_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contracts_rental_settlement_gate ON public.contracts;
CREATE TRIGGER contracts_rental_settlement_gate
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contracts_rental_settlement_gate();

-- Biên bản thu hồi ký xong: thực tế vượt giá trị ký quá ngưỡng → báo người chịu trách nhiệm hợp đồng.
CREATE OR REPLACE FUNCTION public.rental_returns_contract_overrun()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract uuid;
  k          record;
  t          record;
  v_limit    numeric;
  v_actual   bigint;
  v_level    integer;
  v_prev     integer;
  r          record;
BEGIN
  -- Hợp đồng của đơn (đơn mở do điều chuyển lần ngược về đơn gốc).
  WITH RECURSIVE up AS (
    SELECT ra.id, ra.contract_id, ra.transferred_from_id, 0 AS depth
      FROM public.rental_agreements ra WHERE ra.id = NEW.rental_agreement_id
    UNION ALL
    SELECT ra.id, ra.contract_id, ra.transferred_from_id, up.depth + 1
      FROM public.rental_agreements ra JOIN up ON ra.id = up.transferred_from_id
     WHERE up.contract_id IS NULL AND up.depth < 50
  )
  SELECT contract_id INTO v_contract FROM up WHERE contract_id IS NOT NULL ORDER BY depth LIMIT 1;
  IF v_contract IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT id, company_id, code, value, type, responsible_user_id, deleted_at INTO k
    FROM public.contracts WHERE id = v_contract;
  IF k.deleted_at IS NOT NULL OR k.type::text <> 'cho_thue' OR COALESCE(k.value, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  -- `coalesce` ở nơi gọi: trống = không báo (CLAUDE.md 5.2).
  v_limit := public.system_parameter_number('sx.rental_contract_overrun_percent', 'company', k.company_id);
  IF v_limit IS NULL OR v_limit <= 0 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO t FROM public._contract_rental_totals(v_contract);
  v_actual := t.rent + t.compensation;
  IF v_actual <= k.value THEN
    RETURN NULL;
  END IF;
  v_level := floor(((v_actual - k.value)::numeric * 100 / k.value) / v_limit)::int;
  SELECT COALESCE(max(level), 0) INTO v_prev
    FROM public.contract_rental_overrun_notices WHERE contract_id = v_contract;
  IF v_level < 1 OR v_level <= v_prev THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.contract_rental_overrun_notices (contract_id, level, actual_total, signed_value, threshold_percent)
  VALUES (v_contract, v_level, v_actual, k.value, v_limit)
  ON CONFLICT (contract_id, level) DO NOTHING;

  FOR r IN
    SELECT k.responsible_user_id AS user_id WHERE k.responsible_user_id IS NOT NULL
    UNION
    SELECT uc.user_id FROM public.user_companies uc JOIN public.roles ro ON ro.id = uc.role_id
     WHERE k.responsible_user_id IS NULL AND uc.deleted_at IS NULL AND uc.company_id = k.company_id
       AND ro.code::text IN ('TGD', 'BGD')
  LOOP
    PERFORM public.create_notification(
      r.user_id, k.company_id, 'rental_contract_overrun',
      format('Hợp đồng cho thuê %s: tiền thuê + bồi thường thực tế %s đồng vượt giá trị ký %s đồng hơn %s%% — lập phụ lục điều chỉnh giá trị hợp đồng.',
             k.code, public.vn_number(v_actual), public.vn_number(k.value), public.vn_number(v_limit * v_level)),
      'contracts', v_contract, '/hd/hop-dong/' || v_contract::text || '?tab=phat-sinh');
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_returns_contract_overrun() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rental_returns_contract_overrun ON public.rental_returns;
CREATE TRIGGER rental_returns_contract_overrun
  AFTER INSERT OR UPDATE OF signed_at ON public.rental_returns
  FOR EACH ROW WHEN (NEW.signed_at IS NOT NULL)
  EXECUTE FUNCTION public.rental_returns_contract_overrun();

-- ============================================================================
-- 3. Ngày trả thực tế / ngày điều chuyển không sau hôm nay (giờ Việt Nam)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rental_returns_date_not_future()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  -- Tác vụ hệ thống (dữ liệu demo, migration) không mang người dùng.
  IF public.auth_user_id() IS NULL OR NEW.return_date IS NULL OR NEW.return_date <= v_today THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.return_date IS NOT DISTINCT FROM OLD.return_date THEN
    RETURN NEW;
  END IF;
  IF NEW.transfer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ngày điều chuyển % ở sau hôm nay (%). Ký biên bản điều chuyển vào đúng ngày hàng được chuyển.',
      to_char(NEW.return_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY');
  END IF;
  RAISE EXCEPTION 'Ngày trả thực tế % ở sau hôm nay (%). Ghi biên bản thu hồi khi khách đã trả hàng; ngày hẹn trả ghi ở «Ngày dự kiến trả» của đơn thuê.',
    to_char(NEW.return_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY');
END;
$$;

DROP TRIGGER IF EXISTS rental_returns_date_not_future ON public.rental_returns;
CREATE TRIGGER rental_returns_date_not_future
  BEFORE INSERT OR UPDATE OF return_date ON public.rental_returns
  FOR EACH ROW EXECUTE FUNCTION public.rental_returns_date_not_future();

-- Biên bản điều chuyển: lập nháp được trước, ký thì ngày điều chuyển không ở tương lai.
CREATE OR REPLACE FUNCTION public.rental_transfers_date_not_future()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF public.auth_user_id() IS NULL OR NEW.status <> 'da_ky' OR OLD.status = 'da_ky'
     OR NEW.transfer_date <= v_today THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Ngày điều chuyển % ở sau hôm nay (%). Ký biên bản điều chuyển vào đúng ngày hàng được chuyển.',
    to_char(NEW.transfer_date, 'DD/MM/YYYY'), to_char(v_today, 'DD/MM/YYYY');
END;
$$;

DROP TRIGGER IF EXISTS rental_transfers_date_not_future ON public.rental_transfers;
CREATE TRIGGER rental_transfers_date_not_future
  BEFORE UPDATE OF status ON public.rental_transfers
  FOR EACH ROW EXECUTE FUNCTION public.rental_transfers_date_not_future();

-- ============================================================================
-- 4. Bàn giao thiết kế: đầu bài đã xác nhận, khảo sát hoặc lý do bỏ qua
-- ============================================================================
ALTER TABLE public.design_projects
  ADD COLUMN IF NOT EXISTS survey_waived_reason text,
  ADD COLUMN IF NOT EXISTS survey_waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS survey_waived_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.design_projects.survey_waived_reason IS
  'Lý do không khảo sát thiết kế (0256) — ghi qua waive_design_survey. Không có khảo sát và không có lý do thì không bàn giao thi công được.';

DROP TRIGGER IF EXISTS design_projects_survey_waiver_guard ON public.design_projects;
CREATE TRIGGER design_projects_survey_waiver_guard
  BEFORE UPDATE ON public.design_projects
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'survey_waived_reason', 'survey_waived_at', 'survey_waived_by');

/** Điều kiện đầu bài / khảo sát trước khi bàn giao thi công (0256). Hồ sơ đã bàn giao: không trả gì. */
CREATE OR REPLACE FUNCTION public._design_handover_brief_problems(p_design_project_id uuid)
RETURNS TABLE (code text, message text, blocking boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  SELECT id, handed_over_at, survey_waived_reason, deleted_at INTO p
    FROM public.design_projects WHERE id = p_design_project_id;
  IF NOT FOUND OR p.deleted_at IS NOT NULL OR p.handed_over_at IS NOT NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'dau_bai_chua_xac_nhan'::text,
         'Đầu bài đang hiệu lực chưa được xác nhận — xác nhận đầu bài trước khi bàn giao thi công.'::text,
         true
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_briefs b
      WHERE b.design_project_id = p_design_project_id
        AND b.is_current_version
        AND b.confirmed_at IS NOT NULL
        AND b.deleted_at IS NULL
   );

  IF NOT EXISTS (SELECT 1 FROM public.design_surveys s
                  WHERE s.design_project_id = p_design_project_id AND s.deleted_at IS NULL
                    AND s.surveyed_at IS NOT NULL) THEN
    IF NULLIF(btrim(p.survey_waived_reason), '') IS NULL THEN
      RETURN QUERY SELECT 'chua_khao_sat'::text,
        'Chưa có buổi khảo sát thiết kế — ghi khảo sát, hoặc ghi lý do không khảo sát.'::text, true;
    ELSE
      RETURN QUERY SELECT 'bo_qua_khao_sat'::text,
        ('Không khảo sát thiết kế: ' || p.survey_waived_reason)::text, false;
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._design_handover_brief_problems(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.waive_design_survey(p_design_project_id uuid, p_reason text)
RETURNS void
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
  IF NOT public.rls_design_project_writable(p_design_project_id) OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Không ghi được lý do: chỉ người sửa được hồ sơ thiết kế (chưa bàn giao, chưa dừng) ghi được.'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Vui lòng nhập lý do không khảo sát thiết kế.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.design_surveys s
              WHERE s.design_project_id = p_design_project_id AND s.deleted_at IS NULL
                AND s.surveyed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Hồ sơ đã có buổi khảo sát thiết kế nên không cần ghi lý do bỏ qua.';
  END IF;
  UPDATE public.design_projects
     SET survey_waived_reason = btrim(p_reason), survey_waived_at = now(), survey_waived_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_design_project_id;
END;
$$;
REVOKE ALL ON FUNCTION public.waive_design_survey(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waive_design_survey(uuid, text) TO authenticated;

-- Lưới an toàn: mọi đường đặt `handed_over_at` (không riêng `handover_design_to_construction`).
CREATE OR REPLACE FUNCTION public.design_projects_handover_brief_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg text;
BEGIN
  IF OLD.handed_over_at IS NOT NULL OR NEW.handed_over_at IS NULL OR public.auth_user_id() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT string_agg(x.message, ' ') INTO v_msg
    FROM public._design_handover_brief_problems(NEW.id) x WHERE x.blocking;
  IF v_msg IS NOT NULL THEN
    RAISE EXCEPTION 'Chưa bàn giao thi công được: %', v_msg;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.design_projects_handover_brief_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS design_projects_handover_brief_gate ON public.design_projects;
CREATE TRIGGER design_projects_handover_brief_gate
  BEFORE UPDATE OF handed_over_at ON public.design_projects
  FOR EACH ROW EXECUTE FUNCTION public.design_projects_handover_brief_gate();

-- Chép nguyên văn 0103 (bản đang chạy), thay mục (g) bằng các dòng của `_design_handover_brief_problems`
-- (0256): đầu bài chưa xác nhận CHẶN, chưa khảo sát mà không ghi lý do CHẶN.
CREATE OR REPLACE FUNCTION public.check_design_sync(p_design_project_id uuid)
RETURNS TABLE (
  code text,
  discipline design_discipline,
  message text,
  blocking boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_design_project_readable(p_design_project_id) THEN
    RAISE EXCEPTION 'Không xem được dự án thiết kế này.';
  END IF;

  -- (a) Thiếu bản vẽ đang hiệu lực của một bộ môn — thiếu là không thi công được.
  RETURN QUERY
  SELECT 'thieu_ban_ve'::text,
         d.discipline,
         format('Bộ môn %s chưa có bản vẽ nào được phát hành.',
                public.design_discipline_label(d.discipline)),
         true
    FROM unnest(ARRAY['kien_truc', 'ket_cau', 'dien_nuoc']::design_discipline[]) AS d(discipline)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_versions v
      WHERE v.design_project_id = p_design_project_id
        AND v.discipline = d.discipline
        AND v.is_current_version
        AND v.published_at IS NOT NULL
        AND v.deleted_at IS NULL
   );

  -- (b) Bộ môn chưa báo hoàn thành. Phát hành khi bộ môn còn đang vẽ nghĩa là bản trên hệ
  -- thống không phải bản cuối — đúng vướng mắc #9 mà module này sinh ra để giải.
  RETURN QUERY
  SELECT 'bo_mon_chua_xong'::text,
         t.discipline,
         format('Bộ môn %s đang ở trạng thái "%s", chưa báo hoàn thành.',
                public.design_discipline_label(t.discipline),
                public.discipline_task_status_label(t.status)),
         true
    FROM public.design_discipline_tasks t
   WHERE t.design_project_id = p_design_project_id
     AND t.deleted_at IS NULL
     AND t.discipline <> 'phuong_an'
     AND t.status <> 'hoan_thanh';

  -- (c) Xung đột giữa các bộ môn còn ghi trong hồ sơ (TK-04) — ví dụ dầm chắn cửa sổ, ống
  -- kỹ thuật đâm vào cột. Còn nội dung ở đây thì chưa phát hành được.
  RETURN QUERY
  SELECT 'con_xung_dot'::text,
         t.discipline,
         format('Bộ môn %s còn ghi nhận xung đột chưa xử lý: %s',
                public.design_discipline_label(t.discipline),
                left(t.conflict_notes, 160)),
         true
    FROM public.design_discipline_tasks t
   WHERE t.design_project_id = p_design_project_id
     AND t.deleted_at IS NULL
     AND t.conflict_notes IS NOT NULL
     AND btrim(t.conflict_notes) <> '';

  -- (d) Yêu cầu thay đổi đã chấp thuận nhưng chưa thực hiện: bàn giao lúc này là giao bộ hồ
  -- sơ mà chính mình đã biết là phải sửa (TK-06).
  RETURN QUERY
  SELECT 'thay_doi_chua_lam'::text,
         NULL::design_discipline,
         format('Yêu cầu thay đổi %s đã chấp thuận nhưng chưa thực hiện.',
                COALESCE(c.code, c.title)),
         true
    FROM public.change_requests c
   WHERE c.design_project_id = p_design_project_id
     AND c.deleted_at IS NULL
     AND c.status = 'chap_thuan';

  -- (e) Yêu cầu thay đổi còn đang đánh giá — cảnh báo, không chặn: có thể kết luận là không
  -- làm, và chặn cứng ở đây thì một yêu cầu bỏ quên treo cả dự án.
  RETURN QUERY
  SELECT 'thay_doi_dang_mo'::text,
         NULL::design_discipline,
         format('Yêu cầu thay đổi %s chưa có kết luận.', COALESCE(c.code, c.title)),
         false
    FROM public.change_requests c
   WHERE c.design_project_id = p_design_project_id
     AND c.deleted_at IS NULL
     AND c.status IN ('moi', 'dang_danh_gia');

  -- (f) Phương án kiến trúc chưa được khách duyệt (TK-03).
  RETURN QUERY
  SELECT 'phuong_an_chua_duyet'::text,
         'phuong_an'::design_discipline,
         'Phương án kiến trúc chưa có xác nhận duyệt của khách hàng.',
         true
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_versions v
      WHERE v.design_project_id = p_design_project_id
        AND v.discipline = 'phuong_an'
        AND v.customer_approved_at IS NOT NULL
        AND v.deleted_at IS NULL
   );

  -- (g) 0256: đầu bài chưa xác nhận nay CHẶN bàn giao (câu 5, anh Dũng 30/10/2026), kèm khảo sát
  -- thiết kế hoặc lý do bỏ qua. Hồ sơ đã bàn giao: hàm con không trả gì.
  RETURN QUERY
  SELECT x.code, NULL::design_discipline, x.message, x.blocking
    FROM public._design_handover_brief_problems(p_design_project_id) x;
END;
$$;
