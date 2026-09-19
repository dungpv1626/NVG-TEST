/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-plan-edit.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiPlanEditIdSchema = z.string().max(40).nullable();

export type AiPlanEditId = z.infer<typeof aiPlanEditIdSchema>;

export const aiPlanEditOpSchema = z
  .object({
    op: z.enum([
      'move_door',
      'open_wall',
      'close_wall',
      'swap_rooms',
      'resize_room',
      'move_wall',
      'window',
      'relayout',
    ]),
    level: z.number().int().gte(1).lte(12),
    /** move_door, resize_room, window. */
    room: aiPlanEditIdSchema.describe('move_door, resize_room, window.'),
    /** move_door: the room the door opens to now, when the room has several doors; else null. */
    from: aiPlanEditIdSchema.describe(
      'move_door: the room the door opens to now, when the room has several doors; else null.',
    ),
    /** move_door: room sharing a wall with `room`, or "outside". */
    to: aiPlanEditIdSchema.describe('move_door: room sharing a wall with `room`, or "outside".'),
    /** open_wall, close_wall, swap_rooms, move_wall. */
    a: aiPlanEditIdSchema.describe('open_wall, close_wall, swap_rooms, move_wall.'),
    b: aiPlanEditIdSchema,
    /** move_door: start = end of the wall with smaller x or y, end = larger. */
    place: z
      .union([z.literal('start'), z.literal('middle'), z.literal('end'), z.literal(null)])
      .nullable()
      .describe('move_door: start = end of the wall with smaller x or y, end = larger.'),
    area_m2: z.number().gte(1).lte(400).nullable(),
    /** move_wall: positive makes a larger. */
    delta_m: z.number().gte(-5).lte(5).nullable().describe('move_wall: positive makes a larger.'),
    /** window: true adds a window, false removes it. */
    on: z.boolean().nullable().describe('window: true adds a window, false removes it.'),
    /** relayout: the change needed, in English. */
    request: z.string().max(600).nullable().describe('relayout: the change needed, in English.'),
  })
  .strict();

export type AiPlanEditOp = z.infer<typeof aiPlanEditOpSchema>;

export const aiPlanEditSchema = z
  .object({
    ops: z.array(aiPlanEditOpSchema).max(12),
    /** Parts of the request you cannot do, in Vietnamese. */
    unsupported: z
      .array(z.string().max(300))
      .max(6)
      .describe('Parts of the request you cannot do, in Vietnamese.'),
    /** Vietnamese, one or two sentences on what will change. */
    explanation: z
      .string()
      .max(600)
      .describe('Vietnamese, one or two sentences on what will change.'),
  })
  .strict();

export type AiPlanEdit = z.infer<typeof aiPlanEditSchema>;
