-- ============================================================================
-- Đợt 4 — 4A. Gom đề nghị mua cho Mua hàng.
--
-- Vấn đề: đề nghị vật tư đến từ nhiều công trình / xưởng, mỗi đề nghị một màn hình. Năm công trình
-- cùng cần xi măng thì Mua hàng mở năm hồ sơ, gọi năm lần cho cùng một nhà cung cấp.
--
-- Thiết kế — dùng lại `purchase_requests` + `quotations`, KHÔNG dựng đề nghị gộp:
--   · Mỗi đề nghị gắn MỘT công trình + MỘT mã chi phí; đơn hàng cộng tiền vào đúng dòng ngân
--     sách đó (KT-05, TC-05) và giao về đúng địa điểm của đề nghị. Một «đề nghị gộp» nhiều công
--     trình sẽ làm mất cả hai — tiền không biết cộng vào ngân sách nào, hàng không biết giao đâu.
--   · Thứ gộp được thật là việc HỎI GIÁ: cùng một vật tư, cùng một nhà cung cấp, một lần gọi.
--     Vì vậy nhóm gộp sinh ra BÁO GIÁ NHÁP (`quotations`, «Chờ báo giá») trên từng đề nghị nguồn
--     cho nhà cung cấp được chọn, và một lần «Nhập giá chung» ghi đơn giá vào mọi báo giá đó.
--     Sau đó mỗi đề nghị đi tiếp đường cũ: bảng so giá → người chọn → đơn đặt hàng.
--
-- Kèm theo (dùng chung cho 4B): báo giá nhận được từ khi đề nghị còn Nháp / Chờ duyệt, để người
-- duyệt nhìn thấy bảng so giá ngay trong Hộp thư Phê duyệt. Đơn đặt hàng vẫn CHỈ lập được sau khi
-- đề nghị được duyệt (`create_purchase_order` không đổi) — hỏi giá không phải mua.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Bước nào của đề nghị thì nhận báo giá
--
-- Thêm Nháp, Bị từ chối, Chờ duyệt. Hoàn thành / Đã hủy vẫn đóng. Quyền vẫn là sửa phân hệ MH
-- + cùng pháp nhân, và policy báo giá vẫn đòi quyền xem giá vốn.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_quotation_writable(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_requests pr
    WHERE pr.id = p_request_id
      AND pr.deleted_at IS NULL
      AND pr.stage IN ('nhap', 'tu_choi', 'cho_duyet', 'da_duyet', 'dang_mua')
      AND public.rls_company_access(pr.company_id)
      AND public.auth_can_edit_module('MH')
  );
$$;

COMMENT ON FUNCTION public.rls_quotation_writable(uuid) IS
  'Đề nghị mua còn nhận báo giá (Nháp → Đang mua; 4A/4B, 0200). Đơn hàng vẫn chỉ lập sau khi duyệt.';


-- ----------------------------------------------------------------------------
-- 2. Khoá nhóm vật tư
--
-- Cùng pháp nhân (pháp nhân khác không mua chung được) + cùng MÃ vật tư + cùng đơn vị. Dòng không
-- có mã thì gộp theo tên + quy cách đã chuẩn hoá — tên trùng mà quy cách khác là hai thứ khác.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purchase_item_group_key(
  p_company_id uuid, p_item_code text, p_name text, p_specification text, p_unit text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_company_id::text || '|' ||
         CASE
           WHEN NULLIF(btrim(p_item_code), '') IS NOT NULL THEN 'ma:' || upper(btrim(p_item_code))
           ELSE 'ten:' || lower(regexp_replace(btrim(COALESCE(p_name, '')), '\s+', ' ', 'g'))
                || '|' || lower(regexp_replace(btrim(COALESCE(p_specification, '')), '\s+', ' ', 'g'))
         END
         || '|' || lower(btrim(COALESCE(p_unit, '')));
$$;


-- ----------------------------------------------------------------------------
-- 3. Danh sách gom — mỗi nhóm một dòng, kèm các nguồn
--
-- SECURITY INVOKER: RLS của `purchase_requests` quyết phạm vi — Mẫu A theo pháp nhân, Mẫu E cho
-- chỉ huy trưởng (0134). Hàm không tự kiểm quyền thêm nên không thể thấy nhiều hơn bảng gốc.
--
-- Đề nghị trong danh sách: Chờ duyệt và Đã duyệt mà chưa có đơn hàng đang hiệu lực — đúng phần
-- việc đang nằm ở Mua hàng (Chờ duyệt: hỏi giá song song trong lúc chờ người duyệt).
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.mh_purchase_pool();

CREATE FUNCTION public.mh_purchase_pool()
RETURNS TABLE (
  group_key       text,
  company_id      uuid,
  company_code    text,
  item_code       text,
  name            text,
  specification   text,
  unit            text,
  total_quantity  numeric,
  earliest_needed date,
  has_urgent      boolean,
  source_count    integer,
  request_count   integer,
  sources         jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH src AS (
    SELECT
      public.purchase_item_group_key(pr.company_id, pri.item_code, pri.name, pri.specification, pri.unit) AS gkey,
      pr.company_id, c.code::text AS company_code,
      pri.id AS item_id, pri.item_code, pri.name, pri.specification, pri.unit, pri.quantity,
      pr.id AS request_id, pr.code AS request_code, pr.title, pr.stage, pr.urgency, pr.needed_date,
      pr.delivery_location, s.id AS site_id, s.code AS site_code, s.name AS site_name,
      u.full_name AS requester_name
    FROM public.purchase_request_items pri
    JOIN public.purchase_requests pr ON pr.id = pri.purchase_request_id
    JOIN public.companies c ON c.id = pr.company_id
    LEFT JOIN public.construction_sites s ON s.id = pr.construction_site_id
    LEFT JOIN public.users u ON u.id = pr.requested_by
    WHERE pr.deleted_at IS NULL
      AND pr.stage IN ('cho_duyet', 'da_duyet')
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
         WHERE po.purchase_request_id = pr.id AND po.deleted_at IS NULL AND po.stage <> 'huy'
      )
  )
  SELECT
    s.gkey,
    s.company_id,
    min(s.company_code),
    -- Đại diện nhóm: dòng có ngày cần sớm nhất.
    (array_agg(s.item_code ORDER BY s.needed_date NULLS LAST, s.item_id))[1]::text,
    (array_agg(s.name ORDER BY s.needed_date NULLS LAST, s.item_id))[1],
    (array_agg(s.specification ORDER BY s.needed_date NULLS LAST, s.item_id))[1],
    (array_agg(s.unit ORDER BY s.needed_date NULLS LAST, s.item_id))[1]::text,
    sum(s.quantity),
    min(s.needed_date),
    bool_or(s.urgency = 'gap'),
    count(*)::integer,
    count(DISTINCT s.request_id)::integer,
    jsonb_agg(jsonb_build_object(
      'item_id', s.item_id,
      'request_id', s.request_id,
      'request_code', s.request_code,
      'request_title', s.title,
      'stage', s.stage,
      'urgency', s.urgency,
      'needed_date', s.needed_date,
      'quantity', s.quantity,
      'site_id', s.site_id,
      'site_code', s.site_code,
      'site_name', s.site_name,
      'delivery_location', s.delivery_location,
      'requester_name', s.requester_name
    ) ORDER BY s.needed_date NULLS LAST, s.request_code)
  FROM src s
  GROUP BY s.gkey, s.company_id
  ORDER BY min(s.needed_date) NULLS LAST, bool_or(s.urgency = 'gap') DESC, 5;
$$;

REVOKE ALL ON FUNCTION public.mh_purchase_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mh_purchase_pool() TO authenticated;

COMMENT ON FUNCTION public.mh_purchase_pool() IS
  '4A: đề nghị mua đang ở Mua hàng (Chờ duyệt / Đã duyệt, chưa có đơn hàng), gộp theo pháp nhân + mã vật tư + đơn vị, xếp theo ngày cần. Phạm vi theo RLS (Mẫu A, Mẫu E).';


-- ----------------------------------------------------------------------------
-- 4. Ghi một dòng báo giá — dùng chung cho «Nhập giá chung» (4A) và «Lưu báo giá» (4B)
--
-- Dòng báo giá luôn chép tên / quy cách / đơn vị / số lượng từ dòng đề nghị: báo giá so theo
-- ĐÚNG thứ công trường cần, không theo thứ người nhập gõ lại. Đơn giá rỗng hoặc 0 = nhà cung cấp
-- không báo mặt hàng này → xoá dòng (không để dòng 0 đồng làm tổng trông rẻ hơn).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mh_upsert_quotation_line(
  p_quotation_id uuid, p_request_item_id uuid, p_unit_price bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  it     record;
BEGIN
  SELECT * INTO it FROM public.purchase_request_items WHERE id = p_request_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy mặt hàng của đề nghị mua.';
  END IF;

  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN
    DELETE FROM public.quotation_items
     WHERE quotation_id = p_quotation_id AND purchase_request_item_id = p_request_item_id;
    RETURN;
  END IF;

  UPDATE public.quotation_items
     SET unit_price = p_unit_price,
         quantity = it.quantity,
         updated_at = now(), updated_by = v_user
   WHERE quotation_id = p_quotation_id AND purchase_request_item_id = p_request_item_id;

  IF NOT FOUND THEN
    INSERT INTO public.quotation_items (
      quotation_id, purchase_request_item_id, item_code, name, specification, unit,
      quantity, unit_price, created_by, updated_by
    )
    VALUES (
      p_quotation_id, it.id, it.item_code, it.name, it.specification, it.unit,
      it.quantity, p_unit_price, v_user, v_user
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._mh_upsert_quotation_line(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;

/** Trạng thái báo giá theo số dòng đã có giá: có ít nhất một dòng = «Đã nhận». */
CREATE OR REPLACE FUNCTION public._mh_refresh_quotation_status(p_quotation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.quotations q
     SET status = CASE
                    WHEN EXISTS (SELECT 1 FROM public.quotation_items qi WHERE qi.quotation_id = q.id)
                    THEN 'da_nhan'::public.quotation_status
                    ELSE 'cho_bao_gia'::public.quotation_status
                  END,
         quoted_date = CASE
                         WHEN q.quoted_date IS NULL
                          AND EXISTS (SELECT 1 FROM public.quotation_items qi WHERE qi.quotation_id = q.id)
                         THEN (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
                         ELSE q.quoted_date
                       END,
         updated_at = now(), updated_by = public.auth_user_id()
   WHERE q.id = p_quotation_id
     AND q.status IN ('cho_bao_gia', 'da_nhan');
END;
$$;

REVOKE ALL ON FUNCTION public._mh_refresh_quotation_status(uuid) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 5. «Hỏi giá chung» — một nhà cung cấp cho mọi đề nghị nguồn của nhóm
-- ----------------------------------------------------------------------------

/**
 * Kiểm chung cho hai thao tác nhóm: đã đăng nhập, xem được giá vốn, mọi dòng tồn tại, cùng một
 * pháp nhân, và mọi đề nghị nguồn còn nhận báo giá. Trả mảng id đề nghị (không trùng).
 */
CREATE OR REPLACE FUNCTION public._mh_group_requests(p_item_ids uuid[], p_supplier_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requests  uuid[];
  v_companies integer;
  v_found     integer;
  r           record;
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Báo giá nhà cung cấp chỉ mở cho Ban Giám đốc, Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng.';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Chưa chọn mặt hàng nào trong nhóm.';
  END IF;

  SELECT count(*), count(DISTINCT pr.company_id), array_agg(DISTINCT pr.id)
    INTO v_found, v_companies, v_requests
    FROM public.purchase_request_items pri
    JOIN public.purchase_requests pr ON pr.id = pri.purchase_request_id AND pr.deleted_at IS NULL
   WHERE pri.id = ANY (p_item_ids);

  IF v_found <> cardinality(ARRAY(SELECT DISTINCT unnest(p_item_ids))) THEN
    RAISE EXCEPTION 'Có mặt hàng không còn trong đề nghị mua. Tải lại danh sách rồi thử lại.';
  END IF;

  IF v_companies > 1 THEN
    RAISE EXCEPTION 'Nhóm gồm đề nghị của nhiều pháp nhân. Mỗi pháp nhân hỏi giá riêng.';
  END IF;

  FOR r IN
    SELECT pr.id, pr.code FROM public.purchase_requests pr WHERE pr.id = ANY (v_requests)
  LOOP
    IF NOT public.rls_quotation_writable(r.id) THEN
      RAISE EXCEPTION 'Đề nghị % không còn nhận báo giá (đã hoàn thành, đã hủy, hoặc ngoài phạm vi).', COALESCE(r.code, '');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.quotations q
       WHERE q.purchase_request_id = r.id AND q.deleted_at IS NULL AND q.status = 'duoc_chon'
    ) THEN
      RAISE EXCEPTION 'Đề nghị % đã chọn nhà cung cấp. Bỏ đề nghị đó khỏi nhóm.', COALESCE(r.code, '');
    END IF;
  END LOOP;

  IF p_supplier_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Không tìm thấy nhà cung cấp.';
    END IF;
    IF (SELECT s.supplier_class FROM public.suppliers s WHERE s.id = p_supplier_id) = 'ngung_giao_dich' THEN
      RAISE EXCEPTION 'Nhà cung cấp này đã ngừng giao dịch. Chọn nhà cung cấp khác.';
    END IF;
  END IF;

  RETURN v_requests;
END;
$$;

REVOKE ALL ON FUNCTION public._mh_group_requests(uuid[], uuid) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.request_group_quotation(p_item_ids uuid[], p_supplier_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v_requests uuid[];
  v_req      uuid;
  v_created  integer := 0;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn nhà cung cấp để hỏi giá.';
  END IF;

  v_requests := public._mh_group_requests(p_item_ids, p_supplier_id);

  FOREACH v_req IN ARRAY v_requests LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.quotations q
       WHERE q.purchase_request_id = v_req AND q.supplier_id = p_supplier_id AND q.deleted_at IS NULL
    ) THEN
      INSERT INTO public.quotations (
        company_id, purchase_request_id, supplier_id, status, created_by, updated_by
      )
      SELECT pr.company_id, pr.id, p_supplier_id, 'cho_bao_gia', v_user, v_user
        FROM public.purchase_requests pr WHERE pr.id = v_req;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.request_group_quotation(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_group_quotation(uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.request_group_quotation(uuid[], uuid) IS
  '4A «Hỏi giá chung»: tạo báo giá «Chờ báo giá» của một nhà cung cấp trên mọi đề nghị nguồn của nhóm. Trả số báo giá mới tạo.';


-- ----------------------------------------------------------------------------
-- 6. «Nhập giá chung» — một đơn giá cho mặt hàng này ở mọi đề nghị nguồn
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_group_quotation_price(
  p_item_ids uuid[],
  p_supplier_id uuid,
  p_unit_price bigint,
  p_delivery_days integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v_requests uuid[];
  it         record;
  v_quote    uuid;
  v_count    integer := 0;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn nhà cung cấp.';
  END IF;
  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN
    RAISE EXCEPTION 'Đơn giá phải lớn hơn 0 đồng.';
  END IF;
  IF p_delivery_days IS NOT NULL AND p_delivery_days < 0 THEN
    RAISE EXCEPTION 'Thời hạn giao không được âm.';
  END IF;

  v_requests := public._mh_group_requests(p_item_ids, p_supplier_id);

  FOR it IN
    SELECT pri.id, pri.purchase_request_id
      FROM public.purchase_request_items pri
     WHERE pri.id = ANY (p_item_ids)
  LOOP
    SELECT q.id INTO v_quote FROM public.quotations q
     WHERE q.purchase_request_id = it.purchase_request_id
       AND q.supplier_id = p_supplier_id AND q.deleted_at IS NULL;

    IF v_quote IS NULL THEN
      INSERT INTO public.quotations (
        company_id, purchase_request_id, supplier_id, status, created_by, updated_by
      )
      SELECT pr.company_id, pr.id, p_supplier_id, 'cho_bao_gia', v_user, v_user
        FROM public.purchase_requests pr WHERE pr.id = it.purchase_request_id
      RETURNING id INTO v_quote;
    END IF;

    PERFORM public._mh_upsert_quotation_line(v_quote, it.id, p_unit_price);

    IF p_delivery_days IS NOT NULL THEN
      UPDATE public.quotations SET delivery_days = p_delivery_days, updated_at = now(), updated_by = v_user
       WHERE id = v_quote;
    END IF;

    PERFORM public._mh_refresh_quotation_status(v_quote);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_quotation_price(uuid[], uuid, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_group_quotation_price(uuid[], uuid, bigint, integer) TO authenticated;

COMMENT ON FUNCTION public.set_group_quotation_price(uuid[], uuid, bigint, integer) IS
  '4A «Nhập giá chung»: ghi một đơn giá của một nhà cung cấp cho mặt hàng này ở mọi đề nghị nguồn. Không chọn nhà cung cấp — người chọn ở từng đề nghị.';


-- ----------------------------------------------------------------------------
-- 7. Không chọn được báo giá còn thiếu mặt hàng
--
-- Báo giá hỏi chung chỉ có giá cho mặt hàng của nhóm. Một đề nghị nhiều mặt hàng thì báo giá ấy
-- trông RẺ hơn (thiếu dòng = 0 đồng), và đơn hàng lập từ nó sẽ bỏ sót hàng công trường cần — vì
-- một đề nghị chỉ có một đơn hàng. Chặn ở trigger: `select_quotation` không phải sửa, mọi đường
-- chọn đều đi qua.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quotations_complete_before_select()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing integer;
BEGIN
  IF NEW.status = 'duoc_chon' AND OLD.status IS DISTINCT FROM 'duoc_chon' THEN
    SELECT count(*) INTO v_missing
      FROM public.purchase_request_items pri
     WHERE pri.purchase_request_id = NEW.purchase_request_id
       AND NOT EXISTS (
         SELECT 1 FROM public.quotation_items qi
          WHERE qi.quotation_id = NEW.id
            AND qi.unit_price > 0
            AND (
              qi.purchase_request_item_id = pri.id
              -- Dòng nhập tay không gắn dòng đề nghị (dữ liệu trước 0200): khớp theo mã / tên + đơn vị.
              OR (qi.purchase_request_item_id IS NULL
                  AND public.purchase_item_group_key(NEW.company_id, qi.item_code, qi.name, qi.specification, qi.unit)
                    = public.purchase_item_group_key(NEW.company_id, pri.item_code, pri.name, pri.specification, pri.unit))
            )
       );
    IF v_missing > 0 THEN
      RAISE EXCEPTION 'Báo giá này còn thiếu đơn giá % mặt hàng của đề nghị. Nhập đủ giá trước khi chọn nhà cung cấp.', v_missing;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_complete_before_select ON public.quotations;
CREATE TRIGGER quotations_complete_before_select
  BEFORE UPDATE OF status ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.quotations_complete_before_select();
