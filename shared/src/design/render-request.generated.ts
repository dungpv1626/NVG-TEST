/**
 * SINH TỰ ĐỘNG TỪ `contracts/render-request.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const renderRequestSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type RenderRequestSemver = z.infer<typeof renderRequestSemverSchema>;

export const renderRequestArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type RenderRequestArtifactRef = z.infer<typeof renderRequestArtifactRefSchema>;

/** URI có scheme để đổi kho lưu trữ mà không sửa nơi gọi (interface ArtifactStore — CLAUDE.md 8.5 T4). */
export const renderRequestStoreUriSchema = z
  .string()
  .regex(/^(r2|supabase):\/\/.+/)
  .nullable()
  .describe(
    'URI có scheme để đổi kho lưu trữ mà không sửa nơi gọi (interface ArtifactStore — CLAUDE.md 8.5 T4).',
  );

export type RenderRequestStoreUri = z.infer<typeof renderRequestStoreUriSchema>;

/** 1 nhạy cảm (thông tin khách, đầu bài) · 2 trung bình (mặt bằng kích thước thật) · 3 thấp (clay render, depth map). Lớp chặn so với max_data_class trong config/models.yaml (01-overview 1.5). */
export const renderRequestDataClassSchema = z
  .union([z.literal(1), z.literal(2), z.literal(3)])
  .describe(
    '1 nhạy cảm (thông tin khách, đầu bài) · 2 trung bình (mặt bằng kích thước thật) · 3 thấp (clay render, depth map). Lớp chặn so với max_data_class trong config/models.yaml (01-overview 1.5).',
  );

export type RenderRequestDataClass = z.infer<typeof renderRequestDataClassSchema>;

/** Yêu cầu sinh ảnh — Layer 5, đi qua interface RenderBackend. Nguồn: doc/design/03-data-contracts.md mục 3.7. */
export const renderRequestSchema = z
  .object({
    schema_version: renderRequestSemverSchema,
    arch_ref: renderRequestArtifactRefSchema,
    views: z
      .array(
        z
          .object({
            id: z.string(),
            camera: z.enum(['street_level', 'aerial', 'interior', 'eye_level']),
            clay_png: renderRequestStoreUriSchema.optional(),
            depth_png: renderRequestStoreUriSchema.optional(),
            edge_png: renderRequestStoreUriSchema.optional(),
          })
          .strict(),
      )
      .min(1),
    style_preset: z.string().nullable().optional(),
    /** Đường dẫn tệp workflow ComfyUI — định dạng đã chốt, nơi chạy chưa chốt (05-tech-stack 5.7). */
    workflow: z
      .string()
      .nullable()
      .describe(
        'Đường dẫn tệp workflow ComfyUI — định dạng đã chốt, nơi chạy chưa chốt (05-tech-stack 5.7).',
      )
      .optional(),
    variants_per_view: z.number().int().gte(1).lte(8).optional(),
    data_class: renderRequestDataClassSchema,
  })
  .strict()
  .describe(
    'Yêu cầu sinh ảnh — Layer 5, đi qua interface RenderBackend. Nguồn: doc/design/03-data-contracts.md mục 3.7.',
  );

export type RenderRequest = z.infer<typeof renderRequestSchema>;
