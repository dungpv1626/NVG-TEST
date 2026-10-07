/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-house-layout-delta.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiHouseLayoutDeltaSchema = z
  .object({
    rooms_upsert: z
      .array(
        z
          .object({
            id: z
              .string()
              .max(32)
              .regex(/^[a-z0-9_]+$/),
            level: z.string().max(8),
            rect: z.array(z.number().int()),
          })
          .strict(),
      )
      .max(90),
    rooms_delete: z
      .array(
        z
          .string()
          .max(32)
          .regex(/^[a-z0-9_]+$/),
      )
      .max(40),
    doors_add: z
      .array(
        z.array(
          z
            .string()
            .max(32)
            .regex(/^[a-z0-9_]+$/),
        ),
      )
      .max(60),
    doors_remove: z
      .array(
        z.array(
          z
            .string()
            .max(32)
            .regex(/^[a-z0-9_]+$/),
        ),
      )
      .max(60),
    cantilevers_upsert: z
      .array(
        z
          .object({
            id: z
              .string()
              .max(32)
              .regex(/^[a-z0-9_]+$/),
            from_room: z
              .string()
              .max(32)
              .regex(/^[a-z0-9_]+$/),
            face: z.enum(['front', 'left', 'back', 'right']),
            depth: z.number().int(),
          })
          .strict(),
      )
      .max(12),
    notes: z.array(z.string().max(300)).max(12),
  })
  .strict();

export type AiHouseLayoutDelta = z.infer<typeof aiHouseLayoutDeltaSchema>;
