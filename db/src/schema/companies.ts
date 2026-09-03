/**
 * Bảng `companies` — pháp nhân.
 *
 * PRD NEN-01: dữ liệu dùng chung nhưng tách riêng doanh thu, chi phí, công nợ và lợi nhuận
 * theo từng pháp nhân. Backend Schema 2.2: bảng này chứa 3 pháp nhân giao dịch
 * (NVC/NVS/NVO) + "NVG" là mã TỔNG HỢP toàn tập đoàn, chỉ dùng cho báo cáo,
 * KHÔNG phải pháp nhân giao dịch thật.
 */

import { boolean, integer, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import { primaryId, softDelete } from './_helpers';
import { tenants } from './tenants';

export const companies = pgTable('companies', {
  id: primaryId(),

  /**
   * Tenant sở hữu pháp nhân này — thêm ở migration 0095 (nền Module Thiết kế).
   *
   * Đây là NGUỒN DUY NHẤT xác định phạm vi tenant của một người: `auth_tenant_ids()` suy từ
   * các pháp nhân họ được gán, không có bảng nối người dùng ↔ tenant (CLAUDE.md 8.8 mục 4).
   *
   * Cột đã NOT NULL trong CSDL từ 0095 nhưng khai thiếu ở đây, nên `db:seed` hỏng lặng lẽ:
   * `onConflictDoUpdate` vẫn phải dựng được dòng hợp lệ trước khi phát hiện trùng khoá, nên
   * thiếu `tenant_id` là gãy ngay ở pháp nhân đầu tiên dù cả 4 dòng đều đã tồn tại.
   */
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),

  /** Mã pháp nhân: NVC / NVS / NVO / NVG. */
  code: varchar('code', { length: 8 }).notNull().unique(),

  /** Tên đầy đủ theo giấy phép kinh doanh — hiển thị trên hợp đồng, báo giá, PDF. */
  legalName: text('legal_name').notNull(),

  /** Tên ngắn hiển thị trên giao diện (bộ chọn pháp nhân, sidebar). */
  shortName: varchar('short_name', { length: 64 }).notNull(),

  taxCode: varchar('tax_code', { length: 20 }),
  address: text('address'),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),

  /** Người đại diện pháp luật — in trên hợp đồng. */
  legalRepresentative: varchar('legal_representative', { length: 128 }),

  /**
   * `false` với NVG — mã tổng hợp không phát sinh giao dịch.
   * Dùng để chặn tạo hồ sơ giao dịch gắn `company_id` của NVG.
   */
  isTransactional: boolean('is_transactional').notNull().default(true),

  /** Thứ tự hiển thị trong bộ chọn pháp nhân (Webapp Flow 2.2). */
  displayOrder: integer('display_order').notNull().default(0),

  ...auditColumns(),
  ...softDelete(),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
