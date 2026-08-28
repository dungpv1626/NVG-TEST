-- ============================================================================
-- Sửa lỗi trùng `asset_code` khi hai lô giàn giáo tách ra trong CÙNG một giây (SX-03).
--
-- PHÁT HIỆN khi rà lại 4B (đợt khoá quyền `anon`): bộ test `sx.test.ts` báo đỏ ở ca "hai
-- khách thuê cùng vật tư KHÔNG bị gộp chung một lô" — nhưng gọi lại đúng thao tác đó BẰNG TAY
-- (script độc lập, không qua Vitest) thì chạy đúng, nên đây KHÔNG phải hồi quy do việc khoá
-- `anon` (`0062`) gây ra. Bật debug tạm trong test mới lộ nguyên nhân thật: gọi
-- `create_rental_agreement` hai lần liên tiếp (không có khoảng chờ) cho cùng một lô kho —
-- đúng như Vitest gọi hai `it()`/RPC sát nhau — sinh ra hai `asset_code` GIỐNG HỆT nhau vì cả
-- ba chỗ tách lô trong `0053_sx_rls.sql` dùng `to_char(now(), 'YYMMDDHH24MISS')` (độ phân giải
-- MỘT GIÂY) làm hậu tố duy nhất, và `now()` chỉ đổi theo GIÂY — hai lượt gọi trong cùng một
-- giây tạo đúng một chuỗi, đụng khoá duy nhất `scaffolding_assets_code`.
--
-- Lỗi có thật ngoài môi trường test: hai nhân viên Kho lập liên tiếp hai hợp đồng thuê cùng
-- loại giàn giáo trong cùng một giây (thao tác bấm nút nhanh, hoặc submit kép) sẽ gặp lỗi
-- `duplicate key value violates unique constraint`, hiện ra như một lỗi hệ thống khó hiểu chứ
-- không phải thông báo nghiệp vụ nào.
--
-- SỬA: đổi `now()` (đóng băng theo THỜI ĐIỂM BẮT ĐẦU GIAO DỊCH — không đổi trong suốt một
-- transaction) sang `clock_timestamp()` (thời điểm THẬT của câu lệnh) VÀ thêm định dạng mili-
-- giây (`MS`) — thu hẹp cửa sổ đụng độ từ 1 giây xuống 1 mili-giây, đủ dùng cho quy mô thao
-- tác tay của Kho. Áp dụng thống nhất cho cả ba chỗ tách lô: `-HDT-` (lập hợp đồng),
-- `-TRA-`/`-HH-` (thu hồi — phần đạt/phần hư hỏng, `return_rental_agreement`).
--
-- ⚠️ Cột `asset_code` giới hạn `varchar(64)` (`db/src/schema/kho.ts`), và mỗi lần tách lô GHÉP
-- THÊM vào code của lô NGUỒN (một lô có thể đi qua thuê → trả → thuê lại nhiều lượt, mỗi lượt
-- dài thêm) — kiểm khi chạy thử bản vá đầu: thêm 3 ký tự mili-giây làm một hợp đồng thuê-trả
-- hai loại giàn giáo (`sx.test.ts`, "thu hồi phải khai đủ mọi loại") VƯỢT 64 KÝ TỰ ở lượt trả
-- thứ hai, báo lỗi `value too long for type character varying(64)`. Đây là giới hạn CÓ THẬT
-- (không riêng gì bản vá này — code càng dài dần qua nhiều vòng thuê/trả, kể cả với hậu tố cũ
-- 12 ký tự), nên CẮT BỚT phần đầu của code nguồn trước khi nối hậu tố, thay vì chỉ thêm hậu tố
-- mới — đảm bảo không vượt 64 ký tự ở bất kỳ vòng nào, không phụ thuộc code nguồn dài bao
-- nhiêu.
-- ============================================================================

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
        p_company_id, left(v_lot.asset_code, 44) || '-HDT-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
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
          ra.company_id, left(v_lot.asset_code, 44) || '-TRA-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
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
          ra.company_id, left(v_lot.asset_code, 44) || '-HH-' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
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
$function$;
