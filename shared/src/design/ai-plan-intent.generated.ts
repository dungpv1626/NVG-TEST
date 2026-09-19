/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-plan-intent.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiPlanIntentIdSchema = z
  .string()
  .max(32)
  .regex(/^[a-z0-9_]+$/);

export type AiPlanIntentId = z.infer<typeof aiPlanIntentIdSchema>;

/** Vùng trong lô: front = phía đường, back = phía sâu; left/right khi đứng ngoài đường nhìn vào. */
export const aiPlanIntentZoneSchema = z
  .enum([
    'front_left',
    'front',
    'front_right',
    'left',
    'center',
    'right',
    'back_left',
    'back',
    'back_right',
  ])
  .describe(
    'Vùng trong lô: front = phía đường, back = phía sâu; left/right khi đứng ngoài đường nhìn vào.',
  );

export type AiPlanIntentZone = z.infer<typeof aiPlanIntentZoneSchema>;

export const aiPlanIntentRoomSchema = z
  .object({
    id: aiPlanIntentIdSchema,
    zone: aiPlanIntentZoneSchema,
    /** Phòng muốn một cạnh ra mặt đường. */
    street_facing: z.boolean().describe('Phòng muốn một cạnh ra mặt đường.'),
  })
  .strict();

export type AiPlanIntentRoom = z.infer<typeof aiPlanIntentRoomSchema>;

export const aiPlanIntentRelationshipSchema = z
  .object({
    a: aiPlanIntentIdSchema,
    b: aiPlanIntentIdSchema,
    /** adjacent = chung vách · near = gần · far = xa · open = một không gian mở. */
    kind: z
      .enum(['adjacent', 'near', 'far', 'open'])
      .describe('adjacent = chung vách · near = gần · far = xa · open = một không gian mở.'),
  })
  .strict();

export type AiPlanIntentRelationship = z.infer<typeof aiPlanIntentRelationshipSchema>;

/** MỘT tầng của mặt bằng, do mô hình ngôn ngữ khai dưới dạng Ý ĐỊNH BỐ CỤC: phòng nào ở vùng nào của lô, phòng nào ra mặt tiền, phòng nào cạnh/gần/xa/thông phòng nào, phòng nào có cửa chính. KHÔNG một toạ độ, KHÔNG cây chia, KHÔNG danh sách cửa — chương trình (`ai/arrange/`) dựng cây chia, đặt cửa, dựng tường. */
export const aiPlanIntentSchema = z
  .object({
    /** Tên phương án, tiếng Việt, mô tả cấu trúc. Chỉ tầng 1 điền; tầng khác để null. */
    variant_label: z
      .string()
      .max(120)
      .nullable()
      .describe('Tên phương án, tiếng Việt, mô tả cấu trúc. Chỉ tầng 1 điền; tầng khác để null.'),
    /** Vì sao tầng này xếp như vậy, tiếng Việt, 1–2 câu. */
    rationale: z.string().max(300).describe('Vì sao tầng này xếp như vậy, tiếng Việt, 1–2 câu.'),
    /** Mỗi phòng của tầng đúng một dòng. */
    rooms: z
      .array(aiPlanIntentRoomSchema)
      .min(1)
      .max(40)
      .describe('Mỗi phòng của tầng đúng một dòng.'),
    relationships: z.array(aiPlanIntentRelationshipSchema).max(30),
    /** Tầng 1: phòng mang cửa chính ra ngoài. Tầng khác: null. */
    entry_room: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .nullable()
      .describe('Tầng 1: phòng mang cửa chính ra ngoài. Tầng khác: null.'),
    /** Phòng mang cửa xe; null khi tầng không có chỗ để xe. */
    garage_room: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .nullable()
      .describe('Phòng mang cửa xe; null khi tầng không có chỗ để xe.'),
  })
  .strict()
  .describe(
    'MỘT tầng của mặt bằng, do mô hình ngôn ngữ khai dưới dạng Ý ĐỊNH BỐ CỤC: phòng nào ở vùng nào của lô, phòng nào ra mặt tiền, phòng nào cạnh/gần/xa/thông phòng nào, phòng nào có cửa chính. KHÔNG một toạ độ, KHÔNG cây chia, KHÔNG danh sách cửa — chương trình (`ai/arrange/`) dựng cây chia, đặt cửa, dựng tường.',
  );

export type AiPlanIntent = z.infer<typeof aiPlanIntentSchema>;
