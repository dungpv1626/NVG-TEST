/**
 * Gói B (30/10/2026, anh Dũng) — vai trò riêng «Kinh doanh NVS» (`KD_NVS`).
 *
 * Migration này CHỈ thêm giá trị enum, giống 0167 (KSNB): `ALTER TYPE ... ADD VALUE` và việc DÙNG
 * giá trị mới không nằm chung một giao dịch được, mà drizzle chạy mọi migration đang chờ trong MỘT
 * giao dịch. Nên 0255 (phần dùng) chỉ so mã vai trò dạng `text`. Dòng `roles` + ma trận
 * `permissions` của KD_NVS do `npm run db:seed` tạo (`ROLE_SEED`) — chạy seed SAU migrate.
 *
 * Vì sao tách khỏi `KD`: ma trận `permissions` là (vai trò × phân hệ), không có chiều pháp nhân.
 * Kinh doanh NVS cần XEM phân hệ SX (tồn giàn giáo, đơn thuê, báo giá thuê) để kiểm tồn khi báo
 * giá; mở SX cho `KD` thì Kinh doanh NVC / NVO cũng thấy.
 */

ALTER TYPE public.role_code ADD VALUE IF NOT EXISTS 'KD_NVS';
