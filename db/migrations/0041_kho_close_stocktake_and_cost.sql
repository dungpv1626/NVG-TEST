/*
 * Module KHO — hai bản vá còn lại (phần chuẩn bị ở `0040`).
 *
 *  1. `close_stocktake` — đường ra cho đợt kiểm kê đếm khớp sổ.
 *  2. Giá vốn bình quân không còn bị kéo về 0 ở đường điều chỉnh kiểm kê và đường điều chuyển.
 */


-- ----------------------------------------------------------------------------
-- 1. Đóng đợt kiểm kê khớp sổ
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_stocktake(p_stocktake_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  st         record;
  v_uncount  integer;
  v_variance integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO st FROM public.stocktakes WHERE id = p_stocktake_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_warehouse_writable(st.warehouse_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đợt kiểm kê này.';
  END IF;

  IF st.status <> 'dang_kiem' THEN
    RAISE EXCEPTION 'Chỉ đóng được đợt kiểm kê đang đếm.';
  END IF;

  SELECT count(*) FILTER (WHERE counted_quantity IS NULL),
         count(*) FILTER (WHERE counted_quantity IS NOT NULL
                            AND counted_quantity <> book_quantity)
    INTO v_uncount, v_variance
    FROM public.stocktake_items WHERE stocktake_id = p_stocktake_id;

  IF v_uncount > 0 THEN
    RAISE EXCEPTION 'Còn % vật tư chưa đếm. Đếm hết rồi mới đóng được đợt kiểm kê.', v_uncount;
  END IF;

  /*
   * Có chênh lệch thì PHẢI đi đường phê duyệt, không được đóng thẳng.
   *
   * Thiếu chốt này thì đây thành đường tắt bỏ qua toàn bộ KHO-07: đếm ra thiếu nửa kho rồi
   * bấm "Đóng đợt" là xong, không biên bản, không ai duyệt, và sổ kho giữ nguyên số cũ trong
   * khi hàng thật đã khác.
   */
  IF v_variance > 0 THEN
    RAISE EXCEPTION
      'Có % dòng lệch so với sổ. Lập biên bản chênh lệch và trình phê duyệt, không đóng thẳng.',
      v_variance;
  END IF;

  -- Sổ kho KHÔNG đổi: số đếm đã bằng số sổ. Trạng thái riêng để lần sau đọc lịch sử còn phân
  -- biệt được "kiểm xong, khớp" với "kiểm xong, phải điều chỉnh".
  UPDATE public.stocktakes
     SET status = 'khop_so', counted_at = COALESCE(counted_at, now()),
         updated_at = now(), updated_by = v_user
   WHERE id = p_stocktake_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_stocktake(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_stocktake(uuid) TO authenticated;

COMMENT ON FUNCTION public.close_stocktake(uuid) IS
  'Đóng đợt kiểm kê khi số đếm khớp sổ — mở lại nhập xuất mà không đổi sổ kho (KHO-07).';


-- ----------------------------------------------------------------------------
-- 2. Giá vốn bình quân không bị kéo về 0
-- ----------------------------------------------------------------------------
/*
 * `apply_stock_delta` tính lại đơn giá bình quân mỗi lần tồn TĂNG, theo `p_unit_cost` của
 * phiếu. Hai đường đang truyền vào 0:
 *
 *  a. **Điều chỉnh kiểm kê.** `decide_approval` dựng payload chỉ có `material_id`/`quantity`/
 *     `direction`, nên `write_stock_movement` lấy `unit_cost = 0`. Kho có 100 tấn giá 200.000 đ
 *     mà kiểm kê thừa ra 10 tấn thì bình quân tụt còn ~181.818 đ — và mỗi lần kiểm kê lại tụt
 *     thêm.
 *
 *  b. **Điều chuyển kho.** Kho nhận được ghi tăng theo `unit_cost` do trình duyệt gửi, mà màn
 *     hình Phiếu kho chỉ hiện ô đơn giá cho phiếu NHẬP — nên mọi lần điều chuyển đều ghi giá 0
 *     vào kho nhận. Chuyển hàng sang kho khác không làm hàng mất giá trị.
 *
 * Đây không phải sai số làm đẹp báo cáo. `submit_stocktake_approval` lấy
 * `Σ|đếm − sổ| × average_cost` làm con số đối chiếu HẠN MỨC PHÊ DUYỆT, nên giá vốn bị thổi
 * thấp sẽ đưa một chênh lệch lớn lọt xuống dưới hạn mức và được duyệt sai cấp.
 *
 * Cách sửa: cả hai đường đều lấy giá vốn ĐANG CÓ của chính dòng tồn đó. Điều chỉnh kiểm kê
 * không phải một lần mua nên không có giá mới; điều chuyển thì giá vốn theo hàng sang kho nhận.
 */

-- Sửa ngay tại nơi TÍNH giá vốn, không sửa từng nơi dựng payload: `write_stock_movement` là
-- điểm duy nhất mọi phiếu đi qua, nên đặt chốt ở đây thì phủ luôn mọi đường gọi sau này.
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
  v_source_cost  bigint;
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

    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);

    /*
     * Giá vốn ĐANG CÓ của chính dòng tồn này, đọc TRƯỚC khi cộng trừ.
     *
     * Dùng cho hai việc: làm giá thay thế khi phiếu không ghi đơn giá, và làm giá ghi vào kho
     * nhận khi điều chuyển.
     */
    SELECT i.average_cost INTO v_source_cost
      FROM public.inventory_items i
     WHERE i.warehouse_id = p_warehouse_id AND i.material_id = v_material.id;
    v_source_cost := COALESCE(v_source_cost, 0);

    /*
     * Phiếu không ghi đơn giá thì GIỮ NGUYÊN giá vốn đang có, không lấy 0.
     *
     * Phiếu điều chỉnh kiểm kê không mang đơn giá — nó không phải một lần mua, nên không có
     * giá mới. Lấy 0 thì mỗi lần kiểm kê thừa ra vài tấn lại kéo bình quân của cả dòng tồn
     * xuống, và nó cộng dồn: kho 100 tấn giá 200.000 đ mà thừa 10 tấn thì bình quân còn
     * ~181.818 đ. Con số đó lại chính là cái `submit_stocktake_approval` nhân lên để đối chiếu
     * HẠN MỨC PHÊ DUYỆT, nên giá vốn thổi thấp đưa chênh lệch lớn lọt xuống dưới hạn mức.
     */
    v_cost := COALESCE((v_line ->> 'unit_cost')::bigint, v_source_cost);

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
      /*
       * Kho nhận ghi tăng theo giá vốn của KHO NGUỒN, không theo đơn giá trình duyệt gửi lên.
       *
       * Màn hình Phiếu kho chỉ hiện ô đơn giá cho phiếu NHẬP, nên mọi phiếu điều chuyển đều
       * gửi lên 0 — và kho nhận ghi hàng vào sổ với giá vốn bằng không. Chuyển hàng sang kho
       * khác không làm hàng mất giá trị; giá vốn đi theo hàng.
       */
      PERFORM public.apply_stock_delta(
        w.company_id, p_target_warehouse_id, v_material.id, v_qty, v_source_cost
      );
    END IF;
  END LOOP;

  RETURN v_movement;
END;
$$;
