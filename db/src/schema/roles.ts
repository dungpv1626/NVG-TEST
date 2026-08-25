/**
 * Vai trò, quyền hạn, gán người dùng vào pháp nhân, và hạn mức phê duyệt.
 *
 * Nguồn: Backend Schema Mục 3.2. PRD NEN-02: "Phân quyền theo vai trò, phòng ban, đơn vị
 * và hạn mức phê duyệt (theo giá trị tiền, loại nghiệp vụ, mức rủi ro). Hạn mức phải
 * cấu hình được, KHÔNG hard-code."
 */

import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { approvalSubjectEnum, roleCodeEnum } from './_enums';
import { auditColumns } from './_audit';
import { money, primaryId, softDelete } from './_helpers';
import { optionalCompanyScoped } from './_scoped';
import { companies } from './companies';
import { users } from './users';

/** Danh mục vai trò — dùng chung toàn hệ thống, KHÔNG gắn pháp nhân. */
export const roles = pgTable('roles', {
  id: primaryId(),
  code: roleCodeEnum('code').notNull().unique(),
  label: varchar('label', { length: 64 }).notNull(),
  description: text('description'),

  /**
   * Vai trò xem được dữ liệu của MỌI pháp nhân (Ban Giám đốc, Quản trị hệ thống) —
   * mẫu RLS A cho phép vượt phạm vi pháp nhân (Backend Schema 3.3).
   */
  seesAllCompanies: boolean('sees_all_companies').notNull().default(false),

  /** Trang mặc định sau khi đăng nhập — Webapp Flow 2.3. */
  defaultRoute: varchar('default_route', { length: 128 }),

  ...auditColumns(),
});

/**
 * Quyền hạn chi tiết theo module và hành động, gắn với từng vai trò.
 * Dùng để lọc menu và ẩn nút — Webapp Flow 6.5: "không hiển thị rồi mới báo lỗi".
 */
export const permissions = pgTable(
  'permissions',
  {
    id: primaryId(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),

    /** Mã module: NEN, CRM, DA, TK, HD, TC, MH, KHO, KT, NS, BC, SX. */
    moduleCode: varchar('module_code', { length: 8 }).notNull(),

    canView: boolean('can_view').notNull().default(false),
    canCreate: boolean('can_create').notNull().default(false),
    canEdit: boolean('can_edit').notNull().default(false),
    canDelete: boolean('can_delete').notNull().default(false),
    canApprove: boolean('can_approve').notNull().default(false),

    ...auditColumns(),
  },
  (t) => [unique('permissions_role_module_unique').on(t.roleId, t.moduleCode)],
);

/**
 * Bảng trung gian: người dùng nào thuộc pháp nhân nào, với vai trò gì TẠI pháp nhân đó.
 *
 * Đây là bảng cốt lõi của phân quyền — mẫu RLS A đọc bảng này để xác định
 * người dùng thấy được dữ liệu của những pháp nhân nào (Backend Schema 3.3).
 */
export const userCompanies = pgTable(
  'user_companies',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),

    /** Pháp nhân mặc định hiển thị khi người dùng đăng nhập (Webapp Flow 2.2). */
    isPrimary: boolean('is_primary').notNull().default(false),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    unique('user_companies_unique').on(t.userId, t.companyId, t.roleId),
    index('user_companies_user_idx').on(t.userId),
    index('user_companies_company_idx').on(t.companyId),
  ],
);

/**
 * Hạn mức phê duyệt theo vai trò × loại nghiệp vụ × pháp nhân — PRD NEN-02.
 *
 * Mẫu RLS C đối chiếu bảng này để quyết định một hồ sơ có hiện trong Hộp thư Phê duyệt
 * của người dùng hay không (Backend Schema 3.3).
 *
 * ⚠️ Giá trị khởi tạo là GIẢ ĐỊNH (PRD 8.2) — NVG chỉnh qua Quản trị hệ thống khi
 * ban hành quy chế chính thức. KHÔNG hard-code ở bất kỳ đâu trong mã nguồn.
 */
export const approvalLimits = pgTable(
  'approval_limits',
  {
    id: primaryId(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),

    subject: approvalSubjectEnum('subject').notNull(),

    /**
     * Giới hạn trên, đơn vị ĐỒNG. `null` = KHÔNG giới hạn (ví dụ Tổng Giám đốc).
     * Nghiệp vụ không gắn tiền (nghỉ phép) cũng để `null`.
     */
    maxAmount: money('max_amount'),

    /** Thứ tự trong chuỗi duyệt nhiều cấp (1 = duyệt trước) — ví dụ KT-01. */
    step: integer('step').notNull().default(1),

    /**
     * Rỗng = áp dụng cho mọi pháp nhân. Có giá trị = hạn mức riêng của pháp nhân đó,
     * cho phép NVC và NVO đặt mức khác nhau khi cần.
     */
    ...optionalCompanyScoped(),

    isActive: boolean('is_active').notNull().default(true),

    ...auditColumns(),
  },
  (t) => [
    unique('approval_limits_unique').on(t.roleId, t.subject, t.step, t.companyId),
    index('approval_limits_subject_idx').on(t.subject),
  ],
);

export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type UserCompany = typeof userCompanies.$inferSelect;
export type ApprovalLimit = typeof approvalLimits.$inferSelect;
