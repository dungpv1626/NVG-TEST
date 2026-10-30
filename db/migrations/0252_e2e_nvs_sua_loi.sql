-- ============================================================================
-- 0252 — Chạy thử trọn luồng NVS (cho thuê giàn giáo) trên trình duyệt: sửa lỗi (30/10/2026)
--
-- 1. Số tiền / số lượng trong lý do phê duyệt báo giá thuê và đề nghị thuê nội bộ in kiểu Việt Nam
--    («2.500 đồng/ngày», không phải «2,500»): `to_char(…, 'FM999G999')` theo lc_numeric của máy chủ
--    (en_US → dấu phẩy). Hàm `vn_number` không phụ thuộc locale. Thay `submit_rental_quote`,
--    `prepare_internal_rental_request` — chép nguyên bản 0245, chỉ đổi cách in số và thêm dấu chấm
--    sau danh sách mã («GIANGIAO-NEM-150 × 120. Cần ngày …»).
-- 2. Hợp đồng cho thuê (NVS) ký xong báo Xưởng sản xuất – Cho thuê lập đơn thuê. Trước đây chỉ Kế toán
--    và lãnh đạo được báo — Xưởng không biết có hợp đồng để xuất giàn giáo.
-- 3. Công nợ sinh từ đơn thuê lập theo hợp đồng cho thuê gắn `contract_id` của hợp đồng ấy. Trước đây
--    để trống nên khoản phải thu không hiện dưới hợp đồng.
-- 3b. Biên bản thu hồi ký hai bên thì báo Kế toán của pháp nhân cho thuê (khoản phải thu vừa sinh).
-- 4. «Gửi qua Zalo» cho báo giá thuê đã duyệt: `outbound_shares` nhận `rental_quotes`
--    (chép ba hàm của 0238, thêm một nhánh mỗi hàm).
--
-- Chạy lại được.
-- ============================================================================

-- 1. ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vn_number(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Mẫu dùng ',' và '.' cố định (không theo locale) rồi đổi chỗ hai dấu: 1234567.5 → «1.234.567,5».
  SELECT CASE WHEN p IS NULL THEN NULL
              ELSE translate(rtrim(to_char(p, 'FM999,999,999,999,990.999'), '.'), ',.', '.,') END;
$$;
COMMENT ON FUNCTION public.vn_number(numeric) IS
  'In số kiểu Việt Nam (1.234.567,5) không phụ thuộc lc_numeric của máy chủ — dùng trong câu chữ do hàm CSDL ghi ra (0252).';
GRANT EXECUTE ON FUNCTION public.vn_number(numeric) TO authenticated;

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
  IF q.id IS NULL OR NOT public.rls_company_access(q.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Gửi báo giá thuê do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.prepare_internal_rental_request(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  r          record;
  it         record;
  v_reason   text := '';
  v_total    bigint;
  v_approval uuid;
  v_subject  public.approval_subject := 'internal_rental';
BEGIN
  SELECT * INTO r FROM public.internal_rental_requests WHERE id = p_request_id FOR UPDATE;
  IF r.id IS NULL OR NOT public.rls_company_access(r.company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Chuẩn bị đề nghị thuê nội bộ do Xưởng sản xuất – Cho thuê thực hiện.' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'cho_nvs' THEN
    RAISE EXCEPTION 'Đề nghị % không còn chờ Xưởng chuẩn bị.', r.code;
  END IF;
  FOR it IN
    SELECT i.*, m.code AS material_code FROM public.internal_rental_request_items i
      JOIN public.materials m ON m.id = i.material_id WHERE i.request_id = r.id
  LOOP
    IF public.internal_rental_price_of(it.material_id) IS NULL THEN
      RAISE EXCEPTION 'Chưa cấu hình giá nội bộ cho mã % — Ban Giám đốc đặt «Giá thuê giàn giáo nội bộ» ở Tham số hệ thống trước khi gửi duyệt.', it.material_code;
    END IF;
    v_reason := v_reason || format('%s × %s; ', it.material_code, public.vn_number(it.quantity));
  END LOOP;
  v_total := public.internal_rental_request_estimate(r.id);

  INSERT INTO public.approvals (company_id, subject, entity_type, entity_id, entity_code,
                                title, amount, reason, status, requested_by)
  VALUES (r.company_id, v_subject, 'internal_rental_requests', r.id, r.code,
          format('Cho thuê giàn giáo nội bộ %s — công trình %s', r.code, r.site_label),
          v_total,
          btrim(format('%s. Cần ngày %s%s. Giá nội bộ theo tham số, áp khi xuất. %s', rtrim(v_reason, '; '),
                       to_char(r.needed_date, 'DD/MM/YYYY'),
                       CASE WHEN r.expected_return_date IS NOT NULL THEN ', trả ' || to_char(r.expected_return_date, 'DD/MM/YYYY') ELSE '' END,
                       COALESCE(NULLIF(btrim(p_note), ''), ''))),
          'pending_approval', v_user)
  RETURNING id INTO v_approval;

  UPDATE public.internal_rental_requests
     SET status = 'cho_duyet', approval_id = v_approval, estimated_total = v_total,
         prepared_by = v_user, prepared_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = r.id;
  RETURN v_approval;
END;
$$;

-- 2. ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contracts_rental_signed_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer text;
BEGIN
  SELECT name INTO v_customer FROM public.customers WHERE id = NEW.customer_id;
  -- Xưởng không xem phân hệ Hợp đồng: lời báo không có giá trị, dẫn sang trang lập đơn thuê.
  PERFORM public.create_notification(
    u.id, NEW.company_id, 'rental_contract_signed',
    format('Hợp đồng cho thuê %s (%s) đã ký — lập đơn thuê: «Lập hợp đồng thuê», chọn «Lập từ hợp đồng cho thuê đã ký».',
           COALESCE(NEW.contract_number, NEW.code), COALESCE(v_customer, 'khách')),
    'contracts', NEW.id, '/sx/tai-san-cho-thue')
  FROM public.users u
  WHERE u.is_active AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.user_companies uc
        JOIN public.permissions pm ON pm.role_id = uc.role_id
       WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = NEW.company_id
         AND pm.module_code = 'SX' AND pm.can_edit);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.contracts_rental_signed_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS contracts_rental_signed_notify ON public.contracts;
CREATE TRIGGER contracts_rental_signed_notify
  AFTER UPDATE OF stage ON public.contracts
  FOR EACH ROW
  WHEN (NEW.type = 'cho_thue' AND NEW.stage = 'da_ky' AND OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.contracts_rental_signed_notify();

-- 3. ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receivables_rental_contract_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT ra.contract_id INTO NEW.contract_id
    FROM public.rental_agreements ra WHERE ra.id = NEW.rental_agreement_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.receivables_rental_contract_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS receivables_rental_contract_link ON public.receivables_payables;
CREATE TRIGGER receivables_rental_contract_link
  BEFORE INSERT ON public.receivables_payables
  FOR EACH ROW WHEN (NEW.rental_agreement_id IS NOT NULL AND NEW.contract_id IS NULL)
  EXECUTE FUNCTION public.receivables_rental_contract_link();

-- Khoản đã sinh trước 0252 (đơn thuê theo hợp đồng, công nợ chưa gắn hợp đồng).
UPDATE public.receivables_payables rp
   SET contract_id = ra.contract_id
  FROM public.rental_agreements ra
 WHERE ra.id = rp.rental_agreement_id AND ra.contract_id IS NOT NULL AND rp.contract_id IS NULL;

-- 3b. Biên bản thu hồi ký hai bên → báo Kế toán của pháp nhân cho thuê. Trước đây khoản phải thu sinh
--     lặng lẽ: Kế toán chỉ thấy khi tự mở trang «Thuê giàn giáo». Biên bản chốt khi điều chuyển
--     (transfer_id) cũng sinh công nợ nên cũng báo.
CREATE OR REPLACE FUNCTION public.rental_returns_signed_notify_kt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ra record;
BEGIN
  SELECT a.code, c.name AS customer_name INTO ra
    FROM public.rental_agreements a LEFT JOIN public.customers c ON c.id = a.customer_id
   WHERE a.id = NEW.rental_agreement_id;
  PERFORM public.create_notification(
    u.id, NEW.company_id, 'rental_return_signed',
    format('Biên bản thu hồi %s (đơn thuê %s — %s) đã ký hai bên: phải thu %s đồng. Đối soát ở «Thuê giàn giáo».',
           NEW.code, ra.code, COALESCE(ra.customer_name, 'khách'),
           public.vn_number(COALESCE(NEW.revenue, 0) + COALESCE(NEW.compensation, 0))),
    'rental_agreements', NEW.rental_agreement_id, '/kt/thue-gian-giao')
  FROM public.users u
  WHERE u.is_active AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.user_companies uc
        JOIN public.permissions pm ON pm.role_id = uc.role_id
       WHERE uc.user_id = u.id AND uc.deleted_at IS NULL AND uc.company_id = NEW.company_id
         AND pm.module_code = 'KT' AND pm.can_edit);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.rental_returns_signed_notify_kt() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rental_returns_signed_notify_kt ON public.rental_returns;
CREATE TRIGGER rental_returns_signed_notify_kt
  AFTER UPDATE OF signed_at ON public.rental_returns
  FOR EACH ROW
  WHEN (OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL)
  EXECUTE FUNCTION public.rental_returns_signed_notify_kt();

-- 4. ------------------------------------------------------------------------
ALTER TABLE public.outbound_shares DROP CONSTRAINT IF EXISTS outbound_shares_entity_type_check;
ALTER TABLE public.outbound_shares ADD CONSTRAINT outbound_shares_entity_type_check CHECK (entity_type IN
  ('quotes', 'contracts', 'contract_signed_scan', 'showcase_shares', 'rental_quotes'));

CREATE OR REPLACE FUNCTION public.rls_outbound_share_readable(p_type text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'quotes' THEN EXISTS (
      SELECT 1 FROM public.quotes q
       WHERE q.id = p_id AND q.deleted_at IS NULL AND public.rls_company_access(q.company_id))
    WHEN 'contracts' THEN public.rls_contract_readable(p_id)
    WHEN 'contract_signed_scan' THEN public.rls_contract_readable(p_id)
    WHEN 'showcase_shares' THEN EXISTS (
      SELECT 1 FROM public.showcase_shares s
       WHERE s.id = p_id
         AND (s.created_by = public.auth_user_id()
              OR public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'KSNB')))
    WHEN 'rental_quotes' THEN EXISTS (
      SELECT 1 FROM public.rental_quotes rq
       WHERE rq.id = p_id AND rq.deleted_at IS NULL AND public.rls_rental_readable(rq.company_id))
    ELSE false
  END;
$$;

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
    WHEN 'rental_quotes' THEN EXISTS (
      SELECT 1 FROM public.rental_quotes rq
       WHERE rq.id = p_id AND rq.deleted_at IS NULL AND rq.status = 'da_duyet'
         AND public.rls_company_access(rq.company_id) AND public.auth_can_edit_module('SX'))
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.outbound_shares_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF public.auth_user_id() IS NOT NULL THEN
    NEW.created_by := public.auth_user_id();
    NEW.created_at := now();
  END IF;

  IF NEW.entity_type = 'quotes' THEN
    SELECT q.company_id INTO v_company FROM public.quotes q WHERE q.id = NEW.entity_id;
    NEW.share_link_id := NULL;
  ELSIF NEW.entity_type IN ('contracts', 'contract_signed_scan') THEN
    SELECT c.company_id INTO v_company FROM public.contracts c WHERE c.id = NEW.entity_id;
    IF NEW.entity_type = 'contracts' THEN
      NEW.share_link_id := NULL;
    ELSIF NEW.share_link_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.contract_scan_shares sh
       WHERE sh.id = NEW.share_link_id AND sh.contract_id = NEW.entity_id) THEN
      RAISE EXCEPTION 'Link không thuộc hợp đồng này.';
    END IF;
  ELSIF NEW.entity_type = 'rental_quotes' THEN
    SELECT rq.company_id INTO v_company FROM public.rental_quotes rq WHERE rq.id = NEW.entity_id;
    NEW.share_link_id := NULL;
  ELSIF NEW.entity_type = 'showcase_shares' THEN
    SELECT COALESCE(s.company_id,
                    (SELECT i.company_id FROM public.showcase_items i WHERE i.id = s.item_ids[1]))
      INTO v_company
      FROM public.showcase_shares s WHERE s.id = NEW.entity_id;
    NEW.share_link_id := NEW.entity_id;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ được gửi.';
  END IF;
  NEW.company_id := v_company;
  NEW.recipient := NULLIF(btrim(NEW.recipient), '');
  RETURN NEW;
END;
$$;
