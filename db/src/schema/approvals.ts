/**
 * Hồ sơ chờ phê duyệt — bảng DÙNG CHUNG cho MỌI module.
 *
 * Vì sao một bảng chung thay vì `price_approvals` / `contract_approvals` riêng như Backend
 * Schema 3.3 và 4.3 liệt kê:
 *
 * Webapp Flow 4.6 (tài liệu ưu tiên CAO HƠN Backend Schema) quy định Hộp thư Phê duyệt là
 * "MỘT MẪU DUY NHẤT dù nội dung phê duyệt thuộc module nào" — người duyệt thấy mọi việc
 * cần xử lý ở một nơi. Nếu mỗi module có bảng duyệt riêng thì màn hình đó phải hợp nhất
 * 9 truy vấn có cấu trúc khác nhau, và mỗi module mới lại phải sửa lại Hộp thư.
 *
 * Các bảng Backend Schema đặt tên riêng được hiện thực hoá thành DÒNG trong bảng này:
 *   price_approvals      → subject = 'estimate_price' (DA-07) hoặc 'quote_price' (CRM-04)
 *   contract_approvals   → subject = 'contract' (HD-05)
 * Truy vấn tương đương vẫn có, chỉ khác chỗ lọc thêm một cột.
 *
 * ⚠️ Đây là chỗ lệch có chủ đích so với Backend Schema — cần báo lại để cập nhật tài liệu.
 *
 * RLS: Mẫu C (Backend Schema 3.3) — chỉ hiện với người đề nghị và người có hạn mức đủ duyệt.
 */

import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns } from './_audit';
import { approvalDecisionEnum, approvalSubjectEnum, statusGroupEnum } from './_enums';
import { money, primaryId, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { users } from './users';

export const approvals = pgTable(
  'approvals',
  {
    id: primaryId(),
    ...companyScoped(),

    /** Loại nghiệp vụ — quyết định hạn mức nào áp dụng (PRD NEN-02). */
    subject: approvalSubjectEnum('subject').notNull(),

    /**
     * Hồ sơ nguồn. Cố ý KHÔNG dùng khoá ngoại: một bảng duyệt phục vụ nhiều bảng nguồn ở
     * nhiều module. Toàn vẹn do hàm nghiệp vụ tạo dòng bảo đảm, không do ràng buộc CSDL.
     */
    entityType: varchar('entity_type', { length: 64 }).notNull(),
    entityId: uuid('entity_id').notNull(),

    /** Mã hồ sơ nguồn, chép lại để Hộp thư hiển thị được mà không phải nối bảng. */
    entityCode: varchar('entity_code', { length: 40 }),

    /** Tiêu đề hiển thị trong Hộp thư — đủ để nhận ra hồ sơ. */
    title: text('title').notNull(),

    /**
     * Giá trị đối chiếu hạn mức, đơn vị đồng. `null` với nghiệp vụ không gắn tiền
     * (nghỉ phép) — khi đó hạn mức không ràng buộc, xem `rls_can_approve`.
     */
    amount: money('amount'),

    /** Lý do đề nghị — với giảm giá đặc biệt đây là căn cứ bắt buộc (CRM-05). */
    reason: text('reason'),

    /** Bước hiện tại trong chuỗi duyệt nhiều cấp (KT-01). Giai đoạn này luôn là 1. */
    currentStep: integer('current_step').notNull().default(1),

    status: statusGroupEnum('status').notNull().default('pending_approval'),

    /** Kết quả cuối cùng. `null` khi còn chờ. */
    finalDecision: approvalDecisionEnum('final_decision'),

    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),

    /** Hạn xử lý — cột cố định "thời hạn" của mẫu Danh sách (Webapp Flow 4.2). */
    dueDate: timestamp('due_date', { withTimezone: true }),

    decidedAt: timestamp('decided_at', { withTimezone: true }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('approvals_pending_idx').on(t.companyId, t.status, t.requestedAt),
    index('approvals_entity_idx').on(t.entityType, t.entityId),
    /**
     * Một hồ sơ chỉ được có ĐÚNG MỘT đề nghị đang chờ tại một thời điểm — nếu không,
     * hai người duyệt hai đề nghị khác nhau của cùng một báo giá sẽ ra hai kết quả.
     */
    uniqueIndex('approvals_one_pending_per_entity')
      .on(t.entityType, t.entityId)
      .where(sql`${t.status} = 'pending_approval' AND ${t.deletedAt} IS NULL`),
  ],
);

/**
 * Lịch sử phê duyệt — mỗi lượt quyết định một dòng, KHÔNG ghi đè.
 *
 * Backend Schema 2.3: "thao tác thay đổi trạng thái/giá trị quan trọng (phê duyệt giá,
 * thay đổi ngân sách) ghi vào bảng lịch sử riêng (ví dụ price_approval_history) thay vì
 * ghi đè trực tiếp — phục vụ truy vết theo NEN-03".
 *
 * PRD CRM-05 yêu cầu đúng thứ này cho giá đặc biệt: "ghi lại lịch sử phê duyệt giá đặc biệt".
 */
export const approvalDecisions = pgTable(
  'approval_decisions',
  {
    id: primaryId(),
    approvalId: uuid('approval_id')
      .notNull()
      .references(() => approvals.id, { onDelete: 'cascade' }),

    step: integer('step').notNull().default(1),
    decision: approvalDecisionEnum('decision').notNull(),

    /** Căn cứ phê duyệt hoặc lý do từ chối (DA-07: "căn cứ phê duyệt"). */
    note: text('note'),

    /** Hạn mức của người duyệt tại thời điểm quyết định — quy chế đổi về sau vẫn đọc đúng. */
    approverLimitAtTime: money('approver_limit_at_time'),
    approverUnlimited: boolean('approver_unlimited').notNull().default(false),

    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('approval_decisions_idx').on(t.approvalId, t.decidedAt)],
);

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type ApprovalDecision = typeof approvalDecisions.$inferSelect;
