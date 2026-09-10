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
 * Tờ MẶT BẰNG CÔNG NĂNG của một tầng, do MÔ HÌNH ẢNH vẽ (T21, 10/09/2026).
 *
 * Bộ vẽ vector tất định (T15) không cho ra tờ vẽ đạt sau hai vòng sửa, nên Haan quyết chuyển phần VẼ cho mô hình ảnh. Mô hình văn bản vẫn khai mặt bằng dạng dữ liệu — đó là thứ đo diện tích và đối chiếu quy chuẩn được — nhưng nay khai thêm `levels[].sheet_prompt`, và một mô hình ảnh dựng tờ giấy từ đoạn mô tả ấy.
 *
 * ⚠️ KHÔNG CÓ ẢNH NEO. Mô hình ảnh chỉ nhận CHỮ, không nhận hình. Hệ quả đã biết và đã chấp nhận: **hình trên tờ này không dựng từ toạ độ**, nên kích thước và vị trí trên hình chỉ là minh hoạ. Số đúng nằm ở chính artifact `ai_floor_plan` và ở tờ vector dựng từ nó. Mọi chỗ hiển thị phải nói ra điều đó — xem `watermark_applied`.
 *
 * CỐ Ý KHÔNG dùng lại `ai-image-set`: hợp đồng kia bắt buộc `facade_ref` (tờ mặt bằng không có ý tưởng mặt đứng nào), khai `view` là enum năm góc ngoại thất (không có chỗ cho số TẦNG), và dựng quanh khái niệm ẢNH NEO mà ở đây cố ý không có. Nhét tờ mặt bằng vào đó là phải điền hai trường bịa.
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
    /** Luôn `false` ở phiên bản này, CỐ Ý — cùng quyết định đã ghi ở `ai-image-set`. Byte lưu trong kho CHƯA đóng dấu: Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI. Nhãn cảnh báo do mã nguồn chèn, trình duyệt in lên ảnh khi hiển thị VÀ khi tải về (`web/src/lib/watermark.ts`). Khai `const false` để không ai đặt `true` khi chưa có bước đóng dấu thật ở phía máy chủ. */
    watermark_applied: z
      .literal(false)
      .describe(
        'Luôn `false` ở phiên bản này, CỐ Ý — cùng quyết định đã ghi ở `ai-image-set`. Byte lưu trong kho CHƯA đóng dấu: Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI. Nhãn cảnh báo do mã nguồn chèn, trình duyệt in lên ảnh khi hiển thị VÀ khi tải về (`web/src/lib/watermark.ts`). Khai `const false` để không ai đặt `true` khi chưa có bước đóng dấu thật ở phía máy chủ.',
      ),
    /** Đoạn `sheet_prompt` đã gửi đi, giữ nguyên văn. Cần cho việc đọc lại: cùng một mặt bằng vẽ hai lần ra hai tờ khác nhau, nên biết đã mô tả thế nào là cách duy nhất hiểu vì sao tờ này ra như vậy. */
    prompt_excerpt: z
      .string()
      .max(1200)
      .nullable()
      .describe(
        'Đoạn `sheet_prompt` đã gửi đi, giữ nguyên văn. Cần cho việc đọc lại: cùng một mặt bằng vẽ hai lần ra hai tờ khác nhau, nên biết đã mô tả thế nào là cách duy nhất hiểu vì sao tờ này ra như vậy.',
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
    'Tờ MẶT BẰNG CÔNG NĂNG của một tầng, do MÔ HÌNH ẢNH vẽ (T21, 10/09/2026).\n\nBộ vẽ vector tất định (T15) không cho ra tờ vẽ đạt sau hai vòng sửa, nên Haan quyết chuyển phần VẼ cho mô hình ảnh. Mô hình văn bản vẫn khai mặt bằng dạng dữ liệu — đó là thứ đo diện tích và đối chiếu quy chuẩn được — nhưng nay khai thêm `levels[].sheet_prompt`, và một mô hình ảnh dựng tờ giấy từ đoạn mô tả ấy.\n\n⚠️ KHÔNG CÓ ẢNH NEO. Mô hình ảnh chỉ nhận CHỮ, không nhận hình. Hệ quả đã biết và đã chấp nhận: **hình trên tờ này không dựng từ toạ độ**, nên kích thước và vị trí trên hình chỉ là minh hoạ. Số đúng nằm ở chính artifact `ai_floor_plan` và ở tờ vector dựng từ nó. Mọi chỗ hiển thị phải nói ra điều đó — xem `watermark_applied`.\n\nCỐ Ý KHÔNG dùng lại `ai-image-set`: hợp đồng kia bắt buộc `facade_ref` (tờ mặt bằng không có ý tưởng mặt đứng nào), khai `view` là enum năm góc ngoại thất (không có chỗ cho số TẦNG), và dựng quanh khái niệm ẢNH NEO mà ở đây cố ý không có. Nhét tờ mặt bằng vào đó là phải điền hai trường bịa.\n\nMỘT artifact = MỘT tờ = MỘT tầng. Không gom cả bộ: artifact là bất biến, nên gom lại thì vẽ tờ tầng 2 phải đúc lại cả artifact đang chứa tầng 1, và lineage mất nghĩa.\n\nẢnh lưu trong bucket `design-renders`, `uri` dạng `supabase://` hoặc `r2://`; trình duyệt đọc qua endpoint có kiểm quyền, không đọc thẳng kho.',
  );

export type AiPlanSheetImage = z.infer<typeof aiPlanSheetImageSchema>;
