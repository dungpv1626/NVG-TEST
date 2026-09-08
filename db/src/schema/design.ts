/**
 * Module Thiết kế AI (TK-10 → TK-17) — artifact, đồ thị phụ thuộc, bản đang hiệu lực.
 *
 * Nguồn: `doc/design/03-data-contracts.md` mục 3.8, `02-architecture.md` mục 2.8.
 * Hàng rào cứng: CLAUDE.md mục 8.
 *
 * VÌ SAO KHÔNG DÙNG `documents` + `document_versions` SẴN CÓ: hai cơ chế khác bản chất và
 * cần cả hai.
 *
 *  | | `documents` (NEN-05) | `design_artifact` |
 *  |---|---|---|
 *  | Quản phiên bản của cái gì | Tệp (PDF, DWG) | JSON có cấu trúc giữa các bước tính |
 *  | Phục vụ ai | Con người: phê duyệt, "bản nào hiệu lực" | Máy: tính lại, bỏ qua tính trùng, truy vết phụ thuộc |
 *  | Có đồ thị phụ thuộc | Không | Có |
 *
 * Ép artifact vào hệ tài liệu thì mất tính idempotent và mất đồ thị phụ thuộc. Hai cơ chế
 * gặp nhau ở ĐÚNG MỘT chỗ — cầu nối phát hành (`workers/src/design/publish.ts`), một chiều.
 *
 * BA CỘT PHẠM VI trên mọi bảng ở đây, thiếu một là một lỗ hổng (02-architecture 2.8):
 *   1. `tenant_id`  — không rò rỉ giữa các khách hàng thuê phần mềm
 *   2. dự án        — kỹ sư thuê ngoài chỉ thấy dự án được phân công
 *   3. `discipline` — chỉ ghi được phần bộ môn mình phụ trách
 *
 * `company_id` là cột thứ tư, riêng của repo này (CLAUDE.md 8.5 T5): artifact phải truy được
 * về pháp nhân, vì mục 3.5 của CLAUDE.md bắt mọi bảng giao dịch mang `company_id`.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import { designDisciplineEnum } from './_enums';
import { primaryId, softDelete } from './_helpers';
import { companyScoped } from './_scoped';
import { designProjects } from './tk';
import { tenants } from './tenants';
import { users } from './users';

/**
 * Khoá chính của artifact: `sha256:` + 64 ký tự hex, băm trên payload đã chuẩn hoá.
 *
 * Dùng chính mã băm làm khoá chính chứ không phải UUID: nhờ đó "cùng input + cùng cấu hình
 * → cùng artifact" là một ràng buộc do CSDL giữ, không phải một quy ước phải nhớ. Ghi lại
 * một payload y hệt sẽ đụng khoá chính thay vì lặng lẽ tạo bản thứ hai.
 */
const artifactId = (name: string) => varchar(name, { length: 71 });

/**
 * Artifact — kết quả BẤT BIẾN của một bước trong pipeline thiết kế.
 *
 * KHÔNG BAO GIỜ `UPDATE`. Sửa = tạo artifact mới + đổi `design_head`. Cưỡng chế bằng chính
 * sách RLS (không có policy UPDATE/DELETE) chứ không bằng kỷ luật lập trình.
 *
 * `payload_uri` giữ dạng URI có scheme (`supabase://…`, `r2://…`) để đổi kho lưu trữ mà
 * không sửa nơi gọi — xem interface `ArtifactStore` (CLAUDE.md 8.5 T4).
 */
export const designArtifacts = pgTable(
  'design_artifact',
  {
    id: artifactId('id').primaryKey(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    ...companyScoped(),

    /** Dự án thiết kế SẴN CÓ (TK-01) — tham chiếu, không tạo bảng dự án mới. */
    projectId: uuid('project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    /**
     * Bộ môn. Dùng lại enum `design_discipline` sẵn có (CLAUDE.md 8.5 T7).
     * Giai đoạn 1 chỉ sinh `kien_truc`, nhưng cột phải có từ đầu.
     * Giá trị `phuong_an` của enum KHÔNG hợp lệ ở đây — chặn bằng CHECK trong migration.
     */
    discipline: designDisciplineEnum('discipline').notNull(),

    /** `design_brief` · `space_program` · `layout_intent` · `floor_plan` · … — xem `ARTIFACT_KINDS`. */
    kind: varchar('kind', { length: 32 }).notNull(),

    schemaVersion: varchar('schema_version', { length: 16 }).notNull(),

    payloadUri: text('payload_uri').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('design_artifact_project_kind_idx').on(t.projectId, t.kind, t.createdAt),
    index('design_artifact_tenant_idx').on(t.tenantId),
  ],
);

/**
 * Cạnh của đồ thị phụ thuộc: artifact nào sinh ra artifact nào, bằng bước gì.
 *
 * `params_hash` trả lời "cùng input, cùng cấu hình → đã có kết quả chưa" để bỏ qua tính lại
 * (03-data-contracts 3.8). Nó nằm trong khoá chính vì đổi cấu hình mà ra cùng kết quả là
 * chuyện có thật, và cả hai lần chạy đều đáng ghi lại.
 */
export const designArtifactEdges = pgTable(
  'design_artifact_edge',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    fromId: artifactId('from_id')
      .notNull()
      .references(() => designArtifacts.id, { onDelete: 'cascade' }),
    toId: artifactId('to_id')
      .notNull()
      .references(() => designArtifacts.id, { onDelete: 'cascade' }),

    /** Bước pipeline — xem `PIPELINE_STEPS` của `@nvg/shared/design`. */
    step: varchar('step', { length: 32 }).notNull(),

    paramsHash: varchar('params_hash', { length: 64 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.fromId, t.toId, t.step] }),
    index('design_artifact_edge_to_idx').on(t.toId),
    index('design_artifact_edge_params_idx').on(t.fromId, t.step, t.paramsHash),
  ],
);

/**
 * Bản ĐANG HIỆU LỰC của mỗi loại artifact trong một dự án (thuật ngữ chuẩn — CGD 4.4).
 *
 * Một dòng cho mỗi (dự án × bộ môn × loại). Có `discipline` trong khoá vì bộ hồ sơ hoàn
 * chỉnh là ba bộ môn song song, mỗi bộ môn có mặt bằng đang hiệu lực riêng — gộp lại thì
 * kỹ sư kết cấu phát hành sẽ hạ bản kiến trúc xuống.
 */
export const designHeads = pgTable(
  'design_head',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    projectId: uuid('project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    discipline: designDisciplineEnum('discipline').notNull(),

    kind: varchar('kind', { length: 32 }).notNull(),

    artifactId: artifactId('artifact_id')
      .notNull()
      .references(() => designArtifacts.id, { onDelete: 'restrict' }),

    ...auditColumns(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.discipline, t.kind] }),
    index('design_head_tenant_idx').on(t.tenantId),
  ],
);

/**
 * Lần phát hành sang hệ tài liệu — cầu nối một chiều (03-data-contracts 3.8b).
 *
 * MỘT lần phát hành mang ĐÚNG MỘT bộ môn, và `signed_by` phải có quyền
 * `design.publish.<discipline>`. Kiến trúc sư không ký được hồ sơ kết cấu, kể cả khi là
 * trưởng phòng — đây là ràng buộc pháp lý, cưỡng chế bằng RLS chứ không bằng quy ước.
 *
 * `document_version_id` trỏ tới phiên bản do `publish_document_version` cấp: số phiên bản
 * do HỆ TÀI LIỆU cấp, module không tự đặt.
 */
export const designPublications = pgTable(
  'design_publication',
  {
    id: primaryId(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    ...companyScoped(),

    projectId: uuid('project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    discipline: designDisciplineEnum('discipline').notNull(),

    /** Artifact nguồn, dạng `{ "floor_plan": "sha256:…", "arch_model": "sha256:…" }`. */
    artifactIds: jsonb('artifact_ids').$type<Record<string, string>>().notNull(),

    documentId: uuid('document_id'),
    documentVersionId: uuid('document_version_id'),

    signedBy: uuid('signed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),

    ...auditColumns(),
  },
  (t) => [
    index('design_publication_project_idx').on(t.projectId, t.discipline, t.signedAt),
    index('design_publication_tenant_idx').on(t.tenantId),
  ],
);

/**
 * Phân công người dùng vào dự án thiết kế theo BỘ MÔN — chiều thứ hai và thứ ba của RLS.
 *
 * Vì sao cần bảng riêng khi `design_discipline_tasks` (TK-04) đã có `assignee_id`: bảng kia
 * là TIẾN ĐỘ (một dòng một bộ môn, có phần trăm hoàn thành, có hạn), còn đây là QUYỀN (nhiều
 * người cùng bộ môn, có người chỉ đọc). Dùng bảng tiến độ làm bảng quyền thì thêm người thứ
 * hai vào một bộ môn là làm hỏng số liệu tiến độ.
 *
 * Kỹ sư kết cấu và điện nước thuê ngoài: tài khoản đầy đủ, giới hạn đúng dự án được giao và
 * bộ môn phụ trách (`doc/design/03-data-contracts.md` mục 3.9, D17).
 */
export const designProjectAssignments = pgTable(
  'design_project_assignment',
  {
    id: primaryId(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    projectId: uuid('project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    discipline: designDisciplineEnum('discipline').notNull(),

    /** `read` = xem được; `write` = tạo được artifact của bộ môn này trong dự án này. */
    accessLevel: varchar('access_level', { length: 8 }).notNull().default('read'),

    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('design_project_assignment_unique').on(t.projectId, t.userId, t.discipline),
    index('design_project_assignment_user_idx').on(t.userId),
  ],
);

/**
 * Cấu hình theo tenant — rule pack địa phương đang dùng, ngưỡng cho phép chạy Layer 2…
 *
 * Bảng key/value chứ không phải cột cố định: cấu hình của module còn thay đổi nhiều trong
 * Giai đoạn 1, và mỗi lần thêm một ngưỡng mà phải sinh migration thì cám dỗ hard-code
 * (điều CLAUDE.md 8.2 nguyên tắc 4 cấm) sẽ thắng.
 */
export const designSettings = pgTable(
  'design_setting',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    key: varchar('key', { length: 64 }).notNull(),

    /** Số, chuỗi, mảng, đối tượng đều chứa được — không phải sinh migration khi thêm ngưỡng. */
    value: jsonb('value').notNull(),

    description: text('description'),

    ...auditColumns(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

/**
 * Bản ghi Knowledge Base — một bộ hồ sơ công trình cũ đã số hoá.
 *
 * Nguồn: `doc/design/06-knowledge-base.md` mục 6.2. Hợp đồng: `contracts/kb-record.schema.json`.
 *
 * MỘT NGUỒN SỰ THẬT: `payload` giữ nguyên bản ghi theo hợp đồng; mọi cột dùng để lọc là cột
 * SINH đọc thẳng từ `payload`. Chép tay sang cột riêng sẽ tạo hai nguồn có thể nói khác nhau
 * (CLAUDE.md 5.2); cột sinh thì CSDL không cho phép lệch.
 *
 * KHÁC `design_artifact` ở hai điểm, cả hai đều có chủ đích:
 *  1. **Không bất biến.** Bước 3 của pipeline là kiến trúc sư bổ sung `rationale` vào bản ghi
 *     đã trích — đó là sửa đúng nghĩa, không phải tạo phiên bản mới.
 *  2. **Không có chiều dự án trong phân quyền.** Bản ghi là tri thức mức TENANT, mô tả công
 *     trình ĐÃ XÂY và dùng tham chiếu cho mọi dự án mới; `projectId` còn được phép rỗng vì
 *     nhiều hồ sơ cũ không còn dự án trong hệ thống. Ràng buộc thật là ranh giới tenant —
 *     mục 6.0 của tài liệu: "rò rỉ giữa các tenant là hỏng sản phẩm".
 */
/**
 * Kiểu `extensions.vector(1536)` của pgvector.
 *
 * Không có chỉ mục vector nào — mục 6.6 của tài liệu: dưới vài nghìn bản ghi thì quét tuần
 * tự nhanh hơn, mà chỉ mục xấp xỉ còn đánh đổi độ chính xác. Số 1536 nằm dưới trần 2000
 * chiều của pgvector, nên thêm chỉ mục sau này không phải nhúng lại cả kho.
 */
const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'extensions.vector(1536)',
});

export const kbRecords = pgTable(
  'kb_record',
  {
    id: primaryId(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    ...companyScoped(),

    /** Rỗng khi hồ sơ cũ không còn dự án tương ứng. Xoá dự án KHÔNG xoá tri thức đã trích. */
    projectId: uuid('project_id').references(() => designProjects.id, { onDelete: 'set null' }),

    discipline: designDisciplineEnum('discipline').notNull().default('kien_truc'),

    /** Toàn bộ bản ghi theo hợp đồng `kb-record`. Nguồn sự thật duy nhất. */
    payload: jsonb('payload').notNull(),

    /** Kết quả kiểm tra chéo — người xác nhận cần thấy bản ghi mất điểm vì gì. */
    checks: jsonb('checks').notNull().default([]),

    /** Tên tệp nguồn đã dùng, để truy ngược khi kết quả trích trông sai. */
    sourceFiles: jsonb('source_files').notNull().default([]),

    // --- Cột sinh: chỉ để LỌC, không bao giờ ghi trực tiếp ---------------------
    projectCode: text('project_code').generatedAlwaysAs(sql`(payload ->> 'project_code')`),
    tier: text('tier').generatedAlwaysAs(sql`(payload ->> 'tier')`),
    buildingType: text('building_type').generatedAlwaysAs(sql`(payload ->> 'building_type')`),
    floors: integer('floors').generatedAlwaysAs(sql`((payload ->> 'floors')::integer)`),
    qualityScore: doublePrecision('quality_score').generatedAlwaysAs(
      sql`((payload ->> 'quality_score')::double precision)`,
    ),
    hasBrief: boolean('has_brief').generatedAlwaysAs(sql`((payload ->> 'has_brief')::boolean)`),

    /** `false` = không dựng được cây chia không gian → KHÔNG dùng làm few-shot cho Layer 3a. */
    hasSlicingTree: boolean('has_slicing_tree').generatedAlwaysAs(
      sql`COALESCE(jsonb_typeof(payload -> 'slicing_tree') = 'object', false)`,
    ),

    // --- Truy hồi ba tầng (0099) ----------------------------------------------
    /** Kích thước lô — bộ lọc tầng 2 của truy hồi (06-knowledge-base 6.3). */
    siteWidthM: doublePrecision('site_width_m').generatedAlwaysAs(
      sql`((payload -> 'site' ->> 'width_m')::double precision)`,
    ),
    siteDepthM: doublePrecision('site_depth_m').generatedAlwaysAs(
      sql`((payload -> 'site' ->> 'depth_m')::double precision)`,
    ),
    familyArchetype: text('family_archetype').generatedAlwaysAs(
      sql`(payload ->> 'family_archetype')`,
    ),
    style: text('style').generatedAlwaysAs(sql`(payload ->> 'style')`),

    /** Bước 3 (tri thức ngầm) đã làm chưa — bộ lọc của hàng chờ chú giải. */
    hasRationale: boolean('has_rationale').generatedAlwaysAs(
      sql`COALESCE(jsonb_typeof(payload -> 'rationale') = 'object', false)`,
    ),

    /**
     * Nhúng phần `rationale`, 1536 chiều (`extensions.vector`).
     *
     * KHÔNG phải cột sinh, khác mọi cột lọc còn lại: giá trị đến từ mô hình nhúng bên ngoài,
     * không suy được từ `payload`. Ghi qua hàm `kb_apply_rationale` để chú giải và vector
     * không lệch nhau. Drizzle chưa có kiểu `vector` gốc nên khai bằng `customType` mỏng —
     * bảng này không bao giờ được đọc/ghi vector qua Drizzle, chỉ qua hàm SQL đó.
     */
    rationaleEmbedding: vector1536('rationale_embedding'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex('kb_record_tenant_code_unique')
      .on(t.tenantId, t.projectCode)
      .where(sql`deleted_at IS NULL`),
    index('kb_record_retrieval_idx')
      .on(t.tenantId, t.buildingType, t.qualityScore.desc())
      .where(sql`deleted_at IS NULL`),
    index('kb_record_fewshot_idx')
      .on(t.tenantId, t.hasSlicingTree)
      .where(sql`deleted_at IS NULL`),
    index('kb_record_project_idx').on(t.projectId),
    index('kb_record_geometry_idx')
      .on(t.tenantId, t.buildingType, t.floors, t.siteWidthM)
      .where(sql`deleted_at IS NULL`),
    index('kb_record_annotation_queue_idx')
      .on(t.tenantId, t.hasRationale, t.qualityScore.desc())
      .where(sql`deleted_at IS NULL`),
  ],
);

export type DesignArtifact = typeof designArtifacts.$inferSelect;
export type DesignArtifactEdge = typeof designArtifactEdges.$inferSelect;
export type DesignHead = typeof designHeads.$inferSelect;
export type DesignPublication = typeof designPublications.$inferSelect;
export type DesignProjectAssignment = typeof designProjectAssignments.$inferSelect;
export type DesignSetting = typeof designSettings.$inferSelect;
export type KbRecord = typeof kbRecords.$inferSelect;

/**
 * Nhật ký từng lượt gọi mô hình AI của nhà cung cấp ngoài — nhánh AI (T10–T13, migration 0121).
 *
 * Mỗi lượt một dòng, kể cả lượt hỏng hay bị bác: chi phí phải đối chiếu được theo dự án, model
 * và việc. Chỉ Worker ghi bằng `service_role`; trình duyệt chỉ đọc (RLS ba chiều).
 */
export const designAiCalls = pgTable(
  'design_ai_call',
  {
    id: primaryId(),

    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    ...companyScoped(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => designProjects.id, { onDelete: 'cascade' }),
    discipline: designDisciplineEnum('discipline').notNull(),

    /** Tên tuyến trong `config/models.yaml` (`ai_text_openai`…). */
    route: varchar('route', { length: 64 }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 96 }).notNull(),
    /** Việc gì: `program`, `plan`, `plan_repair`, `image:exterior`… */
    purpose: varchar('purpose', { length: 64 }).notNull(),
    dataClass: smallint('data_class').notNull(),
    promptVersion: varchar('prompt_version', { length: 16 }),

    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    imageCount: integer('image_count').notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
    /** `ok` · `rejected` (đầu ra không đạt kiểm) · `failed` (lỗi gọi). */
    status: varchar('status', { length: 16 }).notNull(),
    errorCode: varchar('error_code', { length: 64 }),
    /** Tính từ giá niêm yết trong `config/models.yaml` lúc gọi; rỗng khi tuyến không khai giá. */
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),

    artifactId: artifactId('artifact_id').references(() => designArtifacts.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('design_ai_call_project_idx').on(t.projectId, t.createdAt),
    index('design_ai_call_tenant_time_idx').on(t.tenantId, t.createdAt),
  ],
);

export type DesignAiCall = typeof designAiCalls.$inferSelect;
