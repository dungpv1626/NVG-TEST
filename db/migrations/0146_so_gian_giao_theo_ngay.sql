-- ============================================================================
-- Sổ giàn giáo tại một ngày trong quá khứ (KHO-06, SX-15, Asset Ledger — Webapp Flow 4.9).
--
-- `scaffolding_assets` chỉ giữ số HIỆN TẠI của từng lô; hỏi «ngày 15 khách nào giữ bao nhiêu»
-- thì không trả lời được. Thêm sổ phát sinh `scaffolding_ledger_entries`: mỗi lần một lô đổi
-- số lượng, tình trạng hay vị trí, một trigger ghi phần CHÊNH (+/−) kèm thuộc tính của lô lúc
-- đó. Số của một lô tại ngày X = tổng phần chênh có ngày ≤ X.
--
--   · Ngày ghi là NGÀY NGHIỆP VỤ của chứng từ (ngày bắt đầu thuê, ngày trả của đợt, ngày biên
--     bản), do hàm nghiệp vụ đặt qua `set_config('nvg.ledger_date', …, true)`. Không đặt thì
--     lấy ngày hôm nay giờ Việt Nam.
--   · Haan 01/10/2026 chọn «chỉ ghi từ hôm nay»: KHÔNG dựng lại lịch sử cũ. Lúc chạy migration,
--     mỗi lô đang có được một dòng «mở sổ» bằng đúng số hiện tại; `scaffolding_ledger_start()`
--     trả ngày đó. Hỏi ngày trước mốc mở sổ thì hàm từ chối, màn hình nói rõ sổ bắt đầu từ
--     ngày nào — không hiện số ước lượng.
--   · Sổ chỉ đọc: không policy ghi, chỉ trigger (SECURITY DEFINER) thêm dòng.
-- ============================================================================

CREATE TABLE public.scaffolding_ledger_entries (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  scaffolding_asset_id        uuid NOT NULL REFERENCES public.scaffolding_assets(id) ON DELETE CASCADE,
  asset_code                  varchar(64) NOT NULL,
  material_id                 uuid NOT NULL,
  condition                   public.scaffolding_condition NOT NULL,
  location_type               public.asset_location_type NOT NULL,
  warehouse_id                uuid,
  construction_site_id        uuid,
  current_rental_agreement_id uuid,
  renter_name                 varchar(255),
  quantity_delta              numeric(18, 3) NOT NULL,
  effective_date              date NOT NULL,
  source                      varchar(16) NOT NULL CHECK (source IN ('mo_so', 'phat_sinh')),
  recorded_at                 timestamptz NOT NULL DEFAULT now(),
  recorded_by                 uuid
);

CREATE INDEX scaffolding_ledger_company_date_idx
  ON public.scaffolding_ledger_entries (company_id, effective_date);
CREATE INDEX scaffolding_ledger_asset_idx
  ON public.scaffolding_ledger_entries (scaffolding_asset_id);

COMMENT ON TABLE public.scaffolding_ledger_entries IS
  'Sổ phát sinh giàn giáo theo lô: phần chênh số lượng kèm tình trạng/vị trí của lô, theo ngày nghiệp vụ. Số tại ngày X = tổng chênh có ngày ≤ X (scaffolding_ledger_as_of). Chỉ trigger ghi.';

ALTER TABLE public.scaffolding_ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scaffolding_ledger_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.scaffolding_ledger_entries FROM authenticated;

CREATE POLICY scaffolding_ledger_entries_select ON public.scaffolding_ledger_entries
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND (
      public.auth_can_view_module('KHO')
      OR public.auth_can_view_module('CRM')
      OR public.auth_can_view_module('SX')
    )
  );

CREATE OR REPLACE FUNCTION public.scaffolding_ledger_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date     date := COALESCE(
    NULLIF(current_setting('nvg.ledger_date', true), '')::date,
    (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  );
  v_user     uuid := public.auth_user_id();
  v_old      numeric := 0;
  v_new      numeric := CASE WHEN NEW.deleted_at IS NULL THEN NEW.quantity ELSE 0 END;
  v_same     boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := CASE WHEN OLD.deleted_at IS NULL THEN OLD.quantity ELSE 0 END;
    v_same := (OLD.material_id, OLD.condition, OLD.location_type, OLD.warehouse_id,
               OLD.construction_site_id, OLD.current_rental_agreement_id, OLD.renter_name)
              IS NOT DISTINCT FROM
              (NEW.material_id, NEW.condition, NEW.location_type, NEW.warehouse_id,
               NEW.construction_site_id, NEW.current_rental_agreement_id, NEW.renter_name);
  END IF;

  -- Cùng thuộc tính: một dòng chênh. Đổi tình trạng / vị trí: rút khỏi chỗ cũ, ghi vào chỗ mới.
  IF TG_OP = 'UPDATE' AND NOT v_same AND v_old <> 0 THEN
    INSERT INTO public.scaffolding_ledger_entries (
      company_id, scaffolding_asset_id, asset_code, material_id, condition, location_type,
      warehouse_id, construction_site_id, current_rental_agreement_id, renter_name,
      quantity_delta, effective_date, source, recorded_by
    ) VALUES (
      OLD.company_id, OLD.id, OLD.asset_code, OLD.material_id, OLD.condition, OLD.location_type,
      OLD.warehouse_id, OLD.construction_site_id, OLD.current_rental_agreement_id, OLD.renter_name,
      -v_old, v_date, 'phat_sinh', v_user
    );
    v_old := 0;
  END IF;

  IF v_new - v_old <> 0 THEN
    INSERT INTO public.scaffolding_ledger_entries (
      company_id, scaffolding_asset_id, asset_code, material_id, condition, location_type,
      warehouse_id, construction_site_id, current_rental_agreement_id, renter_name,
      quantity_delta, effective_date, source, recorded_by
    ) VALUES (
      NEW.company_id, NEW.id, NEW.asset_code, NEW.material_id, NEW.condition, NEW.location_type,
      NEW.warehouse_id, NEW.construction_site_id, NEW.current_rental_agreement_id, NEW.renter_name,
      v_new - v_old, v_date, 'phat_sinh', v_user
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER scaffolding_assets_ledger
  AFTER INSERT OR UPDATE ON public.scaffolding_assets
  FOR EACH ROW EXECUTE FUNCTION public.scaffolding_ledger_capture();

-- Mở sổ: mỗi lô đang có một dòng bằng đúng số hiện tại, ghi vào ngày chạy migration.
INSERT INTO public.scaffolding_ledger_entries (
  company_id, scaffolding_asset_id, asset_code, material_id, condition, location_type,
  warehouse_id, construction_site_id, current_rental_agreement_id, renter_name,
  quantity_delta, effective_date, source
)
SELECT company_id, id, asset_code, material_id, condition, location_type,
       warehouse_id, construction_site_id, current_rental_agreement_id, renter_name,
       quantity, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'mo_so'
  FROM public.scaffolding_assets
 WHERE deleted_at IS NULL AND quantity <> 0;

-- Ngày mở sổ đóng cứng vào hàm lúc chạy migration: mỗi CSDL (máy, demo) có mốc của riêng nó.
DO $$
BEGIN
  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.scaffolding_ledger_start()
       RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public
       AS $b$SELECT %L::date$b$ $f$,
    (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  );
END;
$$;

COMMENT ON FUNCTION public.scaffolding_ledger_start() IS
  'Ngày bắt đầu ghi sổ giàn giáo theo ngày (ngày chạy migration 0146 trên CSDL này). Trước ngày này không có số.';

CREATE OR REPLACE FUNCTION public.scaffolding_ledger_as_of(p_date date, p_company_id uuid DEFAULT NULL)
RETURNS TABLE (
  scaffolding_asset_id  uuid,
  asset_code            text,
  company_id            uuid,
  material_id           uuid,
  material_code         text,
  material_name         text,
  unit                  text,
  condition             public.scaffolding_condition,
  location_type         public.asset_location_type,
  warehouse_name        text,
  site_code             text,
  site_name             text,
  renter_name           text,
  rental_agreement_code text,
  quantity              numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Chọn ngày cần xem sổ.';
  END IF;
  IF p_date < public.scaffolding_ledger_start() THEN
    RAISE EXCEPTION 'Sổ giàn giáo bắt đầu ghi theo ngày từ %. Chọn ngày từ đó trở đi.',
      to_char(public.scaffolding_ledger_start(), 'DD/MM/YYYY');
  END IF;

  -- Chạy bằng quyền người xem (không SECURITY DEFINER): RLS của sổ và của các bảng nối vào
  -- quyết định thấy gì, đúng như màn hình sổ hiện tại.
  RETURN QUERY
  SELECT e.scaffolding_asset_id, max(e.asset_code)::text, e.company_id, e.material_id,
         max(m.code)::text, max(m.name)::text, max(m.unit)::text,
         e.condition, e.location_type,
         max(w.name)::text, max(s.code)::text, max(s.name)::text,
         e.renter_name::text, max(ra.code)::text,
         sum(e.quantity_delta)
    FROM public.scaffolding_ledger_entries e
    LEFT JOIN public.materials m ON m.id = e.material_id
    LEFT JOIN public.warehouses w ON w.id = e.warehouse_id
    LEFT JOIN public.construction_sites s ON s.id = e.construction_site_id
    LEFT JOIN public.rental_agreements ra ON ra.id = e.current_rental_agreement_id
   WHERE e.effective_date <= p_date
     AND (p_company_id IS NULL OR e.company_id = p_company_id)
   GROUP BY e.scaffolding_asset_id, e.company_id, e.material_id, e.condition, e.location_type,
            e.warehouse_id, e.construction_site_id, e.current_rental_agreement_id, e.renter_name
  HAVING sum(e.quantity_delta) <> 0
   ORDER BY max(m.code), e.condition, e.location_type, max(e.asset_code);
END;
$$;

COMMENT ON FUNCTION public.scaffolding_ledger_as_of(date, uuid) IS
  'Sổ giàn giáo tại cuối ngày p_date: từng lô với tình trạng, vị trí và số lượng lúc đó (KHO-06, SX-15). Từ chối ngày trước scaffolding_ledger_start().';

REVOKE ALL ON FUNCTION public.scaffolding_ledger_as_of(date, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.scaffolding_ledger_as_of(date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.scaffolding_ledger_capture() FROM anon, public;
REVOKE ALL ON FUNCTION public.scaffolding_ledger_start() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.scaffolding_ledger_start() TO authenticated;


-- Hàm nghiệp vụ đặt ngày nghiệp vụ cho sổ (thân hàm giữ nguyên bản 0079 / 0106, chỉ thêm một dòng).

CREATE OR REPLACE FUNCTION public.record_scaffolding_event(p_asset_id uuid, p_event_type scaffolding_event_type, p_quantity numeric, p_reason text, p_result_condition scaffolding_condition DEFAULT NULL::scaffolding_condition, p_event_date date DEFAULT NULL::date, p_amount bigint DEFAULT 0, p_responsible_party text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.auth_user_id();
  a        record;
  v_target uuid;
  v_event  uuid;
BEGIN
  -- 0146: thay đổi lô ghi vào sổ theo NGÀY NGHIỆP VỤ của chứng từ, không theo lúc bấm nút.
  PERFORM set_config('nvg.ledger_date', (COALESCE(p_event_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))::text, true);
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
$function$;

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
  -- 0146: thay đổi lô ghi vào sổ theo NGÀY NGHIỆP VỤ của chứng từ, không theo lúc bấm nút.
  PERFORM set_config('nvg.ledger_date', (COALESCE(p_start_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date))::text, true);
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
