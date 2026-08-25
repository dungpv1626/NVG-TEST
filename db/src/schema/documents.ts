/**
 * Kho hồ sơ tập trung và quản lý phiên bản tài liệu.
 *
 * PRD NEN-05: "tại mọi thời điểm phải xác định rõ bản đang có hiệu lực; lưu lịch sử chỉnh sửa
 * gồm người sửa, ngày sửa và nguyên nhân thay đổi. Khi phát hành bản điều chỉnh, hệ thống
 * thông báo đồng thời cho tất cả các bên liên quan."
 *
 * PRD NEN-06: kho hồ sơ phân loại theo pháp nhân – dự án/công trình – loại hồ sơ.
 *
 * Đây là hạ tầng DÙNG CHUNG: bản vẽ (TK-05), dự toán (DA-06), báo giá (CRM-04) và
 * hợp đồng (HD-01) đều dùng lại cơ chế này thay vì mỗi module tự làm một kiểu.
 */

import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns } from './_audit';
import { primaryId, softDelete, versionColumns } from './_helpers';
import { companyScoped } from './_scoped';
import { users } from './users';

/**
 * Tham chiếu đa hình tới hồ sơ nghiệp vụ bất kỳ.
 *
 * Dùng `varchar` thay vì enum vì sẽ trỏ tới ~65 bảng và danh sách còn mở rộng qua từng
 * giai đoạn — enum sẽ phải sinh migration mỗi lần thêm module.
 * Quy ước: đúng TÊN BẢNG ở dạng số nhiều (`opportunities`, `bidding_projects`…).
 */
const relatedEntity = () => ({
  relatedEntityType: varchar('related_entity_type', { length: 64 }),
  relatedEntityId: uuid('related_entity_id'),
});

export const documents = pgTable(
  'documents',
  {
    id: primaryId(),
    ...companyScoped(),

    /** Tên hiển thị của tài liệu logic (không phải tên tệp). */
    title: text('title').notNull(),

    /**
     * Loại hồ sơ — dùng để phân loại trong kho hồ sơ (NEN-06).
     * Ví dụ: `ban_ve`, `du_toan`, `bao_gia`, `hop_dong`, `bien_ban_nghiem_thu`, `chung_tu`.
     */
    category: varchar('category', { length: 64 }).notNull(),

    ...relatedEntity(),

    description: text('description'),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('documents_company_idx').on(t.companyId),
    index('documents_related_idx').on(t.relatedEntityType, t.relatedEntityId),
    index('documents_category_idx').on(t.category),
  ],
);

/**
 * Từng phiên bản cụ thể của một tài liệu.
 *
 * Ràng buộc "chỉ MỘT bản đang hiệu lực" được bảo đảm bằng unique index có điều kiện
 * trong migration (`WHERE is_current_version AND deleted_at IS NULL`) — không thể để
 * ứng dụng tự giữ, vì hai người phát hành đồng thời sẽ tạo ra hai bản cùng hiệu lực.
 */
export const documentVersions = pgTable(
  'document_versions',
  {
    id: primaryId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    ...versionColumns(),

    /** Đường dẫn trong Supabase Storage. */
    fileUrl: text('file_url').notNull(),
    fileName: text('file_name').notNull(),
    fileSizeBytes: text('file_size_bytes'),
    mimeType: varchar('mime_type', { length: 128 }),

    /**
     * Nguyên nhân thay đổi — NEN-05 yêu cầu tường minh, không để trống khi phát hành
     * bản điều chỉnh (version > 1).
     */
    changeReason: text('change_reason'),

    /** Thời điểm phát hành chính thức; rỗng nghĩa là còn ở dạng nháp. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),

    ...auditColumns(),
    ...softDelete(),
  },
  (t) => [
    index('document_versions_document_idx').on(t.documentId),
    index('document_versions_current_idx').on(t.documentId, t.isCurrentVersion),
  ],
);

export type Document = typeof documents.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export { relatedEntity };
