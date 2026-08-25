/**
 * Cột đa pháp nhân — PRD NEN-01.
 *
 * Tách khỏi `_helpers.ts` vì cần tham chiếu bảng `companies`.
 *
 * CHỈ dùng cho bảng GIAO DỊCH (cơ hội, dự án, hợp đồng, phiếu kho, chứng từ…) —
 * đây là ranh giới tách doanh thu/chi phí/công nợ/lợi nhuận theo từng công ty.
 *
 * Bảng DÙNG CHUNG thật sự (`customers`, `suppliers`, `users`) KHÔNG có cột này:
 * chúng liên hệ với pháp nhân qua bảng giao dịch (Backend Schema 2.2) — ví dụ một
 * khách hàng có thể xuất hiện ở nhiều cơ hội của nhiều pháp nhân khác nhau.
 */

import { uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';

export const companyScoped = () => ({
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
});

/** Biến thể cho phép rỗng — dùng khi bản ghi có thể áp dụng cho MỌI pháp nhân. */
export const optionalCompanyScoped = () => ({
  companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
});
