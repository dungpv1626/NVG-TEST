/**
 * Module MH — Mua hàng và Vật tư (Backend Schema Mục 4.7).
 * Giai đoạn 2 — áp dụng cho cả vật tư NVC/NVO và nguyên liệu sản xuất NVS.
 *
 * Backend Schema 4.7 liệt kê 5 bảng; ở đây có 9. Bốn bảng thêm đều là bảng DÒNG của một
 * bảng đã có tên trong tài liệu, không phải khái niệm mới:
 *
 *   purchase_request_items  ← MH-01 yêu cầu "tên hàng, quy cách, SỐ LƯỢNG" cho từng mặt hàng
 *   quotation_items         ← MH-05 yêu cầu lịch sử giá theo MÃ VẬT TƯ, không phải theo đơn
 *   purchase_order_items    ← MH-06 theo dõi tiến độ giao "theo cam kết", tức theo từng dòng
 *   delivery_items          ← MH-07 kiểm đếm số lượng và chất lượng theo từng mặt hàng
 *
 * Gộp chúng vào bảng cha thì một đề nghị mua chỉ mua được đúng một mặt hàng — trong khi
 * phiếu đề nghị vật tư thật của một công trình luôn là một danh sách.
 *
 * ⚠️ CỐ Ý CHƯA làm ở bước này, không phải quên:
 *   - MH-09 bảng giá khung/thỏa thuận nguyên tắc — cần biết NVG thỏa thuận theo tháng hay
 *     quý và cơ chế điều chỉnh giá, hiện chưa có dữ liệu.
 *   - MH-10 quy cách kỹ thuật nguyên liệu NVS (mác thép, dung sai) — bảng `material_specs`
 *     thuộc đợt 6.2 của `BUILD_PLAN.md`, chưa dựng.
 *
 * MH-07 "tự cập nhật tồn kho" nay đã nối: `deliveries` chỉ ghi nhận giao nhận, việc cộng vào
 * tồn đi qua `receive_from_delivery` của Module KHO (migration `0039`), một phiếu giao nhận
 * chỉ nhập kho một lần.
 */

import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns } from './_audit';
import {
  costGroupEnum,
  deliveryIssueTypeEnum,
  purchaseOrderStageEnum,
  purchaseRequestStageEnum,
  purchaseUrgencyEnum,
  quotationStatusEnum,
  supplierClassEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { biddingProjects } from './da';
import { constructionSites } from './tc';
import { users } from './users';

/* ========================================================================== *
 * Nhà cung cấp — MH-03
 * ========================================================================== */

/**
 * Danh mục nhà cung cấp.
 *
 * ⚠️ KHÔNG có `company_id`, giống `customers`. Backend Schema 4.7 ghi RLS "A" cho bảng này
 * nhưng cột Mô tả của chính dòng đó ghi "danh mục nhà cung cấp DÙNG CHUNG", và Backend
 * Schema 2.2 xếp `suppliers` vào đúng danh sách ba bảng dùng chung cùng `customers` và
 * `users`. Mẫu A cần `company_id` để so, nên hai vế không thể cùng đúng.
 *
 * Chọn theo "dùng chung" vì đó là điều đúng về nghiệp vụ: ba pháp nhân cùng mua thép, cùng
 * mua tôn. Tách danh mục theo pháp nhân thì cùng một nhà cung cấp được nhập ba lần với ba
 * mã khác nhau, và MH-05 mất luôn lịch sử giá — đúng vướng mắc #3 trong khảo sát.
 * Đã ghi vào mục "cần cập nhật tài liệu".
 */
export const suppliers = pgTable(
  'suppliers',
  {
    id: primaryId(),

    /** Mã nhà cung cấp do Mua hàng đặt. Bộ mã thống nhất còn chờ NVG chốt (PRD Mục 10). */
    code: varchar('code', { length: 40 }).notNull().unique(),

    name: text('name').notNull(),

    /** Nhóm hàng cung cấp: thép, bê tông, cốp pha, thiết bị điện… Tự do cho tới khi có bộ mã. */
    category: varchar('category', { length: 128 }),

    supplierClass: supplierClassEnum('supplier_class').notNull().default('du_phong'),

    taxCode: varchar('tax_code', { length: 20 }),
    contactPerson: varchar('contact_person', { length: 128 }),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    address: text('address'),

    /** Điều kiện thanh toán thường lệ — dùng làm giá trị gợi ý khi nhập báo giá. */
    defaultPaymentTermDays: integer('default_payment_term_days'),

    /**
     * Tám tiêu chí đánh giá của PRD MH-03, mỗi tiêu chí 1–5 do NGƯỜI chấm.
     *
     * Tám cột riêng thay vì một cột JSON: mỗi tiêu chí đều là thứ cần lọc và sắp xếp được
     * ("nhà cung cấp nào giao đúng hạn nhất"), và cột riêng thì ràng buộc 1–5 kiểm được ở
     * CSDL. CỐ Ý không có cột điểm tổng — xem lý do ở `@nvg/shared/mh`.
     */
    ratingSpecConformity: integer('rating_spec_conformity'),
    ratingQualityStability: integer('rating_quality_stability'),
    ratingPrice: integer('rating_price'),
    ratingDelivery: integer('rating_delivery'),
    ratingPaymentTerms: integer('rating_payment_terms'),
    ratingDocuments: integer('rating_documents'),
    ratingWarranty: integer('rating_warranty'),
    ratingReputation: integer('rating_reputation'),

    /** Ghi chú đánh giá — căn cứ cho các con số trên, để lần sau đọc lại còn hiểu vì sao. */
    ratingNotes: text('rating_notes'),
    ratedAt: timestamp('rated_at', { withTimezone: true }),

    /** Lý do ngừng giao dịch — bắt buộc khi chuyển sang `ngung_giao_dich` (kiểm ở trigger). */
    suspendedReason: text('suspended_reason'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('suppliers_class_idx').on(t.supplierClass, t.name),
    index('suppliers_category_idx').on(t.category),
  ],
);

/* ========================================================================== *
 * Đề nghị mua — MH-01, MH-02
 * ========================================================================== */

/**
 * Đề nghị mua (MH-01).
 *
 * Hai nguồn phát sinh ở giai đoạn này: từ một CÔNG TRÌNH (TC-03 "đề nghị mua vật tư phát
 * sinh từ công trường") hoặc từ một GÓI THẦU đang chuẩn bị. Cả hai đều rỗng nghĩa là mua
 * cho văn phòng — không gắn ngân sách công trình nào.
 *
 * `cost_code` là dây nối sang `project_budgets`: KT-05 yêu cầu "gắn chi phí vào mã công
 * trình ngay từ khi phát sinh, không hạch toán lại thủ công". Có công trình thì bắt buộc
 * có mã chi phí, và mã đó phải nằm trong bộ ngân sách của chính công trình đó (kiểm ở hàm
 * gửi phê duyệt).
 */
export const purchaseRequests = pgTable(
  'purchase_requests',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),

    title: text('title').notNull(),

    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),
    biddingProjectId: uuid('bidding_project_id').references(() => biddingProjects.id, {
      onDelete: 'set null',
    }),

    /** Mã chi phí trong ngân sách công trình — khớp `project_budgets.cost_code`. */
    costCode: varchar('cost_code', { length: 64 }),
    costGroup: costGroupEnum('cost_group').notNull().default('vat_tu'),

    stage: purchaseRequestStageEnum('stage').notNull().default('nhap'),
    urgency: purchaseUrgencyEnum('urgency').notNull().default('thuong'),

    /** Thời điểm cần hàng (MH-01) — cột "thời hạn" cố định của mẫu Danh sách. */
    neededDate: date('needed_date'),

    /** Địa điểm giao (MH-01) — mặc định là địa chỉ công trình, sửa được. */
    deliveryLocation: text('delivery_location'),

    /**
     * Giá trị ước tính, đồng — Σ (số lượng × đơn giá ước tính) của các dòng.
     * Đây là con số đem đối chiếu hạn mức phê duyệt (MH-02 ↔ NEN-02), chốt lại tại thời
     * điểm gửi phê duyệt để hạn mức không đổi giữa chừng khi ai đó sửa dòng.
     */
    estimatedValue: money('estimated_value')
      .notNull()
      .default(sql`0`),

    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    /** Lý do hủy hoặc lý do bị từ chối — không cho đóng hồ sơ mà không nói vì sao. */
    closedReason: text('closed_reason'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('purchase_requests_list_idx').on(t.companyId, t.stage, t.neededDate),
    index('purchase_requests_site_idx').on(t.constructionSiteId),
    index('purchase_requests_bidding_idx').on(t.biddingProjectId),
    uniqueIndex('purchase_requests_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

/** Một mặt hàng trong đề nghị mua — MH-01. */
export const purchaseRequestItems = pgTable(
  'purchase_request_items',
  {
    id: primaryId(),
    purchaseRequestId: uuid('purchase_request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'cascade' }),

    position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),

    /** Mã vật tư — dùng chung bộ mã với `unit_prices` và Module KHO (KHO-02). */
    itemCode: varchar('item_code', { length: 64 }),
    name: text('name').notNull(),

    /** Quy cách, tiêu chuẩn kỹ thuật (MH-01) — chỗ này quyết định báo giá có so được không. */
    specification: text('specification'),

    unit: varchar('unit', { length: 32 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull().default('0'),

    /** Đơn giá ước tính do người đề nghị điền, để tính giá trị đối chiếu hạn mức. */
    estimatedUnitPrice: money('estimated_unit_price')
      .notNull()
      .default(sql`0`),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [index('purchase_request_items_idx').on(t.purchaseRequestId, t.position)],
);

/* ========================================================================== *
 * Báo giá — MH-04, MH-05
 * ========================================================================== */

/**
 * Báo giá của một nhà cung cấp cho một đề nghị mua (MH-04).
 *
 * Các cột phí lưu ĐÚNG như nhà cung cấp báo, KHÔNG lưu tổng đã chuẩn hóa: tổng chuẩn hóa
 * là kết quả tính lại được từ các cột này, mà công thức chuẩn hóa còn có thể phải sửa (ví
 * dụ khi NVG đổi cách tính hao hụt). Lưu cả hai thì hai con số sẽ lệch nhau, và không ai
 * biết con số nào đúng. Xem `standardizeQuotationCost` ở `@nvg/shared/mh`.
 */
export const quotations = pgTable(
  'quotations',
  {
    id: primaryId(),
    ...companyScoped(),

    purchaseRequestId: uuid('purchase_request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),

    status: quotationStatusEnum('status').notNull().default('cho_bao_gia'),

    /** Ngày nhà cung cấp báo giá — MH-05 lưu lịch sử giá THEO NGÀY. */
    quotedDate: date('quoted_date'),
    validUntil: date('valid_until'),

    /** Thuế suất, ĐIỂM CƠ BẢN: VAT 10% lưu là 1000. Xem `BASIS_POINTS` ở `@nvg/shared/mh`. */
    taxRateBp: integer('tax_rate_bp').notNull().default(0),
    /** Tỷ lệ hao hụt dự kiến, điểm cơ bản. */
    wastageRateBp: integer('wastage_rate_bp').notNull().default(0),

    shippingFee: money('shipping_fee')
      .notNull()
      .default(sql`0`),

    deliveryDays: integer('delivery_days'),
    paymentTermDays: integer('payment_term_days'),
    warrantyMonths: integer('warranty_months'),

    /**
     * Căn cứ chọn nhà cung cấp này — MH-04 "không chỉ so sánh giá thấp nhất".
     * BẮT BUỘC khi báo giá được chọn KHÔNG phải báo giá rẻ nhất (kiểm ở `select_quotation`).
     */
    selectionReason: text('selection_reason'),
    selectedAt: timestamp('selected_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('quotations_request_idx').on(t.purchaseRequestId, t.status),
    index('quotations_supplier_idx').on(t.supplierId, t.quotedDate),
    /** Mỗi nhà cung cấp chỉ có một báo giá còn hiệu lực cho một đề nghị. */
    uniqueIndex('quotations_one_per_supplier')
      .on(t.purchaseRequestId, t.supplierId)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/**
 * Đơn giá từng mặt hàng trong một báo giá — nguồn dữ liệu của MH-05.
 *
 * Đây là bảng mà "lịch sử giá theo mã vật tư – nhà cung cấp – ngày báo giá – dự án áp dụng"
 * đọc ra. Không có bảng này thì chỉ còn tổng tiền của cả đơn, không tra ngược được giá thép
 * phi 16 hôm nào là bao nhiêu.
 */
export const quotationItems = pgTable(
  'quotation_items',
  {
    id: primaryId(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),

    /** Dòng đề nghị tương ứng. Rỗng nghĩa là nhà cung cấp chào thêm ngoài danh sách hỏi. */
    purchaseRequestItemId: uuid('purchase_request_item_id').references(
      () => purchaseRequestItems.id,
      { onDelete: 'set null' },
    ),

    itemCode: varchar('item_code', { length: 64 }),
    name: text('name').notNull(),
    specification: text('specification'),
    unit: varchar('unit', { length: 32 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull().default('0'),
    unitPrice: money('unit_price')
      .notNull()
      .default(sql`0`),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [
    index('quotation_items_idx').on(t.quotationId),
    index('quotation_items_history_idx').on(t.itemCode),
  ],
);

/* ========================================================================== *
 * Đơn đặt hàng — MH-06
 * ========================================================================== */

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),

    purchaseRequestId: uuid('purchase_request_id')
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    /** Báo giá đã chọn — đường truy ngược từ đơn hàng về căn cứ giá (PRD Mục 7). */
    quotationId: uuid('quotation_id').references(() => quotations.id, { onDelete: 'set null' }),

    stage: purchaseOrderStageEnum('stage').notNull().default('nhap'),

    orderDate: date('order_date'),
    /** Ngày giao cam kết — MH-06 "theo dõi tiến độ giao hàng theo cam kết". */
    promisedDate: date('promised_date'),

    /** Số hợp đồng mua bán bản giấy, nếu có (MH-06 "đơn đặt hàng/hợp đồng mua bán"). */
    contractNumber: varchar('contract_number', { length: 64 }),

    /** Tổng giá trị đơn hàng đã chuẩn hóa (gồm hao hụt, thuế, vận chuyển), đồng. */
    totalValue: money('total_value')
      .notNull()
      .default(sql`0`),

    /** Phần đã cộng vào `project_budgets.committed_amount` — để hoàn lại đúng khi hủy đơn. */
    committedToBudget: money('committed_to_budget')
      .notNull()
      .default(sql`0`),

    closedReason: text('closed_reason'),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('purchase_orders_list_idx').on(t.companyId, t.stage, t.promisedDate),
    index('purchase_orders_request_idx').on(t.purchaseRequestId),
    index('purchase_orders_supplier_idx').on(t.supplierId),
    uniqueIndex('purchase_orders_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: primaryId(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),

    position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),

    itemCode: varchar('item_code', { length: 64 }),
    name: text('name').notNull(),
    specification: text('specification'),
    unit: varchar('unit', { length: 32 }).notNull(),

    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull().default('0'),
    unitPrice: money('unit_price')
      .notNull()
      .default(sql`0`),

    /**
     * Số lượng đã nhận cộng dồn qua các đợt giao. Cố ý LƯU LẠI thay vì luôn cộng từ
     * `delivery_items`: đây là con số bị kiểm ở mỗi lần ghi giao nhận ("nhận vượt số đặt"),
     * mà kiểm bằng một phép cộng chạy lại trên bảng con thì hai người ghi cùng lúc sẽ cùng
     * đọc được giá trị cũ. Trigger `deliveries` là nơi DUY NHẤT ghi cột này.
     */
    deliveredQuantity: numeric('delivered_quantity', { precision: 18, scale: 3 })
      .notNull()
      .default('0'),

    ...auditColumns(),
  },
  (t) => [index('purchase_order_items_idx').on(t.purchaseOrderId, t.position)],
);

/* ========================================================================== *
 * Giao nhận — MH-07, MH-08
 * ========================================================================== */

/**
 * Một đợt giao nhận của đơn hàng (MH-07).
 *
 * Một đơn hàng có nhiều đợt giao — thép về làm ba chuyến là chuyện thường. Vì vậy giao nhận
 * là bảng riêng chứ không phải mấy cột trên `purchase_orders`.
 */
export const deliveries = pgTable(
  'deliveries',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),

    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),

    deliveredDate: date('delivered_date').notNull(),

    /** Người nhận hàng — chữ ký xác nhận bên nhận (MH-07). */
    receivedBy: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
    /** Người giao phía nhà cung cấp — ghi tên vì họ không có tài khoản trong hệ thống. */
    deliveredByName: varchar('delivered_by_name', { length: 128 }),

    /** Số phiếu giao hàng của nhà cung cấp — mảnh chứng từ đầu tiên của bộ MH-08. */
    deliveryNoteNumber: varchar('delivery_note_number', { length: 64 }),
    invoiceNumber: varchar('invoice_number', { length: 64 }),

    /** Có chứng từ chất lượng CO/CQ kèm theo hay không (MH-07). */
    hasQualityCertificate: boolean('has_quality_certificate').notNull().default(false),

    /** Ảnh chụp biên bản, phiếu giao, hàng thực nhận. */
    documentUrls: text('document_urls').array(),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('deliveries_order_idx').on(t.purchaseOrderId, t.deliveredDate),
    uniqueIndex('deliveries_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);

/**
 * Kiểm đếm từng mặt hàng của một đợt giao (MH-07).
 *
 * Tách `quantity_ok` và `quantity_issue` đúng như Backend Schema 4.7 đặt tên: chỉ phần ĐẠT
 * mới được cộng vào số đã nhận và vào chi phí thực tế. Hàng thiếu/sai/hỏng vẫn ghi lại để
 * có căn cứ làm việc với nhà cung cấp, nhưng không tính là đã mua được.
 */
export const deliveryItems = pgTable(
  'delivery_items',
  {
    id: primaryId(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),
    purchaseOrderItemId: uuid('purchase_order_item_id')
      .notNull()
      .references(() => purchaseOrderItems.id, { onDelete: 'cascade' }),

    quantityOk: numeric('quantity_ok', { precision: 18, scale: 3 }).notNull().default('0'),
    quantityIssue: numeric('quantity_issue', { precision: 18, scale: 3 }).notNull().default('0'),

    issueType: deliveryIssueTypeEnum('issue_type'),
    issueNote: text('issue_note'),

    ...auditColumns(),
  },
  (t) => [
    index('delivery_items_idx').on(t.deliveryId),
    index('delivery_items_order_item_idx').on(t.purchaseOrderItemId),
  ],
);

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;
export type PurchaseRequestItem = typeof purchaseRequestItems.$inferSelect;
export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type DeliveryItem = typeof deliveryItems.$inferSelect;
