/**
 * Module CRM — Khách hàng và Cơ hội kinh doanh (Backend Schema Mục 4.2).
 * Giai đoạn 1 — áp dụng ngay cho cả NVC, NVO, NVS.
 *
 * Ở bước này mới dựng `customers` để kiểm chứng bộ primitive giao diện;
 * `opportunities` và các bảng còn lại thuộc Phase 2A.
 */

import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import { primaryId, softDelete } from './_helpers';
import { users } from './users';

/**
 * Hồ sơ khách hàng tập trung (CRM-01).
 *
 * ⚠️ KHÔNG có `company_id`: đây là bảng DÙNG CHUNG thật sự giữa các pháp nhân
 * (Backend Schema 2.2) — một khách hàng có thể xuất hiện ở nhiều cơ hội của NVC, NVO và NVS.
 * Quan hệ với pháp nhân nằm ở bảng giao dịch `opportunities`.
 */
export const customers = pgTable(
  'customers',
  {
    id: primaryId(),

    /** Mã khách hàng hiển thị — xem quy tắc mã hoá ở `@nvg/shared/codes`. */
    code: varchar('code', { length: 40 }).notNull().unique(),

    name: text('name').notNull(),

    /**
     * Nguồn khách (CRM-01): giới thiệu, BNI, Facebook, website,
     * môi giới bất động sản công nghiệp, mời thầu…
     */
    source: varchar('source', { length: 64 }),

    contactPerson: varchar('contact_person', { length: 128 }),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),
    taxCode: varchar('tax_code', { length: 20 }),

    /** Loại công trình, quy mô, nhu cầu — mô tả tự do ở bước này. */
    needs: text('needs'),

    /**
     * Người phụ trách — thuật ngữ chuẩn là "người chịu trách nhiệm"
     * (Content Guidelines 4.4). Dùng cho mẫu RLS B và cột cố định trên màn hình Danh sách.
     */
    responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('customers_name_idx').on(t.name),
    index('customers_responsible_idx').on(t.responsibleUserId),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
