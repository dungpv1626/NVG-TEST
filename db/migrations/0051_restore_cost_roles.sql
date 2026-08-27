-- ============================================================================
-- Trả lại đúng danh sách vai trò xem được GIÁ VỐN — sửa hồi quy do migration 0049
--
-- LỖI ĐÃ XẢY RA: migration 0049 thêm loại dữ liệu nhạy cảm `personal` bằng cách viết lại
-- `rls_sees_sensitive`, nhưng lấy nhầm bản của migration 0001 làm gốc thay vì bản đang chạy
-- ở migration 0021. Hậu quả: Thiết kế (TKE) và Cung ứng (MH) mất quyền xem giá vốn — Phòng
-- Mua hàng không nhập nổi báo giá nhà cung cấp (MH-04) và Thiết kế không mở được đơn giá
-- dự toán NVO (TK-07).
--
-- Phát hiện bằng bộ test của Module MH, không phải bằng mắt: hai màn hình vẫn mở bình thường,
-- chỉ đến lúc lưu mới bị RLS từ chối. Đây đúng loại lỗi mà CLAUDE.md 4.7 nói "không có triệu
-- chứng khi chạy thử bằng mắt".
--
-- Bản dưới đây là hợp của hai bản: danh sách `cost` của 0021 (đã mở cho TKE và MH) cộng loại
-- `personal` của 0049.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rls_sees_sensitive(kind text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE kind
    -- Giá vốn: Ban Giám đốc, Tài chính, Dự án – Đấu thầu (người lập giá),
    -- Thiết kế (dự toán NVO — TK-07) và Cung ứng (so sánh báo giá — MH-04, MH-05).
    WHEN 'cost'   THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'DA_DT', 'TKE', 'MH')
    WHEN 'profit' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN')
    -- Lương: Ban Giám đốc, Tài chính, Hành chính – Nhân sự.
    WHEN 'salary' THEN public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'NS', 'KT')
    -- Căn cước, sức khỏe, kỷ luật (PRD NS ranh giới): hẹp hơn lương — Kế toán không cần
    -- và không được. Xem migration 0049 mục 3.
    WHEN 'personal' THEN public.auth_has_role('TGD', 'BGD', 'ADMIN', 'NS')
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.rls_sees_sensitive(text) IS
  'Mẫu D (Backend Schema 3.3) — quyền xem cột nhạy cảm: cost | profit | salary | personal. Mọi lượt truy cập phải ghi sensitive_access_logs (PRD NEN-07).';
