/**
 * Bộ cột theo dõi chuẩn (audit columns) — Backend Schema Mục 1.4.
 *
 * Tách khỏi `_helpers.ts` vì cần tham chiếu bảng `users`; đặt ở đây để chuỗi phụ thuộc
 * đi một chiều `_helpers → users → _audit → …` và TypeScript giữ được kiểu đầy đủ.
 *
 * Mọi bảng (trừ `users`, tự khai báo vì tự tham chiếu chính nó) dùng `...auditColumns()`.
 * Phục vụ NEN-03 (lịch sử xử lý đầy đủ: ai làm gì, khi nào) và NEN-07 (nhật ký truy cập).
 */

import { uuid } from 'drizzle-orm/pg-core';
import { timestampColumns } from './_helpers';
import { users } from './users';

export const auditColumns = () => ({
  ...timestampColumns(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
