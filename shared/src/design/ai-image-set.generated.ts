/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-image-set.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiImageSetSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiImageSetSemver = z.infer<typeof aiImageSetSemverSchema>;

export const aiImageSetArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiImageSetArtifactRef = z.infer<typeof aiImageSetArtifactRefSchema>;

/** front_day = chính diện ban ngày (ảnh neo) · front_night = chính diện ban đêm · gate_close = cận cảnh cổng tầng trệt · balcony_close = cận cảnh ban công tầng 2 · oblique = góc nghiêng · axonometric = khối trục đo (tuỳ chọn). */
export const aiImageSetViewSchema = z
  .enum(['front_day', 'front_night', 'gate_close', 'balcony_close', 'oblique', 'axonometric'])
  .describe(
    'front_day = chính diện ban ngày (ảnh neo) · front_night = chính diện ban đêm · gate_close = cận cảnh cổng tầng trệt · balcony_close = cận cảnh ban công tầng 2 · oblique = góc nghiêng · axonometric = khối trục đo (tuỳ chọn).',
  );

export type AiImageSetView = z.infer<typeof aiImageSetViewSchema>;

/**
 * Bộ ảnh phối cảnh của NHÁNH AI — năm góc bắt buộc cùng MỘT ngôi nhà, cộng khối trục đo tuỳ chọn (T16, 09/09/2026).
 *
 * CỐ Ý KHÔNG dùng lại `render-result` của bộ giải: hợp đồng kia là đầu ra Lớp 5 (`variant` là số nguyên, không có khái niệm ảnh neo, không ghi ảnh nào dựng từ ảnh nào) và phải xoá được cùng bộ giải.
 *
 * Cách giữ năm ảnh cùng một ngôi nhà: ảnh CHÍNH DIỆN BAN NGÀY dựng trước từ tờ mặt đứng, gọi là ẢNH NEO (`anchor: true`). Bốn góc còn lại dựng ảnh→ảnh với ảnh neo và tờ mặt đứng làm tham chiếu, kèm cùng một đoạn mô tả vật liệu sinh từ ý tưởng mặt đứng. `source_refs` ghi lại đúng những gì đã gửi, để đọc artifact biết ảnh nào dẫn xuất từ ảnh nào.
 *
 * Góc nào hỏng thì ghi vào `missing` kèm lý do — KHÔNG lặng lẽ trả về ít ảnh hơn.
 *
 * Ảnh lưu trong bucket `design-renders`, `uri` dạng `supabase://` hoặc `r2://`; trình duyệt đọc qua endpoint có kiểm quyền, không đọc thẳng kho.
 */
export const aiImageSetSchema = z
  .object({
    schema_version: aiImageSetSemverSchema,
    facade_ref: aiImageSetArtifactRefSchema,
    plan_ref: aiImageSetArtifactRefSchema,
    images: z
      .array(
        z
          .object({
            view: aiImageSetViewSchema,
            /** Vị trí tệp ảnh trong kho nhị phân. */
            uri: z
              .string()
              .regex(/^(r2|supabase):\/\/.+/)
              .describe('Vị trí tệp ảnh trong kho nhị phân.'),
            mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
            width: z.number().int().gte(1).nullable().optional(),
            height: z.number().int().gte(1).nullable().optional(),
            /** Đây là ảnh NEO mà các góc khác dựng theo. Đúng một ảnh trong bộ mang cờ này. */
            anchor: z
              .boolean()
              .describe(
                'Đây là ảnh NEO mà các góc khác dựng theo. Đúng một ảnh trong bộ mang cờ này.',
              ),
            /** Luôn `false` ở phiên bản này, CỐ Ý. Byte lưu trong kho chưa đóng dấu: Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI. Nhãn cảnh báo do mã nguồn chèn vào phản hồi API, trình duyệt in lên ảnh khi hiển thị và khi tải về. Khai `const false` để không ai đặt `true` khi chưa có bước đóng dấu thật. */
            watermark_applied: z
              .literal(false)
              .describe(
                'Luôn `false` ở phiên bản này, CỐ Ý. Byte lưu trong kho chưa đóng dấu: Worker không có canvas, và đóng dấu bằng Container thì phá tính độc lập của nhánh AI. Nhãn cảnh báo do mã nguồn chèn vào phản hồi API, trình duyệt in lên ảnh khi hiển thị và khi tải về. Khai `const false` để không ai đặt `true` khi chưa có bước đóng dấu thật.',
              ),
            /** URI những ảnh đã gửi làm tham chiếu cho lượt dựng này, đúng thứ tự đã gửi. */
            source_refs: z
              .array(z.string())
              .max(6)
              .describe(
                'URI những ảnh đã gửi làm tham chiếu cho lượt dựng này, đúng thứ tự đã gửi.',
              )
              .optional(),
            provider: z.string().max(32).optional(),
            model: z.string().max(96).optional(),
            prompt_version: z.string().max(16).optional(),
            latency_ms: z.number().int().gte(0).nullable().optional(),
          })
          .strict(),
      )
      .max(12),
    missing: z
      .array(
        z
          .object({
            view: aiImageSetViewSchema,
            /** Vì sao góc này không có ảnh, tiếng Việt, đọc được cho người dùng. */
            reason: z
              .string()
              .max(300)
              .describe('Vì sao góc này không có ảnh, tiếng Việt, đọc được cho người dùng.'),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    generator: z
      .object({
        kind: z.enum(['ai']),
        provider: z.string().max(32),
        model: z.string().max(96),
        route: z.string().max(64),
        prompt_version: z.string().max(16),
      })
      .strict(),
  })
  .strict()
  .describe(
    'Bộ ảnh phối cảnh của NHÁNH AI — năm góc bắt buộc cùng MỘT ngôi nhà, cộng khối trục đo tuỳ chọn (T16, 09/09/2026).\n\nCỐ Ý KHÔNG dùng lại `render-result` của bộ giải: hợp đồng kia là đầu ra Lớp 5 (`variant` là số nguyên, không có khái niệm ảnh neo, không ghi ảnh nào dựng từ ảnh nào) và phải xoá được cùng bộ giải.\n\nCách giữ năm ảnh cùng một ngôi nhà: ảnh CHÍNH DIỆN BAN NGÀY dựng trước từ tờ mặt đứng, gọi là ẢNH NEO (`anchor: true`). Bốn góc còn lại dựng ảnh→ảnh với ảnh neo và tờ mặt đứng làm tham chiếu, kèm cùng một đoạn mô tả vật liệu sinh từ ý tưởng mặt đứng. `source_refs` ghi lại đúng những gì đã gửi, để đọc artifact biết ảnh nào dẫn xuất từ ảnh nào.\n\nGóc nào hỏng thì ghi vào `missing` kèm lý do — KHÔNG lặng lẽ trả về ít ảnh hơn.\n\nẢnh lưu trong bucket `design-renders`, `uri` dạng `supabase://` hoặc `r2://`; trình duyệt đọc qua endpoint có kiểm quyền, không đọc thẳng kho.',
  );

export type AiImageSet = z.infer<typeof aiImageSetSchema>;
