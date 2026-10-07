/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-house-bands-delta.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiHouseBandsDeltaSchema = z
  .object({
    storeys: z
      .array(
        z
          .object({
            level: z.string().regex(/^([1-9][0-9]?|roof)$/),
            /** Dải từ mặt đường vào sâu. */
            bands: z
              .array(
                z
                  .object({
                    /** Chiều sâu mm; 0 = chương trình tính. */
                    depth: z.number().int().gte(0).describe('Chiều sâu mm; 0 = chương trình tính.'),
                    /** Ô từ trái sang phải nhìn từ đường. */
                    cells: z
                      .array(
                        z
                          .object({
                            /** Mã phòng của danh mục (`knowledge.program`) hay mã tự thêm có tiền tố `knowledge.model_added`; `THANG` = ô thang; `.` = sân / phần không xây (chỉ ở mép khối). Rỗng "" khi ô là một chồng (`stack`). */
                            id: z
                              .string()
                              .max(32)
                              .regex(/^[a-z0-9_.]+$|^THANG$|^LW$|^$/)
                              .describe(
                                'Mã phòng của danh mục (`knowledge.program`) hay mã tự thêm có tiền tố `knowledge.model_added`; `THANG` = ô thang; `.` = sân / phần không xây (chỉ ở mép khối). Rỗng "" khi ô là một chồng (`stack`).',
                              ),
                            /** Bề rộng mm theo mặt tiền. 0 = chương trình tính; > 0 chỉ khi cần cố định (hành lang, ô thang). */
                            w: z
                              .number()
                              .int()
                              .gte(0)
                              .describe(
                                'Bề rộng mm theo mặt tiền. 0 = chương trình tính; > 0 chỉ khi cần cố định (hành lang, ô thang).',
                              ),
                            /** Ô chia tiếp theo chiều sâu, từ phía đường vào; rỗng = ô một phòng. */
                            stack: z
                              .array(
                                z
                                  .object({
                                    id: z
                                      .string()
                                      .max(32)
                                      .regex(/^[a-z0-9_.]+$|^THANG$|^LW$|^$/),
                                    /** Chiều sâu mm; 0 = chương trình tính. Ô con cuối nhận phần dư. */
                                    d: z
                                      .number()
                                      .int()
                                      .gte(0)
                                      .describe(
                                        'Chiều sâu mm; 0 = chương trình tính. Ô con cuối nhận phần dư.',
                                      ),
                                  })
                                  .strict(),
                              )
                              .max(6)
                              .describe(
                                'Ô chia tiếp theo chiều sâu, từ phía đường vào; rỗng = ô một phòng.',
                              ),
                          })
                          .strict(),
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

export type AiHouseBandsDelta = z.infer<typeof aiHouseBandsDeltaSchema>;
