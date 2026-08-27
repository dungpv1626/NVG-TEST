-- ============================================================================
-- Sửa lỗi phát hiện khi thu hồi thử một hợp đồng thuê thật qua giao diện:
-- `return_rental_agreement` từng ghi NGUYÊN số `compensation_amount` vào CẢ HAI
-- biên bản (hư hỏng + mất) khi một dòng vừa có hàng hư hỏng vừa có hàng mất —
-- cộng `scaffolding_events.amount` của lô đó ra gấp đôi số tiền thật sự được
-- ghi vào `rental_agreement_items.compensation_amount`.
--
-- `compensation_amount` là MỘT số cho cả dòng (biểu mẫu thu hồi chỉ có một ô),
-- không tách riêng theo nguyên nhân — nên chỉ gán vào biên bản MẤT (mất vĩnh
-- viễn, coi là nguyên nhân chính) khi có mất; biên bản hư hỏng nhận 0.
-- `rental_agreement_items.compensation_amount` vẫn là số ĐÚNG để đối chiếu
-- tổng tiền; hai biên bản chỉ còn dùng để truy vết CÓ chuyện gì xảy ra.
-- ============================================================================

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
    -- nhau nhờ `current_rental_agreement_id` (xem ghi chú đầu file 0053).
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

      -- Xem ghi chú đầu file: chỉ gán tiền bồi thường vào biên bản MẤT khi có mất, tránh
      -- đếm trùng với biên bản hư hỏng.
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
