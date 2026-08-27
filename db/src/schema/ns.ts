/**
 * Module NS — Hành chính và Nhân sự (Backend Schema Mục 4.10).
 * Giai đoạn 2 — khép luồng "ứng viên → nhân sự → chấm công đã chốt → Kế toán tính lương".
 *
 * Backend Schema 4.10 liệt kê 6 bảng; ở đây có 16. Không bảng nào là khái niệm MỚI — tất cả
 * đều là bảng dòng, bảng lịch sử hoặc bảng hồ sơ mà chính PRD NS-01 → NS-11 đòi hỏi, mà một
 * cột phẳng trên bảng đã có tên thì không giữ nổi:
 *
 *   hr_documents            ← NS-10 nhắc hạn 90/60/30/7 ngày cho "giấy tờ pháp lý, chứng chỉ,
 *                             giấy phép, bảo hiểm". Mỗi người có nhiều giấy, mỗi giấy một hạn.
 *   timesheet_periods       ← NS-04 tách rõ ba việc: khối ghi, trưởng đơn vị xác nhận, HCNS
 *                             chốt. Không có bảng KỲ thì không có chỗ nào giữ "đã chốt chưa".
 *   timesheet_entries       ← NS-04 chấm công theo NGÀY (quân số công trường, ca xưởng).
 *                             `timesheets` của tài liệu là bảng TỔNG HỢP, không phải bảng ngày.
 *   timesheet_adjustments   ← NS-04 nguyên văn "mọi điều chỉnh sau thời điểm chốt phải ghi rõ
 *                             lý do và người phê duyệt". Ghi đè lên số đã chốt là mất dấu.
 *   payroll_adjustments     ← NS-05 quản lý "thưởng – phạt" gắn dữ liệu chấm công đã xác nhận.
 *   asset_events            ← NS-08 nguyên văn "biên bản cấp phát/điều chuyển/sửa chữa/thu
 *                             hồi/thanh lý". Hai cột `assigned_at`/`returned_at` chỉ kể được
 *                             một lần cấp phát, không kể được cái máy đã qua tay ai.
 *   hr_checklists +         ← NS-03 checklist tiếp nhận, NS-11 checklist bàn giao nghỉ việc.
 *   hr_checklist_items        Backend Schema 4.10 đã đặc tả `POST /api/employees/:id/offboard`
 *                             trả về "checklist bàn giao" — phải có chỗ lưu checklist đó.
 *   recruitment_candidates  ← NS-02 sàng lọc CV → phỏng vấn → đánh giá → thư mời. Đây là các
 *                             cột Kanban của màn hình Tuyển dụng (Webapp Flow Mục 7).
 *   labor_workers           ← NS-09 hồ sơ lao động thời vụ: danh sách người, giấy tờ định
 *                             danh, chứng chỉ an toàn. Tổ đội đã có ở `subcontractors` (TC-06)
 *                             nhưng đó là hồ sơ KHOÁN VIỆC, không phải danh sách con người.
 *
 * ⚠️ CỐ Ý CHƯA làm ở bước này, không phải quên:
 *   - NS-06 công thức lương: PRD Mục 10 ghi quy chế lương phải do Kế toán – HCNS xác nhận
 *     trước khi cấu hình. Ở đây chỉ có HÌNH THỨC trả lương và số công đã chốt; không có bảng
 *     bảng lương, không có công thức, không có số tiền lương tính ra.
 *   - Kết nối máy chấm công: PRD Mục 9 ghi rõ hệ thống KHÔNG thay thế máy/phần mềm chấm công.
 *     `timesheet_entries.source` đánh dấu dòng nào nhập tay, dòng nào nhập từ máy — nhập khẩu
 *     tệp là việc của giao diện, không phải bảng mới.
 *
 * ⚠️ DỮ LIỆU NHẠY CẢM (PRD NS ranh giới + NEN-07): lương, căn cước, sức khỏe, kỷ luật.
 * Các cột đó KHÔNG cấp quyền đọc trực tiếp cho `authenticated` — đọc qua hàm có ghi
 * `sensitive_access_logs`. Xem mục 3 của migration RLS.
 *
 * ⚠️ KHÔNG lưu: tài khoản ngân hàng cá nhân, mật khẩu, nhận xét cảm tính chưa kiểm chứng
 * (CLAUDE.md 5.2). Bảng `employees` cố ý không có cột số tài khoản.
 */

import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { auditColumns } from './_audit';
import {
  assetConditionEnum,
  assetEventTypeEnum,
  attendanceKindEnum,
  candidateStageEnum,
  checklistItemGroupEnum,
  checklistKindEnum,
  employeeStatusEnum,
  employmentContractStatusEnum,
  employmentContractTypeEnum,
  hrDocumentTypeEnum,
  insuranceStatusEnum,
  laborWorkerStatusEnum,
  leaveRequestStatusEnum,
  leaveTypeEnum,
  payrollAdjustmentKindEnum,
  recruitmentPositionStatusEnum,
  salaryTypeEnum,
  timesheetPeriodStatusEnum,
  workBlockEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { constructionSites, subcontractors } from './tc';
import { users } from './users';

/* ========================================================================== *
 * Hồ sơ nhân sự — NS-01
 * ========================================================================== */

/**
 * Hồ sơ nhân sự điện tử duy nhất cho mỗi người (NS-01).
 *
 * Tách khỏi `users` một cách có chủ đích: `users` là TÀI KHOẢN ĐĂNG NHẬP, `employees` là
 * NGƯỜI LAO ĐỘNG. Hai tập không trùng nhau — công nhân công trường có hồ sơ nhân sự nhưng
 * không bao giờ đăng nhập, còn tài khoản quản trị hệ thống thì ngược lại. Backend Schema
 * 4.10 ghi `user_id` là "rỗng nếu chưa có tài khoản", đúng theo hướng này.
 *
 * `manager_user_id` là quan hệ quản lý trực tiếp — thứ mà Module KT đang thiếu: luồng duyệt
 * chi KT-01 tạm hiểu "trưởng đơn vị" là người có quyền phê duyệt trong module phát sinh
 * khoản chi (xem `rls_payment_step_actor`). Khi NVG xác nhận cây tổ chức, đổi điều kiện
 * trong hàm đó để đọc cột này — không phải sửa chỗ nào khác.
 */
export const employees = pgTable(
  'employees',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),

    fullName: varchar('full_name', { length: 128 }).notNull(),

    /** Tài khoản đăng nhập tương ứng, nếu người này có dùng phần mềm. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    /** Khối lao động — quyết định CÁCH chấm công (NS-04), không phải phòng ban. */
    block: workBlockEnum('block').notNull().default('van_phong'),
    department: varchar('department', { length: 128 }),
    position: varchar('position', { length: 128 }).notNull(),

    /** Quản lý trực tiếp — NS-01 "công ty – phòng ban – chức danh". */
    managerUserId: uuid('manager_user_id').references(() => users.id, { onDelete: 'set null' }),

    /** Công trường đang làm việc, với nhân sự khối công trường. */
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),

    status: employeeStatusEnum('status').notNull().default('thu_viec'),

    hireDate: date('hire_date'),
    /** Hạn kết thúc thử việc — NS-03 nhắc đánh giá TRƯỚC mốc này. */
    probationEndDate: date('probation_end_date'),
    /** Ngày nghỉ việc — do `offboard_employee` ghi, không sửa tay. */
    terminationDate: date('termination_date'),

    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 255 }),
    dateOfBirth: date('date_of_birth'),
    /** Địa chỉ liên hệ. Không phải dữ liệu hạn chế, nhưng cũng không hiện ở màn hình danh sách. */
    address: text('address'),

    /* --- Dưới đây là CỘT NHẠY CẢM: không cấp quyền đọc trực tiếp (NEN-07) --- */

    /** Số căn cước — PRD NS ranh giới xếp cùng nhóm với lương. */
    idNumber: varchar('id_number', { length: 32 }),
    idIssuedDate: date('id_issued_date'),
    idIssuedPlace: varchar('id_issued_place', { length: 128 }),

    /** Hình thức trả lương — NS-06. Không có công thức, chỉ có phân loại. */
    salaryType: salaryTypeEnum('salary_type').notNull().default('thang'),
    /** Mức lương thỏa thuận, đồng. */
    baseSalary: money('base_salary'),
    /** Tổng phụ cấp cố định, đồng. */
    allowance: money('allowance'),
    /** Mức lương đóng bảo hiểm, đồng — NS-07. */
    insuranceSalary: money('insurance_salary'),

    /** Ghi chú sức khỏe và kỷ luật — PRD NS ranh giới xếp vào nhóm hạn chế chặt nhất. */
    healthNotes: text('health_notes'),
    disciplineNotes: text('discipline_notes'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('employees_company_idx').on(t.companyId, t.status),
    index('employees_block_idx').on(t.companyId, t.block),
    index('employees_user_idx').on(t.userId),
    index('employees_site_idx').on(t.constructionSiteId),
    uniqueIndex('employees_code_unique')
      .on(t.code)
      .where(sql`deleted_at IS NULL AND code IS NOT NULL`),
  ],
);

/**
 * Hợp đồng lao động và bảo hiểm (NS-07).
 *
 * Nhiều dòng cho một người: thử việc → xác định thời hạn → không xác định thời hạn là ba
 * hợp đồng nối nhau, và NS-07 đòi "theo dõi thời hạn hiệu lực, nhắc gia hạn" cho từng cái.
 * Hợp đồng cũ không bị ghi đè — giữ nguyên để đối chiếu khi tranh chấp.
 *
 * `salary_amount` để trong bảng này chứ không chỉ ở `employees` vì đó là con số ĐÃ KÝ của
 * đúng hợp đồng đó; lương hiện tại trên hồ sơ có thể đã đổi sau phụ lục.
 */
export const employmentContracts = pgTable(
  'employment_contracts',
  {
    id: primaryId(),
    ...companyScoped(),

    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),

    code: recordCode(),

    type: employmentContractTypeEnum('type').notNull().default('thu_viec'),
    status: employmentContractStatusEnum('status').notNull().default('nhap'),

    startDate: date('start_date').notNull(),
    /** Rỗng với hợp đồng không xác định thời hạn — đó là ý nghĩa của loại đó. */
    endDate: date('end_date'),

    signedDate: date('signed_date'),
    signedBy: uuid('signed_by').references(() => users.id, { onDelete: 'set null' }),

    /** Mức lương ghi trên hợp đồng, đồng — CỘT NHẠY CẢM. */
    salaryAmount: money('salary_amount'),

    insuranceStatus: insuranceStatusEnum('insurance_status').notNull().default('chua_tham_gia'),
    /** Số sổ bảo hiểm xã hội — NS-07 theo dõi tăng – giảm. */
    insuranceNumber: varchar('insurance_number', { length: 32 }),
    insuranceFromDate: date('insurance_from_date'),
    insuranceToDate: date('insurance_to_date'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('employment_contracts_employee_idx').on(t.employeeId, t.status),
    index('employment_contracts_expiry_idx').on(t.endDate),
  ],
);

/**
 * Giấy tờ có thời hạn cần nhắc (NS-10, liên kết NEN-04).
 *
 * Gắn được vào NHÂN SỰ hoặc LAO ĐỘNG THỜI VỤ (NS-09 cũng đòi theo dõi giấy tờ định danh và
 * chứng chỉ an toàn) — đúng một trong hai, ràng buộc kiểm ở migration. Dùng chung một bảng
 * vì mốc nhắc, cách hiển thị và người đi đòi giấy đều giống hệt nhau.
 *
 * `document_number` của căn cước và giấy sức khỏe là CỘT NHẠY CẢM.
 */
export const hrDocuments = pgTable(
  'hr_documents',
  {
    id: primaryId(),
    ...companyScoped(),

    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'cascade' }),
    laborWorkerId: uuid('labor_worker_id'),

    type: hrDocumentTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }).notNull(),

    documentNumber: varchar('document_number', { length: 64 }),

    issuedDate: date('issued_date'),
    /** Rỗng = giấy không có hạn (bằng cấp). Không nhắc, và cũng không coi là quá hạn. */
    expiryDate: date('expiry_date'),

    /**
     * Nơi lưu BẢN GỐC — PRD NS ranh giới: hồ sơ giấy bắt buộc vẫn lưu bản gốc, phần mềm chỉ
     * theo dõi vị trí, tình trạng và bản scan.
     */
    originalLocation: varchar('original_location', { length: 128 }),

    /** Mốc đã nhắc gần nhất (90 | 60 | 30 | 7) — chống nhắc lại cùng một mốc (CGD 3.4). */
    lastRemindedStage: smallint('last_reminded_stage'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('hr_documents_employee_idx').on(t.employeeId, t.expiryDate),
    index('hr_documents_worker_idx').on(t.laborWorkerId),
    index('hr_documents_expiry_idx').on(t.companyId, t.expiryDate),
  ],
);

/* ========================================================================== *
 * Chấm công ba khối — NS-04, NS-05
 * ========================================================================== */

/**
 * Kỳ chấm công của MỘT khối trong MỘT pháp nhân (NS-04).
 *
 * Ba khối tách kỳ riêng vì ba người xác nhận khác nhau và ba cách ghi khác nhau; ghép chung
 * thì khối văn phòng xong ngày mùng 1 vẫn phải chờ khối công trường xong mới xác nhận được.
 * HCNS chốt cả ba khối cùng lúc qua `consolidate_timesheets` — đó là chỗ ba khối gặp nhau,
 * đúng câu "HCNS là đầu mối tổng hợp dữ liệu ba khối".
 */
export const timesheetPeriods = pgTable(
  'timesheet_periods',
  {
    id: primaryId(),
    ...companyScoped(),

    year: integer('year').notNull(),
    /** 1–12. Kỳ lương của NVG là tháng — khảo sát chưa nêu kỳ nào khác. */
    month: integer('month').notNull(),
    sourceType: workBlockEnum('source_type').notNull(),

    status: timesheetPeriodStatusEnum('status').notNull().default('dang_ghi'),

    /** Trưởng đơn vị xác nhận số liệu đúng — NS-04 "trưởng đơn vị chịu trách nhiệm xác nhận". */
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),

    /** HCNS chốt kỳ — sau mốc này mọi thay đổi phải đi qua `timesheet_adjustments`. */
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('timesheet_periods_unique').on(t.companyId, t.year, t.month, t.sourceType),
    index('timesheet_periods_status_idx').on(t.companyId, t.status),
  ],
);

/**
 * Một NGÀY công của một người (NS-04).
 *
 * Đây là nơi dữ liệu thô của ba khối gặp nhau ở cùng một hình dạng: văn phòng đổ từ máy
 * chấm công, công trường do chỉ huy trưởng ghi quân số, xưởng ghi ca kèm sản lượng. Ba
 * nguồn khác nhau nhưng câu hỏi Kế toán cần trả lời chỉ có một: ngày đó người này có công
 * không, mấy giờ, tăng ca bao nhiêu.
 */
export const timesheetEntries = pgTable(
  'timesheet_entries',
  {
    id: primaryId(),
    ...companyScoped(),

    timesheetPeriodId: uuid('timesheet_period_id')
      .notNull()
      .references(() => timesheetPeriods.id, { onDelete: 'cascade' }),

    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),

    workDate: date('work_date').notNull(),
    kind: attendanceKindEnum('kind').notNull().default('lam_viec'),

    /** Giờ làm trong ngày. Dùng `numeric` vì nửa công là chuyện thường ở công trường. */
    hours: numeric('hours', { precision: 5, scale: 2 }),
    overtimeHours: numeric('overtime_hours', { precision: 5, scale: 2 }),
    /** Sản lượng của ca — chỉ khối xưởng dùng (NS-04). */
    outputQuantity: numeric('output_quantity', { precision: 14, scale: 3 }),

    /** Tổ đội của lao động thuê ngoài, nếu ngày công này thuộc tổ đội (TC-06, NS-09). */
    subcontractorId: uuid('subcontractor_id').references(() => subcontractors.id, {
      onDelete: 'set null',
    }),
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),

    /** `may` = đổ từ máy chấm công, `tay` = người nhập. PRD Mục 9: không thay thế máy chấm công. */
    source: varchar('source', { length: 8 }).notNull().default('tay'),

    /** Đơn nghỉ phép đã duyệt tương ứng — NS-05 đòi khớp ngày nghỉ với đơn. */
    leaveRequestId: uuid('leave_request_id'),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('timesheet_entries_unique').on(t.timesheetPeriodId, t.employeeId, t.workDate),
    index('timesheet_entries_employee_idx').on(t.employeeId, t.workDate),
    index('timesheet_entries_site_idx').on(t.constructionSiteId, t.workDate),
  ],
);

/**
 * Bảng công ĐÃ CHỐT của một người trong một kỳ — chính là `timesheets` của Backend Schema 4.10.
 *
 * Sinh ra bởi `consolidate_timesheets`, không nhập tay. Đây là ranh giới bàn giao sang Kế
 * toán (NS-05 "chuyển dữ liệu đã chốt cho Kế toán tính lương mà không cần nhập lại"): sau
 * khi có dòng ở đây, Kế toán đọc thẳng, không mở lại bảng ngày.
 *
 * ⚠️ KHÔNG có cột tiền lương. Quy chế lương chưa ban hành (NS-06, PRD Mục 10) — bảng này
 * dừng đúng ở chỗ ĐẾM công. Thưởng/phạt có mặt vì NS-05 đã nêu đích danh và chúng là số
 * tiền do người quản lý quyết, không phải do công thức tính ra.
 */
export const timesheets = pgTable(
  'timesheets',
  {
    id: primaryId(),
    ...companyScoped(),

    timesheetPeriodId: uuid('timesheet_period_id')
      .notNull()
      .references(() => timesheetPeriods.id, { onDelete: 'restrict' }),

    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),

    year: integer('year').notNull(),
    month: integer('month').notNull(),
    sourceType: workBlockEnum('source_type').notNull(),

    workdays: numeric('workdays', { precision: 6, scale: 2 }).notNull().default('0'),
    workedHours: numeric('worked_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    overtimeHours: numeric('overtime_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    leaveDays: integer('leave_days').notNull().default(0),
    unpaidAbsenceDays: integer('unpaid_absence_days').notNull().default(0),
    holidayDays: integer('holiday_days').notNull().default(0),
    businessTripDays: integer('business_trip_days').notNull().default(0),
    outputQuantity: numeric('output_quantity', { precision: 14, scale: 3 }).notNull().default('0'),

    /** Tổng thưởng và tổng phạt đã duyệt trong kỳ, đồng — NS-05. */
    bonusAmount: money('bonus_amount')
      .notNull()
      .default(sql`0`),
    penaltyAmount: money('penalty_amount')
      .notNull()
      .default(sql`0`),

    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),

    /** Kế toán đã nhận số liệu này chưa — đường bàn giao NS-05 → KT. */
    transferredAt: timestamp('transferred_at', { withTimezone: true }),
    transferredBy: uuid('transferred_by').references(() => users.id, { onDelete: 'set null' }),

    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('timesheets_unique').on(t.employeeId, t.year, t.month),
    index('timesheets_period_idx').on(t.timesheetPeriodId),
    index('timesheets_transfer_idx').on(t.companyId, t.transferredAt),
  ],
);

/**
 * Điều chỉnh bảng công SAU khi đã chốt — NS-04 nguyên văn: "mọi điều chỉnh sau thời điểm
 * chốt phải ghi rõ lý do và người phê duyệt".
 *
 * Một dòng cho mỗi lần sửa, giữ cả giá trị cũ lẫn giá trị mới. Ghi đè thẳng lên `timesheets`
 * mà không để lại dòng nào ở đây là cách chắc chắn nhất để không ai chứng minh được số công
 * tháng trước từng là bao nhiêu.
 */
export const timesheetAdjustments = pgTable(
  'timesheet_adjustments',
  {
    id: primaryId(),
    timesheetId: uuid('timesheet_id')
      .notNull()
      .references(() => timesheets.id, { onDelete: 'cascade' }),

    /** Tên cột được sửa — `workdays`, `overtime_hours`, `leave_days`… */
    field: varchar('field', { length: 32 }).notNull(),
    oldValue: numeric('old_value', { precision: 14, scale: 3 }),
    newValue: numeric('new_value', { precision: 14, scale: 3 }),

    reason: text('reason').notNull(),

    /** Người phê duyệt điều chỉnh — NS-04 đòi đích danh, không phải "hệ thống". */
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('timesheet_adjustments_idx').on(t.timesheetId, t.approvedAt)],
);

/**
 * Đơn nghỉ phép (NS-05).
 *
 * Đi qua Hộp thư Phê duyệt dùng chung (`approval_subject = 'leave_request'`), không tự dựng
 * màn hình duyệt riêng — Webapp Flow 4.6 chỉ cho phép MỘT mẫu phê duyệt trên toàn hệ thống.
 */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: primaryId(),
    ...companyScoped(),

    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),

    code: recordCode(),

    type: leaveTypeEnum('type').notNull().default('phep_nam'),
    status: leaveRequestStatusEnum('status').notNull().default('nhap'),

    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    /** Số ngày nghỉ ghi trên đơn — người nhập tự khai nửa ngày được. */
    dayCount: numeric('day_count', { precision: 5, scale: 2 }).notNull().default('1'),

    reason: text('reason').notNull(),

    /** Người bàn giao công việc trong thời gian nghỉ. */
    coveringUserId: uuid('covering_user_id').references(() => users.id, { onDelete: 'set null' }),

    approvalId: uuid('approval_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('leave_requests_employee_idx').on(t.employeeId, t.fromDate),
    index('leave_requests_status_idx').on(t.companyId, t.status),
  ],
);

/**
 * Thưởng – phạt gắn kỳ lương (NS-05).
 *
 * ⚠️ Số tiền do NGƯỜI quản lý quyết định và ghi lý do, phần mềm không tự tính và không tự
 * đề xuất mức — PRD NS ranh giới cấm phần mềm tự quyết khen thưởng, kỷ luật.
 */
export const payrollAdjustments = pgTable(
  'payroll_adjustments',
  {
    id: primaryId(),
    ...companyScoped(),

    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),

    year: integer('year').notNull(),
    month: integer('month').notNull(),

    kind: payrollAdjustmentKindEnum('kind').notNull(),
    amount: money('amount')
      .notNull()
      .default(sql`0`),

    reason: text('reason').notNull(),

    /** Người quyết định — đích danh, để truy trách nhiệm (PRD NS ranh giới). */
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('payroll_adjustments_period_idx').on(t.employeeId, t.year, t.month)],
);

/* ========================================================================== *
 * Tuyển dụng — NS-02
 * ========================================================================== */

/**
 * Yêu cầu tuyển dụng một vị trí (NS-02 nửa đầu: "trưởng đơn vị gửi yêu cầu → phê duyệt →
 * đăng tuyển").
 *
 * Backend Schema 4.10 xếp bảng này vào mẫu RLS A (theo pháp nhân) chứ không phải B — hợp
 * lý: nhu cầu nhân sự của công ty là thông tin nội bộ chung, không phải hồ sơ riêng của ai.
 */
export const recruitmentPositions = pgTable(
  'recruitment_positions',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode(),

    title: varchar('title', { length: 255 }).notNull(),
    department: varchar('department', { length: 128 }),
    block: workBlockEnum('block').notNull().default('van_phong'),

    status: recruitmentPositionStatusEnum('status').notNull().default('nhap'),

    /** Số lượng cần tuyển và số đã nhận việc — NS-02 "vị trí, số lượng, thời điểm". */
    headcount: integer('headcount').notNull().default(1),
    hiredCount: integer('hired_count').notNull().default(0),

    /** Thời điểm cần người. */
    neededByDate: date('needed_by_date'),

    requirements: text('requirements'),

    /** Người đề nghị — NS-02 "trưởng đơn vị gửi yêu cầu". */
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),

    approvalId: uuid('approval_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('recruitment_positions_company_idx').on(t.companyId, t.status)],
);

/**
 * Ứng viên của một vị trí — các cột Kanban của màn hình Tuyển dụng (Webapp Flow Mục 7).
 *
 * ⚠️ `evaluation` là nơi ghi kết luận phỏng vấn của NGƯỜI phỏng vấn. Phần mềm KHÔNG chấm
 * điểm, không xếp hạng, không gợi ý chọn ai — PRD NS ranh giới cấm tự động quyết định tuyển
 * dụng. Vì cùng lý do, không lưu nhận xét cảm tính chưa kiểm chứng (CLAUDE.md 5.2).
 *
 * ⚠️ KHÔNG lưu căn cước ứng viên: người chưa vào làm thì hệ thống chưa có cơ sở giữ giấy tờ
 * định danh của họ. Khi nhận việc, hồ sơ chuyển thành `employees` và giấy tờ lưu ở đó.
 */
export const recruitmentCandidates = pgTable(
  'recruitment_candidates',
  {
    id: primaryId(),
    ...companyScoped(),

    recruitmentPositionId: uuid('recruitment_position_id')
      .notNull()
      .references(() => recruitmentPositions.id, { onDelete: 'cascade' }),

    fullName: varchar('full_name', { length: 128 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 255 }),

    stage: candidateStageEnum('stage').notNull().default('moi'),

    appliedDate: date('applied_date'),
    interviewAt: timestamp('interview_at', { withTimezone: true }),

    /** Kết luận phỏng vấn do người phỏng vấn viết. */
    evaluation: text('evaluation'),
    /** Lý do không tuyển — bắt buộc khi chuyển sang `tu_choi`, để phản hồi ứng viên tử tế. */
    rejectReason: text('reject_reason'),

    /** Hồ sơ nhân sự sinh ra khi ứng viên nhận việc — đường nối NS-02 → NS-01. */
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('recruitment_candidates_position_idx').on(t.recruitmentPositionId, t.stage),
    index('recruitment_candidates_company_idx').on(t.companyId, t.stage),
  ],
);

/* ========================================================================== *
 * Tài sản, công cụ dụng cụ cấp phát — NS-08
 * ========================================================================== */

/**
 * Tài sản và công cụ dụng cụ (NS-08).
 *
 * KHÁC `scaffolding_assets` của Module KHO: giàn giáo là HÀNG HÓA cho thuê ra ngoài, đếm
 * theo lô và sinh doanh thu (KHO-06, SX-03). Bảng này là tài sản NỘI BỘ cấp cho nhân sự —
 * laptop, máy khoan, chìa khóa, đồng phục — và câu hỏi của nó là "ai đang giữ, thu hồi
 * chưa", không phải "còn bao nhiêu cái để cho thuê".
 *
 * `current_holder_id` là ảnh chụp hiện tại cho dễ tra; lịch sử đầy đủ nằm ở `asset_events`.
 */
export const assets = pgTable(
  'assets',
  {
    id: primaryId(),
    ...companyScoped(),

    /** Mã tài sản — NS-08 liệt kê đầu tiên. */
    code: recordCode(),
    name: varchar('name', { length: 255 }).notNull(),
    serialNumber: varchar('serial_number', { length: 64 }),

    category: varchar('category', { length: 64 }),

    /** Nguyên giá, đồng — NS-08 "giá trị". */
    value: money('value'),
    purchaseDate: date('purchase_date'),

    condition: assetConditionEnum('condition').notNull().default('tot'),

    /** Người đang giữ. Rỗng = đang ở kho hành chính, chưa cấp cho ai. */
    currentHolderId: uuid('current_holder_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    /** Vị trí sử dụng — NS-08. Văn phòng, công trường nào, xưởng. */
    location: varchar('location', { length: 128 }),
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('assets_company_idx').on(t.companyId, t.condition),
    index('assets_holder_idx').on(t.currentHolderId),
    uniqueIndex('assets_code_unique')
      .on(t.code)
      .where(sql`deleted_at IS NULL AND code IS NOT NULL`),
  ],
);

/**
 * Biên bản cấp phát / điều chuyển / sửa chữa / thu hồi / thanh lý (NS-08, nguyên văn).
 *
 * Mỗi biên bản là một dòng, không ghi đè (Backend Schema 2.3). `assets.current_holder_id` và
 * `assets.condition` chỉ đổi qua hàm `record_asset_event` — sửa tay hai cột đó thì lịch sử
 * và hiện trạng lệch nhau ngay lần đầu.
 */
export const assetEvents = pgTable(
  'asset_events',
  {
    id: primaryId(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),

    type: assetEventTypeEnum('type').notNull(),
    eventDate: date('event_date').notNull(),

    /** Người giữ trước và người giữ sau — điều chuyển cần cả hai. */
    fromEmployeeId: uuid('from_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    toEmployeeId: uuid('to_employee_id').references(() => employees.id, { onDelete: 'set null' }),

    /** Tình trạng ghi nhận tại thời điểm lập biên bản. */
    condition: assetConditionEnum('condition'),

    /** Chi phí sửa chữa hoặc giá trị thu hồi khi thanh lý, đồng. */
    amount: money('amount'),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [index('asset_events_asset_idx').on(t.assetId, t.eventDate)],
);

/* ========================================================================== *
 * Tiếp nhận và nghỉ việc — NS-03, NS-11
 * ========================================================================== */

/**
 * Một đợt tiếp nhận (NS-03) hoặc một đợt bàn giao nghỉ việc (NS-11).
 *
 * Cùng một bảng cho hai chiều vì cấu trúc giống hệt: một danh sách việc phải xong trước một
 * ngày, có người chịu trách nhiệm từng việc. Khác nhau ở chiều đi của tài sản và quyền truy
 * cập — cấp ra hay thu về — và đó là `kind`, không phải hai bảng.
 */
export const hrChecklists = pgTable(
  'hr_checklists',
  {
    id: primaryId(),
    ...companyScoped(),

    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),

    kind: checklistKindEnum('kind').notNull(),

    /** Ngày nhận việc (tiếp nhận) hoặc ngày nghỉ việc (bàn giao). */
    effectiveDate: date('effective_date').notNull(),

    completedAt: timestamp('completed_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [
    index('hr_checklists_employee_idx').on(t.employeeId, t.kind),
    uniqueIndex('hr_checklists_unique').on(t.employeeId, t.kind),
  ],
);

/**
 * Từng việc trong checklist.
 *
 * Dòng tài sản được SINH ĐỘNG theo đúng những tài sản người đó đang giữ (NS-08: "tự động
 * tạo danh sách tài sản/chìa khóa/tài khoản cần bàn giao"), nên có `asset_id` trỏ thẳng tới
 * món phải trả — người làm thủ tục không phải mở màn hình khác để biết thu hồi cái gì.
 */
export const hrChecklistItems = pgTable(
  'hr_checklist_items',
  {
    id: primaryId(),
    hrChecklistId: uuid('hr_checklist_id')
      .notNull()
      .references(() => hrChecklists.id, { onDelete: 'cascade' }),

    itemGroup: checklistItemGroupEnum('item_group').notNull(),
    title: varchar('title', { length: 255 }).notNull(),

    /** Tài sản cụ thể phải thu hồi, với dòng sinh từ danh sách đang giữ. */
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),

    /** Người chịu trách nhiệm làm việc này. */
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),

    doneAt: timestamp('done_at', { withTimezone: true }),
    doneBy: uuid('done_by').references(() => users.id, { onDelete: 'set null' }),

    notes: text('notes'),

    ...auditColumns(),
  },
  (t) => [index('hr_checklist_items_idx').on(t.hrChecklistId, t.itemGroup)],
);

/* ========================================================================== *
 * Lao động thời vụ, tổ đội thuê ngoài — NS-09
 * ========================================================================== */

/**
 * Danh sách con người của một tổ đội thuê ngoài (NS-09).
 *
 * `subcontractors` (TC-06) là hồ sơ KHOÁN VIỆC: phạm vi công việc, đơn giá, đánh giá chất
 * lượng. Bảng này trả lời câu hỏi khác — hôm nay ai đang có mặt trên công trường, người đó
 * đã nộp căn cước và chứng chỉ an toàn chưa. Không có bảng này thì 50–200 lao động thời vụ
 * (PRD Mục 1.2) chỉ tồn tại dưới dạng một con số quân số.
 *
 * ⚠️ Giấy tờ của họ lưu ở `hr_documents` qua `labor_worker_id`, cùng cơ chế nhắc hạn NS-10.
 */
export const laborWorkers = pgTable(
  'labor_workers',
  {
    id: primaryId(),
    ...companyScoped(),

    /** Tổ đội quản lý người này. Rỗng = lao động thời vụ NVG thuê trực tiếp. */
    subcontractorId: uuid('subcontractor_id').references(() => subcontractors.id, {
      onDelete: 'set null',
    }),
    constructionSiteId: uuid('construction_site_id').references(() => constructionSites.id, {
      onDelete: 'cascade',
    }),

    fullName: varchar('full_name', { length: 128 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    /** Nghề: thợ hồ, thợ sắt, phụ hồ, thợ hàn… */
    trade: varchar('trade', { length: 64 }),

    status: laborWorkerStatusEnum('status').notNull().default('dang_lam'),

    startDate: date('start_date'),
    endDate: date('end_date'),

    /** Đã ký cam kết nội quy công trường chưa — NS-09 nêu đích danh. */
    safetyCommitmentSigned: boolean('safety_commitment_signed').notNull().default(false),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('labor_workers_site_idx').on(t.constructionSiteId, t.status),
    index('labor_workers_team_idx').on(t.subcontractorId),
  ],
);
