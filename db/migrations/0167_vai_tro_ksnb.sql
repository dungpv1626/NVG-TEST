/**
 * Vai trò «Kiểm soát nội bộ» (`KSNB`) — Giai đoạn 2 của đợt cải tiến (doc/MOC_CAI_TIEN_UX.md,
 * vấn đề 1: lãnh đạo / kiểm soát không thấy vấn đề ngay). Chủ dự án chọn: trang «Tổng quan
 * điều hành» riêng + một vai trò kiểm soát CHỈ XEM.
 *
 * Migration này CHỈ thêm giá trị enum. `ALTER TYPE ... ADD VALUE` và việc DÙNG giá trị mới
 * không nằm chung một giao dịch được — và drizzle chạy mọi migration đang chờ trong MỘT giao
 * dịch (xem 0115). Nên 0168 không viết chữ 'KSNB' dưới kiểu `role_code`: so khớp theo `text`.
 * Dòng `roles` và ma trận `permissions` của KSNB do `npm run db:seed` tạo (`ROLE_SEED`), chạy
 * ở tiến trình khác SAU khi migration đã commit — cùng cách vai trò `SX`, `CHT`.
 */

ALTER TYPE public.role_code ADD VALUE IF NOT EXISTS 'KSNB';
