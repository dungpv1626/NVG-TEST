-- ============================================================================
-- Đợt 4 — 4B. Bảng so giá nhà cung cấp.
--
-- Đã có từ 0037: báo giá theo đề nghị, công thức tổng chi phí (`quotation_landed_total`), bảng so
-- tổng (`compare_quotations`), chọn có căn cứ (`select_quotation` — chọn không rẻ nhất phải nêu lý do).
-- Thêm ở đây:
--   · Hai thông tin Mua hàng hỏi mà chưa có chỗ ghi: CÓ HOÁ ĐƠN VAT không (NULL = chưa hỏi, khác
--     «không») và TỆP BÁO GIÁ của nhà cung cấp (ảnh / PDF, có thể quét bằng `DocumentScanner`).
--   · `save_quotation`: nhập / sửa một báo giá trong MỘT giao dịch, đơn giá theo từng dòng đề nghị.
--     Thay hai lệnh ghi rời của trình duyệt (đầu báo giá rồi dòng hàng) — và là cách duy nhất sửa
--     được báo giá «Chờ báo giá» do «Hỏi giá chung» (4A) tạo ra, vì cột trạng thái chỉ đổi qua hàm.
--   · `quotation_board`: bảng đặt cạnh nhau — mỗi mặt hàng một dòng, mỗi nhà cung cấp một cột, kèm
--     GIÁ LẦN MUA TRƯỚC của cùng vật tư (đơn đặt hàng gần nhất cùng pháp nhân). Người duyệt đề nghị
--     xem đúng bảng này trong Hộp thư Phê duyệt.
--
-- Máy KHÔNG chọn nhà cung cấp và không xếp «nên chọn» — chỉ xếp hạng theo tổng chi phí như 0037.
-- ============================================================================

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS has_vat_invoice boolean,
  ADD COLUMN IF NOT EXISTS document_path text;

COMMENT ON COLUMN public.quotations.has_vat_invoice IS
  'Nhà cung cấp xuất hoá đơn VAT không (4B, 0201). NULL = chưa hỏi — khác «không».';
COMMENT ON COLUMN public.quotations.document_path IS
  'Tệp báo giá của nhà cung cấp trong kho `quotation-files`, `<đề nghị mua>/<tệp>` (4B, 0201).';


-- ----------------------------------------------------------------------------
-- 1. Kho tệp báo giá — nội dung thương thảo (NEN-07): chỉ vai trò xem giá vốn
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('quotation-files', 'quotation-files', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS quotation_files_select ON storage.objects;
CREATE POLICY quotation_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'quotation-files'
         AND public.rls_purchase_request_readable(public.try_uuid((storage.foldername(name))[1]))
         AND public.rls_sees_sensitive('cost'));

DROP POLICY IF EXISTS quotation_files_insert ON storage.objects;
CREATE POLICY quotation_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quotation-files'
              AND public.rls_quotation_writable(public.try_uuid((storage.foldername(name))[1]))
              AND public.rls_sees_sensitive('cost'));
-- Không có chính sách xoá / sửa: tệp báo giá là chứng từ, nhập sai thì tải tệp mới.


-- ----------------------------------------------------------------------------
-- 2. Nhập / sửa một báo giá
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_quotation(
  p_request_id  uuid,
  p_supplier_id uuid,
  p_header      jsonb,
  p_prices      jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  pr      record;
  q       record;
  v_quote uuid;
  v_key   text;
  v_val   jsonb;
  v_path  text := NULLIF(btrim(p_header ->> 'document_path'), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.purchase_requests WHERE id = p_request_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_quotation_writable(p_request_id) OR NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Không nhập được báo giá cho đề nghị mua này. Mua hàng nhập báo giá khi đề nghị chưa hoàn thành hoặc hủy.';
  END IF;

  IF p_supplier_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = p_supplier_id AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Chưa chọn nhà cung cấp.';
  END IF;
  IF (SELECT s.supplier_class FROM public.suppliers s WHERE s.id = p_supplier_id) = 'ngung_giao_dich' THEN
    RAISE EXCEPTION 'Nhà cung cấp này đã ngừng giao dịch. Chọn nhà cung cấp khác.';
  END IF;

  IF v_path IS NOT NULL AND split_part(v_path, '/', 1) <> p_request_id::text THEN
    RAISE EXCEPTION 'Tệp báo giá không thuộc đề nghị mua này. Tải tệp lên lại.';
  END IF;

  SELECT * INTO q FROM public.quotations
   WHERE purchase_request_id = p_request_id AND supplier_id = p_supplier_id AND deleted_at IS NULL;

  IF FOUND AND q.status IN ('duoc_chon', 'khong_chon') THEN
    RAISE EXCEPTION 'Đề nghị này đã chọn nhà cung cấp — báo giá không sửa được nữa.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.quotations x
     WHERE x.purchase_request_id = p_request_id AND x.deleted_at IS NULL AND x.status = 'duoc_chon'
  ) THEN
    RAISE EXCEPTION 'Đề nghị này đã chọn nhà cung cấp — không thêm báo giá được nữa.';
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.quotations (company_id, purchase_request_id, supplier_id, status, created_by, updated_by)
    VALUES (pr.company_id, p_request_id, p_supplier_id, 'cho_bao_gia', v_user, v_user)
    RETURNING id INTO v_quote;
  ELSE
    v_quote := q.id;
  END IF;

  UPDATE public.quotations SET
    quoted_date       = NULLIF(p_header ->> 'quoted_date', '')::date,
    valid_until       = NULLIF(p_header ->> 'valid_until', '')::date,
    tax_rate_bp       = COALESCE(NULLIF(p_header ->> 'tax_rate_bp', '')::integer, 0),
    wastage_rate_bp   = COALESCE(NULLIF(p_header ->> 'wastage_rate_bp', '')::integer, 0),
    shipping_fee      = COALESCE(NULLIF(p_header ->> 'shipping_fee', '')::bigint, 0),
    delivery_days     = NULLIF(p_header ->> 'delivery_days', '')::integer,
    payment_term_days = NULLIF(p_header ->> 'payment_term_days', '')::integer,
    warranty_months   = NULLIF(p_header ->> 'warranty_months', '')::integer,
    has_vat_invoice   = CASE WHEN p_header ? 'has_vat_invoice' AND jsonb_typeof(p_header -> 'has_vat_invoice') = 'boolean'
                             THEN (p_header ->> 'has_vat_invoice')::boolean END,
    notes             = NULLIF(btrim(p_header ->> 'notes'), ''),
    document_path     = COALESCE(v_path, document_path),
    updated_at = now(), updated_by = v_user
  WHERE id = v_quote;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(COALESCE(p_prices, '{}'::jsonb)) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.purchase_request_items pri
       WHERE pri.id = public.try_uuid(v_key) AND pri.purchase_request_id = p_request_id
    ) THEN
      RAISE EXCEPTION 'Có mặt hàng không thuộc đề nghị mua này. Tải lại trang rồi nhập lại.';
    END IF;
    PERFORM public._mh_upsert_quotation_line(
      v_quote, v_key::uuid,
      CASE WHEN jsonb_typeof(v_val) IN ('number', 'string') THEN NULLIF(v_val #>> '{}', '')::bigint END
    );
  END LOOP;

  PERFORM public._mh_refresh_quotation_status(v_quote);
  RETURN v_quote;
END;
$$;

REVOKE ALL ON FUNCTION public.save_quotation(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quotation(uuid, uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_quotation(uuid, uuid, jsonb, jsonb) IS
  '4B: nhập / sửa báo giá của một nhà cung cấp cho một đề nghị — đầu báo giá + đơn giá từng dòng đề nghị trong một giao dịch. Đơn giá rỗng = nhà cung cấp không báo mặt hàng đó.';


-- ----------------------------------------------------------------------------
-- 3. Bảng so giá đặt cạnh nhau + giá lần mua trước
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quotation_board(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
-- Không STABLE: ghi nhật ký truy cập giá vốn (cùng lý do như `compare_quotations`).
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr       record;
  v_quotes jsonb;
  v_lines  jsonb;
BEGIN
  SELECT * INTO pr FROM public.purchase_requests WHERE id = p_request_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_purchase_request_readable(p_request_id) THEN
    RAISE EXCEPTION 'Không xem được đề nghị mua này.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Bảng so giá chỉ mở cho Ban Giám đốc, Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'purchase_requests', p_request_id, 'view', pr.company_id);

  WITH costed AS (
    SELECT q.*, s.name AS supplier_name, s.supplier_class,
           public.quotation_goods_subtotal(q.id) AS goods
      FROM public.quotations q
      JOIN public.suppliers s ON s.id = q.supplier_id
     WHERE q.purchase_request_id = p_request_id AND q.deleted_at IS NULL
  ),
  totalled AS (
    SELECT c.*,
           floor(c.goods * c.wastage_rate_bp / 10000) AS wastage,
           floor((c.goods + floor(c.goods * c.wastage_rate_bp / 10000)) * c.tax_rate_bp / 10000) AS tax,
           (SELECT count(*) FROM public.purchase_request_items pri
             WHERE pri.purchase_request_id = p_request_id
               AND NOT EXISTS (
                 SELECT 1 FROM public.quotation_items qi
                  WHERE qi.quotation_id = c.id AND qi.unit_price > 0
                    AND (qi.purchase_request_item_id = pri.id
                         OR (qi.purchase_request_item_id IS NULL
                             AND public.purchase_item_group_key(c.company_id, qi.item_code, qi.name, qi.specification, qi.unit)
                               = public.purchase_item_group_key(c.company_id, pri.item_code, pri.name, pri.specification, pri.unit)))
               ))::integer AS missing_items
      FROM costed c
  ),
  landed AS (
    SELECT t.*, (t.goods + t.wastage + t.tax + t.shipping_fee)::bigint AS landed_total
      FROM totalled t
  ),
  -- Chỉ báo giá ĐỦ mặt hàng mới đem xếp hạng: thiếu dòng thì tổng nhỏ hơn mà không rẻ hơn.
  ranked AS (
    SELECT l.*,
           CASE WHEN l.status <> 'cho_bao_gia' AND l.missing_items = 0
                THEN rank() OVER (PARTITION BY (l.status <> 'cho_bao_gia' AND l.missing_items = 0)
                                  ORDER BY l.landed_total) END AS cost_rank,
           min(l.landed_total) FILTER (WHERE l.status <> 'cho_bao_gia' AND l.missing_items = 0) OVER () AS lowest
      FROM landed l
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'quotation_id', r.id,
           'supplier_id', r.supplier_id,
           'supplier_name', r.supplier_name,
           'supplier_class', r.supplier_class,
           'status', r.status,
           'quoted_date', r.quoted_date,
           'valid_until', r.valid_until,
           'goods_subtotal', r.goods::bigint,
           'wastage_amount', r.wastage::bigint,
           'tax_amount', r.tax::bigint,
           'tax_rate_bp', r.tax_rate_bp,
           'wastage_rate_bp', r.wastage_rate_bp,
           'shipping_fee', r.shipping_fee,
           'landed_total', r.landed_total,
           'cost_rank', r.cost_rank,
           'cost_gap_vs_lowest', CASE WHEN r.cost_rank IS NOT NULL THEN r.landed_total - r.lowest END,
           'missing_items', r.missing_items,
           'delivery_days', r.delivery_days,
           'payment_term_days', r.payment_term_days,
           'warranty_months', r.warranty_months,
           'has_vat_invoice', r.has_vat_invoice,
           'notes', r.notes,
           'document_path', r.document_path,
           'selection_reason', r.selection_reason
         ) ORDER BY r.cost_rank NULLS LAST, r.landed_total, r.supplier_name), '[]'::jsonb)
    INTO v_quotes
    FROM ranked r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'request_item_id', pri.id,
           'item_code', pri.item_code,
           'name', pri.name,
           'specification', pri.specification,
           'unit', pri.unit,
           'quantity', pri.quantity,
           'estimated_unit_price', pri.estimated_unit_price,
           'prices', (
             SELECT COALESCE(jsonb_object_agg(qi.quotation_id, qi.unit_price), '{}'::jsonb)
               FROM public.quotation_items qi
               JOIN public.quotations q ON q.id = qi.quotation_id AND q.deleted_at IS NULL
              WHERE q.purchase_request_id = p_request_id
                AND qi.unit_price > 0
                AND (qi.purchase_request_item_id = pri.id
                     OR (qi.purchase_request_item_id IS NULL
                         AND public.purchase_item_group_key(q.company_id, qi.item_code, qi.name, qi.specification, qi.unit)
                           = public.purchase_item_group_key(q.company_id, pri.item_code, pri.name, pri.specification, pri.unit)))
           ),
           'last_purchase', (
             SELECT jsonb_build_object(
                      'unit_price', poi.unit_price,
                      'order_date', po.order_date,
                      'order_code', po.code,
                      'supplier_name', s.name)
               FROM public.purchase_order_items poi
               JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                AND po.deleted_at IS NULL AND po.stage <> 'huy'
               JOIN public.suppliers s ON s.id = po.supplier_id
              WHERE po.company_id = pr.company_id
                AND po.purchase_request_id <> p_request_id
                AND public.purchase_item_group_key(po.company_id, poi.item_code, poi.name, poi.specification, poi.unit)
                  = public.purchase_item_group_key(pr.company_id, pri.item_code, pri.name, pri.specification, pri.unit)
              ORDER BY po.order_date DESC NULLS LAST, po.created_at DESC
              LIMIT 1
           )
         ) ORDER BY pri.position, pri.created_at), '[]'::jsonb)
    INTO v_lines
    FROM public.purchase_request_items pri
   WHERE pri.purchase_request_id = p_request_id;

  RETURN jsonb_build_object('quotations', v_quotes, 'lines', v_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.quotation_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quotation_board(uuid) TO authenticated;

COMMENT ON FUNCTION public.quotation_board(uuid) IS
  '4B: bảng so giá đặt cạnh nhau của một đề nghị — tổng chi phí, giao, vận chuyển, VAT, đơn giá từng mặt hàng, giá lần mua trước. Chỉ xếp hạng báo giá đủ mặt hàng; không đề xuất chọn ai.';


-- ----------------------------------------------------------------------------
-- 4. «Thấp nhất» chỉ tính trong các báo giá đủ mặt hàng
--
-- `select_quotation` (0037) lấy mức thấp nhất trên MỌI báo giá có dòng — một báo giá chỉ có giá
-- xi măng (hỏi giá chung, 4A) sẽ thành «thấp nhất» và bắt nêu lý do khi chọn báo giá đủ hàng.
-- Chép nguyên văn 0037, chỉ thêm điều kiện đủ mặt hàng ở câu tính mức thấp nhất.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.quotation_missing_items(p_quotation_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
    FROM public.quotations q
    JOIN public.purchase_request_items pri ON pri.purchase_request_id = q.purchase_request_id
   WHERE q.id = p_quotation_id
     AND NOT EXISTS (
       SELECT 1 FROM public.quotation_items qi
        WHERE qi.quotation_id = q.id AND qi.unit_price > 0
          AND (qi.purchase_request_item_id = pri.id
               OR (qi.purchase_request_item_id IS NULL
                   AND public.purchase_item_group_key(q.company_id, qi.item_code, qi.name, qi.specification, qi.unit)
                     = public.purchase_item_group_key(q.company_id, pri.item_code, pri.name, pri.specification, pri.unit)))
     );
$$;

REVOKE ALL ON FUNCTION public.quotation_missing_items(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.select_quotation(p_quotation_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  q        record;
  pr       record;
  v_this   bigint;
  v_lowest bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO q FROM public.quotations WHERE id = p_quotation_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy báo giá.';
  END IF;

  SELECT * INTO pr FROM public.purchase_requests WHERE id = q.purchase_request_id;

  IF NOT public.rls_quotation_writable(q.purchase_request_id)
     OR NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Không thao tác được trên báo giá của đề nghị mua này.';
  END IF;

  IF q.status = 'cho_bao_gia' THEN
    RAISE EXCEPTION 'Nhà cung cấp này chưa gửi báo giá. Nhập nội dung báo giá trước khi chọn.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.purchase_orders po
     WHERE po.purchase_request_id = q.purchase_request_id
       AND po.deleted_at IS NULL AND po.stage <> 'huy'
  ) THEN
    RAISE EXCEPTION 'Đề nghị này đã có đơn đặt hàng. Hủy đơn đặt hàng trước nếu cần chọn lại nhà cung cấp.';
  END IF;

  IF (SELECT s.supplier_class FROM public.suppliers s WHERE s.id = q.supplier_id) = 'ngung_giao_dich' THEN
    RAISE EXCEPTION 'Nhà cung cấp này đã ngừng giao dịch. Chọn nhà cung cấp khác, hoặc mở lại giao dịch ở danh mục nhà cung cấp.';
  END IF;

  IF (SELECT count(*) FROM public.quotation_items qi WHERE qi.quotation_id = p_quotation_id) = 0 THEN
    RAISE EXCEPTION 'Báo giá chưa có dòng hàng nào. Nhập đơn giá từng mặt hàng trước khi chọn.';
  END IF;

  v_this := public.quotation_landed_total(p_quotation_id);

  SELECT min(public.quotation_landed_total(q2.id)) INTO v_lowest
    FROM public.quotations q2
   WHERE q2.purchase_request_id = q.purchase_request_id
     AND q2.deleted_at IS NULL
     AND q2.status <> 'cho_bao_gia'
     AND EXISTS (SELECT 1 FROM public.quotation_items qi WHERE qi.quotation_id = q2.id)
     -- 0201: chỉ so với báo giá ĐỦ mặt hàng — báo giá thiếu dòng trông rẻ hơn mà không rẻ hơn.
     AND public.quotation_missing_items(q2.id) = 0;

  IF v_this > v_lowest AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION 'Báo giá này cao hơn báo giá thấp nhất % đồng. Nêu căn cứ chọn (tiến độ giao, bảo hành, điều kiện thanh toán) trước khi chọn.',
      to_char(v_this - v_lowest, 'FM999,999,999,999');
  END IF;

  UPDATE public.quotations
     SET status = 'khong_chon', selected_at = NULL,
         updated_at = now(), updated_by = v_user
   WHERE purchase_request_id = q.purchase_request_id
     AND id <> p_quotation_id
     AND deleted_at IS NULL
     AND status <> 'cho_bao_gia';

  UPDATE public.quotations
     SET status = 'duoc_chon',
         selection_reason = NULLIF(btrim(p_reason), ''),
         selected_at = now(),
         updated_at = now(), updated_by = v_user
   WHERE id = p_quotation_id;
END;
$$;

COMMENT ON FUNCTION public.select_quotation(uuid, text) IS
  'Chọn báo giá của một nhà cung cấp; bắt buộc nêu căn cứ nếu không phải báo giá thấp nhất (MH-04).';
