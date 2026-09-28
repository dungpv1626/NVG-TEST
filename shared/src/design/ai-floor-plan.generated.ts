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

/** Xăng-ti-mét, lưới nửa centimet. Toạ độ đo từ góc trước-trái lô đất. Khai SỐ NGUYÊN. */
export const aiFloorPlanCmSchema = z
  .number()
  .multipleOf(0.5)
  .describe('Xăng-ti-mét, lưới nửa centimet. Toạ độ đo từ góc trước-trái lô đất. Khai SỐ NGUYÊN.');

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

export const aiFloorPlanTreeIdSchema = z
  .string()
  .max(32)
  .regex(/^[a-z0-9_]+$/);

export type AiFloorPlanTreeId = z.infer<typeof aiFloorPlanTreeIdSchema>;

/** Cây chia của tầng này — mọi toạ độ của tầng suy ra từ đây. T37: mô hình khai; từ T43 (14/09/2026): bộ giải `ai/arrange/` dựng từ ý định. TUỲ CHỌN: artifact đúc trước 13/09/2026 không có. */
export const aiFloorPlanTreeSchema = z
  .object({
    footprint: aiFloorPlanRectSchema,
    nodes: z
      .array(
        z
          .object({
            id: aiFloorPlanTreeIdSchema,
            cut: z.enum(['x', 'y']),
            at: aiFloorPlanCmSchema,
            a: aiFloorPlanTreeIdSchema,
            b: aiFloorPlanTreeIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(59),
    also: z
      .array(
        z
          .object({
            room: aiFloorPlanTreeIdSchema,
            with: z.array(aiFloorPlanTreeIdSchema).min(1).max(2),
          })
          .strict(),
      )
      .max(6),
    doors: z
      .array(
        z
          .object({
            a: aiFloorPlanTreeIdSchema,
            b: aiFloorPlanTreeIdSchema,
            kind: z.enum(['single', 'double', 'sliding', 'garage', 'gate', 'opening']),
            full: z.boolean().nullable().optional(),
            place: z
              .union([z.literal('start'), z.literal('middle'), z.literal('end'), z.literal(null)])
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    stair: z
      .object({
        room: aiFloorPlanTreeIdSchema,
        up: z.enum(['+x', '-x', '+y', '-y']),
      })
      .strict()
      .nullable(),
    no_window: z.array(aiFloorPlanTreeIdSchema).max(20),
  })
  .strict()
  .describe(
    'Cây chia của tầng này — mọi toạ độ của tầng suy ra từ đây. T37: mô hình khai; từ T43 (14/09/2026): bộ giải `ai/arrange/` dựng từ ý định. TUỲ CHỌN: artifact đúc trước 13/09/2026 không có.',
  );

export type AiFloorPlanTree = z.infer<typeof aiFloorPlanTreeSchema>;

export const aiFloorPlanZoneSchema = z.enum([
  'front_left',
  'front',
  'front_right',
  'left',
  'center',
  'right',
  'back_left',
  'back',
  'back_right',
]);

export type AiFloorPlanZone = z.infer<typeof aiFloorPlanZoneSchema>;

/** Ý định bố cục mô hình đã khai cho tầng này (T43), SAU khi chương trình chuẩn hoá (vùng mặc định, bỏ quan hệ trỏ phòng lạ). TUỲ CHỌN: artifact đúc trước 14/09/2026 không có. */
export const aiFloorPlanIntentSchema = z
  .object({
    rooms: z
      .array(
        z
          .object({
            id: aiFloorPlanTreeIdSchema,
            zone: aiFloorPlanZoneSchema,
            street_facing: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    relationships: z
      .array(
        z
          .object({
            a: aiFloorPlanTreeIdSchema,
            b: aiFloorPlanTreeIdSchema,
            kind: z.enum(['adjacent', 'near', 'far', 'open']),
          })
          .strict(),
      )
      .max(30),
    entry_room: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .nullable(),
    garage_room: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .nullable(),
  })
  .strict()
  .describe(
    'Ý định bố cục mô hình đã khai cho tầng này (T43), SAU khi chương trình chuẩn hoá (vùng mặc định, bỏ quan hệ trỏ phòng lạ). TUỲ CHỌN: artifact đúc trước 14/09/2026 không có.',
  );

export type AiFloorPlanIntent = z.infer<typeof aiFloorPlanIntentSchema>;

/** Bộ giải đã chọn cây của tầng này ra sao (T43): dựng bao nhiêu ứng viên, bao nhiêu qua cổng, cây được chọn khớp ý định bao nhiêu. TUỲ CHỌN. */
export const aiFloorPlanArrangeSchema = z
  .object({
    /** Số cây ứng viên đã dựng được. */
    candidates: z.number().int().gte(0).describe('Số cây ứng viên đã dựng được.'),
    /** Số ứng viên qua cổng kiểm. */
    passed: z.number().int().gte(0).describe('Số ứng viên qua cổng kiểm.'),
    /** Độ khớp ý định của cây được chọn: vùng, quan hệ, mặt tiền. */
    intent_fit: z
      .number()
      .gte(0)
      .lte(1)
      .describe('Độ khớp ý định của cây được chọn: vùng, quan hệ, mặt tiền.'),
    /** Khoá bộ khung của cây được chọn — để truy vết, không hiển thị. */
    parti: z
      .string()
      .max(120)
      .describe('Khoá bộ khung của cây được chọn — để truy vết, không hiển thị.'),
    /** Vòng nới đã phải dùng (0 = không nới). */
    relaxed: z
      .number()
      .int()
      .gte(0)
      .lte(4)
      .describe('Vòng nới đã phải dùng (0 = không nới).')
      .optional(),
  })
  .strict()
  .describe(
    'Bộ giải đã chọn cây của tầng này ra sao (T43): dựng bao nhiêu ứng viên, bao nhiêu qua cổng, cây được chọn khớp ý định bao nhiêu. TUỲ CHỌN.',
  );

export type AiFloorPlanArrange = z.infer<typeof aiFloorPlanArrangeSchema>;

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
    /** Thuộc tính MẶT của từng cạnh hình bao, cùng thứ tự và cùng số lượng với `outline` — cạnh i nối điểm i với điểm i+1, cạnh cuối nối về điểm đầu. open = giáp ngoài trời, lấy được sáng và gió · boundary = giáp nhà hàng xóm hoặc ranh đất, KHÔNG phải mặt thoáng · unknown = chưa suy được. WORKER ĐIỀN từ hiện trạng bốn phía của đầu bài; mô hình không khai. */
    outline_faces: z
      .array(z.enum(['open', 'boundary', 'unknown']))
      .max(24)
      .describe(
        'Thuộc tính MẶT của từng cạnh hình bao, cùng thứ tự và cùng số lượng với `outline` — cạnh i nối điểm i với điểm i+1, cạnh cuối nối về điểm đầu. open = giáp ngoài trời, lấy được sáng và gió · boundary = giáp nhà hàng xóm hoặc ranh đất, KHÔNG phải mặt thoáng · unknown = chưa suy được. WORKER ĐIỀN từ hiện trạng bốn phía của đầu bài; mô hình không khai.',
      )
      .optional(),
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
            /** Mã phòng KHÁC mà chính chữ nhật này cũng phục vụ — khai khi chương trình không gian có hai phòng mà bố cục gộp làm một không gian mở (bếp + ăn, khách + thờ). Diện tích yêu cầu khi đối chiếu là TỔNG của phòng chính và các mã ở đây. */
            also: z
              .array(aiFloorPlanSpaceIdSchema)
              .max(4)
              .describe(
                'Mã phòng KHÁC mà chính chữ nhật này cũng phục vụ — khai khi chương trình không gian có hai phòng mà bố cục gộp làm một không gian mở (bếp + ăn, khách + thờ). Diện tích yêu cầu khi đối chiếu là TỔNG của phòng chính và các mã ở đây.',
              )
              .optional(),
            /** Các khu của một không gian mở, để tờ vẽ ghi tên từng khu. Chỉ có ở phòng mang `also`. */
            parts: z
              .array(
                z
                  .object({
                    id: aiFloorPlanSpaceIdSchema,
                    type: aiFloorPlanSpaceIdSchema,
                    /** Phần chữ nhật của phòng ghép mà khu này chiếm — RANH MỀM, không có tường. */
                    rect: aiFloorPlanRectSchema.describe(
                      'Phần chữ nhật của phòng ghép mà khu này chiếm — RANH MỀM, không có tường.',
                    ),
                    area_m2: z.number().gt(0),
                  })
                  .strict(),
              )
              .max(5)
              .describe(
                'Các khu của một không gian mở, để tờ vẽ ghi tên từng khu. Chỉ có ở phòng mang `also`.',
              )
              .optional(),
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
            /** Bề sâu mặt bậc, cm — CHƯƠNG TRÌNH điền từ `kb/construction_norms.yaml`. Có mặt thì tờ vẽ giữ đúng mặt bậc này và để chiếu nghỉ nhận phần dư của ô thang (T70); vắng (artifact trước 23/09/2026) thì rải đều bậc trên chiều dài ô thang. */
            going: z
              .number()
              .int()
              .gte(15)
              .lte(45)
              .describe(
                'Bề sâu mặt bậc, cm — CHƯƠNG TRÌNH điền từ `kb/construction_norms.yaml`. Có mặt thì tờ vẽ giữ đúng mặt bậc này và để chiếu nghỉ nhận phần dư của ô thang (T70); vắng (artifact trước 23/09/2026) thì rải đều bậc trên chiều dài ô thang.',
              )
              .optional(),
          })
          .strict(),
      )
      .max(4)
      .optional(),
    /** Bậc ở lối vào (bậc tam cấp) ngoài cửa chính, chỉ ở tầng 1 — CHƯƠNG TRÌNH đặt (T70), mô hình không khai. Chỉ có khi đầu bài khai chênh cốt nền hoặc số bậc; không khai thì vắng, không đoán. */
    entry_steps: z
      .array(
        z
          .object({
            id: aiFloorPlanElemIdSchema,
            /** Phần đất bậc chiếm, NGOÀI mặt tường, cm. */
            rect: aiFloorPlanRectSchema.describe('Phần đất bậc chiếm, NGOÀI mặt tường, cm.'),
            /** Chiều đi XUỐNG — từ cửa chính ra sân. */
            down: z
              .enum(['+x', '-x', '+y', '-y'])
              .describe('Chiều đi XUỐNG — từ cửa chính ra sân.'),
            /** Số bậc. Bậc 1 là bậc ngoài cùng, thấp nhất. */
            risers: z
              .number()
              .int()
              .gte(1)
              .lte(12)
              .describe('Số bậc. Bậc 1 là bậc ngoài cùng, thấp nhất.'),
            /** Bề sâu mặt bậc, cm. */
            going: z.number().int().gte(15).lte(60).describe('Bề sâu mặt bậc, cm.'),
          })
          .strict(),
      )
      .max(4)
      .describe(
        'Bậc ở lối vào (bậc tam cấp) ngoài cửa chính, chỉ ở tầng 1 — CHƯƠNG TRÌNH đặt (T70), mô hình không khai. Chỉ có khi đầu bài khai chênh cốt nền hoặc số bậc; không khai thì vắng, không đoán.',
      )
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
    tree: aiFloorPlanTreeSchema.optional(),
    intent: aiFloorPlanIntentSchema.optional(),
    arrange: aiFloorPlanArrangeSchema.optional(),
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
    /** Có ít nhất một lượt gọi thứ hai. Từ T39 (13/09/2026) nghĩa là đã LẤY MẪU LẠI ít nhất một tầng — không còn lượt vá bản cũ; tầng nào thì xem `resampled_levels`. */
    repaired: z
      .boolean()
      .describe(
        'Có ít nhất một lượt gọi thứ hai. Từ T39 (13/09/2026) nghĩa là đã LẤY MẪU LẠI ít nhất một tầng — không còn lượt vá bản cũ; tầng nào thì xem `resampled_levels`.',
      )
      .optional(),
    /** tree = mô hình khai cây chia theo từng tầng, chương trình gán số (T37) · intent = mô hình khai ý định bố cục, chương trình dựng cây chia (T43). Vắng = artifact đúc trước 13/09/2026, mô hình khai chữ nhật phòng. */
    layout: z
      .enum(['tree', 'intent'])
      .describe(
        'tree = mô hình khai cây chia theo từng tầng, chương trình gán số (T37) · intent = mô hình khai ý định bố cục, chương trình dựng cây chia (T43). Vắng = artifact đúc trước 13/09/2026, mô hình khai chữ nhật phòng.',
      )
      .optional(),
    /** Tầng đã phải lấy mẫu lại vì lượt đầu không qua cổng kiểm (T39). */
    resampled_levels: z
      .array(z.number().int().gte(1))
      .max(12)
      .describe('Tầng đã phải lấy mẫu lại vì lượt đầu không qua cổng kiểm (T39).')
      .optional(),
    /** Tường trong artifact này do CHƯƠNG TRÌNH suy từ chữ nhật phòng, không phải mô hình khai (T19): sau một lượt sửa mà tường vẫn không bao kín phòng thì suy hộ để tờ vẽ vẫn dùng được. Bật cờ này thì tờ vẽ và màn hình phải nói ra. */
    walls_derived: z
      .boolean()
      .describe(
        'Tường trong artifact này do CHƯƠNG TRÌNH suy từ chữ nhật phòng, không phải mô hình khai (T19): sau một lượt sửa mà tường vẫn không bao kín phòng thì suy hộ để tờ vẽ vẫn dùng được. Bật cờ này thì tờ vẽ và màn hình phải nói ra.',
      )
      .optional(),
    /** Có mặt khi phương án này là bản SỬA của một phương án khác theo yêu cầu kỹ sư (T53). */
    edit: z
      .object({
        /** Nguyên văn yêu cầu kỹ sư gõ vào ô «Yêu cầu sửa». */
        instruction: z
          .string()
          .max(2000)
          .describe('Nguyên văn yêu cầu kỹ sư gõ vào ô «Yêu cầu sửa».'),
        /** Mã artifact mặt bằng được sửa. */
        base_ref: z.string().max(80).describe('Mã artifact mặt bằng được sửa.'),
        /** Thao tác đã áp (ai-plan-edit). */
        ops: z.array(z.object({}).passthrough()).max(40).describe('Thao tác đã áp (ai-plan-edit).'),
      })
      .strict()
      .nullable()
      .describe(
        'Có mặt khi phương án này là bản SỬA của một phương án khác theo yêu cầu kỹ sư (T53).',
      )
      .optional(),
  })
  .strict();

export type AiFloorPlanGenerator = z.infer<typeof aiFloorPlanGeneratorSchema>;

/** Điểm chất lượng do CHƯƠNG TRÌNH chấm (`ai/plan-score.ts`), không hỏi mô hình. TUỲ CHỌN: artifact đúc trước 12/09/2026 không có trường này và vẫn phải đọc lại được. */
export const aiFloorPlanScoreSchema = z
  .object({
    /** Phiên bản THƯỚC chấm (`kb/plan_quality.yaml`), không phải phiên bản mặt bằng. */
    score_version: z
      .number()
      .int()
      .gte(1)
      .describe('Phiên bản THƯỚC chấm (`kb/plan_quality.yaml`), không phải phiên bản mặt bằng.'),
    /** Điểm tuyệt đối. Đọc PHẢI kèm `scored_weight`: 72 trên 85 phần trọng số chấm được, không phải 72/100. */
    points: z
      .number()
      .gte(0)
      .lte(100)
      .describe(
        'Điểm tuyệt đối. Đọc PHẢI kèm `scored_weight`: 72 trên 85 phần trọng số chấm được, không phải 72/100.',
      ),
    /** Tổng trọng số thật sự chấm được. Dưới 100 nghĩa là có tiêu chí thiếu đầu vào; phần thiếu KHÔNG được chia lại cho tiêu chí khác. */
    scored_weight: z
      .number()
      .gte(0)
      .lte(100)
      .describe(
        'Tổng trọng số thật sự chấm được. Dưới 100 nghĩa là có tiêu chí thiếu đầu vào; phần thiếu KHÔNG được chia lại cho tiêu chí khác.',
      ),
    /** Phần trọng số đã chấm mà dựa trên ngưỡng CHƯA AI ĐO (`n = 0`). Màn hình phải nói ra (T31). */
    reasoned_weight: z
      .number()
      .gte(0)
      .lte(100)
      .describe(
        'Phần trọng số đã chấm mà dựa trên ngưỡng CHƯA AI ĐO (`n = 0`). Màn hình phải nói ra (T31).',
      ),
    groups: z
      .array(
        z
          .object({
            code: z.string().max(8),
            weight: z.number().gte(0).lte(100),
            scored_weight: z.number().gte(0).lte(100),
            points: z.number().gte(0).lte(100),
          })
          .strict(),
      )
      .max(12),
    criteria: z
      .array(
        z
          .object({
            code: z.string().max(8),
            group: z.string().max(8),
            /** Giá trị đo được, đơn vị theo tiêu chí. Rỗng = chưa chấm được. */
            value: z
              .number()
              .nullable()
              .describe('Giá trị đo được, đơn vị theo tiêu chí. Rỗng = chưa chấm được.')
              .optional(),
            score: z.number().gte(0).lte(1).nullable().optional(),
            /** Trọng số DANH NGHĨA. Tiêu chí thiếu dữ liệu vẫn mang trọng số của nó, chỉ không cộng vào điểm. */
            weight: z
              .number()
              .gte(0)
              .lte(100)
              .describe(
                'Trọng số DANH NGHĨA. Tiêu chí thiếu dữ liệu vẫn mang trọng số của nó, chỉ không cộng vào điểm.',
              ),
            /** Số mẫu đã đo. 0 = ngưỡng hoàn toàn là suy luận. */
            n: z.number().int().gte(0).describe('Số mẫu đã đo. 0 = ngưỡng hoàn toàn là suy luận.'),
            label: z.string().max(64).optional(),
            /** gate = cổng dữ liệu đã bảo đảm nên không phải tiêu chí chấm điểm · thieu_du_lieu = phương án này không có đầu vào. */
            not_scored: z
              .union([z.literal('gate'), z.literal('thieu_du_lieu'), z.literal(null)])
              .nullable()
              .describe(
                'gate = cổng dữ liệu đã bảo đảm nên không phải tiêu chí chấm điểm · thieu_du_lieu = phương án này không có đầu vào.',
              )
              .optional(),
            /** Câu tiếng Việt nói vì sao không chấm được — hiện THAY cho con số, không hiện 0. */
            why: z
              .string()
              .max(240)
              .nullable()
              .describe(
                'Câu tiếng Việt nói vì sao không chấm được — hiện THAY cho con số, không hiện 0.',
              )
              .optional(),
            /** Phần tử bị trừ điểm. Dùng cho màn hình VÀ cho ghi chú «tránh những chỗ này» của lượt lấy mẫu sau (T25). */
            refs: z
              .array(aiFloorPlanSpaceIdSchema)
              .max(60)
              .describe(
                'Phần tử bị trừ điểm. Dùng cho màn hình VÀ cho ghi chú «tránh những chỗ này» của lượt lấy mẫu sau (T25).',
              )
              .optional(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict()
  .describe(
    'Điểm chất lượng do CHƯƠNG TRÌNH chấm (`ai/plan-score.ts`), không hỏi mô hình. TUỲ CHỌN: artifact đúc trước 12/09/2026 không có trường này và vẫn phải đọc lại được.',
  );

export type AiFloorPlanScore = z.infer<typeof aiFloorPlanScoreSchema>;

/**
 * Mặt bằng của NHÁNH AI — toàn bộ NỘI DUNG bản vẽ dưới dạng dữ liệu, một artifact cho cả phương án (mọi tầng).
 *
 * Quyết định T15 (09/09/2026 — Haan): «AI thiết kế, chương trình cầm bút». Mô hình khai từng đoạn tường kèm bề dày, từng cửa và cửa sổ kèm vị trí và chiều mở, thang, tên phòng và diện tích; bộ vẽ tất định trong Worker (`ai/draw/`) đặt lên giấy. Thay cho phương án cũ (T14) để mô hình tự viết chuỗi SVG — đo thật 09/09 cho ra bản phác không cửa, không chuỗi kích thước, vách không bề dày.
 *
 * Vì sao dữ liệu chứ không phải tệp vẽ: dữ liệu KIỂM ĐƯỢC. Thiếu cửa, cửa đặt ngoài tường, tường không bao kín phòng, diện tích khai lệch chữ nhật — máy bắt được và yêu cầu mô hình sửa. Một tệp SVG thì chỉ đếm được ký tự.
 *
 * ĐƠN VỊ: xăng-ti-mét, không phải mét, trên lưới nửa centimet. Mô hình khai SỐ NGUYÊN (lời dẫn nói thẳng), còn nửa centimet dành cho chương trình — tim vách 11 cm giữa hai phòng rơi vào x,5. Không có số thực tự do: hai lượt gọi cùng đầu vào phải cho cùng mã băm artifact. Xem `$defs.cm`. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.
 *
 * KHÔNG khai chuỗi kích thước: bộ vẽ suy từ chính toạ độ tường. Bắt mô hình khai lại là thêm ~30% token và thêm một cách sai mới — một chuỗi kích thước cộng không ra tổng là bản vẽ không kiến trúc sư nào tin.
 *
 * KHÔNG khai cửa phục vụ phòng nào: máy suy từ hình học (điểm giữa lỗ mở lùi vào mỗi bên nửa bề dày tường rơi vào phòng nào).
 *
 * Kết quả là ĐỀ XUẤT: không thành `floor_plan` chuẩn, không qua Container, không lên hồ sơ phát hành.
 *
 * Từ T37 (13/09/2026) mô hình KHÔNG khai toạ độ nào của tầng ngoài nhát cắt của cây chia (`levels[].tree`); tường, phòng, cửa, cửa sổ và thang trong artifact đều do chương trình suy từ cây (`ai/tree/`). Artifact chỉ được ghi khi mọi tầng đã qua cổng kiểm (T39).
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
    /** Ý đồ bố cục Worker đã gửi kèm, giữ lại NGUYÊN VĂN để đọc artifact biết phương án này theo hướng nào. Trần 600 chứ không phải 200: con số 200 là một phỏng đoán, và ba ý đồ thật ở `kb/ai_design_prompts.yaml` dài 241–301 ký tự — nên MỌI lượt ghi đều bị từ chối, sau khi đã trả tiền hai lượt gọi mô hình (đo 11/09/2026). Ý đồ bố cục là DỮ LIỆU sẽ dài ra theo mỗi lần chỉnh lời dẫn, nên trần phải có chỗ thở, và có phép thử đối chiếu hai nguồn với nhau. */
    strategy: z
      .string()
      .max(600)
      .nullable()
      .describe(
        'Ý đồ bố cục Worker đã gửi kèm, giữ lại NGUYÊN VĂN để đọc artifact biết phương án này theo hướng nào. Trần 600 chứ không phải 200: con số 200 là một phỏng đoán, và ba ý đồ thật ở `kb/ai_design_prompts.yaml` dài 241–301 ký tự — nên MỌI lượt ghi đều bị từ chối, sau khi đã trả tiền hai lượt gọi mô hình (đo 11/09/2026). Ý đồ bố cục là DỮ LIỆU sẽ dài ra theo mỗi lần chỉnh lời dẫn, nên trần phải có chỗ thở, và có phép thử đối chiếu hai nguồn với nhau.',
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
    score: aiFloorPlanScoreSchema.optional(),
    /** Ý định cả nhà mô hình khai (ai-house-intent, đã đánh mã type_n, có `sketches`) mà phương án này xếp từ đó (T53). Lượt sửa bố cục theo yêu cầu kỹ sư gửi lại nó làm `<previous_intent>`. Vắng = artifact đúc trước T53. */
    house_intent: z
      .object({})
      .passthrough()
      .nullable()
      .describe(
        'Ý định cả nhà mô hình khai (ai-house-intent, đã đánh mã type_n, có `sketches`) mà phương án này xếp từ đó (T53). Lượt sửa bố cục theo yêu cầu kỹ sư gửi lại nó làm `<previous_intent>`. Vắng = artifact đúc trước T53.',
      )
      .optional(),
  })
  .strict()
  .describe(
    'Mặt bằng của NHÁNH AI — toàn bộ NỘI DUNG bản vẽ dưới dạng dữ liệu, một artifact cho cả phương án (mọi tầng).\n\nQuyết định T15 (09/09/2026 — Haan): «AI thiết kế, chương trình cầm bút». Mô hình khai từng đoạn tường kèm bề dày, từng cửa và cửa sổ kèm vị trí và chiều mở, thang, tên phòng và diện tích; bộ vẽ tất định trong Worker (`ai/draw/`) đặt lên giấy. Thay cho phương án cũ (T14) để mô hình tự viết chuỗi SVG — đo thật 09/09 cho ra bản phác không cửa, không chuỗi kích thước, vách không bề dày.\n\nVì sao dữ liệu chứ không phải tệp vẽ: dữ liệu KIỂM ĐƯỢC. Thiếu cửa, cửa đặt ngoài tường, tường không bao kín phòng, diện tích khai lệch chữ nhật — máy bắt được và yêu cầu mô hình sửa. Một tệp SVG thì chỉ đếm được ký tự.\n\nĐƠN VỊ: xăng-ti-mét, không phải mét, trên lưới nửa centimet. Mô hình khai SỐ NGUYÊN (lời dẫn nói thẳng), còn nửa centimet dành cho chương trình — tim vách 11 cm giữa hai phòng rơi vào x,5. Không có số thực tự do: hai lượt gọi cùng đầu vào phải cho cùng mã băm artifact. Xem `$defs.cm`. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.\n\nKHÔNG khai chuỗi kích thước: bộ vẽ suy từ chính toạ độ tường. Bắt mô hình khai lại là thêm ~30% token và thêm một cách sai mới — một chuỗi kích thước cộng không ra tổng là bản vẽ không kiến trúc sư nào tin.\n\nKHÔNG khai cửa phục vụ phòng nào: máy suy từ hình học (điểm giữa lỗ mở lùi vào mỗi bên nửa bề dày tường rơi vào phòng nào).\n\nKết quả là ĐỀ XUẤT: không thành `floor_plan` chuẩn, không qua Container, không lên hồ sơ phát hành.\n\nTừ T37 (13/09/2026) mô hình KHÔNG khai toạ độ nào của tầng ngoài nhát cắt của cây chia (`levels[].tree`); tường, phòng, cửa, cửa sổ và thang trong artifact đều do chương trình suy từ cây (`ai/tree/`). Artifact chỉ được ghi khi mọi tầng đã qua cổng kiểm (T39).',
  );

export type AiFloorPlan = z.infer<typeof aiFloorPlanSchema>;
