/**
 * Module TC — Thi công và Ngân sách công trình.
 *
 * Nguồn: PRD v1.4 TC-01 → TC-20, Backend Schema v1.1 4.6, Webapp Flow v1.1 3.4.
 *
 * ⚠️ LƯỢC ĐỒ NÀY MỚI PHỦ PHẦN LÕI CỦA PHẠM VI CŨ (TC-01 → TC-08 của PRD v1.3).
 *
 * Phiếu khảo sát Chỉ huy – Giám sát công trường về ngày 02/09/2026 và PRD v1.4 đã THAY TOÀN BỘ
 * tám yêu cầu cũ bằng hai mươi yêu cầu mới. Sáu bảng dưới đây (`construction_sites`,
 * `site_logs`, `acceptance_records`, `subcontractors`, `warranties`, `warranty_claims`) vẫn
 * đúng và giữ nguyên, nhưng Backend Schema v1.1 Mục 4.6 liệt kê khoảng hai mươi tám bảng cho
 * module này — phần còn lại nằm ở các đợt sau, xem `BUILD_PLAN.md`.
 *
 * Bảy yêu cầu HOÀN TOÀN MỚI, chưa có bảng nào ở đây: bản vẽ đang hiệu lực và xác nhận trước khi
 * giao việc (TC-03), phiếu giao việc (TC-04), theo dõi trạng thái đề nghị kèm cảnh báo quá hạn
 * (TC-10 — ưu tiên số một của công trường), yêu cầu làm rõ kỹ thuật (TC-15), quản lý thay đổi
 * và phát sinh (TC-16), an toàn lao động và sự cố (TC-18), giàn giáo mượn tại công trường
 * (TC-19).
 *
 * Ba con số SUY LUẬN của module này đã chuyển thành tham số cấu hình được (migration 0112):
 * cửa sổ sửa nhật ký, ngưỡng cảnh báo ngân sách, thang đánh giá tổ đội. Khảo sát KHÔNG xác
 * nhận con số nào trong ba con số đó — đừng coi chúng là quy chế của NVG.
 */

import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
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
import { auditColumns } from './_audit';
import {
  acceptanceStatusEnum,
  acceptanceTypeEnum,
  siteLogTypeEnum,
  siteStageEnum,
  subcontractFormEnum,
  subcontractorStatusEnum,
  warrantyClaimStatusEnum,
  warrantyStatusEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { biddingProjects } from './da';
import { contracts } from './hd';
import { designProjects } from './tk';
import { users } from './users';

/**
 * Công trình thi công (TC-01) — trung tâm chi phí thực tế của toàn hệ thống
 * (Backend Schema 2.1).
 *
 * Ba cột liên kết ngược, không chép dữ liệu (PRD Mục 2.3):
 *  - `contract_id` — hợp đồng đã ký sinh ra công trình. Đây là đường đi tới giá trị, điều
 *    khoản thanh toán và khách hàng; giữ lại một bản sao ở đây thì hai nơi lệch nhau ngay
 *    lần đầu có phát sinh.
 *  - `bidding_project_id` / `design_project_id` — hồ sơ sinh ra NGÂN SÁCH. Đúng một trong
 *    hai có giá trị, hoặc cả hai rỗng với công trình nội bộ chưa qua đấu thầu/thiết kế.
 *
 * Vì sao không suy ngân sách qua hợp đồng cho gọn: câu hỏi TC-05 phải trả lời là "công
 * trình NÀY tiêu bao nhiêu so với phần ngân sách của NÓ", nên liên kết phải nằm ở đây chứ
 * không phải suy ra qua hai nhịp.
 *
 * Lược đồ CHO PHÉP nhiều công trình trên một hợp đồng (hợp đồng chia nhiều hạng mục, nhiều
 * địa điểm là chuyện có thật), nhưng `open_site_from_contract` hiện chỉ mở một và từ chối
 * lần thứ hai — xem lý do ở migration 0035.
 */
export const constructionSites = pgTable(
  'construction_sites',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode().notNull().unique(),
    name: text('name').notNull(),

    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),

    /** ĐÚNG MỘT trong hai cột nguồn ngân sách có giá trị — ràng buộc CHECK ở migration. */
    biddingProjectId: uuid('bidding_project_id').references(() => biddingProjects.id, {
      onDelete: 'set null',
    }),
    designProjectId: uuid('design_project_id').references(() => designProjects.id, {
      onDelete: 'set null',
    }),

    stage: siteStageEnum('stage').notNull().default('chuan_bi'),

    /**
     * Chỉ huy trưởng. TC-06 nói rõ "mỗi công việc thuê ngoài vẫn phải có một người NỘI BỘ
     * chịu trách nhiệm chính" — người đó mặc định là người ở đây.
     */
    responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    siteAddress: text('site_address'),

    plannedStartDate: date('planned_start_date'),
    /** Mốc hoàn thành dự kiến — cột "thời hạn" cố định của mẫu Danh sách (Webapp Flow 4.2). */
    plannedEndDate: date('planned_end_date'),
    actualStartDate: date('actual_start_date'),
    actualEndDate: date('actual_end_date'),

    /**
     * Tiến độ tổng, đơn vị phần trăm.
     * ⚠️ SUY LUẬN MỘT PHẦN. Khảo sát (02/09/2026) đã cho biết công trường đo theo **hạng
     * mục/đầu việc**, xác nhận bằng **khối lượng hoàn thành đã nghiệm thu** (chưa nghiệm thu
     * thì chưa tính). Còn thiếu hai thứ (câu hỏi #10): mức chi tiết của kế hoạch tiến độ và
     * AI là người cập nhật %. Vì vậy đây vẫn là con số do chỉ huy trưởng tự đánh giá và ghi
     * lại, KHÔNG tự tính từ nhật ký — tự tính khi chưa chốt đủ là tạo ra một con số không ai
     * bảo vệ được.
     */
    progressPercent: numeric('progress_percent', { precision: 5, scale: 2 }),

    /** Thời điểm bàn giao cho chủ đầu tư — mốc bắt đầu tính bảo hành (TC-07). */
    handedOverAt: timestamp('handed_over_at', { withTimezone: true }),

    /** Nguyên nhân tạm dừng — bắt buộc khi chuyển sang `tam_dung`. */
    pauseReason: text('pause_reason'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('construction_sites_company_stage_idx').on(t.companyId, t.stage),
    index('construction_sites_contract_idx').on(t.contractId),
    index('construction_sites_bidding_idx').on(t.biddingProjectId),
    index('construction_sites_design_idx').on(t.designProjectId),
    index('construction_sites_responsible_idx').on(t.responsibleUserId),
  ],
);

/**
 * Nhật ký công trường (TC-02) và nhật ký sự việc (TC-08).
 *
 * Một bảng cho cả hai vì chúng là cùng một hành vi — ghi lại điều đã xảy ra tại hiện
 * trường, kèm thời điểm và người ghi. Tách hai bảng chỉ khiến người dùng phải chọn "cái
 * này là nhật ký hay là sự việc" trước khi được viết, mà lúc đứng ngoài công trường thì
 * chưa chắc đã phân biệt được.
 *
 * `log_date` tách khỏi `created_at` có chủ đích: TC-02 yêu cầu ghi "theo ngày/tuần", và ở
 * công trường việc hôm nay thường được nhập vào cuối ngày hoặc sáng hôm sau. Trộn hai khái
 * niệm thì nhật ký ngày mưa lại nằm ở ngày nắng.
 */
export const siteLogs = pgTable(
  'site_logs',
  {
    id: primaryId(),
    ...companyScoped(),

    constructionSiteId: uuid('construction_site_id')
      .notNull()
      .references(() => constructionSites.id, { onDelete: 'cascade' }),

    /** Ngày việc THẬT SỰ xảy ra, không phải ngày nhập liệu. */
    logDate: date('log_date').notNull(),
    logType: siteLogTypeEnum('log_type').notNull().default('tien_do'),

    content: text('content').notNull(),

    /**
     * Quân số có mặt trong ngày — TC-02 ("khối lượng thực hiện") và NS-04 (chấm công khối
     * công trường do chỉ huy ghi quân số). Ghi ngay tại đây để Module NS không phải bắt
     * người ta nhập lại lần thứ hai (PRD Mục 2.3).
     */
    workforceCount: integer('workforce_count'),

    /**
     * Thời tiết. ⚠️ SUY LUẬN — không có trong PRD, nhưng là căn cứ chuẩn khi tranh chấp
     * chậm tiến độ do thời tiết (TC-08). Để rỗng được, không bắt buộc.
     */
    weather: varchar('weather', { length: 64 }),

    /**
     * Ảnh hiện trường — đường dẫn trong Supabase Storage.
     *
     * KHÔNG đi qua `documents`/`document_versions`: cơ chế đó phục vụ tài liệu có PHIÊN BẢN
     * và có bản đang hiệu lực (NEN-05) — bản vẽ, dự toán, hợp đồng. Ảnh chụp lúc 9 giờ sáng
     * không có "phiên bản mới hơn"; nhét vào đó chỉ tạo ra hàng nghìn tài liệu một phiên bản
     * làm loãng kho hồ sơ.
     */
    photoUrls: text('photo_urls').array(),

    loggedBy: uuid('logged_by').references(() => users.id, { onDelete: 'set null' }),

    /**
     * Dấu thời gian hiện trường — Backend Schema v1.1 Mục 1.4 (migration 0116).
     *
     * `clientCreatedAt` là thời điểm NGHIỆP VỤ: người dùng bấm lúc nào, không phải máy chủ
     * nhận lúc nào. Nhật ký ghi lúc 16 giờ ngoài công trường mất sóng, đồng bộ lúc 21 giờ, vẫn
     * là nhật ký của 16 giờ. Rỗng = nhập trực tiếp khi có mạng; nơi đọc dùng
     * `coalesce(client_created_at, created_at)`.
     */
    clientCreatedAt: timestamp('client_created_at', { withTimezone: true }),
    /** Máy chủ tự đặt (trigger `stamp_field_sync`), KHÔNG nhận từ trình duyệt. */
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    /** Mã khử trùng do thiết bị sinh — cùng khuôn `stock_movements` (0038), không sửa được. */
    clientGeneratedId: varchar('client_generated_id', { length: 64 }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('site_logs_site_date_idx').on(t.constructionSiteId, t.logDate),
    index('site_logs_type_idx').on(t.constructionSiteId, t.logType),
    uniqueIndex('site_logs_client_id')
      .on(t.clientGeneratedId)
      .where(sql`${t.clientGeneratedId} IS NOT NULL`),
  ],
);

/**
 * Biên bản nghiệm thu (TC-04).
 *
 * `acceptance_type` là cột quan trọng nhất của bảng: TC-04 nói "biên bản nghiệm thu là căn
 * cứ để Kế toán thông báo thu tiền theo hợp đồng" — nhưng chỉ đúng với nghiệm thu VỚI CHỦ
 * ĐẦU TƯ. Nghiệm thu nội bộ và nghiệm thu với tổ đội là việc khác hẳn: một cái để kiểm soát
 * chất lượng, một cái để trả tiền RA cho thầu phụ. Gộp ba loại làm một thì Kế toán sẽ đòi
 * khách tiền của một khối lượng khách chưa từng ký.
 */
export const acceptanceRecords = pgTable(
  'acceptance_records',
  {
    id: primaryId(),
    ...companyScoped(),

    constructionSiteId: uuid('construction_site_id')
      .notNull()
      .references(() => constructionSites.id, { onDelete: 'cascade' }),

    code: recordCode(),

    acceptanceType: acceptanceTypeEnum('acceptance_type').notNull(),
    status: acceptanceStatusEnum('status').notNull().default('nhap'),

    /** Giai đoạn hoặc hạng mục được nghiệm thu (TC-04) — ví dụ "Phần móng", "Đợt 2". */
    stageName: text('stage_name').notNull(),
    /** Mô tả khối lượng đã nghiệm thu. */
    scope: text('scope'),

    /** Giá trị khối lượng được nghiệm thu, đơn vị đồng — căn cứ số tiền Kế toán thu/chi. */
    value: money('value'),

    /** Tổ đội được nghiệm thu — chỉ có nghĩa với `acceptance_type = 'thau_phu'`. */
    subcontractorId: uuid('subcontractor_id').references((): AnyPgColumn => subcontractors.id, {
      onDelete: 'set null',
    }),

    acceptedDate: date('accepted_date'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    /** Người của NVG ký biên bản. */
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    /** Người ký phía đối tác (chủ đầu tư hoặc tổ đội) — thường chưa có tài khoản trong hệ thống. */
    counterpartSignedBy: varchar('counterpart_signed_by', { length: 128 }),

    /** Tồn tại cần khắc phục ghi ngay trên biên bản — chỗ hay bị bỏ quên nhất khi bàn giao. */
    outstandingIssues: text('outstanding_issues'),

    /** Nguyên nhân hủy — bắt buộc khi chuyển sang `huy`. */
    cancelReason: text('cancel_reason'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('acceptance_records_site_idx').on(t.constructionSiteId, t.acceptanceType),
    index('acceptance_records_subcontractor_idx').on(t.subcontractorId),
    uniqueIndex('acceptance_records_code')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL AND ${t.deletedAt} IS NULL`),
  ],
);

/**
 * Tổ đội / nhà thầu phụ / nhân lực thuê ngoài (TC-06).
 *
 * Gắn vào CÔNG TRÌNH chứ không phải danh mục dùng chung toàn hệ thống, đúng theo Backend
 * Schema 4.6 (`construction_site_id`). Cùng một tổ đội làm ở ba công trình thì có ba dòng —
 * chấp nhận lặp tên, đổi lại mỗi dòng giữ đúng khối lượng, đơn giá khoán và đánh giá CỦA
 * CÔNG TRÌNH ĐÓ. Một danh mục tổ đội dùng chung (như `suppliers` của MH-03) chỉ nên dựng
 * khi có khảo sát thật cho biết công trường có nhu cầu tra cứu xuyên công trình.
 */
export const subcontractors = pgTable(
  'subcontractors',
  {
    id: primaryId(),
    ...companyScoped(),

    constructionSiteId: uuid('construction_site_id')
      .notNull()
      .references(() => constructionSites.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    /** Người đại diện / tổ trưởng và số điện thoại — thứ chỉ huy trưởng cần nhất tại hiện trường. */
    contactName: varchar('contact_name', { length: 128 }),
    contactPhone: varchar('contact_phone', { length: 32 }),

    scopeOfWork: text('scope_of_work').notNull(),

    form: subcontractFormEnum('form').notNull().default('don_gia_khoan'),
    status: subcontractorStatusEnum('status').notNull().default('dang_thuc_hien'),

    /** Giá trị giao khoán, đơn vị đồng. */
    contractValue: money('contract_value'),
    /**
     * Hợp đồng thầu phụ trong Module HD, nếu có ký hợp đồng chính thức
     * (loại `khoan_thau_phu` — hợp đồng NVG chi tiền ra).
     */
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),

    /**
     * Người nội bộ chịu trách nhiệm — TC-06 nguyên văn: "mỗi công việc thuê ngoài vẫn phải
     * có một người nội bộ chịu trách nhiệm chính". Rỗng nghĩa là chỉ huy trưởng của công
     * trình chịu, không phải là không ai chịu.
     */
    responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    startDate: date('start_date'),
    endDate: date('end_date'),

    /**
     * Đánh giá chất lượng gần nhất, thang 1–5.
     * ⚠️ SUY LUẬN về thang điểm. TC-06 yêu cầu "lịch sử đánh giá chất lượng" — lịch sử đầy
     * đủ theo từng đợt chờ khảo sát; hiện giữ đánh giá gần nhất kèm ghi chú, các lần đánh
     * giá trước vẫn truy được qua `audit_logs` (NEN-07).
     */
    qualityRating: integer('quality_rating'),
    qualityNotes: text('quality_notes'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('subcontractors_site_idx').on(t.constructionSiteId, t.status),
    index('subcontractors_contract_idx').on(t.contractId),
  ],
);

/**
 * Bảo hành sau bàn giao (TC-07) — một dòng cho mỗi HẠNG MỤC.
 *
 * Từng hạng mục một vì thời hạn khác nhau thật: chống thấm 5 năm, thiết bị điện 12 tháng,
 * sơn 1 năm. Một mốc bảo hành duy nhất cho cả công trình là cách chắc chắn nhất để cãi nhau
 * với chủ đầu tư về việc hạng mục này còn hạn hay không.
 */
export const warranties = pgTable(
  'warranties',
  {
    id: primaryId(),
    ...companyScoped(),

    constructionSiteId: uuid('construction_site_id')
      .notNull()
      .references(() => constructionSites.id, { onDelete: 'cascade' }),

    /** Hạng mục được bảo hành — ví dụ "Chống thấm mái", "Hệ thống điện nhẹ". */
    item: text('item').notNull(),

    status: warrantyStatusEnum('status').notNull().default('con_han'),

    startDate: date('start_date'),
    /** Ngày hết hạn bảo hành của hạng mục — nguồn của nhắc hạn NEN-04. */
    warrantyUntil: date('warranty_until'),
    /** Thời hạn theo hợp đồng, tính bằng tháng — giữ lại để đối chiếu khi tính sai ngày. */
    durationMonths: integer('duration_months'),

    /** Đơn vị chịu trách nhiệm bảo hành: NVG hay tổ đội đã thi công hạng mục đó. */
    subcontractorId: uuid('subcontractor_id').references(() => subcontractors.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('warranties_site_idx').on(t.constructionSiteId, t.status),
    index('warranties_until_idx').on(t.warrantyUntil),
  ],
);

/**
 * Phản ánh bảo hành và cách xử lý (TC-07).
 *
 * TC-07 liệt kê bốn thứ phải ghi lại: "tiếp nhận phản ánh, phân công xử lý, ghi nhận nguyên
 * nhân, chi phí và kết quả" — bốn thứ đó thuộc về LẦN PHẢN ÁNH, không thuộc về hạng mục.
 * Một hạng mục bảo hành 5 năm có thể bị phản ánh nhiều lần với nguyên nhân khác nhau; nhồi
 * vào cùng dòng với hạng mục thì lần sau ghi đè lần trước, và `cost` mất luôn ý nghĩa.
 */
export const warrantyClaims = pgTable(
  'warranty_claims',
  {
    id: primaryId(),
    ...companyScoped(),

    warrantyId: uuid('warranty_id')
      .notNull()
      .references(() => warranties.id, { onDelete: 'cascade' }),

    status: warrantyClaimStatusEnum('status').notNull().default('tiep_nhan'),

    /** Nội dung khách phản ánh, ghi theo lời khách. */
    description: text('description').notNull(),
    reportedDate: date('reported_date').notNull(),
    /** Người phản ánh phía khách hàng. */
    reportedBy: varchar('reported_by', { length: 128 }),

    /** Người được phân công xử lý (TC-07). */
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),

    /** Nguyên nhân sau khi kiểm tra — điền khi đã xác định, không đoán lúc tiếp nhận. */
    rootCause: text('root_cause'),
    /** Kết quả xử lý. */
    resolution: text('resolution'),
    /** Chi phí khắc phục, đơn vị đồng. */
    cost: money('cost'),

    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('warranty_claims_warranty_idx').on(t.warrantyId, t.status),
    index('warranty_claims_assigned_idx').on(t.assignedUserId),
  ],
);

export type ConstructionSite = typeof constructionSites.$inferSelect;
export type SiteLog = typeof siteLogs.$inferSelect;
export type AcceptanceRecord = typeof acceptanceRecords.$inferSelect;
export type Subcontractor = typeof subcontractors.$inferSelect;
export type Warranty = typeof warranties.$inferSelect;
export type WarrantyClaim = typeof warrantyClaims.$inferSelect;
