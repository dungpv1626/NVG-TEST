/**
 * Hạ tầng cấu hình dùng chung — NEN-12 và mẫu phân quyền E.
 *
 * Nguồn: PRD v1.4 NEN-12, Backend Schema v1.1 Mục 3.3 và 4.1.
 *
 * Ba bảng ở đây không thuộc module nghiệp vụ nào: chúng là thứ mọi module ĐỌC. Migration
 * tương ứng: 0111 (tham số + lịch sử), 0113 (thời hạn cam kết), 0115 (phân công công trình).
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import { primaryId, softDelete } from './_helpers';
import { optionalCompanyScoped } from './_scoped';
import { constructionSites } from './tc';
import { roles } from './roles';
import { users } from './users';

/** Phạm vi áp dụng của một tham số. Giá trị hẹp hơn THAY THẾ giá trị rộng hơn, không cộng dồn. */
export const parameterScopeEnum = pgEnum('parameter_scope', [
  'global',
  'company',
  'product',
  'role',
]);

/**
 * Tham số hệ thống — NEN-12.
 *
 * KHÔNG thay `approval_limits` và `aging_buckets`: hai bảng đó có lược đồ riêng đúng hình dạng
 * dữ liệu của chúng và đã có kiểm thử. Bảng này dành cho tham số MỚI của NEN-12 và cho những
 * con số trước đây nằm cứng trong mã nguồn mà khảo sát không xác nhận (xem migration 0112).
 */
export const systemParameters = pgTable(
  'system_parameters',
  {
    id: primaryId(),
    paramKey: varchar('param_key', { length: 64 }).notNull(),
    scopeType: parameterScopeEnum('scope_type').notNull().default('global'),

    /**
     * Rỗng khi `scopeType = 'global'`. Cố ý KHÔNG có khoá ngoại: cột trỏ tới `companies`,
     * sản phẩm hoặc `roles` tuỳ `scopeType`, không có bảng đích cố định để tham chiếu.
     */
    scopeId: uuid('scope_id'),

    /**
     * Rỗng = CHƯA CÓ DỮ LIỆU THẬT. Màn hình phải hiện "Chưa đủ dữ liệu", KHÔNG hiện 0 và
     * KHÔNG điền số ước lượng (PRD v1.4 Mục 2.3).
     */
    value: jsonb('value'),
    unit: varchar('unit', { length: 32 }),
    label: text('label').notNull(),
    description: text('description'),

    /** Tham số chứa số liệu nhạy cảm — chỉ vai trò xem được giá vốn mới đọc (mẫu D). */
    isSensitive: boolean('is_sensitive').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    effectiveFrom: date('effective_from').notNull().defaultNow(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),

    ...auditColumns(),
  },
  (t) => [
    index('system_parameters_key_idx')
      .on(t.paramKey)
      .where(sql`is_active`),
    // `nullsNotDistinct` — cùng bài học 0109: mặc định Postgres coi hai NULL là KHÁC nhau,
    // nên dòng phạm vi toàn hệ thống (`scope_id` rỗng) sẽ không bao giờ đụng nhau và bộ nạp
    // chạy lại bao nhiêu lần thì nhân bản bấy nhiêu lần.
    unique('system_parameters_key_scope').on(t.paramKey, t.scopeType, t.scopeId).nullsNotDistinct(),
  ],
);

/** Lịch sử thay đổi tham số — ghi bằng trigger, không ai sửa/xoá được từ trình duyệt. */
export const systemParameterHistory = pgTable(
  'system_parameter_history',
  {
    id: primaryId(),
    parameterId: uuid('parameter_id')
      .notNull()
      .references(() => systemParameters.id, { onDelete: 'cascade' }),
    paramKey: varchar('param_key', { length: 64 }).notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    effectiveFrom: date('effective_from'),
    reason: text('reason'),
    changedBy: uuid('changed_by').references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('system_parameter_history_param_idx').on(t.parameterId, t.changedAt)],
);

/**
 * Thời hạn cam kết xử lý — NEN-12, TC-10, MH-02.
 *
 * CỐ Ý để RỖNG cho tới khi Ban Giám đốc ban hành: PRD v1.4 Mục 10 ghi "không có tham số này
 * thì cơ chế cảnh báo quá hạn không có căn cứ". Nạp sẵn một con số sẽ tạo ra đồng hồ đếm ngược
 * trông như đã được cam kết, và người duyệt bị gắn nhãn quá hạn theo thời hạn chưa ai ký.
 */
export const slaDefinitions = pgTable(
  'sla_definitions',
  {
    id: primaryId(),

    /**
     * Với hồ sơ phê duyệt, giá trị là tên của `approval_subject`. Cố ý để `varchar` chứ không
     * dùng enum: TC-10 và MH-02 sẽ thêm loại đề nghị KHÔNG đi qua luồng phê duyệt theo hạn mức.
     */
    requestType: varchar('request_type', { length: 48 }).notNull(),

    /** Rỗng = áp dụng cho mọi vai trò tiếp nhận. */
    responsibleRoleId: uuid('responsible_role_id').references(() => roles.id, {
      onDelete: 'cascade',
    }),
    ...optionalCompanyScoped(),

    targetHours: integer('target_hours').notNull(),
    label: text('label').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),

    ...auditColumns(),
  },
  (t) => [
    index('sla_definitions_type_idx')
      .on(t.requestType)
      .where(sql`is_active`),
    unique('sla_definitions_scope')
      .on(t.requestType, t.responsibleRoleId, t.companyId)
      .nullsNotDistinct(),
  ],
);

/**
 * Phân công người dùng vào công trình — cơ sở của mẫu phân quyền E (Backend Schema v1.1 3.3).
 *
 * Chỉ giới hạn vai trò có `roles.site_scoped`. Vai trò toàn đơn vị (Trưởng phòng Thi công) và
 * vai trò xem mọi pháp nhân không cần dòng nào ở đây. Người được ghi là chịu trách nhiệm chính
 * của công trình (`construction_sites.responsible_user_id`) được coi như đã phân công — không
 * bắt nhập lại một dữ kiện đã có (PRD Mục 2.3).
 */
export const userSiteAssignments = pgTable(
  'user_site_assignments',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    constructionSiteId: uuid('construction_site_id')
      .notNull()
      .references(() => constructionSites.id, { onDelete: 'cascade' }),

    /** Vai trò tại công trình (chỉ huy trưởng, kỹ thuật hiện trường, an toàn…) — MÔ TẢ, không phân quyền. */
    siteRole: varchar('site_role', { length: 48 }),
    assignedFrom: date('assigned_from').notNull().defaultNow(),
    assignedTo: date('assigned_to'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('user_site_assignments_unique')
      .on(t.userId, t.constructionSiteId)
      .where(sql`deleted_at IS NULL`),
    index('user_site_assignments_site_idx')
      .on(t.constructionSiteId)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type SystemParameter = typeof systemParameters.$inferSelect;
export type SlaDefinition = typeof slaDefinitions.$inferSelect;
export type UserSiteAssignment = typeof userSiteAssignments.$inferSelect;
