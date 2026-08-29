/**
 * Tenant — đơn vị thuê bao phần mềm.
 *
 * Nguồn: `doc/design/02-architecture.md` mục 2.8, CLAUDE.md 8.2 nguyên tắc 7 và 8.5 T5.
 *
 * KHÁC `companies` (pháp nhân). Hai khái niệm dễ nhầm vì hiện chỉ có một dòng ở mỗi bảng
 * tương ứng:
 *
 *  - `companies` = pháp nhân giao dịch của Nhà Việt Group (NVC, NVS, NVO, + mã tổng hợp
 *    NVG). Ranh giới tách doanh thu/chi phí/lợi nhuận. Đã chạy trong 12 module.
 *  - `tenants`   = khách hàng thuê phần mềm. Module Thiết kế chuẩn bị bán lại cho công ty
 *    xây dựng khác, và thứ có giá trị khi bán chính là dữ liệu tenant-scoped: Knowledge
 *    Base, rule pack, style template, đơn giá.
 *
 * Vì sao thêm ngay khi mới có MỘT tenant: thêm `tenant_id` sau nghĩa là sửa mọi bảng, mọi
 * hợp đồng dữ liệu và mọi chính sách RLS của module cùng lúc — và bỏ sót một bảng là một lỗ
 * hổng rò rỉ dữ liệu giữa hai khách hàng.
 *
 * ⚠️ Bảng DÙNG CHUNG của phần mềm quản trị (`design_projects`, `customers`, `users`) hiện
 * KHÔNG có `tenant_id`. Đó là chủ ý: module mang `tenant_id` của riêng nó, khi phần mềm
 * quản trị chuyển sang đa tenant thì hai bên khớp nhau. Đừng chờ (02-architecture 2.8).
 */

import { boolean, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import { primaryId, softDelete } from './_helpers';

export const tenants = pgTable('tenants', {
  id: primaryId(),

  /** Mã ngắn, chữ thường, dùng trong cấu hình và đường dẫn. Ví dụ `nvg`. */
  code: varchar('code', { length: 32 }).notNull().unique(),

  name: text('name').notNull(),

  isActive: boolean('is_active').notNull().default(true),

  ...auditColumns(),
  ...softDelete(),
});

export type Tenant = typeof tenants.$inferSelect;
