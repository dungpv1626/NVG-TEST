-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `record_scaffolding_event`
-- sinh mã lô mới (khi biên bản đổi tình trạng cần tách lô, không gộp được vào lô sẵn có) bằng
-- đúng LỚP LỖI mà `0063_fix_scaffolding_asset_code_collision.sql` đã tìm và vá cho
-- `create_rental_agreement`/`return_rental_agreement` — nhưng bỏ sót hàm anh em này:
--
--   a.asset_code || '-' || upper(left(p_result_condition::text, 3)) || '-' ||
--     to_char(now(), 'YYMMDDHH24MISS')
--
-- Hai lỗi giống hệt 0063: (1) `now()` đứng yên suốt transaction và chỉ phân giải tới GIÂY —
-- hai biên bản sửa chữa cùng vật tư/cùng tình trạng đích/cùng vị trí lập trong cùng một giây
-- đụng khoá duy nhất `scaffolding_assets_code`, ra lỗi kỹ thuật khó hiểu; (2) không cắt bớt
-- `asset_code` nguồn trước khi nối hậu tố — một lô đã qua nhiều vòng thuê/trả/sửa (code dài
-- dần) cộng thêm hậu tố có thể vượt `varchar(64)`.
--
-- Vá đúng khuôn 0063: `clock_timestamp()` + mili-giây, và `left(a.asset_code, 44)`.
-- ============================================================================

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
        -- clock_timestamp() + mili-giây, cắt bớt code nguồn — cùng khuôn 0063 (0079).
        left(a.asset_code, 44) || '-' || upper(left(p_result_condition::text, 3)) || '-' ||
          to_char(clock_timestamp(), 'YYMMDDHH24MISSMS'),
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
) IS 'Biên bản sửa chữa / mất mát / thanh lý giàn giáo — đường DUY NHẤT để một lô đổi tình trạng (KHO-06). Mã lô mới dùng clock_timestamp() + cắt bớt code nguồn để tránh đụng khoá duy nhất (0079, cùng khuôn 0063).';
