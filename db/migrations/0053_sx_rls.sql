-- ============================================================================
-- Module SX — phân quyền và luồng nghiệp vụ sản xuất & cho thuê giàn giáo (NVS)
--
-- Nguồn: PRD SX-01 → SX-03, Backend Schema 4.12, Webapp Flow Mục 7 (SX).
--
-- ⚠️ SX-01/SX-02 (lệnh sản xuất, giá thành) PRD ghi "cần xác nhận thêm" — Xưởng sản xuất giàn
-- giáo chưa có khảo sát trực tiếp (PRD Mục 10, CLAUDE.md 5.6). File này chỉ mở CRUD cơ bản
-- cho `production_orders`/`material_consumption`, KHÔNG có định mức hay công thức giá thành.
--
-- SX-03 là phần chính của file này. Hai việc phải giữ được:
--
--  1. XUẤT/THU HỒI GIÀN GIÁO LUÔN DI CHUYỂN ĐÚNG LÔ VẬT LÝ. Cho thuê là chuyển một lô
--     `scaffolding_assets` từ kho sang "khách đang thuê" (`create_rental_agreement`); thu hồi
--     là chuyển ngược lại, tách theo tình trạng trả (`return_rental_agreement`). Cả hai đi
--     qua hàm nghiệp vụ vì `quantity`/`condition` của giàn giáo đã bị khoá ở migration 0039
--     (`scaffolding_assets_condition_guard`) — không có đường nào khác đổi được hai cột đó.
--  2. GIÀN GIÁO CỦA HAI KHÁCH THUÊ KHÔNG GỘP CHUNG MỘT LÔ. `scaffolding_assets` vốn gộp lô
--     theo (vật tư, tình trạng, vị trí) — nếu không gắn thêm `current_rental_agreement_id`,
--     hai khách cùng thuê một loại giáo sẽ dồn vào một dòng và không tách được ai đang giữ
--     bao nhiêu để thu hồi đúng người.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Bộ theo dõi chuẩn, cột định danh bất biến, cột chỉ đổi qua hàm nghiệp vụ, và khoá ngoại
--    còn nợ từ migration 0052 (tránh vòng phụ thuộc `kho.ts ↔ sx.ts`, xem ghi chú ở đó)
-- ----------------------------------------------------------------------------

ALTER TABLE public.scaffolding_assets
  ADD CONSTRAINT scaffolding_assets_current_rental_agreement_id_fk
  FOREIGN KEY (current_rental_agreement_id) REFERENCES public.rental_agreements(id)
  ON DELETE SET NULL;

SELECT public.attach_audit_touch('public.production_orders');
SELECT public.attach_audit_touch('public.material_consumption');
SELECT public.attach_audit_touch('public.rental_agreements');
SELECT public.attach_audit_touch('public.rental_agreement_items');

CREATE TRIGGER production_orders_freeze_identity
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

CREATE TRIGGER material_consumption_freeze_identity
  BEFORE UPDATE ON public.material_consumption
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'production_order_id', 'material_id'
  );

CREATE TRIGGER rental_agreements_freeze_identity
  BEFORE UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'customer_id', 'start_date'
  );

-- Vòng đời và số tiền chốt chỉ đổi qua `return_rental_agreement` — mở cột này cho trình
-- duyệt là mở đường tự đóng hợp đồng mà không di chuyển lô giàn giáo nào cả.
CREATE TRIGGER rental_agreements_stage_guard
  BEFORE UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'actual_return_date', 'total_revenue', 'total_compensation'
  );


-- ----------------------------------------------------------------------------
-- 1. Chính sách truy cập — Mẫu A cho cả bốn bảng (Backend Schema 4.12)
-- ----------------------------------------------------------------------------

ALTER TABLE public.production_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_consumption  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_agreements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_agreement_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.production_orders     FROM anon;
REVOKE ALL ON public.material_consumption  FROM anon;
REVOKE ALL ON public.rental_agreements     FROM anon;
REVOKE ALL ON public.rental_agreement_items FROM anon;

REVOKE DELETE ON public.production_orders FROM authenticated;

-- Xuất/thu hồi giàn giáo chỉ qua hàm nghiệp vụ — xem lý do ở đầu file. Ghi chú/ngày dự kiến
-- trả/công trình vẫn sửa trực tiếp được (chốt ở trigger mục 0, không phải ở đây).
REVOKE INSERT ON public.rental_agreements FROM authenticated;

-- Dòng thuê từng loại giàn giáo: số liệu do hàm tính, không cho sửa tay ở bất kỳ bước nào.
REVOKE INSERT, UPDATE, DELETE ON public.rental_agreement_items FROM authenticated;


-- Lệnh sản xuất — CRUD mở, chưa có bước duyệt (SX-01 "cần xác nhận thêm").
CREATE POLICY production_orders_select ON public.production_orders
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('SX')
  );

CREATE POLICY production_orders_insert ON public.production_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_create_in('SX', company_id));

CREATE POLICY production_orders_update ON public.production_orders
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('SX')
  )
  WITH CHECK (public.rls_company_access(company_id));


CREATE OR REPLACE FUNCTION public.rls_production_order_readable(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.production_orders o
    WHERE o.id = p_order_id
      AND o.deleted_at IS NULL
      AND public.rls_company_access(o.company_id)
      AND public.auth_can_view_module('SX')
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_production_order_writable(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.production_orders o
    WHERE o.id = p_order_id
      AND o.deleted_at IS NULL
      AND public.rls_company_access(o.company_id)
      AND public.auth_can_edit_module('SX')
  );
$$;

CREATE POLICY material_consumption_select ON public.material_consumption
  FOR SELECT TO authenticated
  USING (public.rls_production_order_readable(production_order_id));

CREATE POLICY material_consumption_insert ON public.material_consumption
  FOR INSERT TO authenticated
  WITH CHECK (public.rls_production_order_writable(production_order_id));

CREATE POLICY material_consumption_update ON public.material_consumption
  FOR UPDATE TO authenticated
  USING (public.rls_production_order_writable(production_order_id))
  WITH CHECK (public.rls_production_order_writable(production_order_id));

CREATE POLICY material_consumption_delete ON public.material_consumption
  FOR DELETE TO authenticated
  USING (public.rls_production_order_writable(production_order_id));


-- Hợp đồng cho thuê giàn giáo — CRM cũng đọc được (CRM-11 nối SX cho nghiệp vụ cho thuê),
-- cùng cách `scaffolding_assets_select` đã mở cho CRM ở migration 0039.
CREATE POLICY rental_agreements_select ON public.rental_agreements
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (public.auth_can_view_module('SX') OR public.auth_can_view_module('CRM'))
  );

CREATE POLICY rental_agreements_update ON public.rental_agreements
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('SX')
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY rental_agreement_items_select ON public.rental_agreement_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_agreements ra
      WHERE ra.id = rental_agreement_id AND ra.deleted_at IS NULL
    )
  );


-- ----------------------------------------------------------------------------
-- 2. Xuất giàn giáo cho thuê — SX-03, tạo hồ sơ VÀ chuyển lô trong cùng một giao dịch
-- ----------------------------------------------------------------------------

/**
 * `p_items`: mảng jsonb [{material_id, quantity, daily_rate}].
 *
 * Chỉ lấy từ lô tình trạng "còn dùng được" ở kho — lô "mới" coi như CHƯA được Kho phân loại
 * sẵn sàng cho thuê (Kho phải tự chuyển sang "còn dùng được" trước, qua nghiệp vụ riêng của
 * Module KHO). ⚠️ Giả định cần Haan xác nhận cùng lúc với các giả định KHO-06 khác.
 */
CREATE OR REPLACE FUNCTION public.create_rental_agreement(
  p_company_id uuid,
  p_customer_id uuid,
  p_construction_site_id uuid,
  p_site_address text,
  p_start_date date,
  p_expected_end_date date,
  p_deposit_amount bigint,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    FOR v_lot IN
      SELECT id, quantity, asset_code, warehouse_id
        FROM public.scaffolding_assets
       WHERE company_id = p_company_id
         AND material_id = v_material_id
         AND location_type = 'kho'
         AND condition = 'con_dung_duoc'
         AND deleted_at IS NULL
         AND quantity > 0
       ORDER BY created_at
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
        p_company_id, v_lot.asset_code || '-HDT-' || to_char(now(), 'YYMMDDHH24MISS'),
        v_material_id, v_take, 'con_dung_duoc',
        'khach_thue', p_construction_site_id, v_customer_name, v_agreement_id,
        v_user, v_user
      );

      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION
        'Kho chỉ còn % (tình trạng "còn dùng được") cho vật tư này, không đủ % đã đề nghị.',
        v_quantity - v_remaining, v_quantity;
    END IF;
  END LOOP;

  RETURN v_agreement_id;
END;
$$;

COMMENT ON FUNCTION public.create_rental_agreement(
  uuid, uuid, uuid, text, date, date, bigint, text, jsonb
) IS 'Lập hợp đồng thuê giàn giáo VÀ chuyển đúng lô sang vị trí "khách đang thuê" trong cùng một giao dịch (SX-03).';


-- ----------------------------------------------------------------------------
-- 3. Thu hồi giàn giáo — SX-03, Backend Schema 4.12 (`POST /rental-agreements/:id/return`)
-- ----------------------------------------------------------------------------

/**
 * `p_items`: mảng jsonb [{material_id, quantity_ok, quantity_damaged, quantity_lost,
 * compensation_amount, note}]. Một lần gọi phải khai đủ MỌI loại giàn giáo đã thuê trong hợp
 * đồng — Backend Schema chỉ đặc tả một endpoint thu hồi duy nhất, không có "thu hồi một phần
 * rồi thu hồi tiếp sau". Đóng hợp đồng khi vẫn còn giàn giáo chưa khai tình trạng trả là mất
 * dấu vật lý — hàm chặn thẳng ở bước cuối.
 */
CREATE OR REPLACE FUNCTION public.return_rental_agreement(
  p_rental_agreement_id uuid,
  p_actual_return_date date,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

    -- Doanh thu tính theo số ngày ĐÃ thuê thật (ngày bắt đầu → ngày trả), không theo ngày dự
    -- kiến — SX-03 cần con số đã xảy ra để đối chiếu, không phải con số hứa hẹn lúc ký.
    v_days := GREATEST((v_return_date - ra.start_date) + 1, 1);
    v_total_revenue := v_total_revenue + (ri.daily_rate * v_returning * v_days);

    -- Khoá đúng lô đang gắn hợp đồng này — hai khách thuê cùng vật tư không đụng vào lô của
    -- nhau nhờ `current_rental_agreement_id` (xem ghi chú đầu file).
    SELECT * INTO v_lot FROM public.scaffolding_assets
     WHERE current_rental_agreement_id = p_rental_agreement_id
       AND material_id = v_material_id
       AND location_type = 'khach_thue'
       AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND OR v_lot.quantity < v_returning THEN
      RAISE EXCEPTION 'Lô giàn giáo đang ghi ở bên thuê không đủ để trả — kiểm tra lại số liệu.';
    END IF;

    UPDATE public.scaffolding_assets
       SET quantity = quantity - v_returning, updated_at = now(), updated_by = v_user
     WHERE id = v_lot.id;

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
          ra.company_id, v_lot.asset_code || '-TRA-' || to_char(now(), 'YYMMDDHH24MISS'),
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
          ra.company_id, v_lot.asset_code || '-HH-' || to_char(now(), 'YYMMDDHH24MISS'),
          v_material_id, v_damaged, 'hong_cho_sua', 'kho', v_user, v_user
        );
      ELSE
        UPDATE public.scaffolding_assets
           SET quantity = quantity + v_damaged, updated_at = now(), updated_by = v_user
         WHERE id = v_target;
      END IF;

      -- `compensation_amount` là MỘT số tiền cho cả dòng (khai chung ở biểu mẫu thu hồi,
      -- xem `rental_agreement_items`), không tách riêng phần hư hỏng/phần mất. Ghi nguyên số
      -- đó vào CẢ HAI biên bản sẽ đếm trùng nếu ai đó cộng `scaffolding_events.amount` của lô
      -- này — nên chỉ gán vào biên bản MẤT (nặng hơn, mất vĩnh viễn) khi có mất; hư hỏng chỉ
      -- nhận phần còn lại là 0. `rental_agreement_items.compensation_amount` mới là số đúng
      -- để đối chiếu tổng tiền, hai biên bản này chỉ để truy vết CÓ chuyện gì xảy ra.
      INSERT INTO public.scaffolding_events (
        company_id, scaffolding_asset_id, event_type, event_date, quantity,
        result_condition, amount, responsible_party, reason, recorded_by, created_by, updated_by
      ) VALUES (
        ra.company_id, v_lot.id, 'sua_chua', v_return_date, v_damaged, 'hong_cho_sua',
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
        ra.company_id, v_lot.id, 'mat_mat', v_return_date, v_lost, NULL,
        v_compensation, v_customer_name,
        'Mất khi thu hồi hợp đồng thuê ' || ra.code || COALESCE(' — ' || v_note, ''),
        v_user, v_user, v_user
      );
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.rental_agreement_items
     WHERE rental_agreement_id = p_rental_agreement_id
       AND quantity_out > quantity_returned_ok + quantity_damaged + quantity_lost
  ) THEN
    RAISE EXCEPTION
      'Còn loại giàn giáo chưa khai tình trạng trả — phải khai đủ mới đóng được hợp đồng.';
  END IF;

  UPDATE public.rental_agreements
     SET status = 'da_thu_hoi',
         actual_return_date = v_return_date,
         total_revenue = v_total_revenue,
         total_compensation = v_total_compensation,
         updated_at = now(), updated_by = v_user
   WHERE id = p_rental_agreement_id;

  RETURN p_rental_agreement_id;
END;
$$;

COMMENT ON FUNCTION public.return_rental_agreement(uuid, date, jsonb) IS
  'Thu hồi giàn giáo, đối soát hao hụt/hư hỏng, tính doanh thu và bồi thường — Backend Schema 4.12 POST /rental-agreements/:id/return.';
