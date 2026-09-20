/**
 * Nhật ký thao tác và nhật ký truy cập dữ liệu nhạy cảm.
 *
 * PRD NEN-03: mỗi hồ sơ có "lịch sử xử lý đầy đủ (ai làm gì, khi nào)".
 * PRD NEN-07: ghi nhật ký truy cập với dữ liệu nhạy cảm — giá vốn, lợi nhuận, lương,
 * nội dung thương thảo, dữ liệu thuế/ngân hàng.
 *
 * ⚠️ Hai bảng này KHÔNG dùng xóa mềm: nhật ký mà xóa được thì không còn là nhật ký.
 * Chúng cũng KHÔNG cho phép ghi trực tiếp từ trình duyệt — chỉ ghi qua hàm
 * SECURITY DEFINER hoặc trigger, để người dùng không tự tạo/sửa dấu vết của mình.
 */

import { index, jsonb, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { primaryId, timestampColumns } from './_helpers';
import { optionalCompanyScoped } from './_scoped';
import { users } from './users';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),

    /** Rỗng khi thao tác do hệ thống thực hiện (cron, tác vụ nền). */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    ...optionalCompanyScoped(),

    /** `create` | `update` | `delete` | `approve` | `reject` | `publish` | `handover`… */
    action: varchar('action', { length: 32 }).notNull(),

    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id'),

    /** Giá trị trước và sau thay đổi — chỉ lưu các trường thực sự đổi, không lưu cả bản ghi. */
    before: jsonb('before'),
    after: jsonb('after'),

    /** Lý do thay đổi khi nghiệp vụ yêu cầu (ví dụ điều chỉnh sau khi khóa kỳ — KT-09). */
    reason: text('reason'),

    ...timestampColumns(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_user_idx').on(t.userId),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
);

/**
 * Nhật ký truy cập dữ liệu nhạy cảm — Backend Schema Mục 3.4.
 *
 * Ghi MỌI lượt xem/sửa dữ liệu thuộc Mẫu D (giá vốn, lợi nhuận, lương).
 * Không hiển thị cho người dùng thường; chỉ phục vụ tra soát.
 */
export const sensitiveAccessLogs = pgTable(
  'sensitive_access_logs',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    ...optionalCompanyScoped(),

    /** Loại dữ liệu nhạy cảm: `cost` | `profit` | `salary` — khớp `rls_sees_sensitive`. */
    sensitiveKind: varchar('sensitive_kind', { length: 16 }).notNull(),

    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id'),

    /** `view` | `export` | `update`. */
    action: varchar('action', { length: 16 }).notNull(),

    ...timestampColumns(),
  },
  (t) => [
    index('sensitive_access_user_idx').on(t.userId),
    index('sensitive_access_entity_idx').on(t.entityType, t.entityId),
    index('sensitive_access_created_idx').on(t.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type SensitiveAccessLog = typeof sensitiveAccessLogs.$inferSelect;
