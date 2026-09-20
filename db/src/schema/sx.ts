/**
 * Module SX — Sản xuất và Cho thuê giàn giáo (Backend Schema Mục 4.12).
 * Giai đoạn 2. Phiếu khảo sát Xưởng sản xuất giàn giáo ĐÃ CÓ (02/09/2026), nằm ở
 * `doc/khao-sat/HoSo_KhaoSat_NVG_full.md` — module không còn ở mức ĐỊNH HƯỚNG.
 *
 * ⚠️ Số hiệu SX đã đánh lại ở PRD v1.4: SX-01 → SX-03 CŨ (dùng trong tệp này) KHÔNG trùng
 * SX-01 → SX-22 MỚI. Bốn bảng dưới đây phủ lõi phạm vi CŨ; phần còn thiếu ghi ở
 * `BUILD_PLAN.md` mục 6.4 (vòng đời tài sản cho thuê) và 6.6 (sản xuất, giá thành).
 *
 * Backend Schema 4.12 liệt kê 3 bảng; ở đây có 4. `rental_agreement_items` là bảng dòng của
 * `rental_agreements` — SX-03 đòi biết doanh thu/hiệu suất "theo NHÓM tài sản" (từng mã vật
 * tư), mà một hợp đồng thuê thường gồm nhiều loại giàn giáo cùng lúc, giống cách `deliveries`
 * (MH) và `stock_movements` (KHO) đều tách bảng dòng.
 *
 * ⚠️ SX-01 (`production_orders`) và SX-02 (giá thành) theo số CŨ mới có phần khung mà
 * BSD 4.12 liệt kê (lệnh + tiêu hao nguyên liệu), KHÔNG có định mức, năng suất tổ sản xuất
 * hay công thức giá thành thực tế. Nay chặn bởi DỮ LIỆU chứ không phải bởi khảo sát: phiếu
 * để trống tỷ lệ lỗi, bộ định mức hiện hành, sản lượng/tháng và phân loại bán – cho thuê
 * từng mã, và ghi thẳng "không nên ước lượng một con số để điền" (câu hỏi #28 của
 * `BUILD_PLAN.md`). Hỏi lại Haan trước khi mở rộng.
 *
 * SX-03 (`rental_agreements`) đã đủ thông tin (PRD SX-03 mô tả rõ) nên triển khai đầy đủ:
 * xuất/thu hồi giàn giáo đi qua hàm nghiệp vụ, di chuyển đúng lô giữa kho và bên thuê, liên
 * kết `scaffolding_assets` (KHO-06) qua cột `current_rental_agreement_id` — xem migration RLS
 * để biết vì sao cột đó không khai FK kiểu Drizzle ở `kho.ts` (tránh vòng phụ thuộc
 * `kho.ts ↔ sx.ts`, cùng cách `design_projects.construction_site_id` đã làm trước khi có TC).
 */

import { date, index, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns } from './_audit';
import { productionOrderStatusEnum, rentalAgreementStatusEnum } from './_enums';
import { money, primaryId, recordCode, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { customers } from './crm';
import { materials } from './kho';
import { constructionSites } from './tc';

/* ========================================================================== *
 * Lệnh sản xuất — SX-01 (cần xác nhận thêm)
 * ========================================================================== */

/**
 * Khung tối thiểu theo đúng Backend Schema 4.12: `company_id, product, quantity, status`.
 * KHÔNG có định mức tiêu hao chuẩn, kế hoạch sản xuất hay năng suất tổ — SX-01 nói rõ những
 * thứ đó "cần xác nhận thêm".
 */
export const productionOrders = pgTable(
  'production_orders',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode().notNull().unique(),

    /** Tên sản phẩm — mô tả tự do, chưa có danh mục thành phẩm chuẩn hoá (chờ khảo sát). */
    product: text('product').notNull(),
    unit: text('unit'),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),

    status: productionOrderStatusEnum('status').notNull().default('nhap'),

    plannedStartDate: date('planned_start_date'),
    plannedEndDate: date('planned_end_date'),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('production_orders_company_idx').on(t.companyId, t.status)],
);

/**
 * Tiêu hao nguyên liệu theo lệnh — bảng dòng, một lệnh thường dùng nhiều loại nguyên liệu.
 * CỐ Ý không tự trừ tồn kho: xuất nguyên liệu thật đi qua `issue_stock` (Module KHO) như mọi
 * lượt xuất khác, dòng ở đây chỉ ghi lại ĐÃ dùng bao nhiêu cho lệnh nào — nối hai bên bằng
 * `stock_movement_id` là việc của giao diện khi ghi nhận, không phải ràng buộc CSDL cứng vì
 * chưa rõ xưởng ghi nhận tiêu hao ngay lúc xuất hay tổng hợp sau (cần xác nhận thêm).
 */
export const materialConsumption = pgTable(
  'material_consumption',
  {
    id: primaryId(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),
    note: text('note'),

    ...auditColumns(),
  },
  (t) => [index('material_consumption_order_idx').on(t.productionOrderId)],
);

/* ========================================================================== *
 * Cho thuê giàn giáo — SX-03
 * ========================================================================== */

/**
 * Hợp đồng/đơn thuê giàn giáo. Xuất giáo cho khách đi qua `create_rental_agreement` (tạo hồ
 * sơ này VÀ chuyển đúng lô `scaffolding_assets` sang vị trí "khách đang thuê" trong cùng một
 * giao dịch) — không có màn hình "tạo hợp đồng rồi xuất kho sau" vì SX-03/CRM-11 mô tả đây là
 * một thao tác, chu kỳ giao dịch ngắn.
 */
export const rentalAgreements = pgTable(
  'rental_agreements',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode().notNull().unique(),

    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    /** Công trình NVG đang theo dõi, nếu khách thuê để dùng ngay tại đó (thường là NVC/NVO). */
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),
    /** Địa chỉ lắp đặt khi KHÔNG phải công trình NVG theo dõi — khách bên ngoài thuê riêng. */
    siteAddress: text('site_address'),

    startDate: date('start_date').notNull(),
    /** Ngày dự kiến trả — dùng để tính quá hạn (`rentalAgreementDisplayStatus`). */
    expectedEndDate: date('expected_end_date'),
    /** Ngày trả thực tế — chỉ có giá trị sau khi `return_rental_agreement` chạy. */
    actualReturnDate: date('actual_return_date'),

    status: rentalAgreementStatusEnum('status').notNull().default('dang_thue'),

    depositAmount: money('deposit_amount')
      .notNull()
      .default(sql`0`),
    /** Tổng tiền thuê — CSDL tính và ghi lúc thu hồi, không tính tay ở giao diện (SX-03). */
    totalRevenue: money('total_revenue'),
    /** Tổng bồi thường hao hụt/hư hỏng/mất — CSDL tính và ghi lúc thu hồi. */
    totalCompensation: money('total_compensation'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('rental_agreements_company_idx').on(t.companyId, t.status),
    index('rental_agreements_customer_idx').on(t.customerId),
  ],
);

/**
 * Từng loại giàn giáo trong một hợp đồng thuê — SX-03 "doanh thu … theo nhóm tài sản".
 * `quantity_returned_ok/damaged/lost` chỉ được `return_rental_agreement` ghi, tổng ba cột này
 * không được vượt `quantity_out` (ràng buộc CHECK ở migration RLS).
 */
export const rentalAgreementItems = pgTable(
  'rental_agreement_items',
  {
    id: primaryId(),
    rentalAgreementId: uuid('rental_agreement_id')
      .notNull()
      .references(() => rentalAgreements.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),

    quantityOut: numeric('quantity_out', { precision: 18, scale: 3 }).notNull(),
    /** Đơn giá thuê / ngày / đơn vị, đồng. */
    dailyRate: money('daily_rate')
      .notNull()
      .default(sql`0`),

    quantityReturnedOk: numeric('quantity_returned_ok', { precision: 18, scale: 3 })
      .notNull()
      .default('0'),
    quantityDamaged: numeric('quantity_damaged', { precision: 18, scale: 3 })
      .notNull()
      .default('0'),
    quantityLost: numeric('quantity_lost', { precision: 18, scale: 3 }).notNull().default('0'),
    /** Bồi thường của riêng dòng này — hư hỏng + mất, cộng lại thành `rental_agreements.total_compensation`. */
    compensationAmount: money('compensation_amount')
      .notNull()
      .default(sql`0`),

    note: text('note'),

    ...auditColumns(),
  },
  (t) => [index('rental_agreement_items_agreement_idx').on(t.rentalAgreementId)],
);

export type ProductionOrder = typeof productionOrders.$inferSelect;
export type MaterialConsumption = typeof materialConsumption.$inferSelect;
export type RentalAgreement = typeof rentalAgreements.$inferSelect;
export type RentalAgreementItem = typeof rentalAgreementItems.$inferSelect;
