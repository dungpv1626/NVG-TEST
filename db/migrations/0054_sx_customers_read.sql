-- ============================================================================
-- SX-03 cần đọc được danh mục khách hàng để chọn "khách thuê" khi lập hợp đồng
-- thuê giàn giáo — nhưng `customers_select` (migration 0007) chỉ mở cho
-- `auth_can_view_module('CRM')`. Vai trò Kho (module edit của SX, xem
-- 0053_sx_rls.sql) không có quyền CRM nên không chọn được khách hàng nào,
-- phát hiện khi thử lập hợp đồng thuê thật qua giao diện.
--
-- Cùng cách `scaffolding_assets_select` (0039) đã mở thêm cho CRM/SX bên cạnh
-- KHO — một bảng dùng chung, nhiều module cần đọc thì liệt kê đủ, không đổi
-- toàn bộ chính sách.
-- ============================================================================

DROP POLICY customers_select ON public.customers;

CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (public.auth_can_view_module('CRM') OR public.auth_can_view_module('SX'))
  );
