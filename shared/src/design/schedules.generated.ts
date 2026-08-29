/**
 * SINH TỰ ĐỘNG TỪ `contracts/schedules.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const schedulesSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type SchedulesSemver = z.infer<typeof schedulesSemverSchema>;

export const schedulesArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type SchedulesArtifactRef = z.infer<typeof schedulesArtifactRefSchema>;

/** Bảng thống kê cửa · cửa sổ · diện tích · vật liệu — sinh tự động từ FloorPlan. Nguồn: doc/design/03-data-contracts.md mục 3.6. ⚠️ Mọi bảng khối lượng xuất ra mang nhãn 'Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng' do MÃ NGUỒN chèn (CLAUDE.md 8.7). */
export const schedulesSchema = z
  .object({
    schema_version: schedulesSemverSchema,
    floorplan_ref: schedulesArtifactRefSchema,
    doors: z
      .array(
        z
          .object({
            code: z.string(),
            w_m: z.number().gt(0),
            h_m: z.number().gt(0),
            count: z.number().int().gte(0),
            material: z.string().nullable().optional(),
          })
          .strict(),
      )
      .optional(),
    windows: z
      .array(
        z
          .object({
            code: z.string(),
            w_m: z.number().gt(0),
            h_m: z.number().gt(0),
            count: z.number().int().gte(0),
            material: z.string().nullable().optional(),
          })
          .strict(),
      )
      .optional(),
    areas: z
      .array(
        z
          .object({
            level: z.number().int().gte(1),
            room_type: z.string(),
            area_m2: z.number().gte(0),
          })
          .strict(),
      )
      .optional(),
    materials: z
      .array(
        z
          .object({
            code: z.string(),
            name: z.string(),
            area_m2: z.number().gte(0).nullable().optional(),
            volume_m3: z.number().gte(0).nullable().optional(),
            count: z.number().int().gte(0).nullable().optional(),
          })
          .strict(),
      )
      .optional(),
    /** Nhãn cảnh báo bắt buộc, do mã nguồn chèn, không tắt được từ giao diện (01-overview 1.4). */
    disclaimer: z
      .literal('Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng')
      .describe(
        'Nhãn cảnh báo bắt buộc, do mã nguồn chèn, không tắt được từ giao diện (01-overview 1.4).',
      )
      .optional(),
  })
  .strict()
  .describe(
    "Bảng thống kê cửa · cửa sổ · diện tích · vật liệu — sinh tự động từ FloorPlan. Nguồn: doc/design/03-data-contracts.md mục 3.6. ⚠️ Mọi bảng khối lượng xuất ra mang nhãn 'Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng' do MÃ NGUỒN chèn (CLAUDE.md 8.7).",
  );

export type Schedules = z.infer<typeof schedulesSchema>;
