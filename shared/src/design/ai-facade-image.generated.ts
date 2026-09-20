/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-facade-image.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiFacadeImageSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiFacadeImageSemver = z.infer<typeof aiFacadeImageSemverSchema>;

export const aiFacadeImageArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiFacadeImageArtifactRef = z.infer<typeof aiFacadeImageArtifactRefSchema>;

/**
 * Ảnh MẶT ĐỨNG MẶT TIỀN CÓ VẬT LIỆU do MÔ HÌNH ẢNH vẽ TỪ ẢNH NEO (T59 Đợt E, 20/09/2026).
 *
 * Tấm trình khách: vật liệu, màu, mái, cổng, cây cối — vẽ lại đúng tờ mặt đứng vector đã dựng từ toạ độ (ảnh neo, không khung tên). Nó KHÔNG thay tờ vector: tờ vector vẫn là tờ chính, đo được, xuất DXF. Cùng khuôn với `ai-plan-sheet-image` (T57), khác ở chỗ trỏ ý tưởng mặt đứng và không có số tầng.
 *
 * `anchor` BẮT BUỘC: không có ảnh neo thì mô hình vẽ một ngôi nhà khác — đúng bài học T21.
 *
 * Về sau là ẢNH NEO cho bước Phối cảnh (T16): ảnh chính diện ban ngày, bốn góc còn lại dựng ảnh→ảnh từ nó.
 *
 * MỘT artifact = MỘT tấm. Không đặt head: vẽ lại là chuyện bình thường, tấm mới nhất chọn lúc đọc theo cạnh lineage `ai_facade_image_draw`.
 */
export const aiFacadeImageSchema = z
  .object({
    schema_version: aiFacadeImageSemverSchema,
    /** Ý tưởng mặt đứng (`ai_facade_concept`) mà tấm này vẽ theo. Cũng là cạnh lineage `ai_facade_image_draw`. */
    facade_ref: aiFacadeImageArtifactRefSchema.describe(
      'Ý tưởng mặt đứng (`ai_facade_concept`) mà tấm này vẽ theo. Cũng là cạnh lineage `ai_facade_image_draw`.',
    ),
    /** Vị trí tệp ảnh trong kho nhị phân. */
    uri: z
      .string()
      .regex(/^(r2|supabase):\/\/.+/)
      .describe('Vị trí tệp ảnh trong kho nhị phân.'),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    width: z.number().int().gte(1).nullable().optional(),
    height: z.number().int().gte(1).nullable().optional(),
    /**
     * Ảnh neo đã gửi kèm — khác biệt cốt lõi giữa hợp đồng này và bản T21 đã bị gỡ.
     *
     * Ghi lại ở đây vì đây là dấu vết DUY NHẤT truy được cho một đầu vào mà máy chủ không kiểm được: Worker không có canvas nên không rasterise được tờ SVG, byte PNG do TRÌNH DUYỆT gửi lên, và không có cách nào chứng minh tấm nhận về đúng là tờ máy chủ vừa phát ra. `sha256` là chỗ bám để sau này trả lời «hai tờ này vẽ từ cùng một ảnh neo không».
     */
    anchor: z
      .object({
        /** Ai rasterise tờ SVG. Hiện chỉ có `client_raster` (trình duyệt). Chừa chỗ cho `worker_raster` nếu sau này máy chủ tự dựng được ảnh. */
        source: z
          .enum(['client_raster'])
          .describe(
            'Ai rasterise tờ SVG. Hiện chỉ có `client_raster` (trình duyệt). Chừa chỗ cho `worker_raster` nếu sau này máy chủ tự dựng được ảnh.',
          ),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        bytes: z.number().int().gte(1),
        mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      })
      .strict()
      .describe(
        'Ảnh neo đã gửi kèm — khác biệt cốt lõi giữa hợp đồng này và bản T21 đã bị gỡ.\n\nGhi lại ở đây vì đây là dấu vết DUY NHẤT truy được cho một đầu vào mà máy chủ không kiểm được: Worker không có canvas nên không rasterise được tờ SVG, byte PNG do TRÌNH DUYỆT gửi lên, và không có cách nào chứng minh tấm nhận về đúng là tờ máy chủ vừa phát ra. `sha256` là chỗ bám để sau này trả lời «hai tờ này vẽ từ cùng một ảnh neo không».',
      ),
    /** Luôn `false`, CỐ Ý — cùng quyết định với `ai-plan-sheet-image`: byte trong kho CHƯA đóng dấu, trình duyệt in nhãn khi hiển thị và khi tải về. */
    watermark_applied: z
      .literal(false)
      .describe(
        'Luôn `false`, CỐ Ý — cùng quyết định với `ai-plan-sheet-image`: byte trong kho CHƯA đóng dấu, trình duyệt in nhãn khi hiển thị và khi tải về.',
      ),
    /** Trích đoạn lời dẫn ĐÃ GHÉP đã gửi đi. Cần cho việc đọc lại: cùng một mặt bằng vẽ hai lần ra hai tờ khác nhau, nên biết đã mô tả thế nào là cách duy nhất hiểu vì sao tờ này ra như vậy. */
    prompt_excerpt: z
      .string()
      .max(1200)
      .nullable()
      .describe(
        'Trích đoạn lời dẫn ĐÃ GHÉP đã gửi đi. Cần cho việc đọc lại: cùng một mặt bằng vẽ hai lần ra hai tờ khác nhau, nên biết đã mô tả thế nào là cách duy nhất hiểu vì sao tờ này ra như vậy.',
      )
      .optional(),
    generator: z
      .object({
        kind: z.enum(['ai']),
        provider: z.string().max(32),
        model: z.string().max(96),
        route: z.string().max(64),
        prompt_version: z.string().max(16),
        latency_ms: z.number().int().gte(0).nullable().optional(),
      })
      .strict(),
  })
  .strict()
  .describe(
    'Ảnh MẶT ĐỨNG MẶT TIỀN CÓ VẬT LIỆU do MÔ HÌNH ẢNH vẽ TỪ ẢNH NEO (T59 Đợt E, 20/09/2026).\n\nTấm trình khách: vật liệu, màu, mái, cổng, cây cối — vẽ lại đúng tờ mặt đứng vector đã dựng từ toạ độ (ảnh neo, không khung tên). Nó KHÔNG thay tờ vector: tờ vector vẫn là tờ chính, đo được, xuất DXF. Cùng khuôn với `ai-plan-sheet-image` (T57), khác ở chỗ trỏ ý tưởng mặt đứng và không có số tầng.\n\n`anchor` BẮT BUỘC: không có ảnh neo thì mô hình vẽ một ngôi nhà khác — đúng bài học T21.\n\nVề sau là ẢNH NEO cho bước Phối cảnh (T16): ảnh chính diện ban ngày, bốn góc còn lại dựng ảnh→ảnh từ nó.\n\nMỘT artifact = MỘT tấm. Không đặt head: vẽ lại là chuyện bình thường, tấm mới nhất chọn lúc đọc theo cạnh lineage `ai_facade_image_draw`.',
  );

export type AiFacadeImage = z.infer<typeof aiFacadeImageSchema>;
