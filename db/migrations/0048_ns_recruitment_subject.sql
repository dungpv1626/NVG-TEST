-- ============================================================================
-- Thêm loại nghiệp vụ phê duyệt "yêu cầu tuyển dụng" — PRD NS-02
--
-- NS-02 nguyên văn: "trưởng đơn vị gửi yêu cầu (vị trí, số lượng, thời điểm, yêu cầu chuyên
-- môn) → PHÊ DUYỆT → đăng tuyển". Bước phê duyệt đó đi qua Hộp thư Phê duyệt dùng chung như
-- mọi module khác (Webapp Flow 4.6), nên cần một giá trị `approval_subject` riêng.
--
-- Tách thành migration RIÊNG vì `ALTER TYPE ... ADD VALUE` và việc DÙNG giá trị mới đó không
-- nằm chung một giao dịch được — cùng lý do đã ghi ở migration 0040.
--
-- Giá trị mới nằm CUỐI danh sách: enum của Postgres chỉ thêm được vào cuối, chèn giữa sẽ làm
-- lệch thứ tự giữa các môi trường (xem chú thích ở `@nvg/shared/roles`).
-- ============================================================================

ALTER TYPE public.approval_subject ADD VALUE IF NOT EXISTS 'recruitment_position';
