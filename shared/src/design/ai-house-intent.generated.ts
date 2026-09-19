/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-house-intent.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiHouseIntentIdSchema = z
  .string()
  .max(32)
  .regex(/^[a-z0-9_]+$/);

export type AiHouseIntentId = z.infer<typeof aiHouseIntentIdSchema>;

export const aiHouseIntentRoomSchema = z
  .object({
    id: aiHouseIntentIdSchema,
    /** Code from knowledge.room_types. */
    type: aiHouseIntentIdSchema.describe('Code from knowledge.room_types.'),
    /** Storey, 1 = ground. */
    level: z.number().int().gte(1).describe('Storey, 1 = ground.'),
    /** Target clear area, m². */
    target_area_m2: z.number().gt(0).describe('Target clear area, m².'),
    /** Parent room id when inside that room, else null. */
    ensuite_of: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .nullable()
      .describe('Parent room id when inside that room, else null.'),
  })
  .strict();

export type AiHouseIntentRoom = z.infer<typeof aiHouseIntentRoomSchema>;

export const aiHouseIntentRelationshipSchema = z
  .object({
    a: aiHouseIntentIdSchema,
    b: aiHouseIntentIdSchema,
    /** adjacent = shared wall; open = one open space. */
    kind: z
      .enum(['adjacent', 'near', 'far', 'open'])
      .describe('adjacent = shared wall; open = one open space.'),
  })
  .strict();

export type AiHouseIntentRelationship = z.infer<typeof aiHouseIntentRelationshipSchema>;

export const aiHouseIntentSketchSchema = z
  .object({
    /** Storey, 1 = ground. */
    level: z.number().int().gte(1).describe('Storey, 1 = ground.'),
    /** First row on the street side; left to right as seen from the street; space-separated room ids, one per cell; . = not built. */
    rows: z
      .array(
        z
          .string()
          .max(600)
          .regex(/^[a-z0-9_. ]+$/),
      )
      .min(1)
      .max(40)
      .describe(
        'First row on the street side; left to right as seen from the street; space-separated room ids, one per cell; . = not built.',
      ),
  })
  .strict();

export type AiHouseIntentSketch = z.infer<typeof aiHouseIntentSketchSchema>;

export const aiHouseIntentSchema = z
  .object({
    /** Short Vietnamese name of the layout idea. */
    variant_label: z.string().max(120).describe('Short Vietnamese name of the layout idea.'),
    /** Vietnamese, at most three sentences. */
    rationale: z.string().max(1500).describe('Vietnamese, at most three sentences.'),
    /** Vietnamese questions for the client, at most five. */
    assumptions: z
      .array(z.string().max(200))
      .max(12)
      .describe('Vietnamese questions for the client, at most five.'),
    /** One entry per space of the whole house. */
    rooms: z
      .array(aiHouseIntentRoomSchema)
      .min(1)
      .max(80)
      .describe('One entry per space of the whole house.'),
    /** Pairs of rooms on the same storey. */
    relationships: z
      .array(aiHouseIntentRelationshipSchema)
      .max(80)
      .describe('Pairs of rooms on the same storey.'),
    /** One occupancy grid per storey, see knowledge.sketch_grid. */
    sketches: z
      .array(aiHouseIntentSketchSchema)
      .min(1)
      .max(8)
      .describe('One occupancy grid per storey, see knowledge.sketch_grid.'),
    /** Storey-1 room with the front door. */
    entry_room: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .nullable()
      .describe('Storey-1 room with the front door.'),
    /** Room with the car door; null without parking. */
    garage_room: z
      .string()
      .max(32)
      .regex(/^[a-z0-9_]+$/)
      .nullable()
      .describe('Room with the car door; null without parking.'),
  })
  .strict();

export type AiHouseIntent = z.infer<typeof aiHouseIntentSchema>;
