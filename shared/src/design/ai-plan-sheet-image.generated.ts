/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-plan-sheet-image.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiPlanSheetImageSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiPlanSheetImageSemver = z.infer<typeof aiPlanSheetImageSemverSchema>;

export const aiPlanSheetImageArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiPlanSheetImageArtifactRef = z.infer<typeof aiPlanSheetImageArtifactRefSchema>;

/**
 * Tờ MẶT BẰNG CÔNG NĂNG CÓ NỘI THẤT của một tầng, do MÔ HÌNH ẢNH vẽ TỪ ẢNH NEO (T57, 19/09/2026).
 *
 * Đây là tấm đưa cho khách xem: tường tô đậm, đồ đạc từng phòng, sàn có vật liệu, cây cối quanh nhà, khung tên tiếng Việt. Nó KHÔNG thay tờ vector.
 *
 * ⚠️ Đọc kỹ chỗ này trước khi sửa: hợp đồng cùng tên đã tồn tại một lần (T21, 10/09/2026) và đã bị T22 xoá ngày 12/09. Bản ấy CỐ Ý không có ảnh neo — mô hình chỉ nhận chữ — nên nó vẽ ra một ngôi nhà khác với ngôi nhà đã xếp, và đó là lý do nó bị gỡ. Bản này khác đúng MỘT điểm: có `anchor`. Ảnh neo là chính tờ mặt bằng đã dựng từ toạ độ, rasterise rồi gửi kèm, nên mô hình vẽ lại ĐÚNG ngôi nhà ấy. Bỏ `anchor` đi là quay về T21 mà vẫn tốn tiền — vì thế nó BẮT BUỘC.
 *
 * ⚠️ Tờ này vẫn KHÔNG ĐO ĐƯỢC. Mô hình ảnh viết cả chữ lẫn số (Haan chốt 19/09), nên tên phòng có thể sai dấu và con số trên hình có thể lệch bảng diện tích. Số đúng nằm ở artifact `ai_floor_plan` và ở tờ vector dựng từ nó, và tờ vector vẫn là tờ CHÍNH trên màn hình. Mọi chỗ hiển thị phải nói ra điều đó — xem `watermark_applied`.
 *
 * CỐ Ý KHÔNG dùng lại `ai-image-set`: hợp đồng kia bắt buộc `facade_ref` (tờ mặt bằng không có ý tưởng mặt đứng nào) và khai `view` là enum năm góc ngoại thất, không có chỗ cho số TẦNG. Nhét tờ mặt bằng vào đó là phải điền hai trường bịa.
 *
 * MỘT artifact = MỘT tờ = MỘT tầng. Không gom cả bộ: artifact là bất biến, nên gom lại thì vẽ tờ tầng 2 phải đúc lại cả artifact đang chứa tầng 1, và lineage mất nghĩa.
 *
 * Ảnh lưu trong bucket `design-renders`, `uri` dạng `supabase://` hoặc `r2://`; trình duyệt đọc qua endpoint có kiểm quyền, không đọc thẳng kho.
 */
export const aiPlanSheetImageSchema = z
  .object({
    schema_version: aiPlanSheetImageSemverSchema,
    /** Mặt bằng mà tờ này vẽ theo. Cũng là cạnh lineage `ai_plan_sheet`. */
    plan_ref: aiPlanSheetImageArtifactRefSchema.describe(
      'Mặt bằng mà tờ này vẽ theo. Cũng là cạnh lineage `ai_plan_sheet`.',
    ),
    /** Số tầng, đúng giá trị `level` trong `ai_floor_plan`. */
    level: z.number().int().gte(1).describe('Số tầng, đúng giá trị `level` trong `ai_floor_plan`.'),
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
    /** Mã phong cách của đầu bài đã gửi cho mô hình, lấy theo lineage mặt bằng → chương trình → đầu bài. `null` khi lineage gãy — phong cách là mệnh đề trang trí, thiếu nó thì bỏ câu ấy chứ không chặn cả tờ vẽ. */
    style_code: z
      .string()
      .max(32)
      .nullable()
      .describe(
        'Mã phong cách của đầu bài đã gửi cho mô hình, lấy theo lineage mặt bằng → chương trình → đầu bài. `null` khi lineage gãy — phong cách là mệnh đề trang trí, thiếu nó thì bỏ câu ấy chứ không chặn cả tờ vẽ.',
      )
      .optional(),
    /** Luôn `false` ở phiên bản này, CỐ Ý — cùng quyết định đã ghi ở `ai-image-set`. Byte lưu trong kho CHƯA đóng dấu: Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI. Nhãn cảnh báo do mã nguồn chèn, trình duyệt in lên ảnh khi hiển thị VÀ khi tải về (`web/src/lib/watermark.ts`). Khai `const false` để không ai đặt `true` khi chưa có bước đóng dấu thật ở phía máy chủ. */
    watermark_applied: z
      .literal(false)
      .describe(
        'Luôn `false` ở phiên bản này, CỐ Ý — cùng quyết định đã ghi ở `ai-image-set`. Byte lưu trong kho CHƯA đóng dấu: Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI. Nhãn cảnh báo do mã nguồn chèn, trình duyệt in lên ảnh khi hiển thị VÀ khi tải về (`web/src/lib/watermark.ts`). Khai `const false` để không ai đặt `true` khi chưa có bước đóng dấu thật ở phía máy chủ.',
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
    'Tờ MẶT BẰNG CÔNG NĂNG CÓ NỘI THẤT của một tầng, do MÔ HÌNH ẢNH vẽ TỪ ẢNH NEO (T57, 19/09/2026).\n\nĐây là tấm đưa cho khách xem: tường tô đậm, đồ đạc từng phòng, sàn có vật liệu, cây cối quanh nhà, khung tên tiếng Việt. Nó KHÔNG thay tờ vector.\n\n⚠️ Đọc kỹ chỗ này trước khi sửa: hợp đồng cùng tên đã tồn tại một lần (T21, 10/09/2026) và đã bị T22 xoá ngày 12/09. Bản ấy CỐ Ý không có ảnh neo — mô hình chỉ nhận chữ — nên nó vẽ ra một ngôi nhà khác với ngôi nhà đã xếp, và đó là lý do nó bị gỡ. Bản này khác đúng MỘT điểm: có `anchor`. Ảnh neo là chính tờ mặt bằng đã dựng từ toạ độ, rasterise rồi gửi kèm, nên mô hình vẽ lại ĐÚNG ngôi nhà ấy. Bỏ `anchor` đi là quay về T21 mà vẫn tốn tiền — vì thế nó BẮT BUỘC.\n\n⚠️ Tờ này vẫn KHÔNG ĐO ĐƯỢC. Mô hình ảnh viết cả chữ lẫn số (Haan chốt 19/09), nên tên phòng có thể sai dấu và con số trên hình có thể lệch bảng diện tích. Số đúng nằm ở artifact `ai_floor_plan` và ở tờ vector dựng từ nó, và tờ vector vẫn là tờ CHÍNH trên màn hình. Mọi chỗ hiển thị phải nói ra điều đó — xem `watermark_applied`.\n\nCỐ Ý KHÔNG dùng lại `ai-image-set`: hợp đồng kia bắt buộc `facade_ref` (tờ mặt bằng không có ý tưởng mặt đứng nào) và khai `view` là enum năm góc ngoại thất, không có chỗ cho số TẦNG. Nhét tờ mặt bằng vào đó là phải điền hai trường bịa.\n\nMỘT artifact = MỘT tờ = MỘT tầng. Không gom cả bộ: artifact là bất biến, nên gom lại thì vẽ tờ tầng 2 phải đúc lại cả artifact đang chứa tầng 1, và lineage mất nghĩa.\n\nẢnh lưu trong bucket `design-renders`, `uri` dạng `supabase://` hoặc `r2://`; trình duyệt đọc qua endpoint có kiểm quyền, không đọc thẳng kho.',
  );

export type AiPlanSheetImage = z.infer<typeof aiPlanSheetImageSchema>;
