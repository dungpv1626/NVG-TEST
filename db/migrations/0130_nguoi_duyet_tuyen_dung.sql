-- Người duyệt yêu cầu tuyển dụng: Hành chính – Nhân sự, không phải Tổng Giám đốc (NS-02).
--
-- Haan chốt 20/09/2026, thay giả định cũ. NS-02 chỉ ghi "trưởng đơn vị gửi yêu cầu → phê duyệt"
-- mà không nói ai duyệt; trước đó tạm đặt Tổng Giám đốc vì tăng biên chế là quyết định ngân
-- sách. Câu trả lời thật: trưởng đơn vị gửi, **Hành chính – Nhân sự duyệt**.
--
-- Đây là DỮ LIỆU cấu hình (5.2 — không hard-code hạn mức phê duyệt), nên sửa bằng một dòng
-- trong `approval_limits`, không đụng hàm nào. Sau này quản trị viên đổi lại trên màn hình
-- Hạn mức phê duyệt mà không cần triển khai lại.
--
-- ⚠️ Hệ quả kiểm soát, ghi ra để không ai phát hiện muộn: hệ thống không chặn người tự duyệt
-- hồ sơ của chính mình. Yêu cầu tuyển dụng do chính HCNS lập thì HCNS duyệt được. Muốn Tổng
-- Giám đốc giữ bước cuối thì thêm một dòng bước 2 — không phải sửa mã.

UPDATE public.approval_limits al
   SET role_id = (SELECT id FROM public.roles WHERE code = 'NS'),
       updated_at = now()
 WHERE al.subject = 'recruitment_position'
   AND al.step = 1
   AND al.role_id = (SELECT id FROM public.roles WHERE code = 'TGD');
