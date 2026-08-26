-- ============================================================================
-- Module KHO — phân quyền và luồng nghiệp vụ kho
--
-- Nguồn: PRD KHO-01 → KHO-10, Backend Schema 4.8, Webapp Flow 3.6 và 4.7.
--
-- Năm thứ file này phải giữ được:
--
--  1. SỔ KHO CHỈ ĐỔI QUA PHIẾU. `inventory_items.quantity_on_hand` không mở cho trình duyệt
--     ghi. Mỗi lần con số đổi đều có một phiếu đứng sau nó — không có ràng buộc đó thì kiểm
--     kê KHO-07 mất luôn cái để đối chiếu.
--  2. KHÔNG XUẤT QUÁ TỒN. Tồn âm nghĩa là đã xuất thứ không có trong kho, và mọi báo cáo
--     phía sau sai theo.
--  3. ĐIỀU CHUYỂN LÀ MỘT VIỆC, KHÔNG PHẢI HAI. Giảm ở kho xuất và tăng ở kho nhận nằm trong
--     cùng một giao dịch (KHO-05) — tách ra thì có lúc hàng không ở đâu cả.
--  4. KIỂM KÊ KHOÁ KHO, VÀ ĐIỀU CHỈNH PHẢI ĐƯỢC DUYỆT TRƯỚC. KHO-07 nói cả hai vế: "tạm
--     dừng nhập–xuất trong lúc kiểm" và "trình phê duyệt TRƯỚC KHI điều chỉnh số liệu".
--  5. GIÀN GIÁO HỎNG KHÔNG NẰM CHUNG VỚI HÀNG DÙNG ĐƯỢC (KHO-06). Gộp vào thì Kinh doanh
--     hứa với khách một lượng hàng cho thuê mà thực tế không cho thuê được.
--
-- ⚠️ KHO-09 mới làm PHẦN CHỐNG GHI TRÙNG (`client_generated_id`), chưa làm ngoại tuyến thật.
-- Gửi lại cùng một phiếu không tạo ra hai phiếu — điều kiện cần của mọi cơ chế đồng bộ lại,
-- và tự nó đã giải được trường hợp mất sóng giữa lúc gửi. Quyết định "ngoại tuyến thật hay
-- chỉ chống trùng" còn treo (CLAUDE.md 6.6).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Bộ theo dõi chuẩn, cột định danh bất biến, và cột chỉ đổi qua hàm nghiệp vụ
-- ----------------------------------------------------------------------------

SELECT public.attach_audit_touch('public.materials');
SELECT public.attach_audit_touch('public.warehouses');
SELECT public.attach_audit_touch('public.inventory_items');
SELECT public.attach_audit_touch('public.stock_movements');
SELECT public.attach_audit_touch('public.stock_movement_items');
SELECT public.attach_audit_touch('public.stocktakes');
SELECT public.attach_audit_touch('public.stocktake_items');
SELECT public.attach_audit_touch('public.scaffolding_assets');
SELECT public.attach_audit_touch('public.scaffolding_events');

CREATE TRIGGER materials_freeze_identity
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code');

CREATE TRIGGER warehouses_freeze_identity
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('code', 'company_id');

CREATE TRIGGER inventory_items_freeze_identity
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'warehouse_id', 'material_id'
  );

CREATE TRIGGER stock_movements_freeze_identity
  BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'movement_type', 'warehouse_id', 'target_warehouse_id',
    'client_generated_id'
  );

CREATE TRIGGER stock_movement_items_freeze_identity
  BEFORE UPDATE ON public.stock_movement_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'stock_movement_id', 'material_id', 'quantity'
  );

CREATE TRIGGER stocktakes_freeze_identity
  BEFORE UPDATE ON public.stocktakes
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'warehouse_id'
  );

CREATE TRIGGER stocktake_items_freeze_identity
  BEFORE UPDATE ON public.stocktake_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'stocktake_id', 'material_id', 'book_quantity'
  );

CREATE TRIGGER scaffolding_assets_freeze_identity
  BEFORE UPDATE ON public.scaffolding_assets
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('asset_code', 'company_id');

CREATE TRIGGER scaffolding_events_freeze_identity
  BEFORE UPDATE ON public.scaffolding_events
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'scaffolding_asset_id', 'event_type', 'quantity'
  );

-- Sổ kho chỉ đổi qua phiếu. Đây là chốt chặn số 1 của module: mở cột này cho trình duyệt là
-- mở đường sửa tồn không để lại phiếu nào, và kiểm kê KHO-07 mất căn cứ đối chiếu.
CREATE TRIGGER inventory_items_quantity_guard
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'quantity_on_hand', 'average_cost', 'last_movement_at'
  );

CREATE TRIGGER stocktakes_status_guard
  BEFORE UPDATE ON public.stocktakes
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'counted_at', 'adjusted_at'
  );

-- Tình trạng giàn giáo chỉ đổi qua biên bản (KHO-06). Không có dòng này thì một câu PATCH
-- đặt thẳng `condition = 'con_dung_duoc'` sẽ đưa 80 bộ giáo hỏng trở lại danh sách cho thuê.
CREATE TRIGGER scaffolding_assets_condition_guard
  BEFORE UPDATE ON public.scaffolding_assets
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'condition', 'quantity'
  );

-- Một phiếu giao nhận chỉ nhập kho MỘT LẦN. Gọi lại `receive_from_delivery` vì bấm hai lần
-- hoặc vì mất sóng sẽ cộng tồn hai lần nếu thiếu chỉ số này.
CREATE UNIQUE INDEX stock_movements_one_receipt_per_delivery
  ON public.stock_movements (delivery_id)
  WHERE delivery_id IS NOT NULL AND movement_type = 'nhap' AND deleted_at IS NULL;


-- ----------------------------------------------------------------------------
-- 1. Điều kiện dùng chung
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_warehouse_readable(p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = p_warehouse_id
      AND w.deleted_at IS NULL
      AND public.rls_company_access(w.company_id)
      AND public.auth_can_view_module('KHO')
  );
$$;

CREATE OR REPLACE FUNCTION public.rls_warehouse_writable(p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.warehouses w
    WHERE w.id = p_warehouse_id
      AND w.deleted_at IS NULL
      AND w.is_active
      AND public.rls_company_access(w.company_id)
      AND public.auth_can_edit_module('KHO')
  );
$$;

/**
 * Kho có đang bị khoá vì một đợt kiểm kê hay không — KHO-07.
 *
 * "Tạm dừng nhập–xuất trong lúc kiểm" là câu chữ của PRD, và nó có lý do: số đếm được và số
 * sổ kho phải là CÙNG MỘT thời điểm. Cho nhập xuất chen vào giữa thì mọi chênh lệch tìm ra
 * đều không kết luận được là do đếm sai, do thất thoát, hay do phiếu chen ngang.
 */
CREATE OR REPLACE FUNCTION public.warehouse_stocktake_open(p_warehouse_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stocktakes s
    WHERE s.warehouse_id = p_warehouse_id
      AND s.status IN ('dang_kiem', 'cho_duyet')
      AND s.deleted_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.warehouse_stocktake_open(uuid) IS
  'Kho đang có đợt kiểm kê mở hay không — trong lúc đó nhập xuất bị tạm dừng (KHO-07).';


-- ----------------------------------------------------------------------------
-- 2. Chính sách truy cập
-- ----------------------------------------------------------------------------

ALTER TABLE public.materials            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktakes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocktake_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scaffolding_assets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scaffolding_events   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.materials            FROM anon;
REVOKE ALL ON public.warehouses           FROM anon;
REVOKE ALL ON public.inventory_items      FROM anon;
REVOKE ALL ON public.stock_movements      FROM anon;
REVOKE ALL ON public.stock_movement_items FROM anon;
REVOKE ALL ON public.stocktakes           FROM anon;
REVOKE ALL ON public.stocktake_items      FROM anon;
REVOKE ALL ON public.scaffolding_assets   FROM anon;
REVOKE ALL ON public.scaffolding_events   FROM anon;

-- Phiếu kho, dòng phiếu, dòng tồn và biên bản giàn giáo CHỈ sinh ra từ hàm nghiệp vụ: mỗi
-- cái đều đổi một con số mà báo cáo tài sản và ngân sách công trình đọc tới.
REVOKE INSERT, UPDATE, DELETE ON public.inventory_items      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_movements      FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_movement_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stocktake_items      FROM authenticated;
REVOKE INSERT, DELETE          ON public.stocktakes          FROM authenticated;
REVOKE INSERT, UPDATE, DELETE  ON public.scaffolding_events  FROM authenticated;
REVOKE DELETE ON public.materials          FROM authenticated;
REVOKE DELETE ON public.warehouses         FROM authenticated;
REVOKE DELETE ON public.scaffolding_assets FROM authenticated;


/*
 * Danh mục vật tư — bảng DÙNG CHUNG, cùng cách `customers` và `suppliers` đã làm.
 *
 * Ai cũng ĐỌC được nếu xem được một trong hai phân hệ dùng tới nó: Kho làm việc trên danh
 * mục, còn Mua hàng phải chọn đúng mã khi lập đề nghị (MH-01) và khi nhập báo giá. Chỉ Kho
 * (và Quản trị) mới SỬA — KHO-02 chỉ giữ được "một vật tư một mã" khi việc đặt mã nằm ở một
 * đầu mối.
 */
CREATE POLICY materials_select ON public.materials
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (public.auth_can_view_module('KHO') OR public.auth_can_view_module('MH'))
  );

CREATE POLICY materials_insert ON public.materials
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_edit_module('KHO'));

CREATE POLICY materials_update ON public.materials
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.auth_can_edit_module('KHO'))
  WITH CHECK (public.auth_can_edit_module('KHO'));


-- Kho — Mẫu A (Backend Schema 4.8).
CREATE POLICY warehouses_select ON public.warehouses
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    -- Mua hàng "xem tồn" theo Webapp Flow 2.3, nên cũng phải đọc được danh sách kho.
    AND (public.auth_can_view_module('KHO') OR public.auth_can_view_module('MH'))
  );

CREATE POLICY warehouses_insert ON public.warehouses
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_create_in('KHO', company_id));

CREATE POLICY warehouses_update ON public.warehouses
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('KHO')
  )
  WITH CHECK (public.rls_company_access(company_id));


-- Tồn kho, phiếu kho và dòng phiếu — chỉ đọc từ trình duyệt.
CREATE POLICY inventory_items_select ON public.inventory_items
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (public.auth_can_view_module('KHO') OR public.auth_can_view_module('MH'))
  );

CREATE POLICY stock_movements_select ON public.stock_movements
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (public.auth_can_view_module('KHO') OR public.auth_can_view_module('MH'))
  );

CREATE POLICY stock_movement_items_select ON public.stock_movement_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.id = stock_movement_id));


-- Kiểm kê — đọc theo kho; đếm và trình duyệt đi qua hàm nghiệp vụ.
CREATE POLICY stocktakes_select ON public.stocktakes
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_warehouse_readable(warehouse_id));

-- Sửa được ghi chú và nguyên nhân chênh lệch; `status` đã bị trigger ở mục 0 chặn.
CREATE POLICY stocktakes_update ON public.stocktakes
  FOR UPDATE TO authenticated
  USING (deleted_at IS NULL AND public.rls_warehouse_writable(warehouse_id))
  WITH CHECK (public.rls_warehouse_writable(warehouse_id));

CREATE POLICY stocktake_items_select ON public.stocktake_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stocktakes s WHERE s.id = stocktake_id));


-- Giàn giáo — Mẫu A. Tình trạng và số lượng chỉ đổi qua biên bản (KHO-06).
CREATE POLICY scaffolding_assets_select ON public.scaffolding_assets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    -- Kinh doanh NVS cần biết còn bao nhiêu bộ cho thuê được (KHO-10 → CRM), nên đọc được.
    AND (
      public.auth_can_view_module('KHO')
      OR public.auth_can_view_module('CRM')
      OR public.auth_can_view_module('SX')
    )
  );

/*
 * Tạo lô giàn giáo là đường ghi SỐ DƯ ĐẦU KỲ: đưa số giàn giáo đang có thật vào sổ tài sản.
 *
 * Cố ý mở INSERT (khác `inventory_items` bị khoá hoàn toàn) vì chưa có luồng nào sinh ra lô
 * giàn giáo một cách tự động — mua giàn giáo về hiện phải ghi tay ở đây, và việc nối tự động
 * chờ khảo sát Xưởng giàn giáo (KHO-10, PRD Mục 10). Sau khi lô đã có, SỐ LƯỢNG và TÌNH
 * TRẠNG chỉ đổi qua biên bản — trigger ở mục 0 chặn mọi câu UPDATE thẳng.
 */
CREATE POLICY scaffolding_assets_insert ON public.scaffolding_assets
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_can_create_in('KHO', company_id));

CREATE POLICY scaffolding_assets_update ON public.scaffolding_assets
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('KHO')
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY scaffolding_events_select ON public.scaffolding_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scaffolding_assets a WHERE a.id = scaffolding_asset_id));


-- ----------------------------------------------------------------------------
-- 3. Ghi một phiếu kho — lõi dùng chung cho cả bốn loại
--
-- Một hàm lõi thay vì bốn hàm chép nhau: bốn loại phiếu khác nhau ở ĐIỀU KIỆN được lập, còn
-- việc ghi sổ thì giống hệt. Chép bốn lần là bốn chỗ để phép cộng tồn kho lệch nhau về sau.
-- Bốn hàm công khai ở mục 4 lo phần điều kiện, hàm này lo phần ghi.
-- ----------------------------------------------------------------------------

/** Cộng/trừ một dòng tồn và cập nhật đơn giá bình quân. Không kiểm quyền — hàm nội bộ. */
CREATE OR REPLACE FUNCTION public.apply_stock_delta(
  p_company_id uuid,
  p_warehouse_id uuid,
  p_material_id uuid,
  p_delta numeric,
  p_unit_cost bigint DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv       record;
  v_new_qty numeric;
  v_new_avg bigint;
BEGIN
  -- FOR UPDATE: hai người soạn hàng cùng lúc ở một kho thì cả hai đọc cùng một số tồn, và
  -- phép trừ thứ hai ghi đè phép trừ thứ nhất — kho hụt hàng mà sổ vẫn đủ.
  SELECT * INTO inv FROM public.inventory_items
   WHERE warehouse_id = p_warehouse_id AND material_id = p_material_id
   FOR UPDATE;

  IF NOT FOUND THEN
    IF p_delta < 0 THEN
      RAISE EXCEPTION 'Vật tư này chưa có tồn ở kho được chọn.';
    END IF;
    INSERT INTO public.inventory_items (
      company_id, warehouse_id, material_id, quantity_on_hand, average_cost, last_movement_at
    )
    VALUES (p_company_id, p_warehouse_id, p_material_id, p_delta, p_unit_cost, now());
    RETURN;
  END IF;

  v_new_qty := inv.quantity_on_hand + p_delta;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Không xuất quá tồn: vật tư "%" còn % nhưng phiếu ghi %.',
      (SELECT m.name FROM public.materials m WHERE m.id = p_material_id),
      inv.quantity_on_hand, abs(p_delta);
  END IF;

  /*
   * Đơn giá bình quân chỉ tính lại khi NHẬP: xuất kho không làm đổi giá vốn của phần còn lại.
   *
   * ⚠️ Đây là con số THAM KHẢO để ước giá trị tồn. Giá vốn xuất kho chính thức phải khớp với
   * phần mềm kế toán, mà phần mềm đó chưa được chốt (PRD Mục 10, KT-08).
   */
  IF p_delta > 0 AND v_new_qty > 0 THEN
    v_new_avg := round(
      (inv.quantity_on_hand * inv.average_cost + p_delta * p_unit_cost) / v_new_qty
    )::bigint;
  ELSE
    v_new_avg := inv.average_cost;
  END IF;

  UPDATE public.inventory_items
     SET quantity_on_hand = v_new_qty,
         average_cost = v_new_avg,
         last_movement_at = now(),
         updated_at = now()
   WHERE id = inv.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_stock_delta(uuid, uuid, uuid, numeric, bigint)
  FROM authenticated, anon, public;


CREATE OR REPLACE FUNCTION public.write_stock_movement(
  p_movement_type stock_movement_type,
  p_warehouse_id uuid,
  p_target_warehouse_id uuid,
  p_movement_date date,
  p_items jsonb,
  p_issue_reason stock_issue_reason DEFAULT NULL,
  p_construction_site_id uuid DEFAULT NULL,
  p_delivery_id uuid DEFAULT NULL,
  p_purchase_order_id uuid DEFAULT NULL,
  p_client_generated_id text DEFAULT NULL,
  p_counterpart_name text DEFAULT NULL,
  p_stocktake_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := public.auth_user_id();
  w              record;
  target         record;
  v_company_code text;
  v_movement     uuid;
  v_line         jsonb;
  v_material     record;
  v_qty          numeric;
  v_cost         bigint;
  v_delta        numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO w FROM public.warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
  /*
   * Phiếu điều chỉnh kiểm kê là ngoại lệ: nó do NGƯỜI PHÊ DUYỆT sinh ra, không phải do Kho,
   * mà người phê duyệt (Tổng Giám đốc, Giám đốc Tài chính) không có quyền sửa phân hệ Kho.
   * Không nới quyền cho ai: hàm này đã bị thu hồi quyền gọi từ trình duyệt, và thẩm quyền
   * của lượt duyệt đó đã được `decide_approval` kiểm bằng hạn mức trước khi tới đây.
   */
  IF NOT FOUND OR NOT (
       public.rls_warehouse_writable(p_warehouse_id)
       OR (p_stocktake_id IS NOT NULL AND public.rls_company_access(w.company_id))
     ) THEN
    RAISE EXCEPTION 'Không lập được phiếu ở kho này.';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Phiếu chưa có mặt hàng nào.';
  END IF;

  /*
   * Gửi lại cùng một phiếu KHÔNG tạo phiếu thứ hai — KHO-09.
   *
   * Máy ở kho mất sóng giữa lúc gửi thì không biết phiếu đã tới hay chưa, và cách duy nhất
   * an toàn là gửi lại. Trả về đúng phiếu cũ chứ không báo lỗi: với người đứng ở kho, gửi
   * lại thành công và gửi lại "đã có rồi" là cùng một kết quả, còn một thông báo lỗi đỏ sẽ
   * khiến họ tưởng hàng chưa được ghi và nhập tay lần nữa.
   */
  IF p_client_generated_id IS NOT NULL AND btrim(p_client_generated_id) <> '' THEN
    SELECT id INTO v_movement FROM public.stock_movements
     WHERE client_generated_id = btrim(p_client_generated_id);
    IF FOUND THEN
      RETURN v_movement;
    END IF;
  END IF;

  IF public.warehouse_stocktake_open(p_warehouse_id) AND p_stocktake_id IS NULL THEN
    RAISE EXCEPTION 'Kho đang kiểm kê nên tạm dừng nhập xuất. Hoàn tất đợt kiểm kê rồi lập phiếu.';
  END IF;

  IF p_movement_type = 'dieu_chuyen' THEN
    SELECT * INTO target FROM public.warehouses
     WHERE id = p_target_warehouse_id AND deleted_at IS NULL;
    IF NOT FOUND OR NOT public.rls_warehouse_writable(p_target_warehouse_id) THEN
      RAISE EXCEPTION 'Không điều chuyển được tới kho nhận đã chọn.';
    END IF;
    IF target.company_id <> w.company_id THEN
      RAISE EXCEPTION 'Điều chuyển giữa hai pháp nhân là một giao dịch mua bán, không phải điều chuyển nội bộ.';
    END IF;
    IF public.warehouse_stocktake_open(p_target_warehouse_id) THEN
      RAISE EXCEPTION 'Kho nhận đang kiểm kê nên tạm dừng nhập xuất.';
    END IF;
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = w.company_id;

  INSERT INTO public.stock_movements (
    company_id, code, movement_type, warehouse_id, target_warehouse_id, movement_date,
    issue_reason, construction_site_id, delivery_id, purchase_order_id,
    client_generated_id, performed_by, counterpart_name, stocktake_id, notes,
    created_by, updated_by
  )
  VALUES (
    w.company_id,
    public.next_record_code(
      v_company_code,
      CASE p_movement_type
        WHEN 'nhap' THEN 'PN' WHEN 'xuat' THEN 'PX'
        WHEN 'dieu_chuyen' THEN 'PDC' ELSE 'PKK'
      END
    ),
    p_movement_type, p_warehouse_id, p_target_warehouse_id,
    COALESCE(p_movement_date, current_date),
    p_issue_reason, p_construction_site_id, p_delivery_id, p_purchase_order_id,
    NULLIF(btrim(p_client_generated_id), ''), v_user, NULLIF(btrim(p_counterpart_name), ''),
    p_stocktake_id, NULLIF(btrim(p_notes), ''),
    v_user, v_user
  )
  RETURNING id INTO v_movement;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_material FROM public.materials
     WHERE id = (v_line ->> 'material_id')::uuid AND deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Có dòng trỏ tới vật tư không còn trong danh mục.';
    END IF;

    /*
     * Giàn giáo KHÔNG đi qua sổ tồn kho — KHO-06 nói rõ nó "quản lý RIÊNG vòng đời, khác vật
     * tư tiêu hao thông thường".
     *
     * Nếu để giàn giáo vừa có dòng tồn ở `inventory_items` vừa có lô ở `scaffolding_assets`
     * thì cùng một đống giáo nêm được đếm hai lần ở hai chỗ, và hai con số đó chắc chắn sẽ
     * lệch nhau ngay lần đầu có hàng hỏng — vì chỉ một trong hai bên biết đến khái niệm
     * "hỏng chờ sửa".
     */
    IF v_material.is_scaffolding THEN
      RAISE EXCEPTION 'Vật tư "%" quản lý theo vòng đời giàn giáo, không ghi vào sổ tồn kho. Dùng màn hình Giàn giáo.',
        v_material.name;
    END IF;

    v_qty  := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_cost := COALESCE((v_line ->> 'unit_cost')::bigint, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng của vật tư "%" phải lớn hơn 0.', v_material.name;
    END IF;

    INSERT INTO public.stock_movement_items (
      stock_movement_id, material_id, quantity, unit_cost, condition_note, created_by, updated_by
    )
    VALUES (
      v_movement, v_material.id, v_qty, v_cost,
      NULLIF(btrim(v_line ->> 'condition_note'), ''), v_user, v_user
    );

    -- Chiều tăng/giảm do LOẠI PHIẾU quyết định, không do dấu của số lượng: số lượng trên
    -- phiếu luôn dương (ràng buộc CHECK), nên không có phiếu xuất nào lặng lẽ thành phiếu nhập.
    v_delta := CASE
      WHEN p_movement_type = 'nhap' THEN v_qty
      WHEN p_movement_type IN ('xuat', 'dieu_chuyen') THEN -v_qty
      -- Điều chỉnh kiểm kê là loại DUY NHẤT có hai chiều, và chiều nằm ở chính dòng đó.
      WHEN COALESCE(v_line ->> 'direction', 'tang') = 'giam' THEN -v_qty
      ELSE v_qty
    END;

    PERFORM public.apply_stock_delta(w.company_id, p_warehouse_id, v_material.id, v_delta, v_cost);

    IF p_movement_type = 'dieu_chuyen' THEN
      -- Cùng một giao dịch: hoặc cả hai đầu cùng đổi, hoặc không đầu nào đổi (KHO-05).
      PERFORM public.apply_stock_delta(
        w.company_id, p_target_warehouse_id, v_material.id, v_qty, v_cost
      );
    END IF;
  END LOOP;

  RETURN v_movement;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.write_stock_movement(
  stock_movement_type, uuid, uuid, date, jsonb, stock_issue_reason, uuid, uuid, uuid,
  text, text, uuid, text
) FROM authenticated, anon, public;

COMMENT ON FUNCTION public.write_stock_movement(
  stock_movement_type, uuid, uuid, date, jsonb, stock_issue_reason, uuid, uuid, uuid,
  text, text, uuid, text
) IS 'Lõi ghi sổ kho dùng chung cho cả bốn loại phiếu — hàm NỘI BỘ, không gọi được từ trình duyệt.';


-- ----------------------------------------------------------------------------
-- 4. Bốn loại phiếu — KHO-03, KHO-04, KHO-05
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.receive_stock(
  p_warehouse_id uuid,
  p_items jsonb,
  p_movement_date date DEFAULT NULL,
  p_counterpart_name text DEFAULT NULL,
  p_client_generated_id text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.write_stock_movement(
    'nhap', p_warehouse_id, NULL, p_movement_date, p_items,
    NULL, NULL, NULL, NULL, p_client_generated_id, p_counterpart_name, NULL, p_notes
  );
$$;

COMMENT ON FUNCTION public.receive_stock(uuid, jsonb, date, text, text, text) IS
  'Nhập kho hàng không đi qua mua sắm (KHO-03). Hàng theo đơn hàng dùng `receive_from_delivery`.';


CREATE OR REPLACE FUNCTION public.issue_stock(
  p_warehouse_id uuid,
  p_items jsonb,
  p_issue_reason stock_issue_reason,
  p_construction_site_id uuid DEFAULT NULL,
  p_movement_date date DEFAULT NULL,
  p_counterpart_name text DEFAULT NULL,
  p_client_generated_id text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w record;
BEGIN
  IF p_issue_reason IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn lý do xuất kho.';
  END IF;

  -- Xuất cho công trình mà không ghi công trình nào thì chi phí không về được mã công trình,
  -- và KT-05 ("gắn chi phí ngay từ khi phát sinh") mất hiệu lực ngay tại chỗ này.
  IF p_issue_reason = 'cong_trinh' AND p_construction_site_id IS NULL THEN
    RAISE EXCEPTION 'Xuất cho công trình thì phải chọn công trình nhận vật tư.';
  END IF;

  /*
   * ⚠️ Xuất kho cho công trình CỐ Ý KHÔNG cộng vào `project_budgets.actual_amount`.
   *
   * Chi phí vật tư mua theo đề nghị gắn công trình đã được ghi nhận ngay khi hàng về
   * (`record_delivery`, MH-07). Cộng thêm lần nữa ở đây là ghi đôi cùng một khoản tiền.
   *
   * Nhưng vật tư mua sẵn về kho chung rồi mới xuất cho công trình thì hiện KHÔNG về được
   * ngân sách công trình nào — đó là một khoảng trống thật, và lấp nó là một QUYẾT ĐỊNH KẾ
   * TOÁN (ghi chi phí theo lúc mua hay theo lúc xuất kho, và dùng giá vốn nào) chứ không
   * phải một lựa chọn kỹ thuật. Đã ghi vào mục "cần Haan chốt" của BUILD_PLAN.
   */
  IF p_construction_site_id IS NOT NULL THEN
    SELECT * INTO w FROM public.warehouses WHERE id = p_warehouse_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.construction_sites s
       WHERE s.id = p_construction_site_id AND s.company_id = w.company_id
         AND s.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Công trình nhận vật tư không thuộc pháp nhân của kho này.';
    END IF;
  END IF;

  RETURN public.write_stock_movement(
    'xuat', p_warehouse_id, NULL, p_movement_date, p_items,
    p_issue_reason, p_construction_site_id, NULL, NULL,
    p_client_generated_id, p_counterpart_name, NULL, p_notes
  );
END;
$$;

COMMENT ON FUNCTION public.issue_stock(uuid, jsonb, stock_issue_reason, uuid, date, text, text, text) IS
  'Xuất kho theo phiếu yêu cầu đã duyệt, kiểm tồn trước khi ghi (KHO-04).';


CREATE OR REPLACE FUNCTION public.transfer_stock(
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_items jsonb,
  p_movement_date date DEFAULT NULL,
  p_counterpart_name text DEFAULT NULL,
  p_client_generated_id text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.write_stock_movement(
    'dieu_chuyen', p_from_warehouse_id, p_to_warehouse_id, p_movement_date, p_items,
    NULL, NULL, NULL, NULL, p_client_generated_id, p_counterpart_name, NULL, p_notes
  );
$$;

COMMENT ON FUNCTION public.transfer_stock(uuid, uuid, jsonb, date, text, text, text) IS
  'Điều chuyển giữa hai kho — giảm nơi xuất và tăng nơi nhận trong CÙNG một giao dịch (KHO-05).';


/**
 * Nhập kho từ một phiếu giao nhận của Mua hàng — KHO-03 ↔ MH-07.
 *
 * Đây là chỗ nối mà Backend Schema 4.7 gọi là "tự cập nhật tồn kho": số lượng, đơn giá và
 * chứng từ đã có sẵn ở phiếu giao nhận, Kho KHÔNG nhập lại (PRD Mục 2.3).
 *
 * Chỉ lấy phần ĐẠT (`quantity_ok`). Hàng thiếu, sai quy cách hoặc hư hỏng đã được ghi riêng
 * ở phiếu giao nhận và không vào tồn — cho vào thì kho hứa một lượng hàng không dùng được.
 */
CREATE OR REPLACE FUNCTION public.receive_from_delivery(
  p_delivery_id uuid,
  p_warehouse_id uuid,
  p_client_generated_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d         record;
  po        record;
  w         record;
  v_missing text;
  v_items   jsonb;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO d FROM public.deliveries WHERE id = p_delivery_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiếu giao nhận.';
  END IF;

  SELECT * INTO po FROM public.purchase_orders WHERE id = d.purchase_order_id;

  SELECT * INTO w FROM public.warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_warehouse_writable(p_warehouse_id) THEN
    RAISE EXCEPTION 'Không nhập được vào kho này.';
  END IF;

  IF w.company_id <> d.company_id THEN
    RAISE EXCEPTION 'Kho nhận không thuộc pháp nhân của phiếu giao nhận.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_movements m
     WHERE m.delivery_id = p_delivery_id AND m.movement_type = 'nhap' AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Phiếu giao nhận này đã được nhập kho.';
  END IF;

  /*
   * KHO-02 sống hay chết ở đúng chỗ này: hàng chỉ vào kho khi mã trên đơn hàng khớp một mã
   * trong danh mục. Cho qua bằng cách tự tạo vật tư mới thì mỗi lần gõ khác đi một ký tự là
   * một mã mới, và "một vật tư một mã duy nhất" chỉ còn là một câu trong tài liệu.
   */
  SELECT string_agg(DISTINCT COALESCE(poi.item_code, poi.name), ', ')
    INTO v_missing
    FROM public.delivery_items di
    JOIN public.purchase_order_items poi ON poi.id = di.purchase_order_item_id
   WHERE di.delivery_id = p_delivery_id
     AND di.quantity_ok > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.materials m
        WHERE m.code = poi.item_code AND m.deleted_at IS NULL
     );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Chưa có mã vật tư trong danh mục kho: %. Thêm vào danh mục rồi nhập kho.', v_missing;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'material_id', m.id,
           'quantity', sums.qty,
           'unit_cost', sums.cost,
           'condition_note', sums.note
         ))
    INTO v_items
    FROM (
      SELECT poi.item_code,
             sum(di.quantity_ok)   AS qty,
             max(poi.unit_price)   AS cost,
             string_agg(NULLIF(btrim(di.issue_note), ''), '; ') AS note
        FROM public.delivery_items di
        JOIN public.purchase_order_items poi ON poi.id = di.purchase_order_item_id
       WHERE di.delivery_id = p_delivery_id AND di.quantity_ok > 0
       GROUP BY poi.item_code
    ) sums
    JOIN public.materials m ON m.code = sums.item_code AND m.deleted_at IS NULL;

  IF v_items IS NULL THEN
    RAISE EXCEPTION 'Phiếu giao nhận này không có mặt hàng nào đạt để nhập kho.';
  END IF;

  -- Giàn giáo mua về vào SỔ TÀI SẢN GIÀN GIÁO, không vào sổ tồn kho (KHO-06). Chỗ nối tự
  -- động cho việc đó chờ khảo sát Xưởng giàn giáo (KHO-10, PRD Mục 10) — báo rõ thay vì ghi
  -- nhầm vào sổ tồn rồi đếm trùng.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_items) line
    JOIN public.materials m ON m.id = (line ->> 'material_id')::uuid
    WHERE m.is_scaffolding
  ) THEN
    RAISE EXCEPTION 'Đơn hàng có giàn giáo. Ghi vào sổ tài sản giàn giáo ở màn hình Giàn giáo, không nhập vào sổ tồn kho.';
  END IF;

  RETURN public.write_stock_movement(
    'nhap', p_warehouse_id, NULL, d.delivered_date, v_items,
    NULL, NULL, p_delivery_id, d.purchase_order_id,
    p_client_generated_id,
    COALESCE(d.delivered_by_name, po.code),
    NULL,
    format('Nhập theo phiếu giao nhận %s của đơn hàng %s.',
           COALESCE(d.code, ''), COALESCE(po.code, ''))
  );
END;
$$;

COMMENT ON FUNCTION public.receive_from_delivery(uuid, uuid, text) IS
  'Nhập kho thẳng từ phiếu giao nhận của Mua hàng, không nhập lại số liệu (KHO-03 ↔ MH-07).';


-- ----------------------------------------------------------------------------
-- 5. Kiểm kê — KHO-07
--
-- Bốn bước bám đúng câu chữ PRD: tạm dừng nhập–xuất → đối chiếu thực tế với sổ kho → xác
-- định nguyên nhân chênh lệch → lập biên bản và TRÌNH PHÊ DUYỆT TRƯỚC KHI điều chỉnh.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_stocktake(p_warehouse_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user         uuid := public.auth_user_id();
  w              record;
  v_company_code text;
  v_stocktake    uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO w FROM public.warehouses WHERE id = p_warehouse_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_warehouse_writable(p_warehouse_id) THEN
    RAISE EXCEPTION 'Không mở được đợt kiểm kê ở kho này.';
  END IF;

  IF public.warehouse_stocktake_open(p_warehouse_id) THEN
    RAISE EXCEPTION 'Kho này đang có một đợt kiểm kê chưa kết thúc. Hoàn tất đợt đó trước.';
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = w.company_id;

  INSERT INTO public.stocktakes (
    company_id, code, warehouse_id, status, performed_by, created_by, updated_by
  )
  VALUES (
    w.company_id, public.next_record_code(v_company_code, 'KK'), p_warehouse_id,
    'dang_kiem', v_user, v_user, v_user
  )
  RETURNING id INTO v_stocktake;

  /*
   * CHỤP LẠI số sổ kho ngay lúc mở đợt, không đọc lại lúc duyệt.
   *
   * Đọc lại thì chênh lệch đổi theo mỗi lần mở biên bản, và con số người ký duyệt không còn
   * là con số họ đã nhìn thấy. Đây cũng là lý do kho bị khoá nhập xuất từ giây phút này.
   */
  INSERT INTO public.stocktake_items (
    stocktake_id, material_id, book_quantity, created_by, updated_by
  )
  SELECT v_stocktake, i.material_id, i.quantity_on_hand, v_user, v_user
    FROM public.inventory_items i
   WHERE i.warehouse_id = p_warehouse_id;

  RETURN v_stocktake;
END;
$$;

COMMENT ON FUNCTION public.start_stocktake(uuid) IS
  'Mở một đợt kiểm kê: chụp số sổ kho và tạm dừng nhập xuất của kho đó (KHO-07).';


CREATE OR REPLACE FUNCTION public.save_stocktake_count(p_stocktake_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  st     record;
  v_line jsonb;
  v_qty  numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO st FROM public.stocktakes WHERE id = p_stocktake_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_warehouse_writable(st.warehouse_id) THEN
    RAISE EXCEPTION 'Không ghi được số đếm cho đợt kiểm kê này.';
  END IF;

  IF st.status <> 'dang_kiem' THEN
    RAISE EXCEPTION 'Đợt kiểm kê này đã chốt số đếm, không sửa được nữa.';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_qty := NULLIF(v_line ->> 'counted_quantity', '')::numeric;
    IF v_qty IS NOT NULL AND v_qty < 0 THEN
      RAISE EXCEPTION 'Số đếm không được là số âm.';
    END IF;

    UPDATE public.stocktake_items
       SET counted_quantity = v_qty,
           variance_note = NULLIF(btrim(v_line ->> 'variance_note'), ''),
           updated_at = now(), updated_by = v_user
     WHERE stocktake_id = p_stocktake_id
       AND material_id = (v_line ->> 'material_id')::uuid;
  END LOOP;

  UPDATE public.stocktakes
     SET counted_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_stocktake_id;
END;
$$;

COMMENT ON FUNCTION public.save_stocktake_count(uuid, jsonb) IS
  'Ghi số đếm thực tế của một đợt kiểm kê. Đếm bằng máy quét ở kho nên lưu được nhiều lần (KHO-07, KHO-09).';


CREATE OR REPLACE FUNCTION public.submit_stocktake_approval(
  p_stocktake_id uuid,
  p_variance_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  st         record;
  w          record;
  v_uncount  integer;
  v_variance integer;
  v_value    bigint;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO st FROM public.stocktakes WHERE id = p_stocktake_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_warehouse_writable(st.warehouse_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đợt kiểm kê này.';
  END IF;

  IF st.status <> 'dang_kiem' THEN
    RAISE EXCEPTION 'Đợt kiểm kê này đã được trình duyệt.';
  END IF;

  SELECT count(*) FILTER (WHERE counted_quantity IS NULL),
         count(*) FILTER (WHERE counted_quantity IS NOT NULL
                            AND counted_quantity <> book_quantity)
    INTO v_uncount, v_variance
    FROM public.stocktake_items WHERE stocktake_id = p_stocktake_id;

  IF v_uncount > 0 THEN
    RAISE EXCEPTION 'Còn % vật tư chưa đếm. Đếm hết rồi mới lập được biên bản chênh lệch.', v_uncount;
  END IF;

  IF v_variance = 0 THEN
    RAISE EXCEPTION 'Không có chênh lệch nào — đóng đợt kiểm kê thay vì trình phê duyệt điều chỉnh.';
  END IF;

  IF p_variance_reason IS NULL OR btrim(p_variance_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi nguyên nhân chênh lệch trước khi trình phê duyệt.';
  END IF;

  SELECT * INTO w FROM public.warehouses WHERE id = st.warehouse_id;

  -- Giá trị tuyệt đối của phần lệch, đơn vị đồng — đây là con số đối chiếu hạn mức: điều
  -- chỉnh mất vài cây thép và điều chỉnh mất nửa kho là hai việc khác thẩm quyền.
  SELECT COALESCE(SUM(abs(si.counted_quantity - si.book_quantity) * i.average_cost), 0)::bigint
    INTO v_value
    FROM public.stocktake_items si
    JOIN public.inventory_items i
      ON i.material_id = si.material_id AND i.warehouse_id = st.warehouse_id
   WHERE si.stocktake_id = p_stocktake_id
     AND si.counted_quantity <> si.book_quantity;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by
  )
  VALUES (
    st.company_id, 'stocktake_adjustment', 'stocktakes', st.id, st.code,
    format('Điều chỉnh kiểm kê %s — kho %s, %s dòng lệch', st.code, w.name, v_variance),
    v_value, btrim(p_variance_reason), 'pending_approval', v_user
  )
  RETURNING id INTO v_approval;

  UPDATE public.stocktakes
     SET status = 'cho_duyet',
         variance_reason = btrim(p_variance_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_stocktake_id;

  RETURN v_approval;
END;
$$;

COMMENT ON FUNCTION public.submit_stocktake_approval(uuid, text) IS
  'Trình phê duyệt biên bản chênh lệch kiểm kê — sổ kho chỉ đổi SAU khi được duyệt (KHO-07).';


CREATE OR REPLACE FUNCTION public.cancel_stocktake(p_stocktake_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  st     record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO st FROM public.stocktakes WHERE id = p_stocktake_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_warehouse_writable(st.warehouse_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đợt kiểm kê này.';
  END IF;

  IF st.status = 'da_dieu_chinh' THEN
    RAISE EXCEPTION 'Đợt kiểm kê này đã điều chỉnh sổ kho, không hủy được.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do hủy đợt kiểm kê.';
  END IF;

  INSERT INTO public.approval_decisions (approval_id, step, decision, note, decided_by)
  SELECT a.id, a.current_step, 'rejected',
         format('Kho hủy đợt kiểm kê: %s', btrim(p_reason)), v_user
    FROM public.approvals a
   WHERE a.entity_type = 'stocktakes' AND a.entity_id = p_stocktake_id
     AND a.status = 'pending_approval' AND a.deleted_at IS NULL;

  UPDATE public.approvals
     SET status = 'completed', final_decision = 'rejected',
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE entity_type = 'stocktakes' AND entity_id = p_stocktake_id
     AND status = 'pending_approval' AND deleted_at IS NULL;

  -- Sổ kho giữ nguyên: hủy kiểm kê KHÔNG phải là chấp nhận số đếm.
  UPDATE public.stocktakes
     SET status = 'huy', closed_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_stocktake_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_stocktake(uuid, text) IS
  'Hủy đợt kiểm kê kèm lý do và mở khoá nhập xuất. Sổ kho giữ nguyên.';


-- ----------------------------------------------------------------------------
-- 6. Quyết định phê duyệt — thêm nhánh điều chỉnh kiểm kê
--
-- Định nghĩa lại NGUYÊN hàm `decide_approval` (lần gần nhất ở migration 0037) và bổ sung
-- nhánh `stocktakes`. Hộp thư Phê duyệt vẫn là MỘT màn hình cho mọi module (Webapp Flow 4.6).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_approval(
  p_approval_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  perm   record;
  e      record;
  st     record;
  adj    jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.approvals
  WHERE id = p_approval_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ phê duyệt.';
  END IF;

  IF a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này đã được xử lý.';
  END IF;

  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  INSERT INTO public.approval_decisions (
    approval_id, step, decision, note,
    approver_limit_at_time, approver_unlimited, decided_by
  )
  VALUES (
    p_approval_id, a.current_step, p_decision, NULLIF(btrim(p_note), ''),
    perm.max_amount, perm.is_unlimited, v_user
  );

  UPDATE public.approvals
     SET status = 'completed', final_decision = p_decision,
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_approval_id;

  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'estimates' THEN
    UPDATE public.estimates
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING bidding_project_id, design_project_id INTO e;

    IF e.bidding_project_id IS NOT NULL THEN
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;

  ELSIF a.entity_type = 'contracts' THEN
    -- Từ chối thì hợp đồng quay lại bước Nháp để sửa, không nằm mãi ở "chờ phê duyệt".
    UPDATE public.contracts
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'nhap' END)::contract_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'contract_amendments' THEN
    UPDATE public.contract_amendments
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::amendment_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           decision_notes = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'purchase_requests' THEN
    -- Từ chối thì đề nghị về bước "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy
    -- hồ sơ của mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa (MH-02).
    UPDATE public.purchase_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::purchase_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Đề nghị đã duyệt là việc cần làm của Phòng Mua hàng: họ mới là người đi hỏi báo giá
      -- (MH-04), còn người đề nghị thường ở công trường và không mở màn hình MH hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'purchase_request_approved',
        format('Đề nghị mua %s đã được phê duyệt, giá trị ước tính %s đồng.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'purchase_requests', a.entity_id,
        format('/mh/de-nghi-mua/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'MH';
    END IF;

    -- Người đề nghị cần biết kết quả dù duyệt hay từ chối — họ đang chờ hàng.
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'purchase_request_approved' ELSE 'purchase_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị mua %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị mua %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'purchase_requests', a.entity_id,
      format('/mh/de-nghi-mua/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'stocktakes' THEN
    IF p_decision = 'approved' THEN
      /*
       * KHO-07: "lập biên bản và trình phê duyệt TRƯỚC KHI điều chỉnh số liệu". Đây là giây
       * phút sổ kho được phép đổi — và nó đổi bằng một PHIẾU điều chỉnh, không phải bằng một
       * câu UPDATE lặng lẽ, để lần sau còn đọc được ai duyệt và lệch những gì.
       *
       * Đổi trạng thái TRƯỚC khi ghi phiếu: chừng nào đợt kiểm còn mở thì kho vẫn bị khoá
       * nhập xuất, và chính phiếu điều chỉnh cũng sẽ bị chặn.
       */
      UPDATE public.stocktakes
         SET status = 'da_dieu_chinh', adjusted_at = now(),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING warehouse_id INTO st;

      SELECT jsonb_agg(jsonb_build_object(
               'material_id', si.material_id,
               'quantity', abs(si.counted_quantity - si.book_quantity),
               'direction', CASE WHEN si.counted_quantity > si.book_quantity THEN 'tang' ELSE 'giam' END
             ))
        INTO adj
        FROM public.stocktake_items si
       WHERE si.stocktake_id = a.entity_id
         AND si.counted_quantity IS NOT NULL
         AND si.counted_quantity <> si.book_quantity;

      IF adj IS NOT NULL THEN
        PERFORM public.write_stock_movement(
          'kiem_ke', st.warehouse_id, NULL, current_date, adj,
          NULL, NULL, NULL, NULL, NULL, NULL, a.entity_id,
          format('Điều chỉnh theo biên bản kiểm kê %s.', COALESCE(a.entity_code, ''))
        );
      END IF;
    ELSE
      -- Từ chối thì kho đếm lại, KHÔNG phải là chấp nhận số sổ cũ rồi đóng hồ sơ.
      UPDATE public.stocktakes
         SET status = 'dang_kiem', updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'stocktake_adjusted' ELSE 'stocktake_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Biên bản kiểm kê %s đã được duyệt, sổ kho đã điều chỉnh.', COALESCE(a.entity_code, ''))
           ELSE format('Biên bản kiểm kê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'stocktakes', a.entity_id,
      format('/kho/kiem-ke/%s', a.entity_id)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi một quyết định phê duyệt và cập nhật hồ sơ nguồn — báo giá, dự toán, hợp đồng, phát sinh, đề nghị mua, điều chỉnh kiểm kê.';


-- ----------------------------------------------------------------------------
-- 7. Giàn giáo — KHO-06
--
-- PRD KHO-06: "các trường hợp sửa chữa, mất mát hoặc thanh lý phải có biên bản riêng, KHÔNG
-- NHẬP CHUNG NGAY vào lượng hàng sử dụng tốt". Vì vậy tình trạng của một lô chỉ đổi qua hàm
-- này, và mỗi lần đổi để lại một biên bản có số lượng, nguyên nhân và bên chịu trách nhiệm.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_scaffolding_event(
  p_asset_id uuid,
  p_event_type scaffolding_event_type,
  p_quantity numeric,
  p_reason text,
  p_result_condition scaffolding_condition DEFAULT NULL,
  p_event_date date DEFAULT NULL,
  p_amount bigint DEFAULT 0,
  p_responsible_party text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  a        record;
  v_target uuid;
  v_event  uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  -- FOR UPDATE: hai biên bản cùng lúc trên một lô sẽ cùng đọc số cũ và cùng trừ đi, làm lô
  -- âm hoặc làm mất một biên bản.
  SELECT * INTO a FROM public.scaffolding_assets
   WHERE id = p_asset_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(a.company_id)
     OR NOT public.auth_can_edit_module('KHO') THEN
    RAISE EXCEPTION 'Không thao tác được trên lô giàn giáo này.';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số lượng trên biên bản phải lớn hơn 0.';
  END IF;

  IF p_quantity > a.quantity THEN
    RAISE EXCEPTION 'Lô này chỉ còn %, không lập được biên bản cho %.', a.quantity, p_quantity;
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng ghi nguyên nhân — biên bản không có nguyên nhân thì không truy trách nhiệm được.';
  END IF;

  -- Sửa chữa là chuyển sang một tình trạng khác, nên phải nói rõ chuyển sang tình trạng nào.
  -- Mất mát và thanh lý thì số lượng rời khỏi sổ, không còn tình trạng để ghi.
  IF p_event_type = 'sua_chua' AND p_result_condition IS NULL THEN
    RAISE EXCEPTION 'Chọn tình trạng sau sửa chữa (hỏng chờ sửa, còn sử dụng được, hoặc chờ thanh lý).';
  END IF;

  INSERT INTO public.scaffolding_events (
    company_id, scaffolding_asset_id, event_type, event_date, quantity,
    result_condition, amount, responsible_party, reason, recorded_by, created_by, updated_by
  )
  VALUES (
    a.company_id, p_asset_id, p_event_type, COALESCE(p_event_date, current_date), p_quantity,
    p_result_condition, COALESCE(p_amount, 0), NULLIF(btrim(p_responsible_party), ''),
    btrim(p_reason), v_user, v_user, v_user
  )
  RETURNING id INTO v_event;

  UPDATE public.scaffolding_assets
     SET quantity = quantity - p_quantity, updated_at = now(), updated_by = v_user
   WHERE id = p_asset_id;

  IF p_result_condition IS NOT NULL THEN
    /*
     * Gộp vào lô cùng vật tư – cùng tình trạng – cùng chỗ nếu đã có, thay vì luôn tạo lô mới:
     * sửa xong 10 bộ tháng này và 10 bộ tháng sau mà thành hai lô riêng thì danh sách giàn
     * giáo sẽ dài dần ra bằng số lần sửa, trong khi chúng là cùng một thứ hàng.
     */
    SELECT id INTO v_target FROM public.scaffolding_assets
     WHERE company_id = a.company_id
       AND material_id = a.material_id
       AND condition = p_result_condition
       AND location_type = a.location_type
       AND warehouse_id IS NOT DISTINCT FROM a.warehouse_id
       AND construction_site_id IS NOT DISTINCT FROM a.construction_site_id
       AND deleted_at IS NULL
       AND id <> p_asset_id
     LIMIT 1;

    IF v_target IS NULL THEN
      INSERT INTO public.scaffolding_assets (
        company_id, asset_code, material_id, quantity, condition,
        location_type, warehouse_id, construction_site_id, purchase_date, created_by, updated_by
      )
      VALUES (
        a.company_id,
        a.asset_code || '-' || upper(left(p_result_condition::text, 3)) || '-' ||
          to_char(now(), 'YYMMDDHH24MISS'),
        a.material_id, p_quantity, p_result_condition,
        a.location_type, a.warehouse_id, a.construction_site_id, a.purchase_date, v_user, v_user
      );
    ELSE
      UPDATE public.scaffolding_assets
         SET quantity = quantity + p_quantity, updated_at = now(), updated_by = v_user
       WHERE id = v_target;
    END IF;
  END IF;

  RETURN v_event;
END;
$$;

COMMENT ON FUNCTION public.record_scaffolding_event(
  uuid, scaffolding_event_type, numeric, text, scaffolding_condition, date, bigint, text
) IS 'Biên bản sửa chữa / mất mát / thanh lý giàn giáo — đường DUY NHẤT để một lô đổi tình trạng (KHO-06).';


-- ----------------------------------------------------------------------------
-- 8. Quét mã ở kho — KHO-09
--
-- Webapp Flow 3.6 bước 1: quét mã vật tư, "hệ thống hiển thị phiếu liên quan". Ở bước này
-- trả về vật tư và tồn của nó ở các kho người dùng được xem — đủ để người đứng ở kho biết
-- ngay đang cầm thứ gì và còn bao nhiêu, không phải gõ tìm.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.scan_material(p_code text)
RETURNS TABLE (
  material_id      uuid,
  material_code    varchar(64),
  name             text,
  specification    text,
  unit             varchar(32),
  is_scaffolding   boolean,
  warehouse_id     uuid,
  warehouse_name   text,
  quantity_on_hand numeric,
  min_quantity     numeric,
  last_movement_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT (public.auth_can_view_module('KHO') OR public.auth_can_view_module('MH')) THEN
    RAISE EXCEPTION 'Không xem được danh mục vật tư.';
  END IF;

  -- Quét được cả mã vạch lẫn mã vật tư: tem cũ ở kho chưa chắc đã có mã vạch, và người dùng
  -- gõ tay mã vật tư khi tem mờ.
  SELECT * INTO m FROM public.materials
   WHERE deleted_at IS NULL
     AND (barcode = btrim(p_code) OR upper(code) = upper(btrim(p_code)))
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy vật tư với mã "%". Kiểm tra lại tem hoặc thêm vật tư vào danh mục.', p_code;
  END IF;

  RETURN QUERY
  SELECT m.id, m.code, m.name, m.specification, m.unit, m.is_scaffolding,
         w.id, w.name, i.quantity_on_hand, i.min_quantity, i.last_movement_at
    FROM public.inventory_items i
    JOIN public.warehouses w ON w.id = i.warehouse_id AND w.deleted_at IS NULL
   WHERE i.material_id = m.id
     AND public.rls_company_access(w.company_id)
   ORDER BY w.name;
END;
$$;

COMMENT ON FUNCTION public.scan_material(text) IS
  'Tra vật tư theo mã vạch hoặc mã vật tư, kèm tồn ở từng kho trong phạm vi người dùng (KHO-09).';
