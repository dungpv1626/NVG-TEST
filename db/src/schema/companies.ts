/**
 * Bảng `companies` — pháp nhân.
 *
 * PRD NEN-01: dữ liệu dùng chung nhưng tách riêng doanh thu, chi phí, công nợ và lợi nhuận
 * theo từng pháp nhân. Backend Schema 2.2: bảng này chứa 3 pháp nhân giao dịch
 * (NVC/NVS/NVO) + "NVG" là mã TỔNG HỢP toàn tập đoàn, chỉ dùng cho báo cáo,
 * KHÔNG phải pháp nhân giao dịch thật.
 */

import { boolean, integer, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import { primaryId, softDelete } from './_helpers';

export const companies = pgTable('companies', {
  id: primaryId(),

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
