/**
 * Module CRM — Khách hàng và Cơ hội kinh doanh (Backend Schema Mục 4.2).
 * Giai đoạn 1 — áp dụng ngay cho cả NVC, NVO, NVS.
 *
 * Ở bước này mới dựng `customers` để kiểm chứng bộ primitive giao diện;
 * `opportunities` và các bảng còn lại thuộc Phase 2A.
 */

import { date, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import {
  complaintSeverityEnum,
  opportunityClassificationEnum,
  opportunityStageEnum,
  statusGroupEnum,
} from './_enums';
import { money, primaryId, softDelete, versionColumns } from './_helpers';
import { companyScoped } from './_scoped';
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

/**
 * Cơ hội kinh doanh — pipeline (CRM-02).
 *
 * ⚠️ CÓ `company_id`: đây là bảng GIAO DỊCH, là ranh giới tách doanh thu/chi phí theo từng
 * pháp nhân (Backend Schema 2.2). Cùng một khách hàng có thể có cơ hội ở NVC, NVO và NVS —
 * mỗi cơ hội thuộc đúng một pháp nhân.
 *
 * Đây là ĐIỂM KHỞI ĐẦU DỮ LIỆU của một dự án/công trình (Backend Schema 2.1): gói thầu (DA),
 * dự án thiết kế (TK) và hợp đồng (HD) đều truy ngược về đây.
 */
export const opportunities = pgTable(
  'opportunities',
  {
    id: primaryId(),
    ...companyScoped(),

    code: varchar('code', { length: 40 }).notNull().unique(),

    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    name: text('name').notNull(),

    stage: opportunityStageEnum('stage').notNull().default('tiep_nhan'),

    /** Chỉ có ý nghĩa ở giai đoạn `xac_minh` (CRM-02). */
    classification: opportunityClassificationEnum('classification'),

    /**
     * Người chịu trách nhiệm chính. Mẫu RLS B khi hồ sơ còn ở trạng thái nháp;
     * chuyển sang Mẫu A sau khi bàn giao (Backend Schema 4.2, ghi chú).
     */
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),

    /** Giá trị cơ hội dự kiến, đơn vị đồng. */
    estimatedValue: money('estimated_value'),

    /** Loại công trình, quy mô, tiến độ mong muốn (CRM-01). */
    projectType: varchar('project_type', { length: 64 }),
    expectedStartDate: date('expected_start_date'),

    /** Thời hạn xử lý bước hiện tại — cột cố định trên màn hình Danh sách. */
    dueDate: date('due_date'),

    /** Lý do mất cơ hội — CRM-09 yêu cầu báo cáo "nguyên nhân mất cơ hội". */
    lostReason: text('lost_reason'),

    /**
     * Đã bàn giao sang DA/TK chưa (CRM-06). Sau khi bàn giao, cơ hội chuyển chế độ chỉ xem.
     */
    handedOverAt: timestamp('handed_over_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('opportunities_company_stage_idx').on(t.companyId, t.stage),
    index('opportunities_customer_idx').on(t.customerId),
    index('opportunities_owner_idx').on(t.ownerId),
  ],
);

/**
 * Lịch sử chuyển giai đoạn pipeline.
 *
 * Backend Schema 2.3: "thao tác thay đổi trạng thái/giá trị quan trọng ghi vào bảng lịch sử
 * riêng thay vì ghi đè trực tiếp" — phục vụ truy vết theo NEN-03 và báo cáo tỷ lệ chuyển đổi
 * theo từng bước của phễu bán hàng (CRM-09).
 */
export const opportunityStageHistory = pgTable(
  'opportunity_stage_history',
  {
    id: primaryId(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),

    fromStage: opportunityStageEnum('from_stage'),
    toStage: opportunityStageEnum('to_stage').notNull(),
    note: text('note'),

    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('opportunity_stage_history_idx').on(t.opportunityId, t.changedAt)],
);

/** Biên bản khảo sát khách hàng (CRM-03). */
export const siteSurveys = pgTable(
  'site_surveys',
  {
    id: primaryId(),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),

    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    surveyedAt: timestamp('surveyed_at', { withTimezone: true }),
    surveyedBy: uuid('surveyed_by').references(() => users.id, { onDelete: 'set null' }),

    /** Nội dung theo CRM-03: nhu cầu, người quyết định, ngân sách, tiến độ, điều kiện thương mại. */
    needs: text('needs'),
    decisionMaker: varchar('decision_maker', { length: 128 }),
    budgetNote: text('budget_note'),
    scheduleNote: text('schedule_note'),
    commercialTerms: text('commercial_terms'),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('site_surveys_opportunity_idx').on(t.opportunityId)],
);

/**
 * Báo giá gửi khách hàng, có phiên bản (CRM-04).
 *
 * PRD CRM-04: "báo giá phải qua phê duyệt nội bộ TRƯỚC KHI GỬI" — nên bảng này có luồng
 * duyệt và áp dụng mẫu RLS C (theo hạn mức phê duyệt).
 */
export const quotes = pgTable(
  'quotes',
  {
    id: primaryId(),
    ...companyScoped(),

    code: varchar('code', { length: 40 }).notNull().unique(),

    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),

    ...versionColumns(),

    totalValue: money('total_value'),

    /**
     * Mức giảm giá so với giá gốc, đơn vị đồng.
     * Khác 0 thì phải qua phê duyệt giá đặc biệt — mặc định Tổng Giám đốc (CRM-05).
     */
    discountAmount: money('discount_amount'),
    discountReason: text('discount_reason'),

    status: statusGroupEnum('status').notNull().default('draft'),

    /** Thời điểm gửi khách — chỉ được đặt SAU khi đã phê duyệt nội bộ (CRM-04). */
    sentToCustomerAt: timestamp('sent_to_customer_at', { withTimezone: true }),

    /** Phản hồi của khách hàng với phiên bản báo giá này (CRM-04). */
    customerResponse: text('customer_response'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),

    validUntil: date('valid_until'),
    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('quotes_opportunity_idx').on(t.opportunityId),
    index('quotes_status_idx').on(t.companyId, t.status),
  ],
);

/** Khiếu nại / phản ánh của khách hàng (CRM-08). */
export const complaints = pgTable(
  'complaints',
  {
    id: primaryId(),
    ...companyScoped(),

    code: varchar('code', { length: 40 }).notNull().unique(),

    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),

    /** Công trình liên quan, nếu có — liên kết bổ sung khi Module TC sẵn sàng. */
    relatedEntityType: varchar('related_entity_type', { length: 64 }),
    relatedEntityId: uuid('related_entity_id'),

    title: text('title').notNull(),
    content: text('content').notNull(),

    severity: complaintSeverityEnum('severity').notNull().default('trung_binh'),

    /** Người chủ trì xử lý (CRM-08). */
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),

    /** Hạn phản hồi (CRM-08). */
    responseDueDate: date('response_due_date'),

    status: statusGroupEnum('status').notNull().default('in_progress'),

    resolution: text('resolution'),
    /** Xác nhận của khách hàng sau khi xử lý (CRM-08). */
    customerConfirmedAt: timestamp('customer_confirmed_at', { withTimezone: true }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('complaints_customer_idx').on(t.customerId),
    index('complaints_assignee_idx').on(t.assigneeId),
  ],
);

export type Opportunity = typeof opportunities.$inferSelect;
export type OpportunityStageHistory = typeof opportunityStageHistory.$inferSelect;
export type SiteSurvey = typeof siteSurveys.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Complaint = typeof complaints.$inferSelect;
