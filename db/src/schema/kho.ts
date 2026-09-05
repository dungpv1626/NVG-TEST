/**
 * Module KHO — Quản lý Kho (Backend Schema Mục 4.8).
 * Giai đoạn 2 — vật tư NVC/NVO và nguyên liệu/thành phẩm NVS.
 *
 * Backend Schema 4.8 liệt kê 5 bảng; ở đây có 9. Bốn bảng thêm:
 *
 *   materials             ← KHO-02 đòi "một vật tư chỉ dùng MỘT MÃ DUY NHẤT". Đặt tên và quy
 *                           cách vào từng dòng tồn của từng kho thì cùng một cây thép sẽ được
 *                           mô tả lại ở mỗi kho, và đúng cái KHO-02 chặn lại xảy ra ngay.
 *   stock_movement_items  ← một phiếu nhập/xuất là một DANH SÁCH mặt hàng, không phải một dòng
 *   stocktake_items       ← KHO-07 đối chiếu THEO TỪNG vật tư, chênh lệch ghi theo từng dòng
 *   scaffolding_events    ← KHO-06 nói rõ sửa chữa/mất mát/thanh lý "phải có biên bản riêng"
 *
 * ⚠️ CỐ Ý CHƯA làm ở bước này, không phải quên:
 *   - KHO-09 làm việc NGOẠI TUYẾN thật (ghi được khi mất mạng, đồng bộ lại sau). Quyết định
 *     còn treo (CLAUDE.md 6.6). Phần ĐÃ làm là `client_generated_id`: gửi lại cùng một phiếu
 *     không tạo ra hai phiếu — điều kiện cần của mọi cơ chế đồng bộ lại, và tự nó đã giải
 *     được trường hợp mạng chập chờn giữa chừng.
 *   - KHO-10 liên kết lệnh sản xuất và hàng cho thuê — thuộc Module SX (Phase 3E).
 *   - Giá vốn bình quân mới ở mức cột `average_cost` cập nhật khi nhập. Cách tính giá xuất
 *     kho chính thức (bình quân gia quyền, nhập trước xuất trước…) phải khớp với phần mềm kế
 *     toán, mà phần mềm đó chưa được chốt (PRD Mục 10).
 */

import {
  boolean,
  date,
  index,
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
  assetLocationTypeEnum,
  costGroupEnum,
  scaffoldingConditionEnum,
  scaffoldingEventTypeEnum,
  stockIssueReasonEnum,
  stockMovementTypeEnum,
  stocktakeStatusEnum,
  warehouseTypeEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { constructionSites } from './tc';
import { deliveries, purchaseOrders } from './mh';
import { users } from './users';

/* ========================================================================== *
 * Danh mục vật tư — KHO-02
 * ========================================================================== */

/**
 * Danh mục vật tư, công cụ dụng cụ và giàn giáo.
 *
 * ⚠️ KHÔNG có `company_id`, cùng lý do với `suppliers` và `customers`: KHO-02 yêu cầu "một
 * vật tư chỉ dùng MỘT MÃ DUY NHẤT". Tách danh mục theo pháp nhân thì cùng một cây thép hộp
 * có ba mã ở ba công ty, và mọi so sánh giá (MH-05) lẫn điều chuyển giữa các kho (KHO-05)
 * đều đứt.
 *
 * Bộ mã thống nhất của Nhà Việt Group CHƯA có (PRD Mục 10) — `code` do người phụ trách danh
 * mục đặt, `buildMaterialCode` ở `@nvg/shared/codes` chỉ gợi ý theo đúng quy tắc KHO-02.
 */
export const materials = pgTable(
  'materials',
  {
    id: primaryId(),

    /** Mã vật tư: nhóm – tên viết tắt – quy cách. Ví dụ `THEP-ONG-D49X2.0`. */
    code: varchar('code', { length: 64 }).notNull().unique(),

    /** Mã nhóm — xem `MATERIAL_GROUPS` ở `@nvg/shared/codes`. */
    groupCode: varchar('group_code', { length: 32 }).notNull(),

    name: text('name').notNull(),
    specification: text('specification'),

    /**
     * Đơn vị tính. KHO-02 nêu rõ mục đích của mã duy nhất là "tránh trùng tên hoặc NHẦM ĐƠN
     * VỊ TÍNH" — nên đơn vị thuộc về danh mục, không thuộc về từng phiếu.
     */
    unit: varchar('unit', { length: 32 }).notNull(),

    /** Nhóm chi phí khi vật tư này được cấp cho công trình — nối sang ngân sách (TC-05). */
    costGroup: costGroupEnum('cost_group').notNull().default('vat_tu'),

    /** Vật tư này quản lý theo vòng đời giàn giáo (KHO-06) chứ không tiêu hao một lần. */
    isScaffolding: boolean('is_scaffolding').notNull().default(false),

    /** Mã vạch/QR in trên tem — KHO-09. Rỗng khi chưa dán tem. */
    barcode: varchar('barcode', { length: 64 }),

    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('materials_group_idx').on(t.groupCode, t.name),
    uniqueIndex('materials_barcode')
      .on(t.barcode)
      .where(sql`${t.barcode} IS NOT NULL`),
  ],
);

/* ========================================================================== *
 * Danh mục kho — KHO-01
 * ========================================================================== */

export const warehouses = pgTable(
  'warehouses',
  {
    id: primaryId(),
    ...companyScoped(),

    code: varchar('code', { length: 40 }).notNull(),
    name: text('name').notNull(),
    warehouseType: warehouseTypeEnum('warehouse_type').notNull(),

    /**
     * Kho tại công trình (KHO-01) trỏ về đúng công trình đó. Rỗng với bốn loại kho còn lại.
     * Nhờ cột này, xuất vật tư từ kho công trình biết ngay là chi phí của công trình nào.
     */
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),

    address: text('address'),
    managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),

    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('warehouses_company_idx').on(t.companyId, t.warehouseType),
    uniqueIndex('warehouses_code')
      .on(t.code)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/* ========================================================================== *
 * Tồn kho — KHO-02, KHO-08
 * ========================================================================== */

/**
 * Tồn kho theo cặp (kho × vật tư).
 *
 * `quantity_on_hand` CHỈ đổi qua hàm nghiệp vụ, không bao giờ ghi thẳng từ trình duyệt: mỗi
 * lần đổi phải có một phiếu kho đứng sau nó. Không có ràng buộc đó thì sổ kho và các phiếu
 * kể hai câu chuyện khác nhau, và kiểm kê KHO-07 mất luôn cái để đối chiếu.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: primaryId(),
    ...companyScoped(),

    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),

    quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 3 }).notNull().default('0'),

    /** Mức tồn tối thiểu để cảnh báo "sắp hết" (KHO-08). Rỗng = không theo dõi. */
    minQuantity: numeric('min_quantity', { precision: 18, scale: 3 }),

    /**
     * Đơn giá bình quân, đồng — cập nhật khi nhập kho.
     *
     * ⚠️ Đây là con số THAM KHẢO để ước giá trị tồn, chưa phải giá vốn xuất kho chính thức:
     * cách tính giá xuất phải khớp với phần mềm kế toán, mà phần mềm đó chưa được chốt
     * (PRD Mục 10, KT-08). Không dùng con số này để hạch toán.
     */
    averageCost: money('average_cost')
      .notNull()
      .default(sql`0`),

    lastMovementAt: timestamp('last_movement_at', { withTimezone: true }),

    /** Vị trí trong kho (dãy, kệ) — giúp người soạn hàng tìm nhanh. */
    location: varchar('location', { length: 64 }),

    ...auditColumns(),
  },
  (t) => [
    /** Một vật tư chỉ có ĐÚNG MỘT dòng tồn ở mỗi kho — nếu không, số tổng cộng nhầm. */
    uniqueIndex('inventory_items_warehouse_material').on(t.warehouseId, t.materialId),
    index('inventory_items_material_idx').on(t.materialId),
    index('inventory_items_alert_idx').on(t.companyId, t.lastMovementAt),
  ],
);

/* ========================================================================== *
 * Phiếu kho — KHO-03, KHO-04, KHO-05, KHO-07
 * ========================================================================== */

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),
    movementType: stockMovementTypeEnum('movement_type').notNull(),

    /** Kho phát sinh. Với điều chuyển đây là kho XUẤT. */
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),

    /** Kho nhận — chỉ có với phiếu điều chuyển (KHO-05). */
    targetWarehouseId: uuid('target_warehouse_id').references(() => warehouses.id, {
      onDelete: 'restrict',
    }),

    movementDate: date('movement_date').notNull(),

    /** Lý do xuất (KHO-04). Rỗng với phiếu nhập, điều chuyển và kiểm kê. */
    issueReason: stockIssueReasonEnum('issue_reason'),

    /** Công trình nhận vật tư — để chi phí gắn đúng mã công trình ngay khi xuất (KT-05). */
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),

    /**
     * Phiếu giao nhận sinh ra phiếu nhập này (KHO-03 "đối chiếu với đơn hàng/đề nghị mua đã
     * duyệt", MH-07 "tự cập nhật tồn kho"). Rỗng với hàng nhập không qua mua sắm.
     */
    deliveryId: uuid('delivery_id').references(() => deliveries.id, { onDelete: 'set null' }),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),

    /**
     * Chống ghi trùng khi thiết bị gửi lại cùng một phiếu — KHO-09.
     *
     * Máy ở kho mất sóng giữa lúc gửi thì không biết phiếu đã tới hay chưa, và cách duy nhất
     * an toàn là gửi lại. Không có cột này thì mỗi lần gửi lại là một phiếu nhập nữa, tức là
     * tồn kho tự nhân đôi. Chỉ số duy nhất ở dưới là thứ biến việc gửi lại thành vô hại.
     */
    clientGeneratedId: varchar('client_generated_id', { length: 64 }),

    /**
     * Dấu thời gian hiện trường — Backend Schema v1.1 Mục 1.4 (migration 0116).
     * `clientCreatedAt` là lúc thủ kho BẤM; `syncedAt` do máy chủ tự đặt, không nhận từ
     * trình duyệt. Chênh lệch hai mốc là thứ duy nhất cho biết kho mất sóng bao lâu.
     */
    clientCreatedAt: timestamp('client_created_at', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }),

    /** Người giao và người nhận — chữ ký xác nhận hai bên (KHO-03, KHO-04, KHO-05). */
    performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
    counterpartName: varchar('counterpart_name', { length: 128 }),

    /** Đợt kiểm kê sinh ra phiếu điều chỉnh này (KHO-07). */
    stocktakeId: uuid('stocktake_id'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('stock_movements_warehouse_idx').on(t.warehouseId, t.movementDate),
    index('stock_movements_type_idx').on(t.companyId, t.movementType, t.movementDate),
    index('stock_movements_site_idx').on(t.constructionSiteId),
    index('stock_movements_delivery_idx').on(t.deliveryId),
    uniqueIndex('stock_movements_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
    uniqueIndex('stock_movements_client_id')
      .on(t.clientGeneratedId)
      .where(sql`${t.clientGeneratedId} IS NOT NULL`),
  ],
);

export const stockMovementItems = pgTable(
  'stock_movement_items',
  {
    id: primaryId(),
    stockMovementId: uuid('stock_movement_id')
      .notNull()
      .references(() => stockMovements.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),

    /**
     * Số lượng, LUÔN DƯƠNG. Chiều tăng/giảm do `movement_type` của phiếu quyết định.
     *
     * Cho phép số âm ở đây thì một phiếu xuất mang số âm sẽ lặng lẽ trở thành phiếu nhập, và
     * không ai đọc bảng thấy điều đó.
     */
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),

    /** Đơn giá tại thời điểm nhập, đồng — dùng cập nhật giá bình quân của dòng tồn. */
    unitCost: money('unit_cost')
      .notNull()
      .default(sql`0`),

    /** Ghi nhận hàng thiếu/thừa/sai quy cách/hư hỏng khi nhập (KHO-03). */
    conditionNote: text('condition_note'),

    ...auditColumns(),
  },
  (t) => [
    index('stock_movement_items_idx').on(t.stockMovementId),
    index('stock_movement_items_material_idx').on(t.materialId),
  ],
);

/* ========================================================================== *
 * Kiểm kê — KHO-07
 * ========================================================================== */

/**
 * Một đợt kiểm kê của một kho.
 *
 * Trong lúc `dang_kiem`, kho bị TẠM DỪNG nhập – xuất (KHO-07 nói thẳng như vậy). Không dừng
 * thì số đếm được và số sổ kho là hai thời điểm khác nhau, và mọi chênh lệch tìm ra đều
 * không kết luận được gì.
 */
export const stocktakes = pgTable(
  'stocktakes',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),

    status: stocktakeStatusEnum('status').notNull().default('dang_kiem'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    countedAt: timestamp('counted_at', { withTimezone: true }),
    adjustedAt: timestamp('adjusted_at', { withTimezone: true }),

    performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),

    /** Nguyên nhân chênh lệch (KHO-07) — căn cứ để người có thẩm quyền quyết định. */
    varianceReason: text('variance_reason'),
    closedReason: text('closed_reason'),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('stocktakes_warehouse_idx').on(t.warehouseId, t.startedAt),
    uniqueIndex('stocktakes_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
    /**
     * Một kho chỉ có ĐÚNG MỘT đợt kiểm kê đang mở tại một thời điểm — hai đợt cùng lúc thì
     * mỗi đợt chụp một số sổ kho khác nhau và cả hai đều sai.
     */
    uniqueIndex('stocktakes_one_open_per_warehouse')
      .on(t.warehouseId)
      .where(sql`${t.status} IN ('dang_kiem', 'cho_duyet') AND ${t.deletedAt} IS NULL`),
  ],
);

export const stocktakeItems = pgTable(
  'stocktake_items',
  {
    id: primaryId(),
    stocktakeId: uuid('stocktake_id')
      .notNull()
      .references(() => stocktakes.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),

    /**
     * Số sổ kho CHỤP LẠI tại lúc mở đợt kiểm — cố ý lưu, không đọc lại lúc duyệt.
     *
     * Đọc lại thì chênh lệch sẽ đổi theo mỗi lần mở biên bản, và con số người ký duyệt không
     * còn là con số họ đã nhìn thấy.
     */
    bookQuantity: numeric('book_quantity', { precision: 18, scale: 3 }).notNull(),

    /** Số đếm thực tế. Rỗng = chưa đếm tới dòng này. */
    countedQuantity: numeric('counted_quantity', { precision: 18, scale: 3 }),

    varianceNote: text('variance_note'),

    /** Dấu thời gian hiện trường — Backend Schema v1.1 Mục 1.4 (migration 0116). */
    clientCreatedAt: timestamp('client_created_at', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }),

    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('stocktake_items_unique').on(t.stocktakeId, t.materialId),
    index('stocktake_items_idx').on(t.stocktakeId),
  ],
);

/* ========================================================================== *
 * Giàn giáo — KHO-06
 * ========================================================================== */

/**
 * Một lô giàn giáo cùng chủng loại, kích thước và TÌNH TRẠNG.
 *
 * Khác `inventory_items` ở chỗ giàn giáo không tiêu hao: nó đi ra công trình rồi quay về,
 * hỏng thì sửa, hết đời thì thanh lý. Vì vậy đơn vị theo dõi là LÔ theo tình trạng, không
 * phải một con số tồn duy nhất — 500 bộ giáo nêm mà 80 bộ đang hỏng chờ sửa thì con số đem
 * đi hứa với khách là 420, không phải 500.
 */
export const scaffoldingAssets = pgTable(
  'scaffolding_assets',
  {
    id: primaryId(),
    ...companyScoped(),

    assetCode: varchar('asset_code', { length: 64 }).notNull(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),

    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull().default('0'),
    condition: scaffoldingConditionEnum('condition').notNull().default('moi'),

    /** Đang nằm ở đâu (KHO-06 "công trình đang sử dụng"). */
    locationType: assetLocationTypeEnum('location_type').notNull().default('kho'),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),
    /** Tên khách đang thuê — vẫn giữ để hiện nhanh không cần join, nguồn thật là hợp đồng dưới đây. */
    renterName: varchar('renter_name', { length: 255 }),
    /**
     * Hợp đồng thuê đang giữ lô này (Module SX, KHO-10) — CHỈ đặt khi `location_type =
     * 'khach_thue'`. Khai kiểu `uuid` trơn, KHÔNG `.references()`: `sx.ts` đã phải import
     * `materials` từ file này, nên tham chiếu ngược lại đây sẽ tạo vòng phụ thuộc
     * `kho.ts ↔ sx.ts` mà `_helpers.ts` cấm. Ràng buộc FK thật khai bằng SQL tay ở migration
     * RLS của Module SX — giống cách `design_projects.construction_site_id` từng làm trước
     * khi Module TC tồn tại.
     */
    currentRentalAgreementId: uuid('current_rental_agreement_id'),

    purchaseDate: date('purchase_date'),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('scaffolding_assets_company_idx').on(t.companyId, t.condition),
    index('scaffolding_assets_material_idx').on(t.materialId),
    index('scaffolding_assets_rental_idx').on(t.currentRentalAgreementId),
    uniqueIndex('scaffolding_assets_code')
      .on(t.assetCode)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/**
 * Biên bản sửa chữa / mất mát / thanh lý giàn giáo — KHO-06.
 *
 * PRD nói rõ ba việc này "phải có biên bản riêng, KHÔNG NHẬP CHUNG NGAY vào lượng hàng sử
 * dụng tốt". Bảng này là chỗ chứa biên bản đó, và là đường duy nhất để một lô đổi tình trạng.
 */
export const scaffoldingEvents = pgTable(
  'scaffolding_events',
  {
    id: primaryId(),
    ...companyScoped(),

    scaffoldingAssetId: uuid('scaffolding_asset_id')
      .notNull()
      .references(() => scaffoldingAssets.id, { onDelete: 'cascade' }),

    eventType: scaffoldingEventTypeEnum('event_type').notNull(),
    eventDate: date('event_date').notNull(),

    /** Số lượng thuộc biên bản này — một lô có thể hỏng một phần. */
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull(),

    /** Tình trạng lô con sau biên bản. Rỗng với thanh lý (lô con biến mất khỏi sổ). */
    resultCondition: scaffoldingConditionEnum('result_condition'),

    /** Chi phí sửa chữa hoặc giá trị bồi thường, đồng. */
    amount: money('amount')
      .notNull()
      .default(sql`0`),

    /** Bên chịu trách nhiệm — công trình làm mất, đơn vị thuê làm hỏng… */
    responsibleParty: varchar('responsible_party', { length: 255 }),

    reason: text('reason').notNull(),
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),

    ...auditColumns(),
  },
  (t) => [index('scaffolding_events_idx').on(t.scaffoldingAssetId, t.eventDate)],
);

export type Material = typeof materials.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type StockMovementItem = typeof stockMovementItems.$inferSelect;
export type Stocktake = typeof stocktakes.$inferSelect;
export type StocktakeItem = typeof stocktakeItems.$inferSelect;
export type ScaffoldingAsset = typeof scaffoldingAssets.$inferSelect;
export type ScaffoldingEvent = typeof scaffoldingEvents.$inferSelect;
