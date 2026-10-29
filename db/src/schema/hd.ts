/**
 * Module HD — Hợp đồng.
 *
 * Nguồn: PRD HD-01 → HD-05, Backend Schema 4.5, Webapp Flow 3.1 bước 5.
 *
 * Đây là module KHÉP LẠI Giai đoạn 1. Tiêu chí nghiệm thu (PRD Mục 7) nói rõ: "từ một hợp
 * đồng, truy ngược được về đúng cơ hội gốc, đúng phiên bản dự toán đã duyệt, ai duyệt, khi
 * nào". Vì vậy hai quyết định cấu trúc dưới đây không phải tùy chọn:
 *
 *  - `source_type` + `source_id` LIÊN KẾT tới hồ sơ nguồn, KHÔNG chép dữ liệu sang
 *    (PRD Mục 2.3). Chép thì đường truy ngược đứt ngay lần đầu ai đó sửa bên nguồn.
 *  - `estimate_id` trỏ thẳng tới bản dự toán đã duyệt sinh ra giá trị hợp đồng — không suy
 *    ra qua gói thầu, vì một gói thầu có nhiều phiên bản dự toán và câu hỏi cần trả lời là
 *    "bản NÀO".
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
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
  amendmentStageEnum,
  contractSourceTypeEnum,
  contractStageEnum,
  contractPriceFormEnum,
  contractTermTypeEnum,
  contractTypeEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { customers } from './crm';
import { estimates } from './da';
import { users } from './users';

/**
 * Hợp đồng (HD-01).
 *
 * `source_type`/`source_id` là tham chiếu đa hình tới ba bảng nguồn. Không dùng ba cột khoá
 * ngoại riêng vì đúng MỘT trong ba có giá trị ở mọi thời điểm, và ba cột rỗng-hai-đầy-một
 * làm mọi truy vấn phải viết `COALESCE` — trong khi ràng buộc "đúng một" vẫn phải tự giữ.
 *
 * Đánh đổi: mất kiểm tra khoá ngoại ở tầng CSDL cho `source_id`. Bù lại bằng trigger kiểm
 * tra hồ sơ nguồn có thật và cùng pháp nhân (xem migration RLS).
 */
export const contracts = pgTable(
  'contracts',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode().notNull().unique(),
    /** Số hợp đồng theo văn bản giấy — KHÁC `code` là mã nội bộ của hệ thống. */
    contractNumber: varchar('contract_number', { length: 64 }),
    title: text('title').notNull(),

    type: contractTypeEnum('type').notNull(),
    /** Hình thức giá (0171) — chọn mẫu văn bản và điều khoản điều chỉnh giá. */
    priceForm: contractPriceFormEnum('price_form'),
    /**
     * Phạm vi so với cơ hội (0243): thiet_ke · thi_cong · tron_goi (thiết kế – thi công trọn gói,
     * thay cho cả hai). Trigger suy từ `type`; rỗng với loại khác. Một cơ hội tối đa một hợp đồng
     * thiết kế + một hợp đồng thi công, hoặc một hợp đồng trọn gói.
     */
    scopeKind: text('scope_kind'),
    stage: contractStageEnum('stage').notNull().default('nhap'),

    sourceType: contractSourceTypeEnum('source_type'),
    sourceId: uuid('source_id'),

    /**
     * Bản dự toán ĐÃ DUYỆT sinh ra giá trị hợp đồng — đường truy ngược bắt buộc (PRD Mục 7).
     * Để rỗng được với hợp đồng không đi qua dự toán (mua bán nhỏ, khoán tổ đội).
     */
    estimateId: uuid('estimate_id').references(() => estimates.id, { onDelete: 'set null' }),

    /** Đối tác. Với hợp đồng khoán/thầu phụ thì đây là bên NVG thuê, không phải khách hàng. */
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    /** Tên đối tác khi chưa có hồ sơ trong danh mục — tổ đội nhỏ thường chưa có. */
    partnerName: varchar('partner_name', { length: 255 }),

    responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** Giá trị gốc theo hợp đồng, đơn vị đồng. Phát sinh cộng thêm nằm ở bảng riêng. */
    value: money('value'),

    /**
     * Đã thu (hoặc đã trả với hợp đồng khoán), đơn vị đồng — HD-03.
     * Trigger của Module KT tự cộng lại từ `receivable_settlements` mỗi khi ghi nhận thu tiền
     * (0043_kt_rls.sql) — cột này KHÔNG còn là hằng 0 kể từ khi KT lên hình ở Giai đoạn 2.
     */
    collectedAmount: money('collected_amount')
      .notNull()
      .default(sql`0`),

    /** Thuế suất GTGT (%) mà `value` đã gồm (0171). Rỗng = chưa khai, văn bản không tự tách thuế. */
    vatRate: numeric('vat_rate', { precision: 5, scale: 2 }),
    /** Địa điểm thực hiện, in lên văn bản hợp đồng (0171). */
    projectLocation: text('project_location'),

    signedDate: date('signed_date'),
    startDate: date('start_date'),
    endDate: date('end_date'),

    signedAt: timestamp('signed_at', { withTimezone: true }),
    /** Bản đã ký (ảnh / PDF) + người ghi nhận ký (0187). */
    signedScanPath: text('signed_scan_path'),
    signedRecordedBy: uuid('signed_recorded_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),

    /** Nguyên nhân hủy — bắt buộc khi chuyển sang `huy`. */
    cancelReason: text('cancel_reason'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('contracts_company_stage_idx').on(t.companyId, t.stage),
    index('contracts_source_idx').on(t.sourceType, t.sourceId),
    index('contracts_customer_idx').on(t.customerId),
    index('contracts_estimate_idx').on(t.estimateId),
    index('contracts_responsible_idx').on(t.responsibleUserId),
  ],
);

/**
 * Điều khoản chi tiết (HD-02).
 *
 * Một dòng là một điều khoản phải theo dõi, KHÔNG phải toàn văn hợp đồng. Toàn văn nằm ở
 * kho hồ sơ (NEN-05); bảng này chỉ giữ những mốc mà hệ thống phải NHẮC được — ngày đến hạn
 * thanh toán, ngày hết bảo lãnh, hạn bảo hành. Nhồi cả bản Word vào đây thì không nhắc
 * được gì mà cũng không ai đọc.
 */
export const contractTerms = pgTable(
  'contract_terms',
  {
    id: primaryId(),
    ...companyScoped(),

    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),

    termType: contractTermTypeEnum('term_type').notNull(),
    description: text('description').notNull(),

    /** Giá trị của điều khoản (số tiền tạm ứng, mức phạt, giá trị bảo lãnh…). */
    amount: money('amount'),
    /** Tỷ lệ phần trăm, dùng cho đợt thanh toán và mức phạt. */
    percentValue: varchar('percent_value', { length: 16 }),

    /** Mốc đến hạn — nguồn của cảnh báo "khoản sắp đến hạn" ở HD-03. */
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    /** Thứ tự hiển thị trong nhóm — đợt thanh toán 1, 2, 3 phải giữ đúng thứ tự. */
    position: varchar('position', { length: 8 }).notNull().default('0'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('contract_terms_contract_idx').on(t.contractId, t.termType, t.position)],
);

/**
 * Phát sinh ngoài hợp đồng (HD-04).
 *
 * PRD HD-04 đặt ra một quy tắc rất cụ thể: phát sinh phải có đề xuất + báo giá + xác nhận
 * của khách hàng TRƯỚC KHI thực hiện, TRỪ trường hợp khẩn cấp được cấp có thẩm quyền cho
 * phép — và khi đó phải "ghi nhận RÕ trường hợp khẩn cấp và người phê duyệt".
 *
 * Vì vậy `is_emergency` đi CẶP với `emergency_authorized_by`: đánh dấu khẩn cấp mà không
 * chỉ ra ai cho phép chính là lỗ hổng mà HD-04 viết ra để bịt. Ràng buộc CHECK ở migration
 * giữ cặp đó, không để ứng dụng tự nhớ.
 */
export const contractAmendments = pgTable(
  'contract_amendments',
  {
    id: primaryId(),
    ...companyScoped(),

    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),

    code: recordCode(),
    title: text('title').notNull(),

    stage: amendmentStageEnum('stage').notNull().default('de_xuat'),

    /** Nội dung công việc phát sinh. */
    content: text('content').notNull(),
    /** Nguyên nhân phát sinh. */
    reason: text('reason').notNull(),

    /** Thay đổi giá trị hợp đồng, đơn vị đồng. Âm = giảm trừ khối lượng. */
    valueChange: money('value_change')
      .notNull()
      .default(sql`0`),
    /** Thay đổi thời gian thực hiện, tính bằng ngày. */
    scheduleImpactDays: varchar('schedule_impact_days', { length: 8 }),

    /** Báo giá phát sinh đã gửi khách — HD-04 yêu cầu có báo giá trước khi làm. */
    quoteSentAt: timestamp('quote_sent_at', { withTimezone: true }),
    /** Khách hàng xác nhận đồng ý phát sinh (HD-04). */
    customerConfirmedAt: timestamp('customer_confirmed_at', { withTimezone: true }),
    customerConfirmedBy: varchar('customer_confirmed_by', { length: 128 }),

    /** Trường hợp khẩn cấp — đi cặp với người cho phép, xem ghi chú ở đầu bảng. */
    isEmergency: boolean('is_emergency').notNull().default(false),
    emergencyAuthorizedBy: uuid('emergency_authorized_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    emergencyReason: text('emergency_reason'),

    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),

    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    /** Lý do không thực hiện — bắt buộc khi chuyển sang `tu_choi`. */
    decisionNotes: text('decision_notes'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('contract_amendments_contract_idx').on(t.contractId, t.stage),
    uniqueIndex('contract_amendments_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
);

/**
 * Mẫu hợp đồng Word (0171) — theo pháp nhân × loại hợp đồng × (tuỳ) hình thức giá. Không xoá;
 * thay mẫu = tải bản mới rồi ngừng dùng bản cũ. Tệp và chỗ trống của một mẫu không sửa được.
 */
export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: primaryId(),
    companyId: uuid('company_id').notNull(),
    title: text('title').notNull(),
    /** Rỗng với phụ lục / biên bản thanh lý (0229). */
    contractType: contractTypeEnum('contract_type'),
    /** hop_dong · phu_luc · thanh_ly (0229). */
    documentKind: text('document_kind').notNull().default('hop_dong'),
    /** Mẫu trọn gói (NVO-HĐ-02, NVC-HĐ-02) hay thi công / thiết kế — soạn văn bản từ mẫu đặt `contracts.scope_kind` (0243). */
    scopeKind: text('scope_kind'),
    priceForm: contractPriceFormEnum('price_form'),
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name').notNull(),
    tags: jsonb('tags').notNull().default({}),
    /** Các đợt thanh toán mẫu đề xuất (0185) — gợi ý cho «Tiến độ thanh toán». */
    paymentMilestones: jsonb('payment_milestones').notNull().default([]),
    /** Chỗ trống tự do + nhóm phương án của mẫu (0186, convert.py). */
    freeFields: jsonb('free_fields').notNull().default([]),
    options: jsonb('options').notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('contract_templates_lookup_idx').on(t.companyId, t.contractType, t.isActive)],
);

/**
 * Văn bản hợp đồng đã điền (0171) — bất biến, đánh số phiên bản, lưu kèm giá trị đã điền.
 * Khoá khi hợp đồng đã ký (trigger `contract_documents_before_insert`).
 */
export const contractDocuments = pgTable(
  'contract_documents',
  {
    id: primaryId(),
    companyId: uuid('company_id').notNull(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => contractTemplates.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull(),
    storagePath: text('storage_path').notNull(),
    fileName: text('file_name').notNull(),
    filledValues: jsonb('filled_values').notNull().default({}),
    missingFields: text('missing_fields')
      .array()
      .notNull()
      .default(sql`'{}'`),
    changeReason: text('change_reason'),
    /** `mau` = máy điền từ mẫu; `sua_trong_word` = người soạn sửa trong Word rồi tải lên (0222). */
    source: text('source').notNull().default('mau'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('contract_documents_version_unique').on(t.contractId, t.version),
    index('contract_documents_contract_idx').on(t.contractId, t.version),
  ],
);

export type Contract = typeof contracts.$inferSelect;
export type ContractTerm = typeof contractTerms.$inferSelect;
export type ContractAmendment = typeof contractAmendments.$inferSelect;
