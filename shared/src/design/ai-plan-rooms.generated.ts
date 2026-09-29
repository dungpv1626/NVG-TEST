/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-plan-rooms.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiPlanRoomsSpaceIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export type AiPlanRoomsSpaceId = z.infer<typeof aiPlanRoomsSpaceIdSchema>;

export const aiPlanRoomsElemIdSchema = z
  .string()
  .max(24)
  .regex(/^[a-z0-9_]+$/);

export type AiPlanRoomsElemId = z.infer<typeof aiPlanRoomsElemIdSchema>;

/** Xăng-ti-mét, lưới nửa centimet. Gốc ở góc trước-trái lô đất, x sang phải, y vào sâu. */
export const aiPlanRoomsCmSchema = z
  .number()
  .multipleOf(0.5)
  .describe('Xăng-ti-mét, lưới nửa centimet. Gốc ở góc trước-trái lô đất, x sang phải, y vào sâu.');

export type AiPlanRoomsCm = z.infer<typeof aiPlanRoomsCmSchema>;

/** [x, y] cm. */
export const aiPlanRoomsPointSchema = z
  .array(aiPlanRoomsCmSchema)
  .min(2)
  .max(2)
  .describe('[x, y] cm.');

export type AiPlanRoomsPoint = z.infer<typeof aiPlanRoomsPointSchema>;

/** [x0, y0, x1, y1] cm, với x1 > x0 và y1 > y0. */
export const aiPlanRoomsRectSchema = z
  .array(aiPlanRoomsCmSchema)
  .min(4)
  .max(4)
  .describe('[x0, y0, x1, y1] cm, với x1 > x0 và y1 > y0.');

export type AiPlanRoomsRect = z.infer<typeof aiPlanRoomsRectSchema>;

/** Cạnh của chữ nhật phòng: front = cạnh y nhỏ · back = cạnh y lớn · left = cạnh x nhỏ · right = cạnh x lớn. */
export const aiPlanRoomsEdgeSchema = z
  .enum(['front', 'back', 'left', 'right'])
  .describe(
    'Cạnh của chữ nhật phòng: front = cạnh y nhỏ · back = cạnh y lớn · left = cạnh x nhỏ · right = cạnh x lớn.',
  );

export type AiPlanRoomsEdge = z.infer<typeof aiPlanRoomsEdgeSchema>;

export const aiPlanRoomsRoomSchema = z
  .object({
    /** Mã LẤY TỪ chương trình không gian. Không đặt mã mới, không bỏ phòng nào. */
    id: aiPlanRoomsSpaceIdSchema.describe(
      'Mã LẤY TỪ chương trình không gian. Không đặt mã mới, không bỏ phòng nào.',
    ),
    type: aiPlanRoomsSpaceIdSchema,
    /** Kích thước LỌT LÒNG của phòng — mặt trong tường tới mặt trong tường. Hai phòng cạnh nhau để cách nhau đúng bề dày vách (kb/construction_norms.yaml). */
    rect: aiPlanRoomsRectSchema.describe(
      'Kích thước LỌT LÒNG của phòng — mặt trong tường tới mặt trong tường. Hai phòng cạnh nhau để cách nhau đúng bề dày vách (kb/construction_norms.yaml).',
    ),
    /** Diện tích phòng, m². Phải khớp chữ nhật; lệch quá 10% hoặc 1 m² là lỗi phải sửa. */
    area_m2: z
      .number()
      .gt(0)
      .describe('Diện tích phòng, m². Phải khớp chữ nhật; lệch quá 10% hoặc 1 m² là lỗi phải sửa.'),
    /** Mã phòng KHÁC mà chính chữ nhật này cũng phục vụ — khai khi chương trình không gian có hai phòng mà bố cục gộp làm một không gian mở (bếp + ăn, khách + thờ). */
    also: z
      .array(aiPlanRoomsSpaceIdSchema)
      .max(4)
      .describe(
        'Mã phòng KHÁC mà chính chữ nhật này cũng phục vụ — khai khi chương trình không gian có hai phòng mà bố cục gộp làm một không gian mở (bếp + ăn, khách + thờ).',
      )
      .optional(),
    /** Chữ in trong phòng, tiếng Việt. Rỗng thì chương trình tự lấy nhãn theo mã phòng — chỉ khai khi cần tên khác («Phòng ngủ ông bà»). Hai phòng trên cùng một tầng không được cùng nhãn. */
    label: z
      .string()
      .max(40)
      .nullable()
      .describe(
        'Chữ in trong phòng, tiếng Việt. Rỗng thì chương trình tự lấy nhãn theo mã phòng — chỉ khai khi cần tên khác («Phòng ngủ ông bà»). Hai phòng trên cùng một tầng không được cùng nhãn.',
      )
      .optional(),
  })
  .strict();

export type AiPlanRoomsRoom = z.infer<typeof aiPlanRoomsRoomSchema>;

export const aiPlanRoomsDoorSchema = z
  .object({
    id: aiPlanRoomsElemIdSchema,
    /** Mã phòng có cạnh chứa cửa này. */
    room: aiPlanRoomsSpaceIdSchema.describe('Mã phòng có cạnh chứa cửa này.'),
    edge: aiPlanRoomsEdgeSchema,
    /** Khoảng cách từ ĐẦU cạnh tới mép gần của lỗ cửa, cm. Đầu cạnh là góc x nhỏ với front/back, góc y nhỏ với left/right. */
    at: aiPlanRoomsCmSchema.describe(
      'Khoảng cách từ ĐẦU cạnh tới mép gần của lỗ cửa, cm. Đầu cạnh là góc x nhỏ với front/back, góc y nhỏ với left/right.',
    ),
    /** Bề rộng lỗ cửa thông thuỷ, cm. */
    w: aiPlanRoomsCmSchema.describe('Bề rộng lỗ cửa thông thuỷ, cm.'),
    /** Bản lề ở đầu GẦN hay đầu XA của cạnh (gần = phía đầu cạnh, nơi đo `at`). Rỗng với cửa trượt, cổng, cửa để xe và ô thông không cánh. */
    hinge: z
      .union([z.literal('near'), z.literal('far'), z.literal(null)])
      .nullable()
      .describe(
        'Bản lề ở đầu GẦN hay đầu XA của cạnh (gần = phía đầu cạnh, nơi đo `at`). Rỗng với cửa trượt, cổng, cửa để xe và ô thông không cánh.',
      )
      .optional(),
    /** Cánh quét VÀO TRONG phòng hay RA NGOÀI phòng. */
    swing: z
      .union([z.literal('in'), z.literal('out'), z.literal(null)])
      .nullable()
      .describe('Cánh quét VÀO TRONG phòng hay RA NGOÀI phòng.')
      .optional(),
    /** single = cửa một cánh · double = hai cánh · sliding = cửa trượt · garage = cửa để xe · gate = cổng · opening = ô thông không cánh. */
    kind: z
      .enum(['single', 'double', 'sliding', 'garage', 'gate', 'opening'])
      .describe(
        'single = cửa một cánh · double = hai cánh · sliding = cửa trượt · garage = cửa để xe · gate = cổng · opening = ô thông không cánh.',
      ),
  })
  .strict();

export type AiPlanRoomsDoor = z.infer<typeof aiPlanRoomsDoorSchema>;

export const aiPlanRoomsWindowSchema = z
  .object({
    id: aiPlanRoomsElemIdSchema,
    room: aiPlanRoomsSpaceIdSchema,
    /** Cạnh của phòng chứa cửa sổ. Chỉ đặt trên cạnh giáp NGOÀI TRỜI — cạnh chung với một phòng khác trong nhà thì không có cửa sổ. */
    edge: aiPlanRoomsEdgeSchema.describe(
      'Cạnh của phòng chứa cửa sổ. Chỉ đặt trên cạnh giáp NGOÀI TRỜI — cạnh chung với một phòng khác trong nhà thì không có cửa sổ.',
    ),
    at: aiPlanRoomsCmSchema,
    w: aiPlanRoomsCmSchema,
    /** Cao độ bệ cửa sổ so với mặt sàn tầng, cm. */
    sill: aiPlanRoomsCmSchema.describe('Cao độ bệ cửa sổ so với mặt sàn tầng, cm.').optional(),
    /** Chiều cao ô cửa sổ, cm. */
    h: aiPlanRoomsCmSchema.describe('Chiều cao ô cửa sổ, cm.').optional(),
  })
  .strict();

export type AiPlanRoomsWindow = z.infer<typeof aiPlanRoomsWindowSchema>;

export const aiPlanRoomsStairSchema = z
  .object({
    id: aiPlanRoomsElemIdSchema,
    /** Ô thang, trùng khít chữ nhật của phòng thang trong `rooms`. */
    rect: aiPlanRoomsRectSchema.describe(
      'Ô thang, trùng khít chữ nhật của phòng thang trong `rooms`.',
    ),
    /** Chiều đi LÊN của vế thang đầu tiên. */
    up: z.enum(['+x', '-x', '+y', '-y']).describe('Chiều đi LÊN của vế thang đầu tiên.'),
    flights: z.number().int().gte(1).lte(3).optional(),
    /** Tổng số bậc trong ô thang này. Số bậc × chiều cao bậc phải bằng chiều cao tầng. */
    treads: z
      .number()
      .int()
      .gte(2)
      .lte(40)
      .describe('Tổng số bậc trong ô thang này. Số bậc × chiều cao bậc phải bằng chiều cao tầng.')
      .optional(),
    /** Bề sâu mặt bậc, cm — CHƯƠNG TRÌNH điền từ `kb/construction_norms.yaml` (T70). */
    going: z
      .number()
      .int()
      .gte(15)
      .lte(45)
      .describe('Bề sâu mặt bậc, cm — CHƯƠNG TRÌNH điền từ `kb/construction_norms.yaml` (T70).')
      .optional(),
  })
  .strict();

export type AiPlanRoomsStair = z.infer<typeof aiPlanRoomsStairSchema>;

export const aiPlanRoomsVoidSpaceSchema = z
  .object({
    id: aiPlanRoomsElemIdSchema,
    /** light_well = giếng trời · courtyard = sân trong · atrium = thông tầng · void = ô trống trên thang. */
    kind: z
      .enum(['light_well', 'courtyard', 'atrium', 'void'])
      .describe(
        'light_well = giếng trời · courtyard = sân trong · atrium = thông tầng · void = ô trống trên thang.',
      ),
    rect: aiPlanRoomsRectSchema,
  })
  .strict();

export type AiPlanRoomsVoidSpace = z.infer<typeof aiPlanRoomsVoidSpaceSchema>;

export const aiPlanRoomsLevelSchema = z
  .object({
    /** Số tầng, 1 là tầng trệt. */
    level: z.number().int().gte(1).describe('Số tầng, 1 là tầng trệt.'),
    /** Tên tầng in trên tờ vẽ, tiếng Việt: «Tầng 1», «Tầng lửng», «Tầng mái». */
    name: z
      .string()
      .max(40)
      .describe('Tên tầng in trên tờ vẽ, tiếng Việt: «Tầng 1», «Tầng lửng», «Tầng mái».'),
    /** Chiều cao tầng (sàn tới sàn), cm. */
    h: aiPlanRoomsCmSchema.describe('Chiều cao tầng (sàn tới sàn), cm.'),
    /** Hình bao khối xây của tầng, đa giác kín ngầm (điểm cuối tự nối điểm đầu). Nằm trong hình bao xây được mà lời dẫn đưa ra. */
    outline: z
      .array(aiPlanRoomsPointSchema)
      .min(4)
      .max(24)
      .describe(
        'Hình bao khối xây của tầng, đa giác kín ngầm (điểm cuối tự nối điểm đầu). Nằm trong hình bao xây được mà lời dẫn đưa ra.',
      ),
    /** Phòng phải LẤP KÍN hình bao: tổng diện tích phòng + ô thang + ô trống bằng diện tích hình bao, trừ bề dày tường. Muốn để trống thì khai một ô trống. */
    rooms: z
      .array(aiPlanRoomsRoomSchema)
      .min(1)
      .max(60)
      .describe(
        'Phòng phải LẤP KÍN hình bao: tổng diện tích phòng + ô thang + ô trống bằng diện tích hình bao, trừ bề dày tường. Muốn để trống thì khai một ô trống.',
      ),
    doors: z.array(aiPlanRoomsDoorSchema).max(120).optional(),
    windows: z.array(aiPlanRoomsWindowSchema).max(160).optional(),
    stairs: z.array(aiPlanRoomsStairSchema).max(4).optional(),
    voids: z.array(aiPlanRoomsVoidSpaceSchema).max(12).optional(),
  })
  .strict();

export type AiPlanRoomsLevel = z.infer<typeof aiPlanRoomsLevelSchema>;

/**
 * Mặt bằng dạng PHÒNG và LỖ MỞ TRÊN CẠNH PHÒNG — hợp đồng NỘI BỘ từ T37 (13/09/2026): chương trình điền nó từ cây chia mô hình khai (`contracts/ai-plan-tree`), rồi suy tường từ chữ nhật phòng. Không còn gửi cho mô hình.
 *
 * ĐƠN VỊ: xăng-ti-mét NGUYÊN. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.
 *
 * KHÔNG khai: bề dày tường, chuỗi kích thước, hướng bắc, mã phương án, toạ độ nội thất. Chương trình suy tất cả từ chữ nhật phòng và từ `kb/construction_norms.yaml`.
 */
export const aiPlanRoomsSchema = z
  .object({
    /** Tên phương án bằng tiếng Việt, mô tả CẤU TRÚC («Lõi thang giữa, bếp thông phòng ăn»), không phải số. */
    variant_label: z
      .string()
      .max(120)
      .describe(
        'Tên phương án bằng tiếng Việt, mô tả CẤU TRÚC («Lõi thang giữa, bếp thông phòng ăn»), không phải số.',
      ),
    levels: z.array(aiPlanRoomsLevelSchema).min(1).max(12),
    /** Vì sao bố cục như vậy, tiếng Việt, 2–5 câu. */
    rationale: z.string().max(1500).describe('Vì sao bố cục như vậy, tiếng Việt, 2–5 câu.'),
  })
  .strict()
  .describe(
    'Mặt bằng dạng PHÒNG và LỖ MỞ TRÊN CẠNH PHÒNG — hợp đồng NỘI BỘ từ T37 (13/09/2026): chương trình điền nó từ cây chia mô hình khai (`contracts/ai-plan-tree`), rồi suy tường từ chữ nhật phòng. Không còn gửi cho mô hình.\n\nĐƠN VỊ: xăng-ti-mét NGUYÊN. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.\n\nKHÔNG khai: bề dày tường, chuỗi kích thước, hướng bắc, mã phương án, toạ độ nội thất. Chương trình suy tất cả từ chữ nhật phòng và từ `kb/construction_norms.yaml`.',
  );

export type AiPlanRooms = z.infer<typeof aiPlanRoomsSchema>;
