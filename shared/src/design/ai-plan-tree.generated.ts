/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-plan-tree.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiPlanTreeIdSchema = z
  .string()
  .max(32)
  .regex(/^[a-z0-9_]+$/);

export type AiPlanTreeId = z.infer<typeof aiPlanTreeIdSchema>;

/** Xăng-ti-mét, số nguyên. Gốc ở góc trước-trái lô đất, x sang phải, y vào sâu. */
export const aiPlanTreeCmSchema = z
  .number()
  .int()
  .describe('Xăng-ti-mét, số nguyên. Gốc ở góc trước-trái lô đất, x sang phải, y vào sâu.');

export type AiPlanTreeCm = z.infer<typeof aiPlanTreeCmSchema>;

/** [x0, y0, x1, y1] cm, với x1 > x0 và y1 > y0. */
export const aiPlanTreeRectSchema = z
  .array(aiPlanTreeCmSchema)
  .min(4)
  .max(4)
  .describe('[x0, y0, x1, y1] cm, với x1 > x0 và y1 > y0.');

export type AiPlanTreeRect = z.infer<typeof aiPlanTreeRectSchema>;

export const aiPlanTreeNodeSchema = z
  .object({
    id: aiPlanTreeIdSchema,
    /** x = vách đứng tại x = at · y = vách ngang tại y = at. */
    cut: z.enum(['x', 'y']).describe('x = vách đứng tại x = at · y = vách ngang tại y = at.'),
    /** TIM bức vách, toạ độ tuyệt đối. Phải nằm hẳn bên trong ô đang chia. */
    at: aiPlanTreeCmSchema.describe(
      'TIM bức vách, toạ độ tuyệt đối. Phải nằm hẳn bên trong ô đang chia.',
    ),
    /** Ô phía toạ độ NHỎ. Mã nút khác, mã phòng, unbuilt_N hoặc void_N. */
    a: aiPlanTreeIdSchema.describe(
      'Ô phía toạ độ NHỎ. Mã nút khác, mã phòng, unbuilt_N hoặc void_N.',
    ),
    /** Ô phía toạ độ LỚN. Mã nút khác, mã phòng, unbuilt_N hoặc void_N. */
    b: aiPlanTreeIdSchema.describe(
      'Ô phía toạ độ LỚN. Mã nút khác, mã phòng, unbuilt_N hoặc void_N.',
    ),
  })
  .strict();

export type AiPlanTreeNode = z.infer<typeof aiPlanTreeNodeSchema>;

export const aiPlanTreeMergeSchema = z
  .object({
    /** Phòng là lá của cây. */
    room: aiPlanTreeIdSchema.describe('Phòng là lá của cây.'),
    /** Phòng của chương trình dùng chung ô ấy. Không phải lá. */
    with: z
      .array(aiPlanTreeIdSchema)
      .min(1)
      .max(2)
      .describe('Phòng của chương trình dùng chung ô ấy. Không phải lá.'),
  })
  .strict();

export type AiPlanTreeMerge = z.infer<typeof aiPlanTreeMergeSchema>;

export const aiPlanTreeDoorSchema = z
  .object({
    /** Mã phòng. */
    a: aiPlanTreeIdSchema.describe('Mã phòng.'),
    /** Mã phòng giáp a, hoặc outside. */
    b: aiPlanTreeIdSchema.describe('Mã phòng giáp a, hoặc outside.'),
    /** single = một cánh · double = hai cánh · sliding = trượt · garage = cửa để xe · gate = cổng · opening = ô thông không cánh. */
    kind: z
      .enum(['single', 'double', 'sliding', 'garage', 'gate', 'opening'])
      .describe(
        'single = một cánh · double = hai cánh · sliding = trượt · garage = cửa để xe · gate = cổng · opening = ô thông không cánh.',
      ),
    /** Chỉ với opening: ô thông chạy suốt vách chung, chừa hai má cửa — bỏ vách giữa hai phòng. Do kỹ sư yêu cầu qua thao tác sửa (T53), bộ xếp không tự đặt. */
    full: z
      .boolean()
      .nullable()
      .describe(
        'Chỉ với opening: ô thông chạy suốt vách chung, chừa hai má cửa — bỏ vách giữa hai phòng. Do kỹ sư yêu cầu qua thao tác sửa (T53), bộ xếp không tự đặt.',
      )
      .optional(),
    /** Vị trí cửa trên đoạn vách trống: start = đầu toạ độ nhỏ, end = đầu toạ độ lớn, middle hoặc null = giữa. Do kỹ sư yêu cầu qua thao tác sửa (T53). */
    place: z
      .union([z.literal('start'), z.literal('middle'), z.literal('end'), z.literal(null)])
      .nullable()
      .describe(
        'Vị trí cửa trên đoạn vách trống: start = đầu toạ độ nhỏ, end = đầu toạ độ lớn, middle hoặc null = giữa. Do kỹ sư yêu cầu qua thao tác sửa (T53).',
      )
      .optional(),
  })
  .strict();

export type AiPlanTreeDoor = z.infer<typeof aiPlanTreeDoorSchema>;

/**
 * MỘT tầng của mặt bằng, do mô hình ngôn ngữ khai dưới dạng CÂY CHIA KHÔNG GIAN. Mô hình khai CẤU TRÚC (nhát cắt, phòng nào ở ô nào, phòng nào nối phòng nào); chương trình gán mọi con số còn lại.
 *
 * ĐƠN VỊ: xăng-ti-mét NGUYÊN. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.
 */
export const aiPlanTreeSchema = z
  .object({
    /** Tên phương án, tiếng Việt, mô tả cấu trúc. Chỉ tầng 1 điền; tầng khác để null. */
    variant_label: z
      .string()
      .max(120)
      .nullable()
      .describe('Tên phương án, tiếng Việt, mô tả cấu trúc. Chỉ tầng 1 điền; tầng khác để null.'),
    /** Vì sao tầng này xếp như vậy, tiếng Việt, 1–2 câu. */
    rationale: z.string().max(300).describe('Vì sao tầng này xếp như vậy, tiếng Việt, 1–2 câu.'),
    /** Khối xây của tầng, tính tới mặt NGOÀI tường bao. Nằm trong knowledge.buildable_cm. */
    footprint: aiPlanTreeRectSchema.describe(
      'Khối xây của tầng, tính tới mặt NGOÀI tường bao. Nằm trong knowledge.buildable_cm.',
    ),
    /** Các nhát cắt. Nút gốc là nút không nút nào trỏ tới; nó chia chính footprint. */
    nodes: z
      .array(aiPlanTreeNodeSchema)
      .min(1)
      .max(59)
      .describe('Các nhát cắt. Nút gốc là nút không nút nào trỏ tới; nó chia chính footprint.'),
    /** Phòng ghép: một ô phục vụ thêm phòng khác của chương trình. Chỉ cặp trong knowledge.merge_allowed. */
    also: z
      .array(aiPlanTreeMergeSchema)
      .max(6)
      .describe(
        'Phòng ghép: một ô phục vụ thêm phòng khác của chương trình. Chỉ cặp trong knowledge.merge_allowed.',
      ),
    doors: z.array(aiPlanTreeDoorSchema).min(1).max(60),
    /** Thang của tầng. null khi tầng không có thang. */
    stair: z
      .object({
        /** Mã phòng thang (một lá của cây). */
        room: aiPlanTreeIdSchema.describe('Mã phòng thang (một lá của cây).'),
        /** Chiều đi LÊN của vế đầu tiên. */
        up: z.enum(['+x', '-x', '+y', '-y']).describe('Chiều đi LÊN của vế đầu tiên.'),
      })
      .strict()
      .nullable()
      .describe('Thang của tầng. null khi tầng không có thang.'),
    /** Phòng KHÔNG muốn cửa sổ dù có cạnh giáp ngoài trời. Chương trình tự đặt cửa sổ cho mọi phòng còn lại. */
    no_window: z
      .array(aiPlanTreeIdSchema)
      .max(20)
      .describe(
        'Phòng KHÔNG muốn cửa sổ dù có cạnh giáp ngoài trời. Chương trình tự đặt cửa sổ cho mọi phòng còn lại.',
      ),
  })
  .strict()
  .describe(
    'MỘT tầng của mặt bằng, do mô hình ngôn ngữ khai dưới dạng CÂY CHIA KHÔNG GIAN. Mô hình khai CẤU TRÚC (nhát cắt, phòng nào ở ô nào, phòng nào nối phòng nào); chương trình gán mọi con số còn lại.\n\nĐƠN VỊ: xăng-ti-mét NGUYÊN. Gốc toạ độ ở góc TRƯỚC-TRÁI lô đất, `x` sang phải dọc mặt tiền, `y` vào sâu.',
  );

export type AiPlanTree = z.infer<typeof aiPlanTreeSchema>;
