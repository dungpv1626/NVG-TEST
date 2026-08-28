-- ============================================================================
-- Tiếp tục rà 4B (BUILD_PLAN.md) — soát toàn bộ hàm ghi dữ liệu tìm đúng lớp lỗi vừa vá ở
-- `budget_overrun_alert` (0067): điều kiện nhận thông báo lọc cứng `company_id`, bỏ sót vai
-- trò `sees_all_companies` (CFO chỉ gán vào "NVG", không gán riêng vào NVC/NVS/NVO).
--
-- Tìm thêm đúng 2 chỗ khác cùng lớp lỗi:
--   1. `record_delivery` (MH-08, 0037_mh_rls.sql) — thông báo "bộ chứng từ sẵn sàng để lập đề
--      nghị thanh toán" cho ('KT', 'CFO'): CFO không bao giờ nhận được.
--   2. `record_acceptance` (TC-04, 0035_tc_rls.sql) — thông báo "đủ căn cứ thu tiền" cho
--      ('KT', 'CFO'): CFO không bao giờ nhận được.
-- Vá giống hệt 0067: thêm `OR r.sees_all_companies`, gói `SELECT DISTINCT u.id` để phòng vai
-- trò nào đó sau này vừa `sees_all_companies` vừa có nhiều dòng `user_companies` (như TGD)
-- không bị báo trùng — hiện `KT`/`CFO` chưa ai bị vậy, nhưng cùng khuôn cho nhất quán.
--
-- Đồng thời tìm ra một lỗ hổng KHÁC LỚP — không phải thông báo, mà là lộ dữ liệu nhạy cảm
-- Mẫu D:
--   3. `construction_budget_status` (TC-05, 0035_tc_rls.sql) — chỉ khoá dòng `loi_nhuan`
--      (lợi nhuận) sau `rls_sees_sensitive('profit')`, còn lại MỌI dòng chi phí khác (vật tư,
--      nhân công, máy móc, thầu phụ, chi phí chung, dự phòng — tức là toàn bộ số liệu ngân
--      sách/giá vốn công trình) trả cho BẤT KỲ ai xem được module TC, không kiểm
--      `rls_sees_sensitive('cost')` như mọi nơi khác đang khoá giá vốn (`estimates`,
--      `inventory_items_cost`, `purchase_price_history`…), và không ghi
--      `sensitive_access_logs` (NEN-07). Vai trò NS được cấp quyền XEM module TC (để xác nhận
--      chấm công công trường — `db/src/seed/data.ts`) nên trước migration này đọc được đầy đủ
--      chi phí công trình dù không nằm trong danh sách CLAUDE.md 6.6 cho phép xem giá vốn.
--      `web/src/hooks/use-construction-sites.ts` đã có sẵn chú thích đúng ý đồ Mẫu D cho dòng
--      lợi nhuận ("vai trò không được xem lợi nhuận sẽ KHÔNG nhận dòng...") nhưng người viết
--      chỉ áp cho lợi nhuận, bỏ sót các dòng chi phí còn lại — vá cho khớp đúng ý đồ đó, không
--      đổi cách Frontend tiêu thụ (vẫn là "dòng bị lọc mất", không phải giá trị bị che rỗng).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_delivery(
  p_purchase_order_id uuid,
  p_delivered_date date,
  p_items jsonb,
  p_delivered_by_name text DEFAULT NULL,
  p_delivery_note_number text DEFAULT NULL,
  p_invoice_number text DEFAULT NULL,
  p_has_quality_certificate boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := public.auth_user_id();
  po             record;
  pr             record;
  v_company_code text;
  v_delivery     uuid;
  v_line         jsonb;
  v_item         record;
  v_ok           numeric;
  v_issue        numeric;
  v_goods_total  numeric;
  v_delivered_v  numeric;
  v_share        bigint;
  v_complete     boolean;
  v_budget       uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO po FROM public.purchase_orders
   WHERE id = p_purchase_order_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(po.company_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đơn đặt hàng này.';
  END IF;

  IF NOT (public.auth_can_edit_module('MH') OR public.auth_has_role('KHO')) THEN
    RAISE EXCEPTION 'Ghi nhận giao nhận do Mua hàng hoặc Kho thực hiện.';
  END IF;

  IF po.stage NOT IN ('da_dat', 'dang_giao') THEN
    RAISE EXCEPTION 'Đơn đặt hàng này không còn nhận hàng: %.', po.stage;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Chưa có mặt hàng nào được kiểm đếm. Nhập số lượng thực nhận trước khi lưu.';
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = po.company_id;

  INSERT INTO public.deliveries (
    company_id, code, purchase_order_id, delivered_date, received_by, delivered_by_name,
    delivery_note_number, invoice_number, has_quality_certificate, notes, created_by, updated_by
  )
  VALUES (
    po.company_id, public.next_record_code(v_company_code, 'GN'), po.id,
    COALESCE(p_delivered_date, current_date), v_user, NULLIF(btrim(p_delivered_by_name), ''),
    NULLIF(btrim(p_delivery_note_number), ''), NULLIF(btrim(p_invoice_number), ''),
    COALESCE(p_has_quality_certificate, false), NULLIF(btrim(p_notes), ''), v_user, v_user
  )
  RETURNING id INTO v_delivery;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id = (v_line ->> 'purchase_order_item_id')::uuid
       AND poi.purchase_order_id = p_purchase_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Có dòng kiểm đếm không thuộc đơn đặt hàng này.';
    END IF;

    v_ok    := COALESCE((v_line ->> 'quantity_ok')::numeric, 0);
    v_issue := COALESCE((v_line ->> 'quantity_issue')::numeric, 0);

    IF v_ok < 0 OR v_issue < 0 THEN
      RAISE EXCEPTION 'Số lượng nhận không được là số âm.';
    END IF;

    IF v_item.delivered_quantity + v_ok > v_item.quantity THEN
      RAISE EXCEPTION 'Mặt hàng "%" nhận vượt số đã đặt: đã nhận %, đặt %, lần này %.',
        v_item.name, v_item.delivered_quantity, v_item.quantity, v_ok;
    END IF;

    IF v_ok = 0 AND v_issue = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.delivery_items (
      delivery_id, purchase_order_item_id, quantity_ok, quantity_issue,
      issue_type, issue_note, created_by, updated_by
    )
    VALUES (
      v_delivery, v_item.id, v_ok, v_issue,
      NULLIF(v_line ->> 'issue_type', '')::delivery_issue_type,
      NULLIF(btrim(v_line ->> 'issue_note'), ''), v_user, v_user
    );

    UPDATE public.purchase_order_items
       SET delivered_quantity = delivered_quantity + v_ok,
           updated_at = now(), updated_by = v_user
     WHERE id = v_item.id;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.delivery_items di WHERE di.delivery_id = v_delivery) THEN
    RAISE EXCEPTION 'Chưa có mặt hàng nào được kiểm đếm. Nhập số lượng thực nhận trước khi lưu.';
  END IF;

  SELECT bool_and(poi.delivered_quantity >= poi.quantity) INTO v_complete
    FROM public.purchase_order_items poi
   WHERE poi.purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(SUM(poi.quantity * poi.unit_price), 0)::numeric INTO v_goods_total
    FROM public.purchase_order_items poi WHERE poi.purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(SUM(di.quantity_ok * poi.unit_price), 0)::numeric INTO v_delivered_v
    FROM public.delivery_items di
    JOIN public.purchase_order_items poi ON poi.id = di.purchase_order_item_id
   WHERE di.delivery_id = v_delivery;

  IF v_goods_total > 0 THEN
    v_share := floor(po.total_value * v_delivered_v / v_goods_total)::bigint;
  ELSE
    v_share := 0;
  END IF;

  IF v_complete THEN
    v_share := po.committed_to_budget;
  ELSE
    v_share := least(v_share, po.committed_to_budget);
  END IF;

  v_budget := public.purchase_request_budget_line(po.purchase_request_id);
  IF v_budget IS NOT NULL AND v_share > 0 THEN
    UPDATE public.project_budgets
       SET committed_amount = greatest(committed_amount - v_share, 0),
           actual_amount = actual_amount + v_share,
           updated_at = now(), updated_by = v_user
     WHERE id = v_budget;
  END IF;

  UPDATE public.purchase_orders
     SET stage = (CASE WHEN v_complete THEN 'da_giao_du' ELSE 'dang_giao' END)::purchase_order_stage,
         committed_to_budget = greatest(committed_to_budget - v_share, 0),
         updated_at = now(), updated_by = v_user
   WHERE id = p_purchase_order_id;

  SELECT * INTO pr FROM public.purchase_requests WHERE id = po.purchase_request_id;

  IF v_complete THEN
    UPDATE public.purchase_requests
       SET stage = 'hoan_thanh', updated_at = now(), updated_by = v_user
     WHERE id = po.purchase_request_id;

    PERFORM public.create_notification(
      recipient.id, po.company_id, 'purchase_order_delivered',
      format('Đơn hàng %s đã nhận đủ, giá trị %s đồng. Bộ chứng từ sẵn sàng để lập đề nghị thanh toán.',
             COALESCE(po.code, ''), to_char(po.total_value, 'FM999,999,999,999')),
      'purchase_orders', po.id,
      format('/mh/don-hang/%s', po.id)
    )
    FROM (
      SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = po.company_id OR r.sees_all_companies)
        AND r.code IN ('KT', 'CFO')
    ) recipient;
  END IF;

  PERFORM public.create_notification(
    u.id, po.company_id, 'delivery_received',
    format('Đơn hàng %s vừa nhận một đợt hàng ngày %s.',
           COALESCE(po.code, ''), to_char(COALESCE(p_delivered_date, current_date), 'DD/MM/YYYY')),
    'deliveries', v_delivery,
    format('/mh/don-hang/%s', po.id)
  )
  FROM public.users u
  JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
  JOIN public.roles r ON r.id = uc.role_id
  WHERE u.is_active AND u.deleted_at IS NULL
    AND uc.company_id = po.company_id
    AND (r.code = 'KHO' OR u.id = pr.requested_by);

  RETURN v_delivery;
END;
$$;

COMMENT ON FUNCTION public.record_delivery(uuid, date, jsonb, text, text, text, boolean, text) IS
  'Ghi nhận giao nhận hàng, chuyển ngân sách từ cam kết sang phát sinh theo tỷ lệ giá trị (MH-07, MH-08). Người nhận thông báo hoàn tất gồm cả vai trò xem toàn NVG (0068).';


CREATE OR REPLACE FUNCTION public.record_acceptance(
  p_site_id uuid,
  p_acceptance_type acceptance_type,
  p_stage_name text,
  p_value bigint DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_accepted_date date DEFAULT NULL,
  p_subcontractor_id uuid DEFAULT NULL,
  p_counterpart_signed_by text DEFAULT NULL,
  p_outstanding_issues text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := public.auth_user_id();
  s              record;
  v_company_code text;
  v_id           uuid;
  v_code         text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = p_site_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(s.company_id)
     OR NOT public.auth_can_edit_module('TC') THEN
    RAISE EXCEPTION 'Không thao tác được trên công trình này.';
  END IF;

  IF s.stage = 'hoan_thanh' THEN
    RAISE EXCEPTION 'Công trình đã kết thúc, không lập thêm biên bản nghiệm thu.';
  END IF;

  IF COALESCE(btrim(p_stage_name), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập giai đoạn hoặc hạng mục được nghiệm thu.';
  END IF;

  IF p_acceptance_type = 'thau_phu' AND p_subcontractor_id IS NULL THEN
    RAISE EXCEPTION 'Vui lòng chọn tổ đội được nghiệm thu.';
  END IF;

  IF p_subcontractor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subcontractors sc
     WHERE sc.id = p_subcontractor_id AND sc.construction_site_id = p_site_id
       AND sc.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tổ đội được chọn không thuộc công trình này.';
  END IF;

  IF p_acceptance_type = 'khach_hang' AND COALESCE(p_value, 0) <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị khối lượng được nghiệm thu để Kế toán có căn cứ thu tiền.';
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = s.company_id;
  v_code := public.next_record_code(v_company_code, 'NT');

  INSERT INTO public.acceptance_records (
    company_id, construction_site_id, code, acceptance_type, status,
    stage_name, scope, value, subcontractor_id,
    accepted_date, accepted_at, accepted_by, counterpart_signed_by, outstanding_issues
  )
  VALUES (
    s.company_id, p_site_id, v_code, p_acceptance_type, 'da_nghiem_thu',
    btrim(p_stage_name), p_scope, p_value, p_subcontractor_id,
    COALESCE(p_accepted_date, current_date), now(), v_user,
    NULLIF(btrim(COALESCE(p_counterpart_signed_by, '')), ''), p_outstanding_issues
  )
  RETURNING id INTO v_id;

  IF p_acceptance_type = 'khach_hang' THEN
    PERFORM public.create_notification(
      recipient.id, s.company_id, 'acceptance_billing',
      format('Công trình %s đã nghiệm thu %s với chủ đầu tư, giá trị %s đồng — đủ căn cứ thu tiền theo hợp đồng.',
             s.code, btrim(p_stage_name), to_char(p_value, 'FM999,999,999,999')),
      'acceptance_records', v_id,
      format('/tc/cong-trinh/%s?tab=nghiem-thu', p_site_id)
    )
    FROM (
      SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = s.company_id OR r.sees_all_companies)
        AND r.code IN ('KT', 'CFO')
    ) recipient;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_acceptance(uuid, acceptance_type, text, bigint, text, date, uuid, text, text) IS
  'Lập biên bản nghiệm thu; nghiệm thu với chủ đầu tư báo Kế toán đủ căn cứ thu tiền (TC-04). Người nhận gồm cả vai trò xem toàn NVG (0068).';


-- ----------------------------------------------------------------------------
-- construction_budget_status — khoá đúng như mọi nơi khác đang khoá giá vốn (Mẫu D)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.construction_budget_status(p_site_id uuid)
RETURNS TABLE (
  cost_group       cost_group,
  cost_code        text,
  name             text,
  budgeted_amount  bigint,
  actual_amount    bigint,
  committed_amount bigint,
  engaged_amount   bigint,
  remaining_amount bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF public.rls_sees_sensitive('cost') THEN
    SELECT s.company_id INTO v_company_id FROM public.construction_sites s WHERE s.id = p_site_id;
    PERFORM public.log_sensitive_access('cost', 'construction_sites', p_site_id, 'view', v_company_id);
  END IF;

  RETURN QUERY
  SELECT b.cost_group,
         b.cost_code::text,
         b.name,
         b.budgeted_amount,
         b.actual_amount,
         b.committed_amount,
         b.actual_amount + b.committed_amount            AS engaged_amount,
         b.budgeted_amount - b.actual_amount - b.committed_amount AS remaining_amount
    FROM public.project_budgets b
   WHERE b.construction_site_id = p_site_id
     AND b.deleted_at IS NULL
     AND public.rls_site_readable(p_site_id)
     AND public.rls_sees_sensitive('cost')
     AND (b.cost_group <> 'loi_nhuan' OR public.rls_sees_sensitive('profit'))
   ORDER BY b.cost_group, b.cost_code;
END;
$$;

COMMENT ON FUNCTION public.construction_budget_status(uuid) IS
  'Ngân sách công trình so với chi phí đã phát sinh và đã cam kết, theo từng mã chi phí (TC-05). Mẫu D: toàn bộ dòng chỉ trả cho vai trò xem giá vốn, riêng dòng lợi nhuận còn cần thêm quyền xem lợi nhuận; ghi sensitive_access_logs (0068, trước đó chỉ khoá dòng lợi nhuận, bỏ sót các dòng chi phí còn lại).';
