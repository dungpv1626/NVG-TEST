-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện trigger
-- `estimates_freeze_identity` (0021_da_rls.sql) đóng băng `code, company_id,
-- bidding_project_id, version` sau khi tạo — nhưng KHÔNG có `design_project_id`, cột được
-- thêm SAU đó ở migration 0024 cho nhánh dự toán NVO (Thiết kế) và bị bỏ sót khi thêm.
--
-- Hậu quả: một dự toán đã tạo có thể bị PATCH đổi `design_project_id` sang một dự án thiết kế
-- KHÁC — kể cả dự án người dùng không có quyền — vì `estimates_update` (0025_tk_rls.sql) chỉ
-- kiểm `rls_estimate_parent_writable` trên GIÁ TRỊ CŨ ở mệnh đề USING, còn WITH CHECK chỉ kiểm
-- `rls_company_access(company_id)` trên giá trị MỚI, không kiểm lại quyền ghi trên dự án đích
-- mới. Đổi được `design_project_id` phá luôn "Hồ sơ 360°" (dự toán trỏ nhầm dự án) và ràng
-- buộc "một phiên bản đang hiệu lực trên một dự án" (NEN-05).
--
-- Vá tại gốc: thêm `design_project_id` vào danh sách cột bị đóng băng — cùng cách
-- `bidding_project_id` đã được bảo vệ từ 0021. Trigger BEFORE UPDATE chặn thẳng câu UPDATE
-- trước khi RLS WITH CHECK kịp chạy, nên không cần sửa thêm policy `estimates_update`.
-- ============================================================================

DROP TRIGGER IF EXISTS estimates_freeze_identity ON public.estimates;

CREATE TRIGGER estimates_freeze_identity
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'bidding_project_id', 'design_project_id', 'version'
  );
