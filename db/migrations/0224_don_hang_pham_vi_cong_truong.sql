-- 0224 — Đơn đặt hàng và phiếu giao nhận theo phạm vi công trường (Mẫu E).
--
-- Vì sao: đề nghị mua đã lọc theo công trình được phân công (`purchase_requests_select` dùng `rls_site_in_scope`), các
-- hàm danh sách 0202 / 0203 cũng vậy — nhưng chính sách đọc / sửa của `purchase_orders` (0037) chỉ theo pháp nhân. Chỉ
-- huy trưởng công trình A mở thẳng bảng đơn hàng là thấy đơn, giá trị, nhà cung cấp, phiếu giao nhận của công trình B
-- cùng pháp nhân; và `record_delivery` cho người có quyền sửa Thi công ghi giao nhận vào đơn của công trình bất kỳ.
--
-- Đơn hàng không có cột công trình — công trình là của đề nghị mua gốc. Quy tắc giữ đúng như đề nghị mua: đề nghị không
-- gắn công trình (hàng về kho, cho gói thầu) thì hiện theo pháp nhân như cũ; gắn công trình thì chỉ người trong phạm vi
-- công trình đó. Người không bị giới hạn theo công trường (Mua hàng, Kho, Ban Giám đốc…) không đổi gì.

CREATE OR REPLACE FUNCTION public.rls_purchase_order_site_in_scope(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.purchase_requests pr
     WHERE pr.id = p_request_id
       AND pr.construction_site_id IS NOT NULL
       AND NOT public.rls_site_in_scope(pr.construction_site_id)
  );
$$;

COMMENT ON FUNCTION public.rls_purchase_order_site_in_scope(uuid) IS
  'Đơn đặt hàng của đề nghị mua này nằm trong phạm vi công trường của người gọi (Mẫu E) — 0224.';

REVOKE ALL ON FUNCTION public.rls_purchase_order_site_in_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rls_purchase_order_site_in_scope(uuid) TO authenticated;

-- rls_purchase_order_readable — chép 0037, thêm phạm vi công trường. Phiếu giao nhận, dòng hàng của đơn đọc qua hàm này.
CREATE OR REPLACE FUNCTION public.rls_purchase_order_readable(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = p_order_id
      AND po.deleted_at IS NULL
      AND public.rls_company_access(po.company_id)
      AND public.auth_can_view_module('MH')
      AND public.rls_purchase_order_site_in_scope(po.purchase_request_id)
  );
$$;

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_select ON public.purchase_orders;
CREATE POLICY purchase_orders_select ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('MH')
    AND public.rls_purchase_order_site_in_scope(purchase_request_id)
  );

DROP POLICY IF EXISTS purchase_orders_update ON public.purchase_orders;
CREATE POLICY purchase_orders_update ON public.purchase_orders
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('MH')
    AND public.rls_purchase_order_site_in_scope(purchase_request_id)
  )
  WITH CHECK (public.rls_company_access(company_id));

-- Ghi giao nhận: `record_delivery` (SECURITY DEFINER, ~120 dòng) chỉ kiểm pháp nhân + quyền. Không chép lại hàm dài —
-- chặn ở trigger trên bảng để mọi đường ghi phiếu đều qua (bài học 0086). Không có người đăng nhập (máy chạy nền) thì
-- `rls_site_in_scope` coi như không giới hạn.
CREATE OR REPLACE FUNCTION public.deliveries_site_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request uuid;
BEGIN
  SELECT po.purchase_request_id INTO v_request
    FROM public.purchase_orders po WHERE po.id = NEW.purchase_order_id;
  IF NOT public.rls_purchase_order_site_in_scope(v_request) THEN
    RAISE EXCEPTION 'Không ghi được giao nhận cho đơn đặt hàng này: hàng về công trình chưa được phân công. Chỉ huy trưởng công trình đó, Mua hàng hoặc Kho ghi nhận.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliveries_site_scope_guard ON public.deliveries;
CREATE TRIGGER deliveries_site_scope_guard
  BEFORE INSERT ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.deliveries_site_scope_guard();
