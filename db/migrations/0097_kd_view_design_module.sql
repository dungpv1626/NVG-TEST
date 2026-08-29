-- ============================================================================
-- Kinh doanh xem được Module Thiết kế — Haan xác nhận 29/08/2026 (câu hỏi Q-12).
--
-- Vì sao cần: `doc/design/03-data-contracts.md` mục 3.9 cho vai trò bán hàng ĐỌC đầu bài,
-- mặt bằng và ảnh phối cảnh — đó là thứ Kinh doanh mang đi chốt phương án với khách. Migration
-- `0095` đã cấp cho KD hai quyền chuỗi tương ứng (`design.project.all`,
-- `design.read.kien_truc`), nhưng phân quyền của Module Thiết kế AI cố ý dựng TIẾP trên
-- `rls_design_project_readable` sẵn có, mà hàm đó đòi `auth_can_view_module('TK')`. Không có
-- dòng này thì hai quyền chuỗi kia là quyền chết.
--
-- Vì sao tách khỏi `0095`: đây là thay đổi ma trận `permissions` của một module ĐANG CHẠY,
-- không phải hạ tầng của module mới. Tách ra để `git log` trả lời được "ai mở quyền này, khi
-- nào, vì sao" mà không phải đọc một migration 400 dòng về artifact.
--
-- ⚠️ PHẠM VI THẬT của dòng này rộng hơn phần artifact của engine: KD nhìn thấy TOÀN BỘ Module
-- TK đang chạy — dự án thiết kế, đầu bài (`design_briefs`), phiên bản bản vẽ từng bộ môn
-- (`design_versions`), tiến độ bộ môn, yêu cầu thay đổi. Đó là điều Haan đã cân nhắc và đồng ý.
--
-- KHÔNG mở thêm gì ngoài quyền XEM:
--   · `can_create/edit/delete/approve` để `false` — Kinh doanh không sửa hồ sơ thiết kế.
--   · Giá vốn KHÔNG lộ: dự toán NVO (TK-07) dùng chung bảng `estimates` của Module DA, và cột
--     giá vốn được `rls_sees_sensitive('cost')` che riêng. KD không nằm trong danh sách đó
--     (`0051`), nên vẫn nhận giá trị rỗng. Có phép thử khẳng định điều này.
-- ============================================================================

INSERT INTO public.permissions (role_id, module_code, can_view)
SELECT r.id, 'TK', true
FROM public.roles r
WHERE r.code = 'KD'
ON CONFLICT ON CONSTRAINT permissions_role_module_unique
DO UPDATE SET can_view = true, updated_at = now();
