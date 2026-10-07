/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-house-layout.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiHouseLayoutSchema = z
  .object({
    variant_label: z.string().max(120),
    rationale: z.string().max(1500),
    design_notes: z.array(z.string().max(300)).max(12),
    assumptions: z.array(z.string().max(200)).max(12),
    rooms: z
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
      .min(1)
      .max(90),
    doors: z
      .array(
        z.array(
          z
            .string()
            .max(32)
            .regex(/^[a-z0-9_]+$/),
        ),
      )
      .max(120),
    open: z
      .array(
        z.array(
          z
            .string()
            .max(32)
            .regex(/^[a-z0-9_]+$/),
        ),
      )
      .max(20),
    cantilevers: z
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
    entry_room: z.string().max(32),
    garage_room: z.string().max(32),
  })
  .strict();

export type AiHouseLayout = z.infer<typeof aiHouseLayoutSchema>;
