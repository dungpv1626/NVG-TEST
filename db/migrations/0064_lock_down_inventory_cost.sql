-- ============================================================================
-- Khoá giá vốn tồn kho — cùng chuẩn với giá vốn dự toán (BUILD_PLAN 4B, xác nhận với Haan).
--
-- Phát hiện khi rà 4B đợt 2: `inventory_items.average_cost` và `stock_movement_items.unit_cost`
-- KHÔNG bị khoá cột như `estimates`/`unit_prices`/`quotations` (đều dùng `rls_sees_sensitive`
-- theo cách này hay cách khác) — bất kỳ ai xem được phân hệ Kho/Mua hàng cũng đọc được giá
-- vốn bình quân, kể cả vai trò không nằm trong danh sách được xem giá vốn (CLAUDE.md 6.6:
-- TGĐ/CFO/BGĐ/Admin + DA_DT/TKE/MH). Haan xác nhận 28/08/2026: khoá giống giá vốn dự toán.
--
-- Hai bảng, hai cách xử lý khác nhau vì cách dùng ở Frontend khác nhau:
--
--  1. `inventory_items.average_cost` — CÓ hiển thị: trang "Tồn kho" cộng dồn thành "Giá trị
--     ước tính" ở đầu danh sách (`inventory-list.tsx`). Đây là bảng NHIỀU DÒNG (một dòng mỗi
--     mặt hàng/kho), không phải một hồ sơ chi tiết như `estimates` — nên không dùng khuôn
--     "hàm trả một dòng" của `estimate_cost_breakdown`, mà dùng khuôn "hàm trả cả danh sách,
--     ghi MỘT lượt log cho cả đợt xem" của `purchase_price_history` (0037_mh_rls.sql).
--
--  2. `stock_movement_items.unit_cost` — KHÔNG hề hiển thị: cột này được SELECT trong
--     `use-warehouse.ts` (`MOVEMENT_SELECT`) nhưng lịch sử phiếu kho (`movement-page.tsx`)
--     không render nó ở bất kỳ đâu — dữ liệu tải về rồi bỏ không. Khoá cột và bỏ luôn khỏi câu
--     truy vấn Frontend là đủ; không cần thêm hàm/log vì chưa ai xem được nó để mà ghi.
--     (Ghi giá lúc nhập kho vẫn qua `record_stock_movement`, SECURITY DEFINER — không đụng.)
-- ============================================================================

REVOKE SELECT ON public.inventory_items FROM authenticated;

GRANT
  SELECT (
    id, company_id, warehouse_id, material_id, quantity_on_hand, min_quantity,
    last_movement_at, location, created_at, updated_at, created_by, updated_by
  )
ON public.inventory_items TO authenticated;

-- average_cost: CỐ Ý không cấp quyền — chỉ đọc qua hàm `inventory_items_cost` ở dưới.

REVOKE SELECT ON public.stock_movement_items FROM authenticated;

GRANT
  SELECT (
    id, stock_movement_id, material_id, quantity, condition_note,
    created_at, updated_at, created_by, updated_by
  )
ON public.stock_movement_items TO authenticated;

-- unit_cost: CỐ Ý không cấp quyền — chưa có màn hình nào hiển thị, không cần cửa đọc riêng.


-- ----------------------------------------------------------------------------
-- Cửa duy nhất vào giá vốn tồn kho — ghi nhật ký (NEN-07), trả CẢ DANH SÁCH cho một lượt xem
-- trang "Tồn kho" thay vì một dòng log mỗi mặt hàng (cùng khuôn `purchase_price_history`).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.inventory_items_cost(
  p_warehouse_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (inventory_item_id uuid, average_cost bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_id() IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.rls_sees_sensitive('cost') THEN
    RAISE EXCEPTION 'Giá vốn tồn kho chỉ mở cho Ban Giám đốc, Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng.';
  END IF;

  PERFORM public.log_sensitive_access('cost', 'inventory_items', NULL, 'view', p_company_id);

  RETURN QUERY
  SELECT i.id, i.average_cost
  FROM public.inventory_items i
  WHERE public.rls_company_access(i.company_id)
    AND (public.auth_can_view_module('KHO') OR public.auth_can_view_module('MH'))
    AND (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id);
END;
$$;

COMMENT ON FUNCTION public.inventory_items_cost(uuid, uuid) IS
  'Giá vốn bình quân tồn kho theo từng dòng — Mẫu D, ghi một lượt nhật ký cho cả đợt xem (BUILD_PLAN 4B).';

REVOKE ALL ON FUNCTION public.inventory_items_cost(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.inventory_items_cost(uuid, uuid) TO authenticated;
