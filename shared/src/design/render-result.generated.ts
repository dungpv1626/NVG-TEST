/**
 * SINH TỰ ĐỘNG TỪ `contracts/render-result.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const renderResultSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type RenderResultSemver = z.infer<typeof renderResultSemverSchema>;

/** Kết quả sinh ảnh — Layer 5. Nguồn: doc/design/03-data-contracts.md mục 3.7. */
export const renderResultSchema = z
  .object({
    schema_version: renderResultSemverSchema,
    images: z.array(
      z
        .object({
          view: z.string(),
          variant: z.number().int().gte(1),
          uri: z.string().regex(/^(r2|supabase):\/\/.+/),
          /** Phải là true TRƯỚC khi ảnh hiển thị cho khách. Kiểm tra trong mã nguồn, không tin tưởng (03-data-contracts 3.7). Nhãn: 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công'. */
          watermark_applied: z
            .boolean()
            .describe(
              "Phải là true TRƯỚC khi ảnh hiển thị cho khách. Kiểm tra trong mã nguồn, không tin tưởng (03-data-contracts 3.7). Nhãn: 'Ảnh tham khảo ý tưởng — chưa phải phương án thi công'.",
            ),
        })
        .strict(),
    ),
    backend: z.enum(['local_workstation', 'serverless', 'api_service', 'stub']),
    duration_s: z.number().gte(0).nullable().optional(),
  })
  .strict()
  .describe('Kết quả sinh ảnh — Layer 5. Nguồn: doc/design/03-data-contracts.md mục 3.7.');

export type RenderResult = z.infer<typeof renderResultSchema>;
