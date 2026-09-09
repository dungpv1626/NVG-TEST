/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-floor-plan.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiFloorPlanSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiFloorPlanSemver = z.infer<typeof aiFloorPlanSemverSchema>;

export const aiFloorPlanArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiFloorPlanArtifactRef = z.infer<typeof aiFloorPlanArtifactRefSchema>;

export const aiFloorPlanSpaceIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export type AiFloorPlanSpaceId = z.infer<typeof aiFloorPlanSpaceIdSchema>;

export const aiFloorPlanElemIdSchema = z
  .string()
  .max(24)
  .regex(/^[a-z0-9_]+$/);

export type AiFloorPlanElemId = z.infer<typeof aiFloorPlanElemIdSchema>;

/** Xăng-ti-mét nguyên. Toạ độ đo từ góc trước-trái lô đất. */
export const aiFloorPlanCmSchema = z
  .number()
  .int()
  .describe('Xăng-ti-mét nguyên. Toạ độ đo từ góc trước-trái lô đất.');

export type AiFloorPlanCm = z.infer<typeof aiFloorPlanCmSchema>;

/** [x, y] tính bằng cm. */
export const aiFloorPlanPointSchema = z
  .array(aiFloorPlanCmSchema)
  .min(2)
  .max(2)
  .describe('[x, y] tính bằng cm.');

export type AiFloorPlanPoint = z.infer<typeof aiFloorPlanPointSchema>;

/** [x0, y0, x1, y1] cm, với x1 > x0 và y1 > y0. */
export const aiFloorPlanRectSchema = z
  .array(aiFloorPlanCmSchema)
  .min(4)
  .max(4)
  .describe('[x0, y0, x1, y1] cm, với x1 > x0 và y1 > y0.');

export type AiFloorPlanRect = z.infer<typeof aiFloorPlanRectSchema>;

export const aiFloorPlanLevelSchema = z
  .object({
    /** Số tầng, 1 là tầng trệt. */
    level: z.number().int().gte(1).describe('Số tầng, 1 là tầng trệt.'),
    /** Tên tầng in trên tờ vẽ, tiếng Việt: «Tầng 1», «Tầng lửng», «Tầng mái». */
    name: z
      .string()
      .max(40)
      .describe('Tên tầng in trên tờ vẽ, tiếng Việt: «Tầng 1», «Tầng lửng», «Tầng mái».'),
    /** Chiều cao tầng (sàn tới sàn), cm. Quy ước cấu tạo gợi ý nằm ở kb/construction_norms.yaml và được gửi kèm lời dẫn. */
    h: aiFloorPlanCmSchema.describe(
      'Chiều cao tầng (sàn tới sàn), cm. Quy ước cấu tạo gợi ý nằm ở kb/construction_norms.yaml và được gửi kèm lời dẫn.',
    ),
    /** Hình bao khối xây của tầng, đa giác kín ngầm (điểm cuối tự nối điểm đầu). Nằm trong hình bao xây được mà lời dẫn đưa ra. */
    outline: z
      .array(aiFloorPlanPointSchema)
      .min(4)
      .max(24)
      .describe(
        'Hình bao khối xây của tầng, đa giác kín ngầm (điểm cuối tự nối điểm đầu). Nằm trong hình bao xây được mà lời dẫn đưa ra.',
      ),
    walls: z
      .array(
        z
          .object({
            id: aiFloorPlanElemIdSchema,
            /** Đầu tường, trên TIM tường. */
            a: aiFloorPlanPointSchema.describe('Đầu tường, trên TIM tường.'),
            /** Cuối tường, trên TIM tường. */
            b: aiFloorPlanPointSchema.describe('Cuối tường, trên TIM tường.'),
            /** Bề dày tường, cm, đối xứng qua tim. Bề dày thường dùng của NVG nằm ở kb/construction_norms.yaml. */
            t: aiFloorPlanCmSchema.describe(
              'Bề dày tường, cm, đối xứng qua tim. Bề dày thường dùng của NVG nằm ở kb/construction_norms.yaml.',
            ),
            /** e = tường bao (giáp ngoài trời hoặc giếng trời) · p = vách ngăn trong nhà · r = lan can ban công, sân thượng. */
            k: z
              .enum(['e', 'p', 'r'])
              .describe(
                'e = tường bao (giáp ngoài trời hoặc giếng trời) · p = vách ngăn trong nhà · r = lan can ban công, sân thượng.',
              ),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    rooms: z
      .array(
        z
          .object({
            /** Mã LẤY TỪ chương trình không gian (`ai_space_program.spaces[].id`). Không đặt mã mới, không bỏ phòng nào. */
            id: aiFloorPlanSpaceIdSchema.describe(
              'Mã LẤY TỪ chương trình không gian (`ai_space_program.spaces[].id`). Không đặt mã mới, không bỏ phòng nào.',
            ),
            type: aiFloorPlanSpaceIdSchema,
            /** Kích thước LỌT LÒNG của phòng — mặt trong tường tới mặt trong tường. Nhờ vậy cảnh báo kích thước tối thiểu so thẳng với ngưỡng quy chuẩn mà không phải trừ bề dày. */
            rect: aiFloorPlanRectSchema.describe(
              'Kích thước LỌT LÒNG của phòng — mặt trong tường tới mặt trong tường. Nhờ vậy cảnh báo kích thước tối thiểu so thẳng với ngưỡng quy chuẩn mà không phải trừ bề dày.',
            ),
            /** Diện tích phòng, m². Khai để đối chiếu với chữ nhật và với chương trình không gian; lệch quá 10% hoặc 1 m² là lỗi phải sửa. */
            area_m2: z
              .number()
              .gt(0)
              .describe(
                'Diện tích phòng, m². Khai để đối chiếu với chữ nhật và với chương trình không gian; lệch quá 10% hoặc 1 m² là lỗi phải sửa.',
              ),
            /** Chữ in trong phòng, tiếng Việt. Rỗng thì bộ vẽ tự lấy nhãn từ kb/room_vocabulary.yaml — chỉ khai khi cần tên khác («Phòng ngủ ông bà»). */
            label: z
              .string()
              .max(40)
              .nullable()
              .describe(
                'Chữ in trong phòng, tiếng Việt. Rỗng thì bộ vẽ tự lấy nhãn từ kb/room_vocabulary.yaml — chỉ khai khi cần tên khác («Phòng ngủ ông bà»).',
              )
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    doors: z
      .array(
        z
          .object({
            id: aiFloorPlanElemIdSchema,
            /** Mã đoạn tường chứa cửa. */
            wall: aiFloorPlanElemIdSchema.describe('Mã đoạn tường chứa cửa.'),
            /** Khoảng cách từ đầu `a` của tường tới MÉP GẦN của lỗ cửa, cm. */
            at: aiFloorPlanCmSchema.describe(
              'Khoảng cách từ đầu `a` của tường tới MÉP GẦN của lỗ cửa, cm.',
            ),
            /** Bề rộng lỗ cửa thông thuỷ, cm. */
            w: aiFloorPlanCmSchema.describe('Bề rộng lỗ cửa thông thuỷ, cm.'),
            /** Bản lề ở phía đầu `a` hay đầu `b` của tường. Rỗng với cửa trượt và ô thông không cánh. */
            hinge: z
              .union([z.literal('a'), z.literal('b'), z.literal(null)])
              .nullable()
              .describe(
                'Bản lề ở phía đầu `a` hay đầu `b` của tường. Rỗng với cửa trượt và ô thông không cánh.',
              )
              .optional(),
            /** Cánh mở về bên trái hay bên phải khi đứng ở `a` nhìn về `b`. */
            side: z
              .union([z.literal('l'), z.literal('r'), z.literal(null)])
              .nullable()
              .describe('Cánh mở về bên trái hay bên phải khi đứng ở `a` nhìn về `b`.')
              .optional(),
            /** single = cửa một cánh · double = hai cánh · sliding = cửa trượt · garage = cửa để xe · gate = cổng · opening = ô thông không cánh. */
            kind: z
              .enum(['single', 'double', 'sliding', 'garage', 'gate', 'opening'])
              .describe(
                'single = cửa một cánh · double = hai cánh · sliding = cửa trượt · garage = cửa để xe · gate = cổng · opening = ô thông không cánh.',
              ),
          })
          .strict(),
      )
      .max(120)
      .optional(),
    windows: z
      .array(
        z
          .object({
            id: aiFloorPlanElemIdSchema,
            wall: aiFloorPlanElemIdSchema,
            at: aiFloorPlanCmSchema,
            w: aiFloorPlanCmSchema,
            /** Cao độ bệ cửa sổ so với mặt sàn tầng, cm. */
            sill: aiFloorPlanCmSchema
              .describe('Cao độ bệ cửa sổ so với mặt sàn tầng, cm.')
              .optional(),
            /** Chiều cao ô cửa sổ, cm. */
            h: aiFloorPlanCmSchema.describe('Chiều cao ô cửa sổ, cm.').optional(),
          })
          .strict(),
      )
      .max(160)
      .optional(),
    stairs: z
      .array(
        z
          .object({
            id: aiFloorPlanElemIdSchema,
            rect: aiFloorPlanRectSchema,
            /** Chiều đi LÊN của vế thang đầu tiên. */
            up: z.enum(['+x', '-x', '+y', '-y']).describe('Chiều đi LÊN của vế thang đầu tiên.'),
            flights: z.number().int().gte(1).lte(3).optional(),
            /** Tổng số bậc trong ô thang này. */
            treads: z
              .number()
              .int()
              .gte(2)
              .lte(40)
              .describe('Tổng số bậc trong ô thang này.')
              .optional(),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    voids: z
      .array(
        z
          .object({
            id: aiFloorPlanElemIdSchema,
            /** light_well = giếng trời · courtyard = sân trong · atrium = thông tầng · void = ô trống trên thang. */
            kind: z
              .enum(['light_well', 'courtyard', 'atrium', 'void'])
              .describe(
                'light_well = giếng trời · courtyard = sân trong · atrium = thông tầng · void = ô trống trên thang.',
              ),
            rect: aiFloorPlanRectSchema,
          })
          .strict(),
      )
      .max(12)
      .optional(),
  })
  .strict();

export type AiFloorPlanLevel = z.infer<typeof aiFloorPlanLevelSchema>;

export const aiFloorPlanGeneratorSchema = z
  .object({
    kind: z.enum(['ai']),
    provider: z.string().max(32),
    model: z.string().max(96),
    route: z.string().max(64),
    prompt_version: z.string().max(16),
    repaired: z.boolean().optional(),
    /** Tường trong artifact này do CHƯƠNG TRÌNH suy từ chữ nhật phòng, không phải mô hình khai (T19): sau một lượt sửa mà tường vẫn không bao kín phòng thì suy hộ để tờ vẽ vẫn dùng được. Bật cờ này thì tờ vẽ và màn hình phải nói ra. */
    walls_derived: z
      .boolean()
      .describe(
        'Tường trong artifact này do CHƯƠNG TRÌNH suy từ chữ nhật phòng, không phải mô hình khai (T19): sau một lượt sửa mà tường vẫn không bao kín phòng thì suy hộ để tờ vẽ vẫn dùng được. Bật cờ này thì tờ vẽ và màn hình phải nói ra.',
      )
      .optional(),
  })
  .strict();

export type AiFloorPlanGenerator = z.infer<typeof aiFloorPlanGeneratorSchema>;

/**
 * Mặt bằng của NHÁNH AI — toàn bộ NỘI DUNG bản vẽ dưới dạng dữ liệu, một artifact cho cả phương án (mọi tầng).
 *
 * Quyết định T15 (09/09/2026 — Haan): «AI thiết kế, chương trình cầm bút». Mô hình khai từng đoạn tường kèm bề dày, từng cửa và cửa sổ kèm vị trí và chiều mở, thang, tên phòng và diện tích; bộ vẽ tất định trong Worker (`ai/draw/`) đặt lên giấy. Thay cho phương án cũ (T14) để mô hình tự viết chuỗi SVG — đo thật 09/09 cho ra bản phác không cửa, không chuỗi kích thước, vách không bề dày.
 *
 * Vì sao dữ liệu chứ không phải tệp vẽ: dữ liệu KIỂM ĐƯỢC. Thiếu cửa, cửa đặt ngoài tường, tường không bao kín phòng, diện tích khai lệch chữ nhật — máy bắt được và yêu cầu mô hình sửa. Một tệp SVG thì chỉ đếm được ký tự.
 *
 * ĐƠN VỊ: xăng-ti-mét NGUYÊN, không phải mét. Số nguyên để hai lượt gọi cùng đầu vào cho cùng mã băm artifact, và để mô hình không sinh 3.4499999. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.
 *
 * KHÔNG khai chuỗi kích thước: bộ vẽ suy từ chính toạ độ tường. Bắt mô hình khai lại là thêm ~30% token và thêm một cách sai mới — một chuỗi kích thước cộng không ra tổng là bản vẽ không kiến trúc sư nào tin.
 *
 * KHÔNG khai cửa phục vụ phòng nào: máy suy từ hình học (điểm giữa lỗ mở lùi vào mỗi bên nửa bề dày tường rơi vào phòng nào).
 *
 * Kết quả là ĐỀ XUẤT: không thành `floor_plan` chuẩn, không qua Container, không xuất DXF, không lên hồ sơ phát hành. Lệch quy chuẩn QUỐC GIA (`rules/base/`) hiện thành cảnh báo, không chặn.
 */
export const aiFloorPlanSchema = z
  .object({
    schema_version: aiFloorPlanSemverSchema,
    /** Chương trình không gian (`ai_space_program`) mà mặt bằng bám theo. Worker điền. */
    program_ref: aiFloorPlanArtifactRefSchema.describe(
      'Chương trình không gian (`ai_space_program`) mà mặt bằng bám theo. Worker điền.',
    ),
    /** Mã phương án: AI-A, AI-B, AI-C. Worker điền theo ý đồ bố cục đã gửi, không hỏi mô hình — ba lượt gọi song song sẽ đặt trùng nhau. */
    variant_id: z
      .string()
      .regex(/^AI-[A-Z]$/)
      .describe(
        'Mã phương án: AI-A, AI-B, AI-C. Worker điền theo ý đồ bố cục đã gửi, không hỏi mô hình — ba lượt gọi song song sẽ đặt trùng nhau.',
      ),
    /** Tên phương án bằng tiếng Việt, mô tả CẤU TRÚC («Lõi thang giữa, bếp thông phòng ăn»), không phải số. */
    variant_label: z
      .string()
      .max(120)
      .describe(
        'Tên phương án bằng tiếng Việt, mô tả CẤU TRÚC («Lõi thang giữa, bếp thông phòng ăn»), không phải số.',
      ),
    /** Ý đồ bố cục Worker đã gửi kèm, giữ lại để đọc artifact biết phương án này theo hướng nào. */
    strategy: z
      .string()
      .max(200)
      .nullable()
      .describe(
        'Ý đồ bố cục Worker đã gửi kèm, giữ lại để đọc artifact biết phương án này theo hướng nào.',
      )
      .optional(),
    /** Góc của hướng bắc so với trục +y của bản vẽ, độ, cùng chiều kim đồng hồ. Worker suy từ hướng nhà trong đầu bài — mô hình không biết hướng và không được hỏi. */
    north_deg: z
      .number()
      .gte(0)
      .lt(360)
      .describe(
        'Góc của hướng bắc so với trục +y của bản vẽ, độ, cùng chiều kim đồng hồ. Worker suy từ hướng nhà trong đầu bài — mô hình không biết hướng và không được hỏi.',
      )
      .optional(),
    levels: z.array(aiFloorPlanLevelSchema).min(1).max(12),
    /** Vì sao bố cục như vậy, tiếng Việt, 2–5 câu. */
    rationale: z.string().max(1500).describe('Vì sao bố cục như vậy, tiếng Việt, 2–5 câu.'),
    generator: aiFloorPlanGeneratorSchema,
  })
  .strict()
  .describe(
    'Mặt bằng của NHÁNH AI — toàn bộ NỘI DUNG bản vẽ dưới dạng dữ liệu, một artifact cho cả phương án (mọi tầng).\n\nQuyết định T15 (09/09/2026 — Haan): «AI thiết kế, chương trình cầm bút». Mô hình khai từng đoạn tường kèm bề dày, từng cửa và cửa sổ kèm vị trí và chiều mở, thang, tên phòng và diện tích; bộ vẽ tất định trong Worker (`ai/draw/`) đặt lên giấy. Thay cho phương án cũ (T14) để mô hình tự viết chuỗi SVG — đo thật 09/09 cho ra bản phác không cửa, không chuỗi kích thước, vách không bề dày.\n\nVì sao dữ liệu chứ không phải tệp vẽ: dữ liệu KIỂM ĐƯỢC. Thiếu cửa, cửa đặt ngoài tường, tường không bao kín phòng, diện tích khai lệch chữ nhật — máy bắt được và yêu cầu mô hình sửa. Một tệp SVG thì chỉ đếm được ký tự.\n\nĐƠN VỊ: xăng-ti-mét NGUYÊN, không phải mét. Số nguyên để hai lượt gọi cùng đầu vào cho cùng mã băm artifact, và để mô hình không sinh 3.4499999. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.\n\nKHÔNG khai chuỗi kích thước: bộ vẽ suy từ chính toạ độ tường. Bắt mô hình khai lại là thêm ~30% token và thêm một cách sai mới — một chuỗi kích thước cộng không ra tổng là bản vẽ không kiến trúc sư nào tin.\n\nKHÔNG khai cửa phục vụ phòng nào: máy suy từ hình học (điểm giữa lỗ mở lùi vào mỗi bên nửa bề dày tường rơi vào phòng nào).\n\nKết quả là ĐỀ XUẤT: không thành `floor_plan` chuẩn, không qua Container, không xuất DXF, không lên hồ sơ phát hành. Lệch quy chuẩn QUỐC GIA (`rules/base/`) hiện thành cảnh báo, không chặn.',
  );

export type AiFloorPlan = z.infer<typeof aiFloorPlanSchema>;
