/**
 * Áp dụng hai phiếu khảo sát còn thiếu — Xưởng sản xuất giàn giáo và Chỉ huy – Giám sát
 * công trường (nhận 02/09/2026, bản đầy đủ ở `doc/khao-sat/HoSo_KhaoSat_NVG_full.md`).
 *
 * PRD Mục 10 và CLAUDE.md 5.6 để ngỏ Module TC và SX ở mức ĐỊNH HƯỚNG vì hai bộ phận này
 * chưa có phiếu khảo sát trực tiếp. Nay đã có, và bốn chỗ suy luận trong mã nguồn được thay
 * bằng câu trả lời thật. Mỗi thay đổi dưới đây trích thẳng câu trong phiếu.
 *
 * 1. NS-04 — bảng chấm công KHỐI XƯỞNG do chính Xưởng chốt, không phải HCNS.
 *    "Cuối tháng người phụ trách xưởng chốt bảng công và sản lượng, Phó Giám đốc xác nhận,
 *     sau đó chuyển HCNS/Kế toán tính và thanh toán lương."
 *    Ánh xạ khối → phân hệ xác nhận nay đủ ba nhánh: công trường → TC, xưởng → SX,
 *    văn phòng → NS. Trước đây xưởng bị gộp vào nhánh NS.
 *
 * 2. MH-07 — công trường ký nhận vật tư giao thẳng tới chân công trình.
 *    "Khi hàng về, thủ kho/người được giao phối hợp với kỹ thuật kiểm tra số lượng, quy cách,
 *     chất lượng và chứng từ. Hai bên ký giao nhận."
 *    Mở thêm vai trò có quyền ghi phân hệ TC, NHƯNG chỉ với đề nghị mua có gắn công trình —
 *    hàng mua cho văn phòng hay cho gói thầu vẫn do Mua hàng/Kho ký như cũ.
 *
 * 3. SX-03 — lô giàn giáo tình trạng "mới" cho thuê được ngay.
 *    Dây chuyền sản xuất kết thúc bằng "kiểm tra thành phẩm → đếm, bó kiện, dán nhận diện →
 *    lập phiếu nhập kho thành phẩm", nghĩa là hàng mới đã qua kiểm tra chất lượng trước khi
 *    vào kho. Giả định cũ ("lô mới coi như Kho chưa phân loại xong") không có căn cứ.
 *    Ưu tiên xuất hàng "còn dùng được" trước để hàng cũ luân chuyển, giữ hàng mới cho khách
 *    yêu cầu hàng mới; lô giao cho khách GIỮ NGUYÊN tình trạng của lô nguồn thay vì bị ghi
 *    đè thành "còn dùng được".
 *
 * 4. SX-03 — thu hồi NHIỀU ĐỢT, tiền thuê tính theo từng đợt.
 *    "Nếu khách giao hoặc trả nhiều lần, tiền thuê phải tính riêng theo từng đợt hoặc theo
 *     số dư hằng ngày."
 *    Trước đây một lần gọi phải khai đủ mọi loại giàn giáo, thiếu một dòng thì rollback cả
 *    giao dịch — đúng với giả định "khách trả một lần", sai với thực tế. Nay mỗi lần gọi ghi
 *    nhận một đợt trả, doanh thu và bồi thường CỘNG DỒN, hợp đồng chỉ đóng khi đã trả hết.
 *    Số ngày tính thuê của mỗi đợt = ngày bắt đầu thuê → ngày trả CỦA ĐỢT ĐÓ, nên hàng trả
 *    sớm không phải trả tiền cho quãng thời gian khách đã trả xong.
 *
 * KHÔNG có trong migration này (chờ Haan, xem BUILD_PLAN): giao thêm giữa kỳ trong cùng một
 * hợp đồng (cần bảng đợt giao có ngày bắt đầu riêng cho từng đợt), định mức vật tư và giá
 * thành SX-02, giá thuê nội bộ khi công trình NVG mượn giàn giáo.
 */

-- ----------------------------------------------------------------------------
-- 1. NS-04 — khối xưởng do Xưởng ghi công và Xưởng xác nhận
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_timesheet_period_writable(p_period_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.timesheet_periods p
     WHERE p.id = p_period_id
       AND p.status = 'dang_ghi'
       AND public.rls_company_access(p.company_id)
       AND (
         public.rls_hr_manages()
         OR (p.source_type = 'cong_truong' AND public.auth_can_edit_module('TC'))
         OR (p.source_type = 'xuong'       AND public.auth_can_edit_module('SX'))
       )
  );
$$;

COMMENT ON FUNCTION public.rls_timesheet_period_writable(uuid) IS
  'Ghi được công vào kỳ này không — HCNS mọi khối, Ban chỉ huy với khối công trường, Xưởng với khối xưởng (NS-04).';

DROP POLICY IF EXISTS timesheet_periods_select ON public.timesheet_periods;

CREATE POLICY timesheet_periods_select ON public.timesheet_periods
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      -- Chỉ huy công trường và Xưởng xem kỳ của khối mình để biết đã tới hạn xác nhận chưa.
      OR (source_type = 'cong_truong' AND public.auth_can_view_module('TC'))
      OR (source_type = 'xuong'       AND public.auth_can_view_module('SX'))
      -- Kế toán đọc để biết kỳ nào đã chốt, sẵn sàng tính lương (NS-05).
      OR public.auth_has_role('KT', 'CFO')
    )
  );

/*
 * Ba chính sách ĐỌC đi kèm quyền ghi ở trên.
 *
 * Cho Xưởng ghi công mà không cho đọc lại thì họ nhập mù: màn hình chấm công không hiện được
 * tên người, không hiện được ngày đã ghi. Khối công trường không gặp cảnh này vì bản ghi của
 * họ mang `construction_site_id` và đã đi qua `rls_site_readable`; bản ghi khối xưởng không
 * gắn công trình nào nên phải mở riêng.
 *
 * Phạm vi mở đúng bằng phạm vi của chỉ huy công trường, không hơn: đọc được DÒNG hồ sơ nhân
 * sự khối xưởng. Cột lương vẫn khuất — nó đi qua `rls_sees_sensitive` (Mẫu D), hàm này không
 * đụng tới.
 */
CREATE OR REPLACE FUNCTION public.rls_employee_readable(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = p_employee_id
       AND e.deleted_at IS NULL
       AND public.rls_company_access(e.company_id)
       AND (
         public.auth_can_view_module('NS')
         OR e.user_id = public.auth_user_id()
         OR e.manager_user_id = public.auth_user_id()
         OR (e.construction_site_id IS NOT NULL AND public.rls_site_writable(e.construction_site_id))
         -- Kế toán – Tài chính: cần tên và khối để đối chiếu bảng công đã chốt (NS-05, 0050).
         OR public.auth_has_role('KT', 'CFO')
         -- Xưởng: cùng lý lẽ với chỉ huy công trường ngay trên, chỉ khác là người khối xưởng
         -- không gắn công trình nào nên không lọt vào vế `construction_site_id`.
         OR (e.block = 'xuong' AND public.auth_can_edit_module('SX'))
       )
  );
$$;

COMMENT ON FUNCTION public.rls_employee_readable(uuid) IS
  'Đọc được hồ sơ nhân sự này không — HCNS, chính mình, quản lý trực tiếp, chỉ huy công trường, Kế toán – Tài chính, Xưởng với người khối xưởng (NS-01, NS-04, NS-05).';

-- ⚠️ `employees_select` KHÔNG gọi `rls_employee_readable` mà chép lại điều kiện (di sản từ
-- 0049/0050). Hai chỗ phải sửa cùng lúc, nếu không thì hàm nói đọc được còn policy nói không.
DROP POLICY IF EXISTS employees_select ON public.employees;

CREATE POLICY employees_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR user_id = public.auth_user_id()
      OR manager_user_id = public.auth_user_id()
      OR (construction_site_id IS NOT NULL AND public.rls_site_writable(construction_site_id))
      OR public.auth_has_role('KT', 'CFO')
      OR (block = 'xuong' AND public.auth_can_edit_module('SX'))
    )
  );

DROP POLICY IF EXISTS timesheet_entries_select ON public.timesheet_entries;

CREATE POLICY timesheet_entries_select ON public.timesheet_entries
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR public.rls_is_self_employee(employee_id)
      OR (construction_site_id IS NOT NULL AND public.rls_site_readable(construction_site_id))
      OR EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = employee_id AND e.manager_user_id = public.auth_user_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.timesheet_periods p
         WHERE p.id = timesheet_period_id
           AND p.source_type = 'xuong'
           AND public.auth_can_view_module('SX')
      )
    )
  );

DROP POLICY IF EXISTS timesheets_select ON public.timesheets;

CREATE POLICY timesheets_select ON public.timesheets
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('NS')
      OR public.auth_has_role('KT', 'CFO', 'TGD', 'BGD', 'ADMIN')
      OR public.rls_is_self_employee(employee_id)
      OR (source_type = 'xuong' AND public.auth_can_view_module('SX'))
    )
  );


/** Phân hệ nào giữ quyền xác nhận bảng công của một khối — NS-04. */
CREATE OR REPLACE FUNCTION public.timesheet_block_module(p_block work_block)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_block
           WHEN 'cong_truong' THEN 'TC'
           WHEN 'xuong'       THEN 'SX'
           ELSE 'NS'
         END;
$$;

COMMENT ON FUNCTION public.timesheet_block_module(work_block) IS
  'Khối chấm công → phân hệ có quyền xác nhận. Công trường do Ban chỉ huy, xưởng do Xưởng, văn phòng do HCNS (NS-04, khảo sát 02/09/2026).';

CREATE OR REPLACE FUNCTION public.submit_timesheet_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  p      record;
  v_rows integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.timesheet_periods WHERE id = p_period_id;
  IF NOT FOUND OR NOT public.rls_timesheet_period_writable(p_period_id) THEN
    RAISE EXCEPTION 'Không gửi xác nhận được kỳ chấm công này.';
  END IF;

  SELECT count(*) INTO v_rows FROM public.timesheet_entries WHERE timesheet_period_id = p_period_id;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Chưa có ngày công nào trong kỳ. Ghi công trước khi gửi xác nhận.';
  END IF;

  UPDATE public.timesheet_periods
     SET status = 'cho_xac_nhan', updated_at = now(), updated_by = v_user
   WHERE id = p_period_id;

  -- Gửi đúng người phải xác nhận, không gửi hàng loạt (Content Guidelines 3.4).
  PERFORM public.create_notification(
    u.id, p.company_id, 'timesheet_pending_confirm',
    format('Bảng chấm công khối %s tháng %s/%s chờ xác nhận.',
           CASE p.source_type WHEN 'van_phong' THEN 'văn phòng'
                              WHEN 'cong_truong' THEN 'công trường'
                              ELSE 'xưởng sản xuất' END,
           p.month, p.year),
    'timesheet_periods', p_period_id, '/ns/cham-cong'
  )
  /*
   * Gửi cho ĐÚNG người ký được, không gửi theo mã vai trò.
   *
   * Bản cũ lọc `r.code = <mã phân hệ>` — trùng khớp một cách tình cờ vì vai trò NS và TC đều
   * có `approve` trên phân hệ cùng tên. Với khối xưởng thì không: vai trò `SX` điều hành xưởng
   * nhưng KHÔNG có quyền phê duyệt (khảo sát ghi người ký là "Phó Giám đốc/Ban Giám đốc"), nên
   * lọc theo mã vai trò sẽ báo cho đúng người không ký được và bỏ sót người ký được.
   *
   * Điều kiện dưới đây là ĐÚNG điều kiện `confirm_timesheet_period` dùng để cho phép ký, kể cả
   * vế `sees_all_companies`. Hai chỗ lệch nhau thì kỳ chấm công nằm im không ai biết.
   *
   * EXISTS chứ KHÔNG phải JOIN: một người có thể được gán vào nhiều pháp nhân, và `sees_all_
   * companies` bỏ luôn điều kiện lọc pháp nhân — nối bảng thì Tổng Giám đốc (gán ở cả bốn
   * pháp nhân) nhận BỐN thông báo giống hệt nhau cho cùng một kỳ chấm công.
   */
  FROM public.users u
  WHERE u.is_active AND u.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
        FROM public.user_companies uc
        JOIN public.roles r        ON r.id = uc.role_id
        JOIN public.permissions pm ON pm.role_id = uc.role_id
       WHERE uc.user_id = u.id
         AND uc.deleted_at IS NULL
         AND (uc.company_id = p.company_id OR r.sees_all_companies)
         AND pm.module_code = public.timesheet_block_module(p.source_type)
         AND pm.can_approve
    );
END;
$$;

COMMENT ON FUNCTION public.submit_timesheet_period(uuid) IS
  'Gửi bảng công của một khối cho đúng người có quyền xác nhận khối đó — NS-04.';

/**
 * Trưởng đơn vị xác nhận số liệu đúng — NS-04.
 *
 * Khối công trường và khối xưởng nay bám đúng khảo sát (chỉ huy trưởng / Phó Giám đốc xưởng
 * ký, xem đầu file). Khối văn phòng vẫn là SUY LUẬN chờ cây tổ chức của Module NS: tạm hiểu
 * người xác nhận là người có quyền PHÊ DUYỆT trên phân hệ NS.
 */
CREATE OR REPLACE FUNCTION public.confirm_timesheet_period(p_period_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  p      record;
  v_ok   boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.timesheet_periods WHERE id = p_period_id;
  IF NOT FOUND OR NOT public.rls_company_access(p.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ chấm công này.';
  END IF;

  IF p.status <> 'cho_xac_nhan' THEN
    RAISE EXCEPTION 'Kỳ chấm công này chưa được gửi xác nhận, hoặc đã xác nhận rồi.';
  END IF;

  /*
   * `sees_all_companies` được tính vào phạm vi — giống hệt `rls_payment_step_actor` (KT-01)
   * đã làm. Không có vế đó thì Ban Giám đốc và Tổng Giám đốc, vốn được gán vào mã tổng hợp
   * NVG chứ không vào từng pháp nhân, KHÔNG xác nhận được bảng công của bất kỳ pháp nhân
   * nào — trong khi phiếu khảo sát Xưởng ghi thẳng người ký là "Phó Giám đốc/Ban Giám đốc".
   * Đây cũng đúng bẫy "lọc company_id = NVG cho ra danh sách rỗng" ở CLAUDE.md 3.5.
   */
  SELECT EXISTS (
    SELECT 1
      FROM public.user_companies uc
      JOIN public.permissions pm ON pm.role_id = uc.role_id
      JOIN public.roles r        ON r.id = uc.role_id
     WHERE uc.user_id = v_user
       AND uc.deleted_at IS NULL
       AND (uc.company_id = p.company_id OR r.sees_all_companies)
       AND pm.module_code = public.timesheet_block_module(p.source_type)
       AND pm.can_approve
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Chỉ trưởng đơn vị phụ trách khối này xác nhận được bảng chấm công.';
  END IF;

  UPDATE public.timesheet_periods
     SET status = 'da_xac_nhan', confirmed_by = v_user, confirmed_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_period_id;
END;
$$;

COMMENT ON FUNCTION public.confirm_timesheet_period(uuid) IS
  'Trưởng đơn vị xác nhận bảng công của khối mình — NS-04. Công trường/xưởng theo khảo sát 02/09/2026; văn phòng còn là suy luận.';


-- ----------------------------------------------------------------------------
-- 2. MH-07 — Ban công trường ký nhận hàng giao thẳng tới chân công trình
-- ----------------------------------------------------------------------------

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

  SELECT * INTO pr FROM public.purchase_requests WHERE id = po.purchase_request_id;

  /*
   * Khảo sát Chỉ huy – Giám sát công trường (02/09/2026) bổ sung người ký thứ ba: hàng giao
   * thẳng tới chân công trình thì "thủ kho/người được giao phối hợp với kỹ thuật kiểm tra số
   * lượng, quy cách, chất lượng và chứng từ. Hai bên ký giao nhận." Người có mặt ở đó là Ban
   * công trường, không phải Phòng Mua hàng ngồi ở văn phòng.
   *
   * Mở HẸP có chủ đích: chỉ khi đề nghị mua gắn với một công trình. Hàng mua cho văn phòng
   * hoặc cho gói thầu vẫn chỉ Mua hàng và Kho ký được.
   */
  IF NOT (
    public.auth_can_edit_module('MH')
    OR public.auth_has_role('KHO')
    OR (pr.construction_site_id IS NOT NULL AND public.auth_can_edit_module('TC'))
  ) THEN
    RAISE EXCEPTION 'Ghi nhận giao nhận do Mua hàng, Kho hoặc Ban công trường (với hàng về công trình) thực hiện.';
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
  'Ghi nhận một đợt giao nhận: kiểm đếm theo dòng, chuyển cam kết sang chi phí thực tế, báo Kho và Kế toán (MH-07, MH-08). Hàng về công trình thì Ban công trường cũng ký được.';


-- ----------------------------------------------------------------------------
-- 3. SX-03 — lô "mới" cho thuê được, và thu hồi nhiều đợt
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_rental_agreement(p_company_id uuid, p_customer_id uuid, p_construction_site_id uuid, p_site_address text, p_start_date date, p_expected_end_date date, p_deposit_amount bigint, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user          uuid := public.auth_user_id();
  v_agreement_id  uuid;
  v_code          text;
  v_company_code  text;
  v_customer_name text;
  v_item          jsonb;
  v_material_id   uuid;
  v_quantity      numeric;
  v_daily_rate    bigint;
  v_remaining     numeric;
  v_lot           record;
  v_take          numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.rls_company_access(p_company_id) OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Không tạo được hợp đồng cho thuê ở pháp nhân này.';
  END IF;

  IF p_start_date IS NULL THEN
    RAISE EXCEPTION 'Chọn ngày bắt đầu thuê.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Hợp đồng thuê phải có ít nhất một loại giàn giáo.';
  END IF;

  SELECT code INTO v_company_code FROM public.companies WHERE id = p_company_id;
  SELECT name INTO v_customer_name FROM public.customers WHERE id = p_customer_id;
  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy khách hàng.';
  END IF;

  v_code := public.next_record_code(v_company_code, 'HDT', NULL);

  INSERT INTO public.rental_agreements (
    company_id, code, customer_id, construction_site_id, site_address,
    start_date, expected_end_date, status, deposit_amount, notes, created_by, updated_by
  ) VALUES (
    p_company_id, v_code, p_customer_id, p_construction_site_id, NULLIF(btrim(p_site_address), ''),
    p_start_date, p_expected_end_date, 'dang_thue', COALESCE(p_deposit_amount, 0),
    NULLIF(btrim(p_notes), ''), v_user, v_user
  )
  RETURNING id INTO v_agreement_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_material_id := (v_item->>'material_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_daily_rate := COALESCE((v_item->>'daily_rate')::bigint, 0);

    IF v_material_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Mỗi dòng phải có vật tư và số lượng lớn hơn 0.';
    END IF;

    INSERT INTO public.rental_agreement_items (
      rental_agreement_id, material_id, quantity_out, daily_rate, created_by, updated_by
    ) VALUES (
      v_agreement_id, v_material_id, v_quantity, v_daily_rate, v_user, v_user
    );

    v_remaining := v_quantity;

    /*
     * Xuất được từ lô "còn dùng được" VÀ lô "mới" — khảo sát Xưởng 02/09/2026: dây chuyền
     * kết thúc bằng "kiểm tra thành phẩm → đếm, bó kiện, dán nhận diện → lập phiếu nhập kho
     * thành phẩm", nên hàng mới vào kho đã qua kiểm tra chất lượng và sẵn sàng cho thuê.
     *
     * Thứ tự lấy: "còn dùng được" trước, "mới" sau. Hàng đã qua sử dụng luân chuyển tiếp,
     * hàng mới để dành cho khách yêu cầu hàng mới — nếu lấy lẫn lộn thì tồn kho dồn về toàn
     * hàng cũ và không còn gì đáp ứng yêu cầu đó.
     */
    FOR v_lot IN
      SELECT id, quantity, asset_code, warehouse_id, condition
        FROM public.scaffolding_assets
       WHERE company_id = p_company_id
         AND material_id = v_material_id
         AND location_type = 'kho'
         AND condition IN ('con_dung_duoc', 'moi')
         AND deleted_at IS NULL
         AND quantity > 0
       ORDER BY (condition = 'con_dung_duoc') DESC, created_at
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, v_lot.quantity);

      UPDATE public.scaffolding_assets
         SET quantity = quantity - v_take, updated_at = now(), updated_by = v_user
       WHERE id = v_lot.id;

      INSERT INTO public.scaffolding_assets (
        company_id, asset_code, material_id, quantity, condition,
        location_type, construction_site_id, renter_name, current_rental_agreement_id,
        created_by, updated_by
      ) VALUES (
        p_company_id, left(v_lot.asset_code, 44) || '-HDT-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
        v_material_id, v_take, v_lot.condition,
        'khach_thue', p_construction_site_id, v_customer_name, v_agreement_id,
        v_user, v_user
      );

      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION
        'Kho chỉ còn % (tình trạng "mới" hoặc "còn dùng được") cho vật tư này, không đủ % đã đề nghị.',
        v_quantity - v_remaining, v_quantity;
    END IF;
  END LOOP;

  RETURN v_agreement_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.return_rental_agreement(p_rental_agreement_id uuid, p_actual_return_date date, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user               uuid := public.auth_user_id();
  ra                   record;
  ri                   record;
  v_item               jsonb;
  v_material_id        uuid;
  v_ok                 numeric;
  v_damaged            numeric;
  v_lost               numeric;
  v_returning          numeric;
  v_compensation       bigint;
  v_note               text;
  v_lot                record;
  v_target             uuid;
  v_days               integer;
  v_total_revenue      bigint := 0;
  v_total_compensation bigint := 0;
  v_return_date        date := COALESCE(p_actual_return_date, current_date);
  v_customer_name      text;
  v_all_returned       boolean;
  v_left               numeric;
  v_take               numeric;
  v_lot_id             uuid;
  v_lot_code           text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO ra FROM public.rental_agreements
   WHERE id = p_rental_agreement_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(ra.company_id)
     OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng thuê này.';
  END IF;

  IF ra.status <> 'dang_thue' THEN
    RAISE EXCEPTION 'Hợp đồng không ở trạng thái đang cho thuê, không thu hồi được nữa.';
  END IF;

  IF v_return_date < ra.start_date THEN
    RAISE EXCEPTION 'Ngày trả không thể trước ngày bắt đầu thuê.';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Phải khai tình trạng trả cho từng loại giàn giáo đã thuê.';
  END IF;

  SELECT name INTO v_customer_name FROM public.customers WHERE id = ra.customer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_material_id  := (v_item->>'material_id')::uuid;
    v_ok           := COALESCE((v_item->>'quantity_ok')::numeric, 0);
    v_damaged      := COALESCE((v_item->>'quantity_damaged')::numeric, 0);
    v_lost         := COALESCE((v_item->>'quantity_lost')::numeric, 0);
    v_compensation := COALESCE((v_item->>'compensation_amount')::bigint, 0);
    v_note         := NULLIF(btrim(v_item->>'note'), '');
    v_returning    := v_ok + v_damaged + v_lost;

    IF v_returning <= 0 THEN
      RAISE EXCEPTION 'Mỗi dòng trả phải có ít nhất một số lượng lớn hơn 0.';
    END IF;

    IF (v_damaged > 0 OR v_lost > 0) AND v_compensation < 0 THEN
      RAISE EXCEPTION 'Mức bồi thường không được âm.';
    END IF;

    SELECT * INTO ri FROM public.rental_agreement_items
     WHERE rental_agreement_id = p_rental_agreement_id AND material_id = v_material_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Hợp đồng này không có dòng thuê vật tư đang khai.';
    END IF;

    IF v_returning >
       (ri.quantity_out - ri.quantity_returned_ok - ri.quantity_damaged - ri.quantity_lost)
    THEN
      RAISE EXCEPTION 'Số lượng trả vượt số còn lại chưa trả của dòng thuê này.';
    END IF;

    UPDATE public.rental_agreement_items
       SET quantity_returned_ok = quantity_returned_ok + v_ok,
           quantity_damaged     = quantity_damaged + v_damaged,
           quantity_lost        = quantity_lost + v_lost,
           compensation_amount  = compensation_amount + v_compensation,
           note                 = COALESCE(v_note, note),
           updated_at = now(), updated_by = v_user
     WHERE id = ri.id;

    v_total_compensation := v_total_compensation + v_compensation;

    -- Doanh thu tính theo số ngày ĐÃ thuê thật của ĐỢT TRẢ NÀY (ngày bắt đầu → ngày trả của
    -- đợt), không theo ngày dự kiến — SX-03 cần con số đã xảy ra để đối chiếu, không phải con
    -- số hứa hẹn lúc ký. Khảo sát Xưởng 02/09/2026: "Nếu khách giao hoặc trả nhiều lần, tiền
    -- thuê phải tính riêng theo từng đợt hoặc theo số dư hằng ngày" — nên hàng trả sớm không
    -- phải trả tiền cho quãng thời gian sau khi đã về kho.
    v_days := GREATEST((v_return_date - ra.start_date) + 1, 1);
    v_total_revenue := v_total_revenue + (ri.daily_rate * v_returning * v_days);

    /*
     * Khoá đúng lô đang gắn hợp đồng này — hai khách thuê cùng vật tư không đụng vào lô của
     * nhau nhờ `current_rental_agreement_id` (xem ghi chú đầu file 0053).
     *
     * Trừ dần qua NHIỀU lô, không giả định chỉ có một: `create_rental_agreement` sinh một lô
     * bên khách cho MỖI lô nguồn nó rút ra, nên một dòng thuê 100 bộ gom từ hai lô kho 60 và
     * 40 sẽ nằm ở hai lô. Bản cũ chỉ lấy lô đầu rồi báo "không đủ để trả" — khách trả đủ hàng
     * mà hệ thống từ chối. Từ 02/09/2026 chuyện này còn dễ xảy ra hơn vì lô nguồn được phép
     * khác tình trạng ("mới" lẫn "còn dùng được").
     */
    v_left := v_returning;
    v_lot_id := NULL;

    FOR v_lot IN
      SELECT * FROM public.scaffolding_assets
       WHERE current_rental_agreement_id = p_rental_agreement_id
         AND material_id = v_material_id
         AND location_type = 'khach_thue'
         AND deleted_at IS NULL
         AND quantity > 0
       ORDER BY created_at
       FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;

      -- Lô đầu tiên đại diện cho dòng trả này trong biên bản hư hỏng/mất và trong mã lô mới.
      IF v_lot_id IS NULL THEN
        v_lot_id := v_lot.id;
        v_lot_code := v_lot.asset_code;
      END IF;

      v_take := LEAST(v_left, v_lot.quantity);

      UPDATE public.scaffolding_assets
         SET quantity = quantity - v_take, updated_at = now(), updated_by = v_user
       WHERE id = v_lot.id;

      v_left := v_left - v_take;
    END LOOP;

    IF v_left > 0 THEN
      RAISE EXCEPTION 'Lô giàn giáo đang ghi ở bên thuê không đủ để trả — kiểm tra lại số liệu.';
    END IF;

    -- Phần ĐẠT quay lại kho — gộp vào lô sẵn có nếu trùng vật tư/tình trạng, giống cách
    -- `record_scaffolding_event` (Module KHO) đã gộp.
    IF v_ok > 0 THEN
      SELECT id INTO v_target FROM public.scaffolding_assets
       WHERE company_id = ra.company_id AND material_id = v_material_id
         AND condition = 'con_dung_duoc' AND location_type = 'kho'
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE;

      IF v_target IS NULL THEN
        INSERT INTO public.scaffolding_assets (
          company_id, asset_code, material_id, quantity, condition, location_type,
          created_by, updated_by
        ) VALUES (
          ra.company_id, left(v_lot_code, 44) || '-TRA-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
          v_material_id, v_ok, 'con_dung_duoc', 'kho', v_user, v_user
        );
      ELSE
        UPDATE public.scaffolding_assets
           SET quantity = quantity + v_ok, updated_at = now(), updated_by = v_user
         WHERE id = v_target;
      END IF;
    END IF;

    -- Phần hư hỏng — về kho nhưng KHÔNG gộp chung với hàng dùng được (KHO-06), và để lại
    -- biên bản như mọi lần đổi tình trạng khác.
    IF v_damaged > 0 THEN
      SELECT id INTO v_target FROM public.scaffolding_assets
       WHERE company_id = ra.company_id AND material_id = v_material_id
         AND condition = 'hong_cho_sua' AND location_type = 'kho'
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE;

      IF v_target IS NULL THEN
        INSERT INTO public.scaffolding_assets (
          company_id, asset_code, material_id, quantity, condition, location_type,
          created_by, updated_by
        ) VALUES (
          ra.company_id, left(v_lot_code, 44) || '-HH-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
          v_material_id, v_damaged, 'hong_cho_sua', 'kho', v_user, v_user
        );
      ELSE
        UPDATE public.scaffolding_assets
           SET quantity = quantity + v_damaged, updated_at = now(), updated_by = v_user
         WHERE id = v_target;
      END IF;

      -- Xem ghi chú đầu file: chỉ gán tiền bồi thường vào biên bản MẤT khi có mất, tránh
      -- đếm trùng với biên bản hư hỏng.
      INSERT INTO public.scaffolding_events (
        company_id, scaffolding_asset_id, event_type, event_date, quantity,
        result_condition, amount, responsible_party, reason, recorded_by, created_by, updated_by
      ) VALUES (
        ra.company_id, v_lot_id, 'sua_chua', v_return_date, v_damaged, 'hong_cho_sua',
        CASE WHEN v_lost > 0 THEN 0 ELSE v_compensation END, v_customer_name,
        'Hư hỏng phát hiện khi thu hồi hợp đồng thuê ' || ra.code || COALESCE(' — ' || v_note, ''),
        v_user, v_user, v_user
      );
    END IF;

    -- Phần mất — không quay lại kho, chỉ còn lại biên bản để truy trách nhiệm/bồi thường.
    IF v_lost > 0 THEN
      INSERT INTO public.scaffolding_events (
        company_id, scaffolding_asset_id, event_type, event_date, quantity,
        result_condition, amount, responsible_party, reason, recorded_by, created_by, updated_by
      ) VALUES (
        ra.company_id, v_lot_id, 'mat_mat', v_return_date, v_lost, NULL,
        v_compensation, v_customer_name,
        'Mất khi thu hồi hợp đồng thuê ' || ra.code || COALESCE(' — ' || v_note, ''),
        v_user, v_user, v_user
      );
    END IF;
  END LOOP;

  /*
   * Trả nhiều đợt — khảo sát Xưởng 02/09/2026 mô tả đúng hiện trạng: khách "giao thêm, trả
   * bớt, điều chuyển, gia hạn" trong suốt thời gian thuê, và biên bản thu hồi lập theo từng
   * chuyến. Bản trước bắt khai đủ MỌI loại trong một lần gọi, thiếu một dòng thì rollback cả
   * giao dịch — chỉ đúng với giả định "khách trả một lần".
   *
   * Nay mỗi lần gọi ghi nhận MỘT đợt: doanh thu và bồi thường cộng dồn, hợp đồng chỉ đóng
   * khi mọi dòng đã trả hết. Cộng dồn chứ không ghi đè là điều kiện bắt buộc — ghi đè thì
   * đợt sau xoá mất tiền thuê của đợt trước.
   */
  SELECT NOT EXISTS (
    SELECT 1 FROM public.rental_agreement_items
     WHERE rental_agreement_id = p_rental_agreement_id
       AND quantity_out > quantity_returned_ok + quantity_damaged + quantity_lost
  ) INTO v_all_returned;

  UPDATE public.rental_agreements
     SET status = (CASE WHEN v_all_returned THEN 'da_thu_hoi' ELSE 'dang_thue' END)::rental_agreement_status,
         actual_return_date = CASE WHEN v_all_returned THEN v_return_date ELSE actual_return_date END,
         -- COALESCE vì hai cột này nullable: hợp đồng chưa thu hồi lần nào thì còn NULL,
         -- và NULL + số vẫn là NULL — cộng dồn mà quên chỗ này thì tiền thuê biến mất sạch.
         total_revenue = COALESCE(total_revenue, 0) + v_total_revenue,
         total_compensation = COALESCE(total_compensation, 0) + v_total_compensation,
         updated_at = now(), updated_by = v_user
   WHERE id = p_rental_agreement_id;

  RETURN p_rental_agreement_id;
END;
$function$;
COMMENT ON FUNCTION public.create_rental_agreement(uuid, uuid, uuid, text, date, date, bigint, text, jsonb) IS
  'Lập hợp đồng cho thuê và xuất đúng lô giàn giáo trong cùng một giao dịch — SX-03. Xuất được cả lô "mới" và "còn dùng được".';

COMMENT ON FUNCTION public.return_rental_agreement(uuid, date, jsonb) IS
  'Ghi nhận MỘT đợt thu hồi: tách đạt/hư hỏng/mất, cộng dồn doanh thu theo số ngày thuê thật của đợt, chỉ đóng hợp đồng khi đã trả hết — SX-03.';
