-- ============================================================================
-- Biên bản thu hồi giàn giáo có chữ ký hai bên; đối soát và tất toán chuyển sang Kế toán.
--
-- Haan 01/10/2026 (hướng dẫn Cho thuê giàn giáo, mục «Phần chưa có»). Haan chốt:
--   · Hai bên ký TRÊN MÀN HÌNH tại bãi, hoặc chụp ảnh biên bản giấy đã ký đính vào.
--   · MỖI biên bản đã ký sinh MỘT khoản phải thu bên Kế toán (tiền thuê + bồi thường của đợt).
--   · Khi khách trả hết, Kế toán tất toán: cấn trừ tiền cọc vào phần còn phải thu; cọc thừa
--     thành khoản phải trả (hoàn cọc) cho khách.
--
-- Mỗi đợt trả (`rental_returns`, 0143) nay LÀ biên bản thu hồi:
--   · có mã `…-BBTH-<năm>-<số>` và các dòng hàng trả của riêng đợt (`rental_return_items`) —
--     trước đây chỉ có số cộng dồn trên dòng hợp đồng, không in được biên bản của một đợt;
--   · ký xong thì KHOÁ (`frozen_after_signed`, Backend Schema 3.5 nhóm 1 — «chứng từ giao nhận
--     và thu hồi giàn giáo có chữ ký hai bên», 0117 ghi là «bảng chưa tồn tại»);
--   · chữ ký và ảnh biên bản giấy nằm trong bucket riêng tư `rental-return-docs`, đường dẫn
--     `<id biên bản>/<loại>/<uuid>.<đuôi>`; không có chính sách xoá — đó là chứng cứ.
--
-- Kế toán (vai trò KT) trước đây không đọc được hợp đồng thuê (chỉ SX, CRM). Để đối soát, nhóm
-- xem tài chính có quyền KT được ĐỌC hợp đồng thuê, dòng hàng và biên bản — không được sửa.
-- ============================================================================

-- 1. Biên bản ------------------------------------------------------------------

ALTER TABLE public.rental_returns
  ADD COLUMN code                    varchar(40),
  ADD COLUMN customer_representative varchar(255),
  ADD COLUMN customer_signature_path text,
  ADD COLUMN nvg_signature_path      text,
  ADD COLUMN paper_scan_path         text,
  ADD COLUMN signed_at               timestamptz,
  ADD COLUMN signed_by               uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN receivable_id           uuid REFERENCES public.receivables_payables(id) ON DELETE SET NULL;

-- Mã cho các đợt đã ghi trước migration này, theo thứ tự ngày trả.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT rr.id, c.code AS company_code, rr.return_date
      FROM public.rental_returns rr
      JOIN public.companies c ON c.id = rr.company_id
     WHERE rr.code IS NULL
     ORDER BY rr.return_date, rr.created_at
  LOOP
    UPDATE public.rental_returns
       SET code = public.issue_record_code(r.company_code, 'BBTH', EXTRACT(YEAR FROM r.return_date)::int)
     WHERE id = r.id;
  END LOOP;
END;
$$;

ALTER TABLE public.rental_returns ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX rental_returns_code ON public.rental_returns (code);

COMMENT ON TABLE public.rental_returns IS
  'Biên bản thu hồi giàn giáo — mỗi đợt khách trả một biên bản: ngày trả, tiền thuê và bồi thường của đợt (nguồn doanh thu cho thuê theo ngày, BC-01), chữ ký hai bên, khoản phải thu sinh ra khi ký. Chỉ hàm nghiệp vụ ghi; ký xong thì khoá (Backend Schema 3.5).';

CREATE TABLE public.rental_return_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_return_id    uuid NOT NULL REFERENCES public.rental_returns(id) ON DELETE CASCADE,
  material_id         uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  quantity_ok         numeric(18, 3) NOT NULL DEFAULT 0,
  quantity_damaged    numeric(18, 3) NOT NULL DEFAULT 0,
  quantity_lost       numeric(18, 3) NOT NULL DEFAULT 0,
  rental_days         integer NOT NULL,
  daily_rate          bigint NOT NULL DEFAULT 0,
  revenue             bigint NOT NULL DEFAULT 0,
  compensation_amount bigint NOT NULL DEFAULT 0,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rental_return_items_return_idx ON public.rental_return_items (rental_return_id);

COMMENT ON TABLE public.rental_return_items IS
  'Dòng hàng của một biên bản thu hồi: số trả đạt / hư hỏng / mất, số ngày thuê và tiền thuê của đợt. Chỉ return_rental_agreement ghi.';

/*
 * Dòng hàng cho biên bản cũ. 0143 bù đúng MỘT dòng `rental_returns` cho mỗi hợp đồng đã trả,
 * nên với hợp đồng chỉ có một biên bản, số cộng dồn trên dòng hợp đồng chính là số của biên bản
 * đó. Chỉ nhận khi tiền thuê tính lại khớp đúng số đã chốt — lệch (đã trả nhiều đợt trước 0143)
 * thì để biên bản không có dòng, màn hình nói rõ «ghi trước khi có biên bản chi tiết», không
 * chia ước lượng.
 */
WITH single AS (
  SELECT rr.id, rr.rental_agreement_id, rr.return_date, rr.revenue, ra.start_date
    FROM public.rental_returns rr
    JOIN public.rental_agreements ra ON ra.id = rr.rental_agreement_id
   WHERE (SELECT count(*) FROM public.rental_returns x
           WHERE x.rental_agreement_id = rr.rental_agreement_id) = 1
),
lines AS (
  SELECT s.id AS rental_return_id, s.revenue AS header_revenue, ri.material_id,
         ri.quantity_returned_ok, ri.quantity_damaged, ri.quantity_lost,
         GREATEST((s.return_date - s.start_date) + 1, 1) AS days, ri.daily_rate,
         ri.daily_rate * (ri.quantity_returned_ok + ri.quantity_damaged + ri.quantity_lost)
           * GREATEST((s.return_date - s.start_date) + 1, 1) AS revenue,
         ri.compensation_amount, ri.note
    FROM single s
    JOIN public.rental_agreement_items ri ON ri.rental_agreement_id = s.rental_agreement_id
   WHERE ri.quantity_returned_ok + ri.quantity_damaged + ri.quantity_lost > 0
),
matching AS (
  SELECT rental_return_id FROM lines
   GROUP BY rental_return_id, header_revenue
  HAVING sum(revenue) = header_revenue
)
INSERT INTO public.rental_return_items (
  rental_return_id, material_id, quantity_ok, quantity_damaged, quantity_lost,
  rental_days, daily_rate, revenue, compensation_amount, note
)
SELECT l.rental_return_id, l.material_id, l.quantity_returned_ok, l.quantity_damaged,
       l.quantity_lost, l.days, l.daily_rate, l.revenue, l.compensation_amount, l.note
  FROM lines l
 WHERE l.rental_return_id IN (SELECT rental_return_id FROM matching);

ALTER TABLE public.rental_return_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_return_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.rental_return_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rental_returns FROM authenticated;

-- Ký xong: nội dung đối tác đã nhìn và ký vào không đổi được nữa, kể cả qua hàm nghiệp vụ.
CREATE TRIGGER rental_returns_frozen_after_signed
  BEFORE UPDATE ON public.rental_returns
  FOR EACH ROW EXECUTE FUNCTION public.frozen_after_signed(
    'signed_at',
    'code', 'return_date', 'revenue', 'compensation', 'customer_representative',
    'customer_signature_path', 'nvg_signature_path', 'paper_scan_path', 'signed_by',
    'receivable_id', 'rental_agreement_id', 'company_id'
  );

CREATE OR REPLACE FUNCTION public.rental_return_items_frozen_after_signed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rental_returns
              WHERE id = OLD.rental_return_id AND signed_at IS NOT NULL) THEN
    RAISE EXCEPTION
      'Không sửa được dòng hàng của biên bản thu hồi đã ký. Lập biên bản điều chỉnh mới và gửi phê duyệt.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rental_return_items_frozen_after_signed
  BEFORE UPDATE ON public.rental_return_items
  FOR EACH ROW EXECUTE FUNCTION public.rental_return_items_frozen_after_signed();


-- 2. Ai đọc được: Xưởng, Kinh doanh, và nhóm xem tài chính có quyền Kế toán ---------------

CREATE OR REPLACE FUNCTION public.rls_rental_readable(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_company_access(p_company_id)
     AND (
       public.auth_can_view_module('SX')
       OR public.auth_can_view_module('CRM')
       OR (public.auth_can_view_module('KT') AND public.rls_sees_finance())
     );
$$;

COMMENT ON FUNCTION public.rls_rental_readable(uuid) IS
  'Ai đọc được hợp đồng thuê giàn giáo, dòng hàng và biên bản thu hồi của một pháp nhân: SX, CRM, và Kế toán – Tài chính để đối soát, tất toán (0145).';

DROP POLICY IF EXISTS rental_agreements_select ON public.rental_agreements;
CREATE POLICY rental_agreements_select ON public.rental_agreements
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.rls_rental_readable(company_id));

DROP POLICY IF EXISTS rental_returns_select ON public.rental_returns;
CREATE POLICY rental_returns_select ON public.rental_returns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rental_agreements ra
       WHERE ra.id = rental_agreement_id AND ra.deleted_at IS NULL
         AND public.rls_rental_readable(ra.company_id)
    )
  );

CREATE POLICY rental_return_items_select ON public.rental_return_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_returns rr WHERE rr.id = rental_return_id));

CREATE OR REPLACE FUNCTION public.rls_rental_return_readable(p_rental_return_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_returns rr
      JOIN public.rental_agreements ra ON ra.id = rr.rental_agreement_id
     WHERE rr.id = p_rental_return_id AND ra.deleted_at IS NULL
       AND public.rls_rental_readable(ra.company_id)
  );
$$;

-- Tải chữ ký / ảnh lên chỉ khi biên bản CHƯA ký và người tải là Xưởng của đúng pháp nhân.
CREATE OR REPLACE FUNCTION public.rls_rental_return_signable(p_rental_return_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rental_returns rr
      JOIN public.rental_agreements ra ON ra.id = rr.rental_agreement_id
     WHERE rr.id = p_rental_return_id AND ra.deleted_at IS NULL AND rr.signed_at IS NULL
       AND public.rls_company_access(ra.company_id)
       AND public.auth_can_edit_module('SX')
  );
$$;

REVOKE ALL ON FUNCTION public.rls_rental_readable(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.rls_rental_return_readable(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.rls_rental_return_signable(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.rental_return_items_frozen_after_signed() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.rls_rental_readable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_rental_return_readable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_rental_return_signable(uuid) TO authenticated;


-- 3. Tệp chữ ký và ảnh biên bản giấy ---------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rental-return-docs',
  'rental-return-docs',
  false,
  20971520,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS rental_return_docs_select ON storage.objects;
CREATE POLICY rental_return_docs_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'rental-return-docs'
    AND public.rls_rental_return_readable(public.try_uuid((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS rental_return_docs_insert ON storage.objects;
CREATE POLICY rental_return_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'rental-return-docs'
    AND public.rls_rental_return_signable(public.try_uuid((storage.foldername(name))[1]))
  );


-- 4. Liên kết công nợ ↔ hợp đồng thuê, biên bản -------------------------------------------

ALTER TABLE public.receivables_payables
  ADD COLUMN rental_agreement_id uuid REFERENCES public.rental_agreements(id) ON DELETE SET NULL,
  ADD COLUMN rental_return_id    uuid REFERENCES public.rental_returns(id) ON DELETE SET NULL;

CREATE INDEX receivables_rental_agreement_idx ON public.receivables_payables (rental_agreement_id)
  WHERE rental_agreement_id IS NOT NULL;
-- Một biên bản chỉ sinh một khoản phải thu — ký lại hay gọi lại hàm không được sinh khoản thứ hai.
CREATE UNIQUE INDEX receivables_one_per_rental_return ON public.receivables_payables (rental_return_id)
  WHERE rental_return_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER receivables_rental_link_guard
  BEFORE UPDATE ON public.receivables_payables
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'rental_agreement_id', 'rental_return_id'
  );

ALTER TABLE public.rental_agreements
  ADD COLUMN settled_at                timestamptz,
  ADD COLUMN settled_by                uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN settlement_deposit_offset bigint,
  ADD COLUMN settlement_refund         bigint;

COMMENT ON COLUMN public.rental_agreements.settled_at IS
  'Kế toán tất toán hợp đồng thuê (settle_rental_agreement): cọc đã cấn trừ vào phải thu, phần cọc thừa thành khoản phải trả hoàn cọc.';

CREATE TRIGGER rental_agreements_settlement_guard
  BEFORE UPDATE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'settled_at', 'settled_by', 'settlement_deposit_offset', 'settlement_refund'
  );


-- 5. Thu hồi: mỗi đợt một biên bản có dòng hàng ----------------------------------------------

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
  v_return_id          uuid;
  v_company_code       text;
  v_item_revenue       bigint;
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

  -- 0146: sổ giàn giáo theo ngày ghi mọi thay đổi của lô vào NGÀY TRẢ của đợt, không vào
  -- ngày bấm nút (trả hôm 27 mà 30 mới ghi thì sổ ngày 28 phải thấy giáo đã về kho).
  PERFORM set_config('nvg.ledger_date', v_return_date::text, true);

  -- 0145: mỗi đợt trả là MỘT biên bản thu hồi có mã riêng. Ghi đầu biên bản trước để từng
  -- dòng hàng trả gắn vào nó; tổng tiền cập nhật sau vòng lặp.
  SELECT code INTO v_company_code FROM public.companies WHERE id = ra.company_id;
  INSERT INTO public.rental_returns (
    company_id, rental_agreement_id, code, return_date, revenue, compensation, created_by, updated_by
  ) VALUES (
    ra.company_id, p_rental_agreement_id,
    public.issue_record_code(v_company_code, 'BBTH', EXTRACT(YEAR FROM v_return_date)::int),
    v_return_date, 0, 0, v_user, v_user
  )
  RETURNING id INTO v_return_id;

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
    v_item_revenue := ri.daily_rate * v_returning * v_days;
    v_total_revenue := v_total_revenue + v_item_revenue;

    -- Dòng của biên bản: đúng số hai bên đếm và ký vào ở đợt này (0145).
    INSERT INTO public.rental_return_items (
      rental_return_id, material_id, quantity_ok, quantity_damaged, quantity_lost,
      rental_days, daily_rate, revenue, compensation_amount, note
    ) VALUES (
      v_return_id, v_material_id, v_ok, v_damaged, v_lost,
      v_days, ri.daily_rate, v_item_revenue, v_compensation, v_note
    );

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
  UPDATE public.rental_returns
     SET revenue = v_total_revenue, compensation = v_total_compensation
   WHERE id = v_return_id;

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

COMMENT ON FUNCTION public.return_rental_agreement(uuid, date, jsonb) IS
  'Ghi một đợt khách trả giàn giáo: lập biên bản thu hồi (mã BBTH, dòng hàng của đợt), đưa hàng đạt/hư hỏng về kho, tính tiền thuê theo số ngày thuê thật của đợt. Biên bản chờ hai bên ký (sign_rental_return).';


-- 6. Ký biên bản → khoản phải thu bên Kế toán --------------------------------------------------

CREATE OR REPLACE FUNCTION public.sign_rental_return(
  p_rental_return_id uuid,
  p_customer_representative text,
  p_customer_signature_path text DEFAULT NULL,
  p_nvg_signature_path text DEFAULT NULL,
  p_paper_scan_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user          uuid := public.auth_user_id();
  rr              record;
  ra              record;
  v_customer_sig  text := NULLIF(btrim(p_customer_signature_path), '');
  v_nvg_sig       text := NULLIF(btrim(p_nvg_signature_path), '');
  v_scan          text := NULLIF(btrim(p_paper_scan_path), '');
  v_rep           text := NULLIF(btrim(p_customer_representative), '');
  v_prefix        text;
  v_path          text;
  v_amount        bigint;
  v_customer_name text;
  v_receivable    uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO rr FROM public.rental_returns WHERE id = p_rental_return_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy biên bản thu hồi.';
  END IF;

  SELECT * INTO ra FROM public.rental_agreements
   WHERE id = rr.rental_agreement_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(ra.company_id)
     OR NOT public.auth_can_edit_module('SX') THEN
    RAISE EXCEPTION 'Ký biên bản thu hồi do Xưởng sản xuất – Cho thuê thực hiện.';
  END IF;

  IF rr.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Biên bản % đã ký hai bên, không ký lại được.', rr.code;
  END IF;

  IF v_rep IS NULL THEN
    RAISE EXCEPTION 'Ghi họ tên người đại diện bên thuê ký biên bản.';
  END IF;

  IF NOT ((v_customer_sig IS NOT NULL AND v_nvg_sig IS NOT NULL) OR v_scan IS NOT NULL) THEN
    RAISE EXCEPTION 'Cần đủ chữ ký của hai bên, hoặc ảnh biên bản giấy đã ký.';
  END IF;

  -- Tệp phải nằm dưới thư mục của CHÍNH biên bản này và đã tải lên thật: chữ ký trỏ vào tệp
  -- không có, hoặc tệp của biên bản khác, thì biên bản mất giá trị chứng cứ.
  v_prefix := rr.id::text || '/';
  FOREACH v_path IN ARRAY ARRAY[v_customer_sig, v_nvg_sig, v_scan] LOOP
    CONTINUE WHEN v_path IS NULL;
    IF left(v_path, length(v_prefix)) <> v_prefix
       OR NOT EXISTS (SELECT 1 FROM storage.objects
                       WHERE bucket_id = 'rental-return-docs' AND name = v_path) THEN
      RAISE EXCEPTION 'Chữ ký hoặc ảnh biên bản chưa tải lên được. Kiểm tra mạng rồi ký lại.';
    END IF;
  END LOOP;

  -- Khoản phải thu của đợt: tiền thuê + bồi thường. Hạn thu để trống — Kế toán đặt khi đối
  -- soát (điều khoản thanh toán cho thuê NVG chưa chốt, không tự đặt mặc định).
  v_amount := COALESCE(rr.revenue, 0) + COALESCE(rr.compensation, 0);
  IF v_amount > 0 THEN
    SELECT name INTO v_customer_name FROM public.customers WHERE id = ra.customer_id;
    INSERT INTO public.receivables_payables (
      company_id, direction, party_type, customer_id, party_name, description, amount,
      rental_agreement_id, rental_return_id, created_by, updated_by
    ) VALUES (
      ra.company_id, 'phai_thu', 'khach_hang', ra.customer_id, v_customer_name,
      'Tiền thuê giàn giáo'
        || CASE WHEN COALESCE(rr.compensation, 0) > 0 THEN ' và bồi thường' ELSE '' END
        || ' — hợp đồng ' || ra.code || ', biên bản thu hồi ' || rr.code,
      v_amount, ra.id, rr.id, v_user, v_user
    )
    RETURNING id INTO v_receivable;
  END IF;

  UPDATE public.rental_returns
     SET customer_representative = v_rep,
         customer_signature_path = v_customer_sig,
         nvg_signature_path = v_nvg_sig,
         paper_scan_path = v_scan,
         signed_at = now(),
         signed_by = v_user,
         receivable_id = v_receivable,
         updated_at = now(),
         updated_by = v_user
   WHERE id = rr.id;

  RETURN rr.id;
END;
$$;

COMMENT ON FUNCTION public.sign_rental_return(uuid, text, text, text, text) IS
  'Hai bên ký biên bản thu hồi (chữ ký trên màn hình của cả hai, hoặc ảnh biên bản giấy đã ký). Ký xong biên bản bị khoá và Kế toán nhận một khoản phải thu gồm tiền thuê và bồi thường của đợt.';


-- 7. Tất toán hợp đồng thuê (Kế toán) ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_rental_agreement(
  p_rental_agreement_id uuid,
  p_settled_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  ra          record;
  r           record;
  v_date      date := COALESCE(p_settled_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_left      bigint;
  v_take      bigint;
  v_offset    bigint := 0;
  v_customer  text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO ra FROM public.rental_agreements
   WHERE id = p_rental_agreement_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(ra.company_id)
     OR NOT (public.auth_can_edit_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Tất toán hợp đồng thuê do Kế toán – Tài chính thực hiện.';
  END IF;

  IF ra.settled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Hợp đồng % đã tất toán.', ra.code;
  END IF;

  IF ra.status <> 'da_thu_hoi' THEN
    RAISE EXCEPTION 'Khách chưa trả hết giàn giáo. Chỉ tất toán khi hợp đồng đã thu hồi xong.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.rental_returns
              WHERE rental_agreement_id = ra.id AND signed_at IS NULL) THEN
    RAISE EXCEPTION 'Còn biên bản thu hồi chưa ký hai bên. Xưởng ký xong mới tất toán được.';
  END IF;

  -- Cấn trừ tiền cọc vào phần còn phải thu, khoản cũ trước.
  v_left := COALESCE(ra.deposit_amount, 0);
  FOR r IN
    SELECT id, amount - settled_amount AS open_amount
      FROM public.receivables_payables
     WHERE rental_agreement_id = ra.id AND direction = 'phai_thu' AND deleted_at IS NULL
       AND amount > settled_amount
     ORDER BY created_at
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, r.open_amount);
    PERFORM public.record_receivable_settlement(
      r.id, v_date, v_take, NULL, 'Cấn trừ tiền cọc',
      'Cấn trừ tiền đặt cọc khi tất toán hợp đồng thuê ' || ra.code
    );
    v_left := v_left - v_take;
    v_offset := v_offset + v_take;
  END LOOP;

  -- Cọc còn thừa sau khi trừ hết phải thu → phải trả lại khách.
  IF v_left > 0 THEN
    SELECT name INTO v_customer FROM public.customers WHERE id = ra.customer_id;
    INSERT INTO public.receivables_payables (
      company_id, direction, party_type, customer_id, party_name, description, amount,
      rental_agreement_id, created_by, updated_by
    ) VALUES (
      ra.company_id, 'phai_tra', 'khach_hang', ra.customer_id, v_customer,
      'Hoàn tiền đặt cọc — hợp đồng thuê ' || ra.code,
      v_left, ra.id, v_user, v_user
    );
  END IF;

  UPDATE public.rental_agreements
     SET settled_at = now(), settled_by = v_user,
         settlement_deposit_offset = v_offset, settlement_refund = v_left,
         updated_at = now(), updated_by = v_user
   WHERE id = ra.id;

  RETURN ra.id;
END;
$$;

COMMENT ON FUNCTION public.settle_rental_agreement(uuid, date) IS
  'Kế toán tất toán hợp đồng thuê đã thu hồi xong, mọi biên bản đã ký: cấn trừ tiền cọc vào phần còn phải thu (ghi chứng từ thu), cọc thừa thành khoản phải trả hoàn cọc cho khách.';

REVOKE ALL ON FUNCTION public.sign_rental_return(uuid, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sign_rental_return(uuid, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.settle_rental_agreement(uuid, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.settle_rental_agreement(uuid, date) TO authenticated;


-- 8. Sửa kèm: «hôm nay» của chứng từ thu/trả theo giờ Việt Nam ---------------------------------
--
-- `record_receivable_settlement` so ngày chứng từ với `current_date` — giờ UTC của máy chủ. Từ
-- 0 giờ tới 7 giờ sáng giờ Việt Nam, UTC còn là ngày hôm trước, nên Kế toán chọn đúng ngày hôm
-- nay thì bị báo «ngày nằm ở tương lai». Phép thử tất toán của migration này bắt được lúc 00:24
-- ngày 01/10/2026. Thân hàm giữ nguyên, chỉ đổi hai chỗ lấy «hôm nay».

CREATE OR REPLACE FUNCTION public.record_receivable_settlement(p_receivable_id uuid, p_settled_date date, p_amount bigint, p_method payment_method DEFAULT NULL::payment_method, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid := public.auth_user_id();
  rp          record;
  v_date      date := COALESCE(p_settled_date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
  v_remaining bigint;
  v_id        uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO rp FROM public.receivables_payables
   WHERE id = p_receivable_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(rp.company_id)
     OR NOT (public.auth_can_edit_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Ghi nhận thu – chi công nợ do Kế toán – Tài chính thực hiện.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền phải lớn hơn 0.';
  END IF;

  IF v_date > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RAISE EXCEPTION 'Ngày chứng từ nằm ở tương lai. Chọn ngày đã thực hiện.';
  END IF;

  v_remaining := rp.amount - rp.settled_amount;

  /*
   * Thu nhiều hơn số còn nợ nghĩa là hoặc gõ nhầm, hoặc khách trả gộp cho một khoản khác
   * chưa được lập. Cả hai đều phải dừng lại xử lý: ghi bừa vào đây làm công nợ âm, và bảng
   * tuổi nợ của cả pháp nhân lệch theo.
   */
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Số tiền (% đồng) lớn hơn phần còn lại của khoản công nợ (% đồng).',
      to_char(p_amount, 'FM999,999,999,999'), to_char(v_remaining, 'FM999,999,999,999');
  END IF;

  INSERT INTO public.receivable_settlements (
    receivable_id, settled_date, amount, method, reference, notes, created_by, updated_by
  )
  VALUES (
    p_receivable_id, v_date, p_amount, p_method, NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''), v_user, v_user
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 9. Kế toán đọc được danh mục khách hàng ----------------------------------------------------
--
-- Đối soát công nợ phải thu mà không đọc được tên khách: màn hình Thuê giàn giáo hiện «—» ở chỗ
-- tên khách (chụp thử 01/10/2026), màn hình Công nợ phải lùi về `party_name` chép tay. Nhóm xem
-- tài chính có quyền Kế toán nay đọc được khách hàng — chỉ đọc, sửa vẫn là việc của Kinh doanh.
DROP POLICY IF EXISTS customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.auth_can_view_module('CRM')
      OR public.auth_can_view_module('SX')
      OR (public.auth_can_view_module('KT') AND public.rls_sees_finance())
    )
  );
