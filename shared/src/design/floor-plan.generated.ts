/**
 * SINH TỰ ĐỘNG TỪ `contracts/floor-plan.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const floorPlanSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type FloorPlanSemver = z.infer<typeof floorPlanSemverSchema>;

export const floorPlanArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type FloorPlanArtifactRef = z.infer<typeof floorPlanArtifactRefSchema>;

export const floorPlanPointSchema = z.array(z.number()).min(2).max(2);

export type FloorPlanPoint = z.infer<typeof floorPlanPointSchema>;

/** Đỉnh theo chiều kim đồng hồ, KHÔNG lặp đỉnh đầu ở cuối (03-data-contracts 3.4). */
export const floorPlanPolygonSchema = z
  .array(floorPlanPointSchema)
  .min(3)
  .describe('Đỉnh theo chiều kim đồng hồ, KHÔNG lặp đỉnh đầu ở cuối (03-data-contracts 3.4).');

export type FloorPlanPolygon = z.infer<typeof floorPlanPolygonSchema>;

/** Mặt bằng đã giải — output Layer 3b/3c. Nguồn: doc/design/03-data-contracts.md mục 3.4. Hệ toạ độ: gốc ở góc trước-trái lô đất, x sang phải, y vào sâu, đơn vị MÉT. */
export const floorPlanSchema = z
  .object({
    schema_version: floorPlanSemverSchema,
    intent_ref: floorPlanArtifactRefSchema,
    /** BẮT BUỘC. Không có nó thì không tái lập được phương án cũ sau khi quy chuẩn thay đổi (03-data-contracts 3.4). */
    rule_pack_version: z
      .string()
      .min(1)
      .describe(
        'BẮT BUỘC. Không có nó thì không tái lập được phương án cũ sau khi quy chuẩn thay đổi (03-data-contracts 3.4).',
      ),
    /** Ô chữ nhật xây được của THỬA ĐẤT. KHÔNG phải hình bao công trình — xem `footprint_m`. */
    site: z
      .object({
        width_m: z.number().gt(0),
        depth_m: z.number().gt(0),
      })
      .strict()
      .describe(
        'Ô chữ nhật xây được của THỬA ĐẤT. KHÔNG phải hình bao công trình — xem `footprint_m`.',
      ),
    /** Hình bao công trình trong hệ toạ độ thửa: [x0, y0, x1, y1]. Bằng `site` khi khoảng lùi bốn phía đều bằng không (nhà phố); thụt vào khi có khoảng lùi (biệt thự). Phòng và tường mang toạ độ TUYỆT ĐỐI trong thửa, nên nơi nào cần biết cạnh nào là mặt ngoài phải so với ô này chứ không so với `site` — so nhầm thì mọi mặt đứng của biệt thự trả về rỗng mà không có lỗi nào (V-22). Vắng mặt ở artifact tạo trước 07/09/2026; nơi đọc phải lùi về hộp bao của tường. */
    footprint_m: z
      .array(z.number().gte(0))
      .min(4)
      .max(4)
      .describe(
        'Hình bao công trình trong hệ toạ độ thửa: [x0, y0, x1, y1]. Bằng `site` khi khoảng lùi bốn phía đều bằng không (nhà phố); thụt vào khi có khoảng lùi (biệt thự). Phòng và tường mang toạ độ TUYỆT ĐỐI trong thửa, nên nơi nào cần biết cạnh nào là mặt ngoài phải so với ô này chứ không so với `site` — so nhầm thì mọi mặt đứng của biệt thự trả về rỗng mà không có lỗi nào (V-22). Vắng mặt ở artifact tạo trước 07/09/2026; nơi đọc phải lùi về hộp bao của tường.',
      )
      .optional(),
    /** Lưới trục do hệ thống ĐỀ XUẤT — kỹ sư kết cấu quyết định (CLAUDE.md 8.7). */
    structural_grid: z
      .object({
        axes_x_m: z.array(z.number()).optional(),
        axes_y_m: z.array(z.number()).optional(),
      })
      .strict()
      .describe('Lưới trục do hệ thống ĐỀ XUẤT — kỹ sư kết cấu quyết định (CLAUDE.md 8.7).')
      .optional(),
    levels: z
      .array(
        z
          .object({
            level: z.number().int().gte(1).lte(12),
            height_m: z.number().gt(0).optional(),
            rooms: z.array(
              z
                .object({
                  id: z.string().regex(/^[a-z0-9_]+$/),
                  type: z.string().min(1),
                  wing: z
                    .string()
                    .regex(/^W[0-9]+$/)
                    .nullable()
                    .optional(),
                  polygon: floorPlanPolygonSchema,
                  area_m2: z.number().gte(0),
                  has_daylight: z.boolean().optional(),
                })
                .strict(),
            ),
            voids: z
              .array(
                z
                  .object({
                    id: z.string().optional(),
                    kind: z.enum(['lightwell', 'courtyard', 'atrium']),
                    polygon: floorPlanPolygonSchema,
                  })
                  .strict(),
              )
              .optional(),
            walls: z
              .array(
                z
                  .object({
                    id: z.string(),
                    a: floorPlanPointSchema,
                    b: floorPlanPointSchema,
                    thickness_m: z.number().gt(0).optional(),
                    load_bearing: z.boolean().optional(),
                  })
                  .strict()
                  .describe('Ngữ nghĩa IFC — IfcWall (02-architecture 2.7b).'),
              )
              .optional(),
            openings: z
              .array(
                z
                  .object({
                    id: z.string(),
                    wall: z.string(),
                    kind: z.enum(['door', 'window', 'opening']),
                    offset_m: z.number().gte(0),
                    width_m: z.number().gt(0),
                    height_m: z.number().gt(0).nullable().optional(),
                    sill_m: z.number().gte(0).nullable().optional(),
                  })
                  .strict()
                  .describe('Ngữ nghĩa IFC — IfcDoor / IfcWindow.'),
              )
              .optional(),
          })
          .strict(),
      )
      .min(1),
    /** Lõi dùng chung giữa các tầng: cùng một đa giác cho mọi tầng trong danh sách. */
    cores: z
      .array(
        z
          .object({
            id: z.string().regex(/^C[0-9]+$/),
            polygon: floorPlanPolygonSchema,
            levels: z.array(z.number().int().gte(1)),
          })
          .strict(),
      )
      .describe('Lõi dùng chung giữa các tầng: cùng một đa giác cho mọi tầng trong danh sách.')
      .optional(),
    constraint_report: z
      .object({
        status: z.enum(['pass', 'warning', 'infeasible']),
        violations: z
          .array(
            z
              .object({
                rule_id: z.string(),
                severity: z.enum(['error', 'warning']),
                message: z.string(),
                involved: z.array(z.string()).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
  })
  .strict()
  .describe(
    'Mặt bằng đã giải — output Layer 3b/3c. Nguồn: doc/design/03-data-contracts.md mục 3.4. Hệ toạ độ: gốc ở góc trước-trái lô đất, x sang phải, y vào sâu, đơn vị MÉT.',
  );

export type FloorPlan = z.infer<typeof floorPlanSchema>;
