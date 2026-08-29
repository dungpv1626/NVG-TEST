/**
 * SINH TỰ ĐỘNG TỪ `contracts/publish-request.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const publishRequestSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type PublishRequestSemver = z.infer<typeof publishRequestSemverSchema>;

export const publishRequestArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type PublishRequestArtifactRef = z.infer<typeof publishRequestArtifactRefSchema>;

/** Dùng lại enum design_discipline sẵn có (CLAUDE.md 8.5 T7). Ánh xạ từ tài liệu: KT→kien_truc · KC→ket_cau · DN→dien_nuoc. Giá trị phuong_an của enum KHÔNG dùng cho artifact — nó là giai đoạn hồ sơ, không phải bộ môn. */
export const publishRequestDisciplineSchema = z
  .enum(['kien_truc', 'ket_cau', 'dien_nuoc'])
  .describe(
    'Dùng lại enum design_discipline sẵn có (CLAUDE.md 8.5 T7). Ánh xạ từ tài liệu: KT→kien_truc · KC→ket_cau · DN→dien_nuoc. Giá trị phuong_an của enum KHÔNG dùng cho artifact — nó là giai đoạn hồ sơ, không phải bộ môn.',
  );

export type PublishRequestDiscipline = z.infer<typeof publishRequestDisciplineSchema>;

/** Cầu nối sang hệ quản lý tài liệu sẵn có — ĐIỂM GIAO DUY NHẤT giữa artifact và hồ sơ chính thức. Publish là MỘT CHIỀU. Nguồn: doc/design/03-data-contracts.md mục 3.8b. */
export const publishRequestSchema = z
  .object({
    schema_version: publishRequestSemverSchema,
    tenant_id: z.string().uuid(),
    /** design_projects.id — bảng SẴN CÓ. */
    project_id: z.string().uuid().describe('design_projects.id — bảng SẴN CÓ.'),
    /** Khoá là kind của artifact nguồn (floor_plan, arch_model…). Giữ tham chiếu ngược để sau này truy được 'bản vẽ này sinh ra từ đầu bài nào'. */
    artifact_ids: z
      .record(z.string(), publishRequestArtifactRefSchema)
      .refine((v) => Object.keys(v).length >= 1, {
        message: 'Cần ít nhất 1 mục.',
      })
      .describe(
        "Khoá là kind của artifact nguồn (floor_plan, arch_model…). Giữ tham chiếu ngược để sau này truy được 'bản vẽ này sinh ra từ đầu bài nào'.",
      ),
    /** MỘT lần publish = MỘT bộ môn. Ký theo từng bộ môn, không ký gộp: kiến trúc sư không ký được hồ sơ kết cấu kể cả khi là trưởng phòng. */
    discipline: publishRequestDisciplineSchema.describe(
      'MỘT lần publish = MỘT bộ môn. Ký theo từng bộ môn, không ký gộp: kiến trúc sư không ký được hồ sơ kết cấu kể cả khi là trưởng phòng.',
    ),
    documents: z
      .array(
        z
          .object({
            kind: z.enum(['dxf', 'pdf', 'png', 'gltf', 'json']),
            /** Phần tên theo quy ước NVG ngoài đời (MatBang, PhuongAn…). Số phiên bản do hệ tài liệu cấp, module KHÔNG tự đặt. */
            name: z
              .string()
              .min(1)
              .describe(
                'Phần tên theo quy ước NVG ngoài đời (MatBang, PhuongAn…). Số phiên bản do hệ tài liệu cấp, module KHÔNG tự đặt.',
              ),
            uri: z.string().regex(/^(r2|supabase):\/\/.+/),
            mime_type: z.string().nullable().optional(),
          })
          .strict(),
      )
      .min(1),
    /** users.id của người CHỊU TRÁCH NHIỆM CHUYÊN MÔN bộ môn này. Cưỡng chế bằng quyền design.publish.<discipline>, không bằng quy ước. */
    signed_by: z
      .string()
      .uuid()
      .describe(
        'users.id của người CHỊU TRÁCH NHIỆM CHUYÊN MÔN bộ môn này. Cưỡng chế bằng quyền design.publish.<discipline>, không bằng quy ước.',
      ),
    signed_at: z.string().datetime({ offset: true }).nullable().optional(),
    /** NEN-05 bắt buộc khi phát hành bản điều chỉnh (bản thứ 2 trở đi). */
    change_reason: z
      .string()
      .nullable()
      .describe('NEN-05 bắt buộc khi phát hành bản điều chỉnh (bản thứ 2 trở đi).')
      .optional(),
  })
  .strict()
  .describe(
    'Cầu nối sang hệ quản lý tài liệu sẵn có — ĐIỂM GIAO DUY NHẤT giữa artifact và hồ sơ chính thức. Publish là MỘT CHIỀU. Nguồn: doc/design/03-data-contracts.md mục 3.8b.',
  );

export type PublishRequest = z.infer<typeof publishRequestSchema>;
