/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-house-bands-compact.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiHouseBandsCompactSchema = z
  .object({
    variant_label: z.string().max(120),
    /** Sơ đồ tổ chức chọn, một câu. */
    parti: z.string().max(200).describe('Sơ đồ tổ chức chọn, một câu.'),
    rationale: z.string().max(400),
    design_notes: z.array(z.string().max(160)).max(5),
    assumptions: z.array(z.string().max(200)).max(5),
    storeys: z
      .array(
        z
          .object({
            level: z.string().regex(/^[1-9][0-9]?$/),
            /** Dải từ mặt đường vào sâu. */
            bands: z
              .array(
                z
                  .object({
                    /** Chiều sâu LỌT LÒNG mm; 0 = chương trình tính. */
                    depth: z
                      .number()
                      .int()
                      .gte(0)
                      .describe('Chiều sâu LỌT LÒNG mm; 0 = chương trình tính.'),
                    /** Ô từ trái sang phải nhìn từ đường. */
                    cells: z
                      .array(
                        z
                          .string()
                          .max(64)
                          .regex(
                            /^(THANG|LW|\.|[a-z0-9_]+)(\/(THANG|LW|[a-z0-9_]+))*(:[1-9][0-9]{2,4})?$/,
                          )
                          .describe(
                            'Một ô, trái sang phải: mã phòng (`knowledge.program` hay tiền tố `knowledge.model_added`), `THANG` = ô thang, `LW` = giếng trời của tầng thấp nhất (chương trình đặt đúng chỗ ở mọi tầng trên), `.` = sân không xây ở mép khối. Ô xếp chồng: các mã nối `/`, phía đường trước (`wc_1/light_well_1`). Bề rộng LỌT LÒNG cố định (mm) sau `:` (`gt_1:900`, `THANG:2500`); không ghi = chương trình tính.',
                          ),
                      )
                      .min(1)
                      .max(8)
                      .describe('Ô từ trái sang phải nhìn từ đường.'),
                  })
                  .strict(),
              )
              .min(1)
              .max(10)
              .describe('Dải từ mặt đường vào sâu.'),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    /** Cặp phòng nên có cửa khi có nhiều chỗ mở — chương trình đặt cửa. */
    doors_prefer: z
      .array(
        z
          .array(
            z
              .string()
              .max(32)
              .regex(/^[a-z0-9_]+$/),
          )
          .min(2)
          .max(2),
      )
      .max(24)
      .describe('Cặp phòng nên có cửa khi có nhiều chỗ mở — chương trình đặt cửa.'),
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
    /** "" khi không có chỗ đỗ ô tô. */
    garage_room: z.string().max(32).describe('"" khi không có chỗ đỗ ô tô.'),
  })
  .strict();

export type AiHouseBandsCompact = z.infer<typeof aiHouseBandsCompactSchema>;
