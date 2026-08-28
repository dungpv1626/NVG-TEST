-- ============================================================================
-- Rà tuần tự business logic (phần "Chưa làm" còn lại của 4B) lộ ra: `cancel_purchase_order`
-- chỉ chặn huỷ khi `stage = 'huy'` (đã huỷ rồi), KHÔNG chặn huỷ đơn đang giao (`dang_giao`)
-- hoặc đã giao đủ (`da_giao_du`) — cả hai đều đạt tới qua `record_delivery`
-- (0068_fix_cfo_notifications_and_budget_cost_leak.sql).
--
-- Kịch bản: đơn đạt `da_giao_du` (hàng đã về đủ) — `record_delivery` đã rút hết
-- `committed_to_budget` về 0 và cộng vào `actual_amount`, đồng thời đổi
-- `purchase_requests.stage` thành `hoan_thanh`. Gọi `cancel_purchase_order` trên đơn này:
--   - Bước hoàn "đã cam kết" không làm gì (đã về 0 sẵn) — số tiền ĐÃ CHI (`actual_amount`)
--     không bao giờ được hoàn tác.
--   - `purchase_orders.stage` vẫn chuyển thành `huy` dù hàng đã nhận thật và có
--     `deliveries`/`delivery_items` — đơn "đã huỷ" nhưng có phiếu nhận hàng đính kèm.
--   - Câu UPDATE cuối `WHERE stage = 'dang_mua'` no-op vì đề nghị đã ở `hoan_thanh` — để lại
--     cặp mâu thuẫn: đề nghị mua báo `hoan_thanh`, đơn duy nhất của nó báo `huy`.
--   - Không gì chặn `create_purchase_order` tạo đơn THỨ HAI cho cùng đề nghị (điều kiện của
--     hàm đó chỉ loại đơn có `stage <> 'huy'`) — ra một đơn mới cho hàng đã nhận một lần rồi.
-- Trường hợp `dang_giao` (giao một phần) còn tệ hơn: một phần `delivered_quantity`/ngân sách
-- đã ghi nhận thật, huỷ đưa đề nghị về `da_duyet` như chưa nhận gì, mở đường chọn nhà cung
-- cấp mới và giao lại từ đầu cho các dòng ĐÃ NHẬN một phần, không có cơ chế đối chiếu.
--
-- Vá: chặn huỷ khi đơn đã bắt đầu nhận hàng (`dang_giao`/`da_giao_du`) — đúng khuôn
-- `cancel_purchase_request` đã chặn huỷ đề nghị khi đã có đơn còn sống.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  po       record;
  v_budget uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO po FROM public.purchase_orders
   WHERE id = p_order_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_company_access(po.company_id)
     OR NOT public.auth_can_edit_module('MH') THEN
    RAISE EXCEPTION 'Không thao tác được trên đơn đặt hàng này.';
  END IF;

  IF po.stage = 'huy' THEN
    RAISE EXCEPTION 'Đơn đặt hàng này đã hủy.';
  END IF;

  -- Đã bắt đầu nhận hàng thì không huỷ được nữa (0077) — huỷ sau khi đã giao một phần/toàn bộ
  -- để lại tiền đã chi không hoàn tác được và đơn "huỷ" nhưng có phiếu nhận hàng đính kèm.
  IF po.stage IN ('dang_giao', 'da_giao_du') THEN
    RAISE EXCEPTION 'Đơn đặt hàng này đã nhận hàng, không hủy được nữa.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do hủy đơn đặt hàng.';
  END IF;

  -- Hoàn lại đúng phần còn treo ở "đã cam kết". Phần hàng đã nhận vẫn nằm ở "đã phát sinh"
  -- và KHÔNG được rút ra: hàng đã về kho rồi, tiền đó đã tiêu thật.
  v_budget := public.purchase_request_budget_line(po.purchase_request_id);
  IF v_budget IS NOT NULL AND po.committed_to_budget > 0 THEN
    UPDATE public.project_budgets
       SET committed_amount = greatest(committed_amount - po.committed_to_budget, 0),
           updated_at = now(), updated_by = v_user
     WHERE id = v_budget;
  END IF;

  UPDATE public.purchase_orders
     SET stage = 'huy', committed_to_budget = 0, closed_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_order_id;

  -- Đề nghị mua quay lại bước đã duyệt để chọn nhà cung cấp khác, không phải làm lại từ đầu.
  UPDATE public.purchase_requests
     SET stage = 'da_duyet', updated_at = now(), updated_by = v_user
   WHERE id = po.purchase_request_id AND stage = 'dang_mua';
END;
$$;

COMMENT ON FUNCTION public.cancel_purchase_order(uuid, text) IS
  'Huỷ đơn đặt hàng và hoàn phần đã cam kết về ngân sách — chặn huỷ khi đã hủy hoặc đã bắt đầu nhận hàng (0077).';
