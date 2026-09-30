-- ============================================================================
-- Tiền thuê giàn giáo vào báo cáo theo TỪNG ĐỢT TRẢ, không đợi trả hết.
--
-- Haan 30/09/2026 «sửa luôn đi»: trước đây `finance_daily` (0140) lấy tiền thuê từ
-- `rental_agreements.total_revenue` theo `actual_return_date` — ngày đó chỉ có khi hợp đồng TRẢ
-- HẾT. Hợp đồng đang trả dở (Đông Đô đã chốt 7.149.600 đồng ở một đợt trả một phần) không hề
-- hiện trên biểu đồ doanh thu, và khi trả hết thì tiền của mọi đợt dồn cả vào ngày cuối.
--
-- CSDL chỉ giữ tổng cộng dồn, không giữ từng đợt, nên thêm `rental_returns`: mỗi lần gọi
-- `return_rental_agreement` ghi một dòng (ngày trả, tiền thuê, bồi thường của ĐỢT ĐÓ).
--   · Chỉ hàm SECURITY DEFINER ghi; trình duyệt chỉ đọc — không policy ghi nào, bảng bất biến.
--   · Đọc cùng điều kiện với hợp đồng thuê (`rental_agreements_select`).
--   · Dữ liệu cũ: mỗi hợp đồng đã có tiền thuê được MỘT dòng bù. Ngày lấy theo thứ tự: ngày
--     trả thực tế → ngày của biên bản thu hồi (hư hỏng/mất ghi «thu hồi hợp đồng thuê <mã>»)
--     → ngày cập nhật hợp đồng. Nhiều đợt cũ gộp một dòng — không tách lại được vì trước đây
--     không lưu.
--   · `rental_agreements.total_revenue` vẫn cộng dồn như cũ (màn hình hợp đồng đọc nó); tổng
--     các dòng `rental_returns` của một hợp đồng luôn bằng nó — phép thử canh.
-- ============================================================================

CREATE TABLE public.rental_returns (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  rental_agreement_id uuid NOT NULL REFERENCES public.rental_agreements(id) ON DELETE CASCADE,
  return_date         date NOT NULL,
  revenue             bigint NOT NULL DEFAULT 0,
  compensation        bigint NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX rental_returns_agreement_idx ON public.rental_returns (rental_agreement_id);
CREATE INDEX rental_returns_date_idx ON public.rental_returns (return_date);

ALTER TABLE public.rental_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY rental_returns_select ON public.rental_returns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_agreements ra
       WHERE ra.id = rental_agreement_id AND ra.deleted_at IS NULL
         AND public.rls_company_access(ra.company_id)
         AND (public.auth_can_view_module('SX') OR public.auth_can_view_module('CRM'))
    )
  );

COMMENT ON TABLE public.rental_returns IS
  'Từng đợt thu hồi giàn giáo: ngày trả, tiền thuê và bồi thường của đợt — nguồn doanh thu cho thuê theo ngày cho báo cáo (SX-03, BC-01). Chỉ return_rental_agreement ghi.';

-- Bù dữ liệu cũ: một dòng cho mỗi hợp đồng đã có tiền thuê hoặc bồi thường.
INSERT INTO public.rental_returns (company_id, rental_agreement_id, return_date, revenue, compensation,
                                   created_by, updated_by)
SELECT ra.company_id, ra.id,
       COALESCE(
         ra.actual_return_date,
         (SELECT max(e.event_date) FROM public.scaffolding_events e
           WHERE e.company_id = ra.company_id
             AND e.reason LIKE '%thu hồi hợp đồng thuê ' || ra.code || '%'),
         (ra.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       ),
       COALESCE(ra.total_revenue, 0), COALESCE(ra.total_compensation, 0),
       ra.updated_by, ra.updated_by
  FROM public.rental_agreements ra
 WHERE ra.deleted_at IS NULL
   AND (COALESCE(ra.total_revenue, 0) <> 0 OR COALESCE(ra.total_compensation, 0) <> 0)
   AND NOT EXISTS (SELECT 1 FROM public.rental_returns rr WHERE rr.rental_agreement_id = ra.id);

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

  -- 0143: MỖI đợt trả một dòng — báo cáo doanh thu đọc tiền thuê theo NGÀY TRẢ của từng đợt,
  -- không đợi hợp đồng trả hết rồi dồn cả vào ngày cuối.
  INSERT INTO public.rental_returns (
    company_id, rental_agreement_id, return_date, revenue, compensation, created_by, updated_by
  ) VALUES (
    ra.company_id, p_rental_agreement_id, v_return_date, v_total_revenue, v_total_compensation,
    v_user, v_user
  );

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

CREATE OR REPLACE FUNCTION public.finance_daily(
  p_from date,
  p_to date,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  day date,
  company_id uuid,
  revenue_accepted bigint,
  rental_revenue bigint,
  contracts_signed bigint,
  collected bigint,
  paid_out bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để xem báo cáo.';
  END IF;
  IF NOT public.rls_sees_finance() THEN
    RAISE EXCEPTION 'Không xem được số liệu tài chính. Chỉ Ban Giám đốc, Giám đốc Tài chính và Kế toán xem được — liên hệ quản trị hệ thống nếu công việc cần.';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Khoảng thời gian báo cáo không hợp lệ.';
  END IF;

  RETURN QUERY
  WITH facts AS (
    SELECT ar.accepted_date AS d, ar.company_id AS cid,
           ar.value AS revenue_accepted, 0::bigint AS rental_revenue, 0::bigint AS contracts_signed,
           0::bigint AS collected, 0::bigint AS paid_out
      FROM public.acceptance_records ar
     WHERE ar.acceptance_type = 'khach_hang' AND ar.status = 'da_nghiem_thu'
       AND ar.deleted_at IS NULL AND ar.accepted_date IS NOT NULL
    UNION ALL
    SELECT rr.return_date, rr.company_id, 0, rr.revenue, 0, 0, 0
      FROM public.rental_returns rr
      JOIN public.rental_agreements ra ON ra.id = rr.rental_agreement_id
     WHERE ra.deleted_at IS NULL AND rr.revenue <> 0
    UNION ALL
    SELECT c.signed_date, c.company_id, 0, 0, c.value, 0, 0
      FROM public.contracts c
     WHERE c.deleted_at IS NULL AND c.signed_date IS NOT NULL AND c.stage IN ('da_ky', 'hoan_thanh')
    UNION ALL
    SELECT rs.settled_date, rp.company_id, 0, 0, 0, rs.amount, 0
      FROM public.receivable_settlements rs
      JOIN public.receivables_payables rp ON rp.id = rs.receivable_id
     WHERE rp.direction = 'phai_thu' AND rp.deleted_at IS NULL
    UNION ALL
    SELECT pr.paid_date, pr.company_id, 0, 0, 0, 0, COALESCE(pr.paid_amount, pr.amount)
      FROM public.payment_requests pr
     WHERE pr.deleted_at IS NULL AND pr.paid_date IS NOT NULL AND pr.stage IN ('da_chi', 'da_hach_toan')
  )
  SELECT f.d, f.cid,
         SUM(f.revenue_accepted)::bigint, SUM(f.rental_revenue)::bigint,
         SUM(f.contracts_signed)::bigint, SUM(f.collected)::bigint, SUM(f.paid_out)::bigint
    FROM facts f
   WHERE f.d BETWEEN p_from AND p_to
     AND (p_company_id IS NULL OR f.cid = p_company_id)
     AND public.rls_company_access(f.cid)
   GROUP BY f.d, f.cid
   ORDER BY f.d, f.cid;
END;
$$;

COMMENT ON FUNCTION public.finance_daily(date, date, uuid) IS
  'Tổng tài chính theo ngày nghiệp vụ (doanh thu nghiệm thu, tiền thuê theo từng đợt trả, hợp đồng ký, đã thu, đã chi) cho biểu đồ BC. Chỉ vai trò rls_sees_finance.';
