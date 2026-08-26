/**
 * Module DA — Dự án và Đấu thầu (NVC).
 *
 * Nguồn: PRD DA-01 → DA-10, Backend Schema 4.3, Webapp Flow 3.2.
 *
 * Đây là module đầu tiên có **dữ liệu nhạy cảm Mẫu D** (giá vốn, lợi nhuận). Cách bảo vệ:
 *
 *  - `estimates` giữ cả giá dự thầu (ai xem hồ sơ cũng thấy — đó là con số gửi ra ngoài) lẫn
 *    cấu thành chi phí (chỉ vai trò được phép). Hai loại đó KHÔNG tách bảng, nhưng quyền đọc
 *    các cột chi phí bị thu hồi ở tầng CSDL và chỉ mở qua hàm `estimate_cost_breakdown`.
 *  - `estimate_items` và `unit_prices` toàn bộ là giá vốn, nên chặn bằng policy ở mức DÒNG.
 *
 * Lý do phải đi qua hàm chứ không phải view: PRD NEN-07 bắt buộc GHI NHẬT KÝ mỗi lượt xem dữ
 * liệu nhạy cảm — một câu SELECT không ghi được nhật ký, một hàm thì có.
 */

import { sql } from 'drizzle-orm';
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
import { auditColumns } from './_audit';
import {
  biddingStageEnum,
  bidDocumentCategoryEnum,
  costGroupEnum,
  statusGroupEnum,
  unitPriceSourceEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete, versionColumns } from './_helpers';
import { companyScoped } from './_scoped';
import { customers, opportunities } from './crm';
import { documents, documentVersions } from './documents';
import { designProjects } from './tk';
import { users } from './users';

/**
 * Gói thầu / dự án (DA-01).
 *
 * ĐIỂM NỐI với CRM: `opportunity_id` là đường truy ngược về cơ hội gốc (Backend Schema 2.1).
 * Để rỗng được vì gói thầu còn đến từ thư mời thầu trực tiếp, không qua pipeline kinh doanh —
 * khi đó chủ đầu tư ghi ở `customer_id`, và cũng để rỗng được nếu chưa có hồ sơ khách hàng.
 */
export const biddingProjects = pgTable(
  'bidding_projects',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode().notNull().unique(),
    name: text('name').notNull(),

    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),

    stage: biddingStageEnum('stage').notNull().default('tiep_nhan_ho_so'),

    /** Người chịu trách nhiệm chính (DA-01) — thuật ngữ chuẩn, Content Guidelines 4.4. */
    responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** Giá trị gói thầu dự kiến theo hồ sơ mời thầu, đơn vị đồng. */
    estimatedValue: money('estimated_value'),

    siteAddress: text('site_address'),

    /** Hạn nộp hồ sơ (DA-01, DA-08) — cột "thời hạn" cố định của mẫu Danh sách. */
    submissionDeadline: date('submission_deadline'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),

    /**
     * Nội dung cần làm rõ với chủ đầu tư khi hồ sơ mời thầu thiếu hoặc mâu thuẫn (DA-02).
     * Dạng văn bản tự do ở bước này: mỗi gói thầu có kiểu thiếu sót khác nhau, đóng khung
     * quá sớm thành bảng thì người dùng lại ghi vào ô "khác".
     */
    clarificationNotes: text('clarification_notes'),

    /** Điều kiện thi công, biện pháp, rủi ro đã nhận diện (DA-03). */
    surveyNotes: text('survey_notes'),

    /** Nguyên nhân trượt thầu (DA-08) — bắt buộc khi chuyển sang `truot_thau`. */
    lostReason: text('lost_reason'),

    /** Thời điểm đã chuyển dự toán thành ngân sách thi công (DA-09). */
    budgetGeneratedAt: timestamp('budget_generated_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('bidding_projects_company_stage_idx').on(t.companyId, t.stage),
    index('bidding_projects_opportunity_idx').on(t.opportunityId),
    index('bidding_projects_responsible_idx').on(t.responsibleUserId),
  ],
);

/**
 * Bảng khối lượng bóc tách (DA-04).
 *
 * `drawing_version_id` trỏ tới ĐÚNG phiên bản bản vẽ đã dùng để bóc, không trỏ tới tài liệu.
 * Nhờ vậy câu hỏi "bảng khối lượng này bóc theo bản vẽ nào" trả lời được chính xác, và cảnh
 * báo "bản vẽ nguồn đã thay đổi" chỉ là so sánh phiên bản đó còn `is_current_version` không —
 * đúng yêu cầu DA-04, không cần cột trạng thái riêng phải tự đồng bộ.
 */
export const boqItems = pgTable(
  'boq_items',
  {
    id: primaryId(),
    ...companyScoped(),

    /**
     * ĐÚNG MỘT trong hai cột cha có giá trị — ràng buộc CHECK ở migration giữ điều đó.
     *
     * PRD TK-07 nói rõ Thiết kế (NVO) "sử dụng CHUNG cơ chế với Module DA (DA-04 đến DA-06)".
     * Nên bảng khối lượng và bảng dự toán nhận cả hai loại hồ sơ cha thay vì NVO có một bộ
     * bảng sao chép: hai bộ bảng nghĩa là hai công thức tính thành tiền, và tới lúc sửa quy
     * tắc làm tròn thì chỉ một bên được sửa.
     */
    biddingProjectId: uuid('bidding_project_id').references(() => biddingProjects.id, {
      onDelete: 'cascade',
    }),
    designProjectId: uuid('design_project_id').references(() => designProjects.id, {
      onDelete: 'cascade',
    }),

    /** Số thứ tự hiển thị trong bảng — người dùng tự sắp theo hạng mục. */
    position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),

    /** Mã hạng mục theo hồ sơ mời thầu (nếu có). */
    itemCode: varchar('item_code', { length: 64 }),
    name: text('name').notNull(),
    unit: varchar('unit', { length: 32 }).notNull(),

    /** Khối lượng — số thập phân thật, KHÁC tiền tệ (tiền dùng bigint đơn vị đồng). */
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull().default('0'),

    /** Mã bản vẽ ghi trên bản vẽ giấy — giữ nguyên cách gọi của người bóc tách. */
    drawingRef: varchar('drawing_ref', { length: 64 }),
    drawingDocumentId: uuid('drawing_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    drawingVersionId: uuid('drawing_version_id').references(() => documentVersions.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('boq_items_project_idx').on(t.biddingProjectId, t.position),
    index('boq_items_design_project_idx').on(t.designProjectId, t.position),
    index('boq_items_drawing_idx').on(t.drawingVersionId),
  ],
);

/**
 * Cơ sở dữ liệu đơn giá và định mức dùng chung (DA-05).
 *
 * ⚠️ GIẢ ĐỊNH CHỜ XÁC NHẬN: Backend Schema 5 ghi rõ chưa chốt "NVO có cần bảng đơn giá riêng
 * hay dùng chung với NVC". Bảng này thiết kế DÙNG CHUNG cho DA/TK/MH và tách theo pháp nhân
 * bằng `company_id` — nếu sau này NVO cần bộ đơn giá riêng thì đã tách sẵn, không phải đổi
 * cấu trúc. Xem CLAUDE.md 6.6.
 *
 * Toàn bộ bảng là GIÁ VỐN ⇒ Mẫu D áp ở mức DÒNG (xem migration RLS), không phải mức cột.
 */
export const unitPrices = pgTable(
  'unit_prices',
  {
    id: primaryId(),
    ...companyScoped(),

    /** Mã vật tư/công việc — KHO-02 sẽ dùng chung bộ mã này khi có Module Kho. */
    itemCode: varchar('item_code', { length: 64 }).notNull(),
    name: text('name').notNull(),
    unit: varchar('unit', { length: 32 }).notNull(),
    costGroup: costGroupEnum('cost_group').notNull(),

    price: money('price').notNull(),
    source: unitPriceSourceEnum('source').notNull(),

    /**
     * Nhà cung cấp — CHƯA có khoá ngoại vì bảng `suppliers` thuộc Module MH (Giai đoạn 2).
     * Khi MH có mặt sẽ bổ sung ràng buộc trong migration riêng.
     */
    supplierId: uuid('supplier_id'),
    supplierName: varchar('supplier_name', { length: 255 }),

    /** Ngày báo giá / ngày hiệu lực của đơn giá (DA-05). */
    effectiveDate: date('effective_date').notNull(),

    /** Dự án đã áp dụng đơn giá này (DA-05: "và dự án áp dụng"). */
    appliedProjectRef: varchar('applied_project_ref', { length: 64 }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('unit_prices_lookup_idx').on(t.companyId, t.itemCode, t.effectiveDate),
    index('unit_prices_cost_group_idx').on(t.companyId, t.costGroup),
  ],
);

/**
 * Bảng dự toán / giá dự thầu, có phiên bản (DA-06, DA-07).
 *
 * DA-07 yêu cầu "lưu lại TOÀN BỘ các phiên bản dự toán, người thay đổi giá và căn cứ phê
 * duyệt" — nên sửa giá sau khi đã duyệt KHÔNG ghi đè bản cũ mà tạo phiên bản mới, giống
 * `quotes` ở CRM-04.
 *
 * Mẫu RLS **D**: `bid_price` ai xem được hồ sơ cũng thấy; các cột cấu thành chi phí bên dưới
 * bị thu hồi quyền đọc ở tầng CSDL và chỉ mở qua hàm có ghi nhật ký.
 */
export const estimates = pgTable(
  'estimates',
  {
    id: primaryId(),
    ...companyScoped(),

    /** ĐÚNG MỘT trong hai cột cha có giá trị — xem ghi chú ở `boqItems` và TK-07. */
    biddingProjectId: uuid('bidding_project_id').references(() => biddingProjects.id, {
      onDelete: 'cascade',
    }),
    designProjectId: uuid('design_project_id').references(() => designProjects.id, {
      onDelete: 'cascade',
    }),

    code: recordCode().notNull(),
    ...versionColumns(),

    status: statusGroupEnum('status').notNull().default('draft'),

    /** Giá dự thầu — con số gửi ra ngoài. KHÔNG nhạy cảm. */
    bidPrice: money('bid_price'),

    // --- Từ đây trở xuống là dữ liệu nhạy cảm Mẫu D (giá vốn, lợi nhuận) ---
    directCost: money('direct_cost'),
    overheadCost: money('overhead_cost'),
    contingencyCost: money('contingency_cost'),
    financeCost: money('finance_cost'),
    taxAmount: money('tax_amount'),
    profitAmount: money('profit_amount'),
    /** Tỷ lệ lợi nhuận dự kiến, đơn vị phần trăm (ví dụ `8.50`). */
    profitMarginPercent: numeric('profit_margin_percent', { precision: 5, scale: 2 }),
    // --- Hết phần nhạy cảm ---

    /** Căn cứ lập giá, giả định đã dùng — người duyệt cần đọc trước khi quyết định. */
    basisNotes: text('basis_notes'),

    preparedBy: uuid('prepared_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('estimates_project_idx').on(t.biddingProjectId, t.version),
    index('estimates_design_project_idx').on(t.designProjectId, t.version),
    /**
     * Mỗi hồ sơ cha chỉ MỘT bản dự toán đang hiệu lực tại một thời điểm (NEN-05).
     * Hai unique index riêng vì Postgres coi NULL là khác nhau: gộp một index trên cả hai
     * cột thì mọi dòng của NVO (bidding_project_id rỗng) đều "khác nhau" và ràng buộc mất
     * tác dụng — đúng cái bẫy mà NEN-05 phải tránh.
     */
    uniqueIndex('estimates_one_current_per_project')
      .on(t.biddingProjectId)
      .where(sql`${t.isCurrentVersion} AND ${t.deletedAt} IS NULL`),
    uniqueIndex('estimates_one_current_per_design_project')
      .on(t.designProjectId)
      .where(sql`${t.isCurrentVersion} AND ${t.deletedAt} IS NULL`),
    uniqueIndex('estimates_code_version').on(t.code, t.version),
  ],
);

/**
 * Dòng chi tiết của một bản dự toán (DA-06).
 *
 * Toàn bộ bảng là cấu thành giá vốn ⇒ chặn bằng policy ở mức DÒNG: vai trò không được xem
 * giá vốn thì không nhận được dòng nào, thay vì nhận dòng có cột rỗng.
 */
export const estimateItems = pgTable(
  'estimate_items',
  {
    id: primaryId(),
    ...companyScoped(),

    estimateId: uuid('estimate_id')
      .notNull()
      .references(() => estimates.id, { onDelete: 'cascade' }),

    /** Dòng khối lượng nguồn — rỗng với chi phí không gắn hạng mục (chi phí chung, dự phòng). */
    boqItemId: uuid('boq_item_id').references(() => boqItems.id, { onDelete: 'set null' }),

    /** Đơn giá đã tham chiếu — giữ lại để truy ngược "giá này lấy từ đâu" (DA-05). */
    unitPriceId: uuid('unit_price_id').references(() => unitPrices.id, { onDelete: 'set null' }),

    position: numeric('position', { precision: 10, scale: 2 }).notNull().default('0'),
    costGroup: costGroupEnum('cost_group').notNull(),

    description: text('description').notNull(),
    unit: varchar('unit', { length: 32 }),
    quantity: numeric('quantity', { precision: 18, scale: 3 }).notNull().default('0'),
    unitPrice: money('unit_price').notNull().default(sql`0`),

    /**
     * Thành tiền. Cố ý LƯU LẠI thay vì luôn tính `quantity * unit_price`: dự toán đã duyệt
     * phải đọc lại đúng con số tại thời điểm duyệt, kể cả khi quy tắc làm tròn đổi về sau.
     */
    amount: money('amount').notNull().default(sql`0`),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('estimate_items_estimate_idx').on(t.estimateId, t.position)],
);

/**
 * Checklist hồ sơ dự thầu (DA-08).
 *
 * Một dòng là một đầu mục phải nộp. `document_id` nối sang kho hồ sơ dùng chung (NEN-05) —
 * KHÔNG chép tệp sang đây, để phiên bản đang hiệu lực chỉ có một nơi quản lý.
 */
export const bidDocuments = pgTable(
  'bid_documents',
  {
    id: primaryId(),
    ...companyScoped(),

    biddingProjectId: uuid('bidding_project_id')
      .notNull()
      .references(() => biddingProjects.id, { onDelete: 'cascade' }),

    category: bidDocumentCategoryEnum('category').notNull(),
    name: text('name').notNull(),

    /** Bắt buộc phải có mới nộp được hồ sơ. */
    isRequired: boolean('is_required').notNull().default(true),

    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('bid_documents_project_idx').on(t.biddingProjectId, t.category)],
);

/**
 * Ngân sách thi công sau khi ký hợp đồng (DA-09).
 *
 * Sinh ra từ dự toán ĐÃ DUYỆT, không nhập tay — đây chính là mắt xích nối Giai đoạn 1 sang
 * Giai đoạn 2 (Module TC nhận ngân sách này ở TC-01, và TC-05 so sánh `actual_amount` với
 * `budgeted_amount`).
 *
 * Mẫu RLS **D**: cột lợi nhuận mục tiêu chỉ mở cho vai trò được phép.
 */
export const projectBudgets = pgTable(
  'project_budgets',
  {
    id: primaryId(),
    ...companyScoped(),

    /**
     * ĐÚNG MỘT trong hai cột cha có giá trị — cùng cách `estimates` và `boq_items` đã làm
     * khi bộ máy dự toán được dùng chung cho NVO (TK-07). Ngân sách phải theo được: NVO
     * làm trọn gói thiết kế + thi công, không đi qua gói thầu, nhưng vẫn cần TC-05 so chi
     * phí với ngân sách. Ràng buộc CHECK ở migration giữ "đúng một".
     */
    biddingProjectId: uuid('bidding_project_id').references(() => biddingProjects.id, {
      onDelete: 'cascade',
    }),
    designProjectId: uuid('design_project_id').references(() => designProjects.id, {
      onDelete: 'cascade',
    }),

    /** Bản dự toán đã duyệt sinh ra ngân sách này — đường truy ngược bắt buộc (PRD Mục 7). */
    estimateId: uuid('estimate_id').references(() => estimates.id, { onDelete: 'set null' }),

    /**
     * Công trình tiêu ngân sách này (TC-01, TC-05).
     *
     * CHƯA có khoá ngoại ở tầng Drizzle: `construction_sites` nằm ở `tc.ts`, mà `tc.ts` đã
     * import từ file này — khai khoá ngoại hai chiều sẽ tạo vòng import và TypeScript mất
     * kiểu. Ràng buộc thật được thêm bằng `ALTER TABLE` trong migration của TC, giống cách
     * `design_projects.construction_site_id` đã làm.
     *
     * Rỗng nghĩa là ngân sách đã lập nhưng chưa mở công trình — trạng thái bình thường giữa
     * lúc trúng thầu (DA-09) và lúc ký hợp đồng.
     */
    constructionSiteId: uuid('construction_site_id'),

    /** Mã chi phí (DA-09) — nhóm chi phí + mã công việc. */
    costGroup: costGroupEnum('cost_group').notNull(),
    costCode: varchar('cost_code', { length: 64 }).notNull(),
    name: text('name').notNull(),

    budgetedAmount: money('budgeted_amount').notNull().default(sql`0`),

    /**
     * Đã phát sinh thực tế. Module TC/MH/KT cập nhật khi có chứng từ; ở Giai đoạn 1 luôn là 0.
     */
    actualAmount: money('actual_amount').notNull().default(sql`0`),

    /** Đã cam kết (đơn hàng đã ký nhưng chưa nhận hoá đơn) — TC-05 cần để cảnh báo sớm. */
    committedAmount: money('committed_amount').notNull().default(sql`0`),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('project_budgets_project_idx').on(t.biddingProjectId, t.costGroup),
    index('project_budgets_design_project_idx').on(t.designProjectId, t.costGroup),
    index('project_budgets_site_idx').on(t.constructionSiteId),
    /**
     * Mã chi phí không trùng trong cùng một hồ sơ cha. Hai index riêng vì Postgres coi NULL
     * là khác nhau: gộp cả hai cột vào một index thì mọi dòng của NVO (`bidding_project_id`
     * rỗng) đều "khác nhau" và ràng buộc mất tác dụng — đúng cái bẫy `estimates` đã tránh.
     */
    uniqueIndex('project_budgets_cost_code')
      .on(t.biddingProjectId, t.costCode)
      .where(sql`${t.deletedAt} IS NULL`),
    uniqueIndex('project_budgets_design_cost_code')
      .on(t.designProjectId, t.costCode)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

export type BiddingProject = typeof biddingProjects.$inferSelect;
export type BoqItem = typeof boqItems.$inferSelect;
export type UnitPrice = typeof unitPrices.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type EstimateItem = typeof estimateItems.$inferSelect;
export type BidDocument = typeof bidDocuments.$inferSelect;
export type ProjectBudget = typeof projectBudgets.$inferSelect;
