/**
 * Module TK — Thiết kế (NVO, hỗ trợ NVC khi cần).
 *
 * Nguồn: PRD TK-01 → TK-09, Backend Schema 4.4, Webapp Flow 3.3.
 *
 * Vướng mắc khảo sát mà module này phải giải quyết (Webapp Flow 3.3): "không chắc file đang
 * dùng có phải bản mới nhất" — đặc biệt nghiêm trọng với hồ sơ đa bộ môn. Cách giải: MỌI hồ
 * sơ ở đây (đầu bài, phương án, bản vẽ từng bộ môn) đều có phiên bản, và ràng buộc "chỉ một
 * bản đang hiệu lực" do CSDL giữ bằng unique index có điều kiện — không để ứng dụng tự giữ,
 * vì hai người phát hành cùng lúc sẽ tạo ra hai bản cùng hiệu lực.
 *
 * ⚠️ HAI CHỖ LỆCH BACKEND SCHEMA 4.4 — cố ý, cần Haan xác nhận để cập nhật tài liệu:
 *
 *  1. BSD ghi `design_projects.brief` là một trường. Ở đây tách thành bảng `design_briefs`
 *     có phiên bản, vì PRD TK-01 yêu cầu "một đầu bài ĐANG HIỆU LỰC duy nhất" — chữ "đang
 *     hiệu lực" chỉ có nghĩa khi tồn tại bản không còn hiệu lực, tức là phải có lịch sử.
 *     Ghi đè một trường thì mất căn cứ trả lời "khách đổi yêu cầu lúc nào, bản nào".
 *
 *  2. BSD ghi `design_versions.file_url`. Ở đây trỏ sang kho hồ sơ dùng chung
 *     (`documents` / `document_versions`, NEN-05, NEN-06) thay vì giữ đường dẫn riêng —
 *     giống cách `bid_documents` của Module DA đã làm. Giữ `file_url` riêng ở đây nghĩa là
 *     bản vẽ có hai nơi quản lý phiên bản, đúng thứ PRD Mục 2.3 cấm.
 *
 * 📐 TK-10 → TK-17 (AI Preliminary Design Engine) ở `db/src/schema/design.ts` — bảng artifact
 * và đồ thị phụ thuộc, cơ chế khác hẳn hệ tài liệu. Bảng ở đây được DÙNG LẠI, không thay thế.
 * ⏸ TK-09 (thư viện thiết kế) lùi sang Phase 4, đã đánh dấu "lùi được" trong BUILD_PLAN.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
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
  changeRequestOriginEnum,
  changeRequestStatusEnum,
  designDisciplineEnum,
  designReviewDecisionEnum,
  designReviewerTypeEnum,
  designStageEnum,
  disciplineTaskStatusEnum,
} from './_enums';
import { money, primaryId, recordCode, softDelete, versionColumns } from './_helpers';
import { companyScoped } from './_scoped';
import { customers, opportunities } from './crm';
import { documents, documentVersions } from './documents';
import { users } from './users';

/**
 * Dự án thiết kế (TK-01).
 *
 * ĐIỂM NỐI với CRM: `opportunity_id` là đường truy ngược về cơ hội gốc (Backend Schema 2.1) —
 * cùng vai trò như ở `bidding_projects`. Để rỗng được vì NVO cũng nhận việc thiết kế đến
 * thẳng từ khách quen, không qua pipeline kinh doanh.
 */
export const designProjects = pgTable(
  'design_projects',
  {
    id: primaryId(),
    ...companyScoped(),

    code: recordCode().notNull().unique(),
    name: text('name').notNull(),

    opportunityId: uuid('opportunity_id').references(() => opportunities.id, {
      onDelete: 'set null',
    }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),

    stage: designStageEnum('stage').notNull().default('dau_bai'),

    /** Người chịu trách nhiệm chính — thuật ngữ chuẩn, Content Guidelines 4.4. */
    responsibleUserId: uuid('responsible_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    siteAddress: text('site_address'),

    /** Hạn bàn giao hồ sơ thi công — cột "thời hạn" cố định của mẫu Danh sách (AFD 4.2). */
    handoverDeadline: date('handover_deadline'),

    /** Thời điểm đã bàn giao hồ sơ cho Ban công trường (TK-08). */
    handedOverAt: timestamp('handed_over_at', { withTimezone: true }),

    /**
     * Công trình đã tạo khi bàn giao (TK-08, Backend Schema 4.4).
     * CHƯA có khoá ngoại: bảng `construction_sites` thuộc Module TC (Giai đoạn 2). Ràng buộc
     * sẽ bổ sung trong migration của TC — khai sẵn cột để không phải sửa hàm bàn giao lần nữa.
     */
    constructionSiteId: uuid('construction_site_id'),

    /** Nguyên nhân dừng thiết kế — bắt buộc khi chuyển sang `dung_thiet_ke`. */
    stoppedReason: text('stopped_reason'),

    /**
     * Dự án NHÁP do khách vãng lai trên website tạo, chưa phải dự án chính thức
     * (`doc/design/02-architecture.md` mục 2.8b).
     *
     * Khi Kinh doanh tiếp nhận thì CHUYỂN ĐỔI tại chỗ — đặt `converted_at`/`converted_by`,
     * hạ cờ này — chứ không tạo dự án mới rồi chép sang: chép sang là mất toàn bộ artifact
     * và đồ thị phụ thuộc đã sinh trong lúc khách tự thử.
     *
     * ⚠️ Luồng khách vãng lai THẬT (đăng nhập ẩn danh, giới hạn số lần) thuộc Mốc 8 và chưa
     * mở. Hiện chưa có `anon` access nào trong hệ thống — xem câu hỏi Q-4.
     */
    isDraft: boolean('is_draft').notNull().default(false),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    convertedBy: uuid('converted_by').references(() => users.id, { onDelete: 'set null' }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('design_projects_company_stage_idx').on(t.companyId, t.stage),
    index('design_projects_opportunity_idx').on(t.opportunityId),
    index('design_projects_responsible_idx').on(t.responsibleUserId),
  ],
);

/**
 * Đầu bài thiết kế, có phiên bản (TK-01).
 *
 * Nội dung lấy nguyên văn TK-01: "nhiệm vụ thiết kế, nhu cầu công năng, ngân sách, phong
 * cách, hiện trạng khu đất, hồ sơ pháp lý".
 *
 * Vì sao mỗi mục một cột chứ không gộp một ô văn bản: đây là bộ câu hỏi CỐ ĐỊNH cho mọi dự
 * án nhà ở, gộp lại thì người sau không biết đã hỏi thiếu mục nào — mà thiếu đúng một mục
 * (ví dụ ngân sách) là làm lại cả phương án.
 */
export const designBriefs = pgTable(
  'design_briefs',
  {
    id: primaryId(),
    ...companyScoped(),

    designProjectId: uuid('design_project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    ...versionColumns(),

    /** Nhiệm vụ thiết kế — phạm vi công việc NVO nhận làm. */
    designTask: text('design_task'),
    /** Nhu cầu công năng: số phòng, số tầng, thành viên gia đình, thói quen sử dụng. */
    functionalNeeds: text('functional_needs'),
    /** Ngân sách dự kiến của chủ nhà, đơn vị đồng. */
    budgetAmount: money('budget_amount'),
    budgetNote: text('budget_note'),
    /** Phong cách kiến trúc mong muốn. */
    styleNote: text('style_note'),
    /** Hiện trạng khu đất: kích thước, hướng, cốt nền, công trình lân cận, hạ tầng. */
    siteCondition: text('site_condition'),
    /** Hồ sơ pháp lý: sổ đỏ, chỉ giới, giấy phép xây dựng, quy định của địa phương. */
    legalDocuments: text('legal_documents'),

    /**
     * Vì sao ra bản mới — NEN-05 bắt buộc lưu "nguyên nhân thay đổi", không chỉ nội dung mới.
     * Rỗng ở bản đầu tiên: bản đầu không thay đổi gì cả.
     */
    changeReason: text('change_reason'),

    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),

    // --- Đầu bài có cấu trúc — Lớp 1 của engine thiết kế (TK-10, migration 0101) --------

    /**
     * Toàn bộ đầu bài theo `contracts/design-brief.schema.json`. Nguồn của artifact
     * `design_brief`; đã xác nhận thì bất biến (trigger `design_briefs_freeze_after_confirm`).
     */
    structured: jsonb('structured').notNull().default({}),

    /**
     * Cột SINH từ `structured` — bộ nhớ đệm để lọc và hiển thị.
     *
     * KHÔNG phải chốt chặn: con số này do trình duyệt tính rồi ghi vào payload. Chốt chặn
     * Lớp 2 đọc điểm trong artifact, do Worker tự tính lại bằng `@nvg/shared/design`.
     */
    completenessScore: numeric('completeness_score', { precision: 4, scale: 3 }).generatedAlwaysAs(
      sql`CASE WHEN jsonb_typeof(structured -> 'completeness_score') = 'number' THEN (structured ->> 'completeness_score')::numeric END`,
    ),

    missingFields: jsonb('missing_fields').generatedAlwaysAs(
      sql`CASE WHEN jsonb_typeof(structured -> 'missing_fields') = 'array' THEN structured -> 'missing_fields' ELSE '[]'::jsonb END`,
    ),

    /**
     * Artifact `design_brief` đúc khi xác nhận — truy ngược được hai chiều.
     *
     * Khoá ngoại tới `design_artifact` khai trong migration `0101`, **cố ý không khai lại ở
     * đây**: `design.ts` đã import `designProjects` từ tệp này, nên tham chiếu ngược lại sẽ
     * tạo vòng import giữa hai mô-đun. Ràng buộc thật nằm ở CSDL, chỗ nó không vòng qua được.
     */
    artifactId: text('artifact_id'),

    /**
     * Biên bản khảo sát (TK-02) đã dùng để điền kích thước lô. Rỗng = nhập tay.
     *
     * Đầu bài giữ số của CHÍNH NÓ chứ không đọc thẳng từ khảo sát: đầu bài thường nhập
     * trước lúc đi đo, và khách trên website thì không có khảo sát nào. Cột này để màn hình
     * đối chiếu được và nói ra khi hai bên lệch — không có nó thì lệch vẫn lệch, chỉ là
     * không ai biết.
     */
    siteSourceSurveyId: uuid('site_source_survey_id').references(() => designSurveys.id, {
      onDelete: 'set null',
    }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('design_briefs_project_idx').on(t.designProjectId, t.version),
    /** Hàng chờ: đầu bài đang hiệu lực chưa đủ thông tin để chạy Lớp 2. */
    index('design_briefs_completeness_idx')
      .on(t.designProjectId, t.completenessScore)
      .where(sql`${t.isCurrentVersion} AND ${t.deletedAt} IS NULL`),
    /** Một dự án chỉ MỘT đầu bài đang hiệu lực tại một thời điểm (TK-01, NEN-05). */
    uniqueIndex('design_briefs_one_current_per_project')
      .on(t.designProjectId)
      .where(sql`${t.isCurrentVersion} AND ${t.deletedAt} IS NULL`),
    uniqueIndex('design_briefs_project_version').on(t.designProjectId, t.version),
  ],
);

/**
 * Khảo sát hiện trạng khu đất (TK-02): "đo đạc, ảnh, ghi chú nhu cầu sử dụng".
 *
 * KHÁC `site_surveys` của CRM-03: bảng kia là khảo sát THƯƠNG MẠI (nhu cầu, người quyết
 * định, ngân sách, điều kiện thương mại) do Kinh doanh làm trước khi báo giá. Bảng này là
 * khảo sát KỸ THUẬT do Thiết kế làm để dựng phương án. Gộp chung một bảng thì hai bộ phận
 * ghi đè nội dung của nhau.
 *
 * Ảnh khảo sát KHÔNG có cột riêng — đính kèm qua kho hồ sơ dùng chung (NEN-06) với
 * `related_entity_type = 'design_surveys'`.
 */
export const designSurveys = pgTable(
  'design_surveys',
  {
    id: primaryId(),
    ...companyScoped(),

    designProjectId: uuid('design_project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    surveyedAt: timestamp('surveyed_at', { withTimezone: true }),
    surveyedBy: uuid('surveyed_by').references(() => users.id, { onDelete: 'set null' }),

    /** Kích thước khu đất theo đo đạc thực tế, mét. */
    landWidth: numeric('land_width', { precision: 10, scale: 2 }),
    landDepth: numeric('land_depth', { precision: 10, scale: 2 }),
    landArea: numeric('land_area', { precision: 12, scale: 2 }),

    /** Hướng nhà (đông, tây nam…) — ảnh hưởng trực tiếp tới giải pháp che nắng. */
    orientation: varchar('orientation', { length: 32 }),

    /** Số liệu đo đạc chi tiết: cốt nền, chênh cao, mốc giới, sai khác với sổ. */
    measurementNotes: text('measurement_notes'),
    /** Công trình lân cận, đường vào, hạ tầng điện nước, cây xanh, thoát nước. */
    surroundingNotes: text('surrounding_notes'),
    /** Ghi chú nhu cầu sử dụng ghi nhận tại chỗ (TK-02). */
    usageNotes: text('usage_notes'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [index('design_surveys_project_idx').on(t.designProjectId, t.surveyedAt)],
);

/**
 * Ảnh và video hiện trạng đính kèm biên bản khảo sát (TK-02).
 *
 * Tệp nằm ở bucket riêng `design-site-photos` theo đường dẫn
 * `<design_project_id>/<design_survey_id>/<uuid>.<đuôi>` — thư mục đầu chính là khoá phân
 * quyền của policy trên `storage.objects` (migration 0118). Cột hiện trường theo BSD 1.4.
 */
export const designSurveyPhotos = pgTable(
  'design_survey_photos',
  {
    id: primaryId(),
    ...companyScoped(),

    designProjectId: uuid('design_project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),
    designSurveyId: uuid('design_survey_id')
      .notNull()
      .references(() => designSurveys.id, { onDelete: 'cascade' }),

    storagePath: text('storage_path').notNull().unique(),
    fileName: text('file_name').notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    caption: text('caption'),
    /** Thời điểm chụp theo thiết bị (EXIF) nếu đọc được — mốc nghiệp vụ của chứng cứ. */
    takenAt: timestamp('taken_at', { withTimezone: true }),
    clientCreatedAt: timestamp('client_created_at', { withTimezone: true }),
    clientGeneratedId: uuid('client_generated_id').unique(),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('design_survey_photos_survey_idx').on(t.designSurveyId, t.createdAt),
    index('design_survey_photos_project_idx').on(t.designProjectId),
  ],
);

/**
 * Phiên bản phương án / bản vẽ theo bộ môn (TK-03, TK-05).
 *
 * `document_version_id` trỏ tới ĐÚNG phiên bản tệp trong kho hồ sơ, không trỏ tới tài liệu —
 * cùng lý do như `boq_items.drawing_version_id` của Module DA: nhờ đó câu hỏi "bản vẽ này là
 * tệp nào" trả lời được chính xác, và Module DA/TC bóc khối lượng theo phiên bản nào thì
 * cảnh báo "bản vẽ nguồn đã đổi" chỉ còn là so sánh `is_current_version`.
 *
 * `published_at` rỗng = bản nháp đang làm; có giá trị = đã phát hành và đã thông báo các bên
 * (TK-05). Bản nháp KHÔNG chiếm chỗ "đang hiệu lực".
 */
export const designVersions = pgTable(
  'design_versions',
  {
    id: primaryId(),
    ...companyScoped(),

    designProjectId: uuid('design_project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    discipline: designDisciplineEnum('discipline').notNull(),

    ...versionColumns(),

    code: recordCode(),
    title: text('title').notNull(),

    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    documentVersionId: uuid('document_version_id').references(() => documentVersions.id, {
      onDelete: 'set null',
    }),

    /** Nguyên nhân ra bản điều chỉnh — NEN-05 bắt buộc, rỗng ở bản đầu tiên. */
    changeReason: text('change_reason'),

    /** Yêu cầu thay đổi đã dẫn tới bản này (TK-06) — đường truy ngược "vì sao phải vẽ lại". */
    changeRequestId: uuid('change_request_id'),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),

    /** Bản này đã được khách hàng duyệt chưa (TK-03) — do hàm ghi, không sửa tay. */
    customerApprovedAt: timestamp('customer_approved_at', { withTimezone: true }),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('design_versions_project_idx').on(t.designProjectId, t.discipline, t.version),
    /**
     * Chỉ MỘT bản ĐÃ PHÁT HÀNH đang hiệu lực cho mỗi bộ môn tại một thời điểm (TK-05).
     * Bản nháp (`published_at IS NULL`) không tính — nếu tính thì không ai soạn được bản
     * điều chỉnh mà không hạ bản đang dùng ngoài công trường xuống trước.
     */
    uniqueIndex('design_versions_one_current_per_discipline')
      .on(t.designProjectId, t.discipline)
      .where(
        sql`${t.isCurrentVersion} AND ${t.publishedAt} IS NOT NULL AND ${t.deletedAt} IS NULL`,
      ),
    uniqueIndex('design_versions_project_discipline_version').on(
      t.designProjectId,
      t.discipline,
      t.version,
    ),
  ],
);

/**
 * Lịch sử các vòng góp ý và duyệt trên một phiên bản (TK-03).
 *
 * KHÔNG có `deleted_at`: đây là bảng lịch sử. Xoá được một vòng góp ý nghĩa là xoá được căn
 * cứ "khách đã duyệt bản nào" — mà đó chính là căn cứ chuyển bước theo TK-03.
 */
export const designReviews = pgTable(
  'design_reviews',
  {
    id: primaryId(),
    ...companyScoped(),

    designVersionId: uuid('design_version_id')
      .notNull()
      .references(() => designVersions.id, { onDelete: 'cascade' }),

    reviewerType: designReviewerTypeEnum('reviewer_type').notNull(),
    decision: designReviewDecisionEnum('decision').notNull(),

    /** Người nội bộ ghi nhận. Với góp ý của khách thì đây là người ghi hộ, không phải khách. */
    recordedBy: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
    /** Tên người góp ý phía khách hàng — khách không có tài khoản trong hệ thống. */
    reviewerName: varchar('reviewer_name', { length: 128 }),

    comments: text('comments').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),

    ...auditColumns(),
  },
  (t) => [index('design_reviews_version_idx').on(t.designVersionId, t.reviewedAt)],
);

/**
 * Tiến độ từng bộ môn (TK-04).
 *
 * RLS Mẫu **B**: kỹ sư bộ môn nào cập nhật tiến độ bộ môn đó; người khác cùng pháp nhân xem
 * được nhưng không sửa. Trưởng phòng (người chịu trách nhiệm dự án) sửa được tất cả — nếu
 * không thì một người nghỉ là cả dự án đứng.
 */
export const designDisciplineTasks = pgTable(
  'design_discipline_tasks',
  {
    id: primaryId(),
    ...companyScoped(),

    designProjectId: uuid('design_project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    discipline: designDisciplineEnum('discipline').notNull(),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),

    status: disciplineTaskStatusEnum('status').notNull().default('chua_bat_dau'),

    /** Phần trăm hoàn thành do người phụ trách tự đánh giá, 0–100. */
    progressPercent: integer('progress_percent').notNull().default(0),

    startDate: date('start_date'),
    dueDate: date('due_date'),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    /**
     * Kết quả kiểm tra chéo với bộ môn khác (TK-04) — ví dụ "dầm chắn cửa sổ trục B",
     * "ống kỹ thuật đâm vào cột". Còn nội dung ở đây thì chưa bàn giao được.
     */
    conflictNotes: text('conflict_notes'),

    notes: text('notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('design_discipline_tasks_project_idx').on(t.designProjectId, t.discipline),
    index('design_discipline_tasks_assignee_idx').on(t.assigneeId),
    /** Mỗi bộ môn đúng một dòng tiến độ trong một dự án — hai dòng thì không biết tin dòng nào. */
    uniqueIndex('design_discipline_tasks_unique')
      .on(t.designProjectId, t.discipline)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/**
 * Yêu cầu thay đổi thiết kế (TK-06).
 *
 * Nội dung lấy nguyên văn TK-06: "người yêu cầu, nội dung, nguyên nhân, mức độ ảnh hưởng đến
 * tiến độ và chi phí, số lượng bản vẽ cần sửa lại".
 *
 * `cost_impact` là ẢNH HƯỞNG CHI PHÍ ước tính, không phải giá vốn chi tiết — không thuộc Mẫu
 * D. Con số này chính là thứ phải cho Kinh doanh và khách hàng thấy để quyết định có làm hay
 * không; giấu đi thì yêu cầu thay đổi không có ai duyệt được.
 */
export const changeRequests = pgTable(
  'change_requests',
  {
    id: primaryId(),
    ...companyScoped(),

    designProjectId: uuid('design_project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    code: recordCode(),
    title: text('title').notNull(),

    origin: changeRequestOriginEnum('origin').notNull(),
    /** Người yêu cầu phía khách hàng/công trường — có thể không có tài khoản. */
    requesterName: varchar('requester_name', { length: 128 }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),

    /** Nội dung thay đổi. */
    content: text('content').notNull(),
    /** Nguyên nhân — vì sao phải đổi. */
    reason: text('reason').notNull(),

    status: changeRequestStatusEnum('status').notNull().default('moi'),

    /** Mức độ ảnh hưởng tiến độ, tính bằng ngày (âm = rút ngắn). */
    scheduleImpactDays: integer('schedule_impact_days'),
    /** Mức độ ảnh hưởng chi phí, đơn vị đồng (âm = giảm chi phí). */
    costImpact: money('cost_impact'),
    /** Số lượng bản vẽ cần sửa lại (TK-06). */
    affectedDrawingCount: integer('affected_drawing_count'),
    impactNotes: text('impact_notes'),

    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    /** Lý do từ chối — bắt buộc khi chuyển sang `tu_choi`. */
    decisionNotes: text('decision_notes'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('change_requests_project_idx').on(t.designProjectId, t.status),
    index('change_requests_requested_by_idx').on(t.requestedBy),
  ],
);

export type DesignProject = typeof designProjects.$inferSelect;
export type DesignBrief = typeof designBriefs.$inferSelect;
export type DesignSurvey = typeof designSurveys.$inferSelect;
export type DesignVersion = typeof designVersions.$inferSelect;
export type DesignReview = typeof designReviews.$inferSelect;
export type DesignDisciplineTask = typeof designDisciplineTasks.$inferSelect;
export type ChangeRequest = typeof changeRequests.$inferSelect;
