/**
 * SINH TỰ ĐỘNG TỪ `contracts/infeasibility-report.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const infeasibilityReportSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type InfeasibilityReportSemver = z.infer<typeof infeasibilityReportSemverSchema>;

/** Báo cáo vô nghiệm — quan trọng ngang FloorPlan, là thứ tạo ra tính năng phân tích tác động. Nguồn: doc/design/03-data-contracts.md mục 3.5. */
export const infeasibilityReportSchema = z
  .object({
    schema_version: infeasibilityReportSemverSchema,
    status: z.literal('infeasible'),
    rule_pack_version: z.string().optional(),
    /** Lấy từ cơ chế giả định (assumptions) của CP-SAT. ⚠️ OR-Tools chỉ hứa tập ĐỦ, không hứa tập nhỏ nhất — bộ giải phải thu hẹp thêm bằng bộ lọc xoá dần (vướng mắc V-4 trong TIEN_DO_THIET_KE.html). */
    conflict_set: z
      .array(
        z
          .object({
            rule_id: z.string(),
            involved: z.array(z.string()).optional(),
          })
          .strict(),
      )
      .describe(
        'Lấy từ cơ chế giả định (assumptions) của CP-SAT. ⚠️ OR-Tools chỉ hứa tập ĐỦ, không hứa tập nhỏ nhất — bộ giải phải thu hẹp thêm bằng bộ lọc xoá dần (vướng mắc V-4 trong TIEN_DO_THIET_KE.html).',
      ),
    /** Sinh từ MẪU CÂU theo rule_id, KHÔNG gọi mô hình ngôn ngữ: tất định, rẻ, dịch được, không bịa (07-rule-pack 7.6). */
    human_message: z
      .string()
      .min(1)
      .describe(
        'Sinh từ MẪU CÂU theo rule_id, KHÔNG gọi mô hình ngôn ngữ: tất định, rẻ, dịch được, không bịa (07-rule-pack 7.6).',
      ),
    suggested_relaxations: z
      .array(
        z
          .object({
            rule_id: z.string().nullable().optional(),
            /** Đường dẫn tới trường đầu vào, ví dụ site.width_m. */
            target: z
              .string()
              .nullable()
              .describe('Đường dẫn tới trường đầu vào, ví dụ site.width_m.')
              .optional(),
            action: z
              .union([
                z.literal('shrink_adjacent'),
                z.literal('move_to_floor'),
                z.literal('remove'),
                z.literal('none'),
                z.literal(null),
              ])
              .nullable()
              .optional(),
            from: z.number().nullable().optional(),
            to: z.number().nullable().optional(),
            unit: z
              .union([z.literal('m'), z.literal('m2'), z.literal('count'), z.literal(null)])
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .describe(
    'Báo cáo vô nghiệm — quan trọng ngang FloorPlan, là thứ tạo ra tính năng phân tích tác động. Nguồn: doc/design/03-data-contracts.md mục 3.5.',
  );

export type InfeasibilityReport = z.infer<typeof infeasibilityReportSchema>;
