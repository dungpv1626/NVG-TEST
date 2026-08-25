/**
 * Column helper NGUYÊN THỦY — không phụ thuộc bảng nào.
 *
 * Nguồn: Backend Schema Mục 1.4 ("Quy ước đặt tên và kiểu dữ liệu chuẩn — áp dụng
 * THỐNG NHẤT cho mọi bảng, không lặp lại trong từng bảng").
 *
 * Chuỗi phụ thuộc MỘT CHIỀU, không được tạo vòng (vòng làm TypeScript mất kiểu):
 *
 *     _helpers.ts  ←  users.ts  ←  _audit.ts  ←  companies.ts  ←  _scoped.ts  ←  mọi bảng khác
 *
 * Helper cần tham chiếu bảng (`auditColumns`, `companyScoped`) nằm ở `_audit.ts` / `_scoped.ts`.
 */

import { bigint, boolean, integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Khóa chính: `id` kiểu UUID sinh tự động.
 * KHÔNG dùng số nguyên tự tăng — tránh lộ số lượng bản ghi và thuận tiện khi
 * đồng bộ/di chuyển dữ liệu (Backend Schema 1.4).
 */
export const primaryId = () => uuid('id').primaryKey().defaultRandom();

/** Hai cột thời điểm của bộ theo dõi chuẩn — dùng lại bởi `_audit.ts`. */
export const timestampColumns = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Xóa mềm — bảng chứa dữ liệu nghiệp vụ quan trọng đánh dấu thay vì xóa hẳn,
 * để giữ lịch sử theo NEN-03. Bảng nhật ký KHÔNG dùng.
 *
 * ⚠️ Khi truy vấn phải luôn lọc `isNull(deletedAt)`. Dùng helper truy vấn đã lọc sẵn
 * thay vì tự nhớ ở từng màn hình.
 */
export const softDelete = () => ({
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * Quản lý phiên bản tài liệu — NEN-05.
 *
 * Tại mọi thời điểm chỉ MỘT bản có `isCurrentVersion = true` trong cùng một nhóm tài liệu.
 * Ràng buộc duy nhất phải khai báo ở từng bảng cụ thể bằng unique index có điều kiện
 * (`WHERE is_current_version`), vì "cùng một nhóm" khác nhau tùy bảng.
 */
export const versionColumns = () => ({
  version: integer('version').notNull().default(1),
  isCurrentVersion: boolean('is_current_version').notNull().default(true),
});

/**
 * Tiền tệ — Backend Schema 1.4 + Content Guidelines 4.3.
 *
 * `bigint`, đơn vị ĐỒNG, KHÔNG dùng số thập phân (VNĐ không có đơn vị nhỏ hơn đồng
 * trong thực tế). `mode: 'bigint'` để không mất chính xác: một hợp đồng vài trăm tỷ
 * tính bằng đồng đã vượt `Number.MAX_SAFE_INTEGER`.
 */
export const money = (name: string) => bigint(name, { mode: 'bigint' });

/** Mã hồ sơ hiển thị cho người dùng (ví dụ `NVC-DA-2026-0001`) — xem `@nvg/shared/codes`. */
export const recordCode = () => varchar('code', { length: 40 });
