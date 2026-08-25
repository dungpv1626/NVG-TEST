/**
 * Bảng `users` — hồ sơ nghiệp vụ của người dùng.
 *
 * Backend Schema 3.2: `auth.users` do Supabase Auth quản lý (email, mật khẩu đã băm) —
 * KHÔNG tự tạo bảng đó. Bảng `users` ở đây MỞ RỘNG thông tin nghiệp vụ và có quan hệ 1-1
 * với `auth.users` qua `auth_user_id`.
 *
 * KHÔNG có `company_id`: một người có thể làm việc cho nhiều pháp nhân
 * (Backend Schema 2.2) — quan hệ nằm ở bảng `user_companies`.
 */

import { type AnyPgColumn, boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, softDelete, timestampColumns } from './_helpers';

export const users = pgTable('users', {
  id: primaryId(),

  /**
   * Liên kết 1-1 tới `auth.users.id` của Supabase Auth.
   * Cho phép rỗng: quản trị viên có thể tạo hồ sơ nhân sự trước khi cấp tài khoản đăng nhập
   * (Backend Schema 3.1 bước 1 — không có luồng tự đăng ký công khai).
   */
  authUserId: uuid('auth_user_id').unique(),

  email: varchar('email', { length: 255 }).notNull().unique(),
  fullName: varchar('full_name', { length: 128 }).notNull(),
  phone: varchar('phone', { length: 20 }),

  /** Chức danh — ví dụ "Trưởng phòng Dự án – Đấu thầu". */
  jobTitle: varchar('job_title', { length: 128 }),

  /** Phòng ban theo sơ đồ tổ chức (PRD Phụ lục C). */
  department: varchar('department', { length: 128 }),

  /**
   * `false` khi nghỉ việc/luân chuyển — NEN-10 yêu cầu thu hồi quyền truy cập
   * mà KHÔNG mất lịch sử, nên vô hiệu hóa thay vì xóa.
   */
  isActive: boolean('is_active').notNull().default(true),

  /** Thời điểm bàn giao khi nghỉ việc (NEN-10, NS-11). */
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),

  /** Người kế nhiệm nhận bàn giao hồ sơ/khách hàng/công việc đang xử lý (NEN-10). */
  successorUserId: uuid('successor_user_id').references((): AnyPgColumn => users.id, {
    onDelete: 'set null',
  }),

  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

  // Bộ theo dõi chuẩn khai báo trực tiếp thay vì dùng `auditColumns()`:
  // bảng này tự tham chiếu chính nó, nên không thể import `_audit.ts` (sẽ tạo vòng).
  ...timestampColumns(),
  createdBy: uuid('created_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  ...softDelete(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
