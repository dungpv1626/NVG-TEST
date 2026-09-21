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

/**
 * front_day = chính diện ban ngày (ảnh neo của bộ) · front_night = chính diện ban đêm · gate_close = cận cảnh cổng và cửa tầng trệt · balcony_close = cận cảnh ban công tầng 2 · oblique = góc nghiêng từ tầm mắt · aerial = toàn cảnh từ trên cao, máy ảnh chúc 50–60° · axonometric = khối trục đo (tuỳ chọn).
 *
 * Một bộ có ĐÚNG MỘT ảnh cận cảnh: `balcony_close` khi mặt đứng có ban công, `gate_close` khi không. Chương trình chọn theo `ai_facade_concept.balconies`, không hỏi mô hình — nó đã có câu trả lời trong tay (T67).
 */
export const aiImageSetViewSchema = z
  .enum([
    'front_day',
    'front_night',
    'gate_close',
    'balcony_close',
    'oblique',
    'aerial',
    'axonometric',
  ])
  .describe(
    'front_day = chính diện ban ngày (ảnh neo của bộ) · front_night = chính diện ban đêm · gate_close = cận cảnh cổng và cửa tầng trệt · balcony_close = cận cảnh ban công tầng 2 · oblique = góc nghiêng từ tầm mắt · aerial = toàn cảnh từ trên cao, máy ảnh chúc 50–60° · axonometric = khối trục đo (tuỳ chọn).\n\nMột bộ có ĐÚNG MỘT ảnh cận cảnh: `balcony_close` khi mặt đứng có ban công, `gate_close` khi không. Chương trình chọn theo `ai_facade_concept.balconies`, không hỏi mô hình — nó đã có câu trả lời trong tay (T67).',
  );

export type AiImageSetView = z.infer<typeof aiImageSetViewSchema>;

/**
 * Bộ ảnh phối cảnh của NHÁNH AI — năm góc bắt buộc cùng MỘT ngôi nhà, cộng khối trục đo tuỳ chọn (T16, 09/09/2026; nới ở T67, 20/09/2026).
 *
 * CỐ Ý KHÔNG dùng lại `render-result` của bộ giải: hợp đồng kia là đầu ra Lớp 5 (`variant` là số nguyên, không có khái niệm ảnh neo, không ghi ảnh nào dựng từ ảnh nào) và phải xoá được cùng bộ giải.
 *
 * Cách giữ năm ảnh cùng một ngôi nhà: ảnh CHÍNH DIỆN BAN NGÀY dựng trước từ tờ mặt đứng vector, gọi là ẢNH NEO của bộ (`anchor: true`). Bốn góc còn lại dựng ảnh→ảnh với ảnh neo ấy làm tham chiếu, kèm cùng một đoạn mô tả vật liệu sinh từ ý tưởng mặt đứng. `source_refs` ghi lại đúng những gì đã gửi, để đọc artifact biết ảnh nào dẫn xuất từ ảnh nào.
 *
 * ⚠️ Tờ mặt đứng KHÔNG có chiều sâu, nên hai góc `oblique` và `aerial` nhận thêm một ảnh neo thứ hai: **tờ mặt bằng mái** nhìn thẳng từ trên, dựng từ chính toạ độ của phương án (hình bao từng tầng, sân trước, cổng, rào, hướng đường). Thiếu nó thì chiều sâu nhà, hình mái và vị trí gara nhìn từ trên cao là do mô hình đoán — tức hai tờ vẽ của cùng một ngôi nhà nói ngược nhau (T65).
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
    /**
     * Những tờ vector mà TRÌNH DUYỆT đã rasterise và gửi lên cho lượt chạy này.
     *
     * Ghi lại vì đây là dấu vết truy được DUY NHẤT cho một đầu vào máy chủ không kiểm được: Worker không có canvas, byte PNG do trình duyệt gửi, và không có cách chứng minh tấm nhận về đúng là tờ máy chủ vừa phát ra. Cùng lý do với `ai-facade-image.anchor`, khác ở chỗ một lượt phối cảnh cần NHIỀU tờ neo.
     */
    anchors: z
      .array(
        z
          .object({
            /** elevation = tờ mặt đứng vector không khung tên (dựng `front_day`) · roof_plan = tờ mặt bằng mái nhìn thẳng từ trên (dựng `oblique` và `aerial`). */
            kind: z
              .enum(['elevation', 'roof_plan'])
              .describe(
                'elevation = tờ mặt đứng vector không khung tên (dựng `front_day`) · roof_plan = tờ mặt bằng mái nhìn thẳng từ trên (dựng `oblique` và `aerial`).',
              ),
            uri: z.string().regex(/^(r2|supabase):\/\/.+/),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            bytes: z.number().int().gte(1),
            mime: z.enum(['image/png']),
          })
          .strict(),
      )
      .max(4)
      .describe(
        'Những tờ vector mà TRÌNH DUYỆT đã rasterise và gửi lên cho lượt chạy này.\n\nGhi lại vì đây là dấu vết truy được DUY NHẤT cho một đầu vào máy chủ không kiểm được: Worker không có canvas, byte PNG do trình duyệt gửi, và không có cách chứng minh tấm nhận về đúng là tờ máy chủ vừa phát ra. Cùng lý do với `ai-facade-image.anchor`, khác ở chỗ một lượt phối cảnh cần NHIỀU tờ neo.',
      ),
    /** Lựa chọn của kỹ sư cho cả bộ. Ghi vào artifact chứ không chỉ truyền qua lời dẫn: xem lại một bộ ảnh không có xe nào, phải phân biệt được «kỹ sư tắt» với «mô hình quên vẽ». */
    options: z
      .object({
        /** Cho phép mô hình thêm người, ô tô, xe máy vào ảnh. Bật thì số xe lấy theo đầu bài (`parking`), và xe KHÔNG được đứng chắn lối vào gara hay che cửa chính. Cây cối và chậu cảnh không chịu ô này — ảnh không có cây thì không ra ảnh trình khách. */
        people_and_vehicles: z
          .boolean()
          .describe(
            'Cho phép mô hình thêm người, ô tô, xe máy vào ảnh. Bật thì số xe lấy theo đầu bài (`parking`), và xe KHÔNG được đứng chắn lối vào gara hay che cửa chính. Cây cối và chậu cảnh không chịu ô này — ảnh không có cây thì không ra ảnh trình khách.',
          )
          .optional(),
      })
      .strict()
      .describe(
        'Lựa chọn của kỹ sư cho cả bộ. Ghi vào artifact chứ không chỉ truyền qua lời dẫn: xem lại một bộ ảnh không có xe nào, phải phân biệt được «kỹ sư tắt» với «mô hình quên vẽ».',
      )
      .optional(),
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
            /** Trích đoạn lời dẫn ĐÃ GHÉP của riêng góc này. Mỗi góc một lời dẫn khác nhau, và mô hình ảnh không tất định — biết đã mô tả thế nào là cách duy nhất hiểu vì sao tấm này ra như vậy. Cùng lý do với `ai-facade-image.prompt_excerpt`. */
            prompt_excerpt: z
              .string()
              .max(1200)
              .nullable()
              .describe(
                'Trích đoạn lời dẫn ĐÃ GHÉP của riêng góc này. Mỗi góc một lời dẫn khác nhau, và mô hình ảnh không tất định — biết đã mô tả thế nào là cách duy nhất hiểu vì sao tấm này ra như vậy. Cùng lý do với `ai-facade-image.prompt_excerpt`.',
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
    'Bộ ảnh phối cảnh của NHÁNH AI — năm góc bắt buộc cùng MỘT ngôi nhà, cộng khối trục đo tuỳ chọn (T16, 09/09/2026; nới ở T67, 20/09/2026).\n\nCỐ Ý KHÔNG dùng lại `render-result` của bộ giải: hợp đồng kia là đầu ra Lớp 5 (`variant` là số nguyên, không có khái niệm ảnh neo, không ghi ảnh nào dựng từ ảnh nào) và phải xoá được cùng bộ giải.\n\nCách giữ năm ảnh cùng một ngôi nhà: ảnh CHÍNH DIỆN BAN NGÀY dựng trước từ tờ mặt đứng vector, gọi là ẢNH NEO của bộ (`anchor: true`). Bốn góc còn lại dựng ảnh→ảnh với ảnh neo ấy làm tham chiếu, kèm cùng một đoạn mô tả vật liệu sinh từ ý tưởng mặt đứng. `source_refs` ghi lại đúng những gì đã gửi, để đọc artifact biết ảnh nào dẫn xuất từ ảnh nào.\n\n⚠️ Tờ mặt đứng KHÔNG có chiều sâu, nên hai góc `oblique` và `aerial` nhận thêm một ảnh neo thứ hai: **tờ mặt bằng mái** nhìn thẳng từ trên, dựng từ chính toạ độ của phương án (hình bao từng tầng, sân trước, cổng, rào, hướng đường). Thiếu nó thì chiều sâu nhà, hình mái và vị trí gara nhìn từ trên cao là do mô hình đoán — tức hai tờ vẽ của cùng một ngôi nhà nói ngược nhau (T65).\n\nGóc nào hỏng thì ghi vào `missing` kèm lý do — KHÔNG lặng lẽ trả về ít ảnh hơn.\n\nẢnh lưu trong bucket `design-renders`, `uri` dạng `supabase://` hoặc `r2://`; trình duyệt đọc qua endpoint có kiểm quyền, không đọc thẳng kho.',
  );

export type AiImageSet = z.infer<typeof aiImageSetSchema>;
