/**
 * SINH TỰ ĐỘNG TỪ `contracts/space-program.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const spaceProgramSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type SpaceProgramSemver = z.infer<typeof spaceProgramSemverSchema>;

export const spaceProgramArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type SpaceProgramArtifactRef = z.infer<typeof spaceProgramArtifactRefSchema>;

export const spaceProgramSpaceIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export type SpaceProgramSpaceId = z.infer<typeof spaceProgramSpaceIdSchema>;

/** Chương trình không gian — output Layer 2. Nguồn: doc/design/03-data-contracts.md mục 3.2. */
export const spaceProgramSchema = z
  .object({
    schema_version: spaceProgramSemverSchema,
    brief_ref: spaceProgramArtifactRefSchema,
    spaces: z
      .array(
        z
          .object({
            id: spaceProgramSpaceIdSchema,
            type: z.string().min(1),
            floor: z.number().int().gte(1).lte(12),
            target_area_m2: z.number().gt(0).nullable().optional(),
            min_area_m2: z.number().gt(0),
            max_area_m2: z.number().gt(0).nullable().optional(),
            /** 1 là cao nhất. */
            priority: z.number().int().gte(1).describe('1 là cao nhất.').optional(),
            needs_daylight: z.boolean().optional(),
            needs_facade: z.boolean().optional(),
            needs_ventilation: z.boolean().optional(),
            /** Mã phòng MẸ khi không gian này nằm LỌT bên trong một phòng khác — hiện chỉ dùng cho khu vệ sinh của phòng ngủ khép kín. Hai hệ quả, và cả hai đều bắt buộc: cây bố cục đặt nó thành một lát cắt con bên trong ô của phòng mẹ, và bộ giải coi `requires_access` là thoả khi nó kề phòng mẹ — vì lối vào đi qua phòng mẹ, không qua hành lang. Thiếu vế thứ hai thì mọi phòng khép kín đều vô nghiệm. */
            enclosed_in: z
              .string()
              .nullable()
              .describe(
                'Mã phòng MẸ khi không gian này nằm LỌT bên trong một phòng khác — hiện chỉ dùng cho khu vệ sinh của phòng ngủ khép kín. Hai hệ quả, và cả hai đều bắt buộc: cây bố cục đặt nó thành một lát cắt con bên trong ô của phòng mẹ, và bộ giải coi `requires_access` là thoả khi nó kề phòng mẹ — vì lối vào đi qua phòng mẹ, không qua hành lang. Thiếu vế thứ hai thì mọi phòng khép kín đều vô nghiệm.',
              )
              .optional(),
          })
          .strict(),
      )
      .min(1),
    adjacency: z
      .array(
        z
          .object({
            a: spaceProgramSpaceIdSchema,
            b: spaceProgramSpaceIdSchema,
            /** adjacent = phải kề nhau · near = cùng tầng, gần · separate = nên cách nhau. */
            kind: z
              .enum(['adjacent', 'near', 'separate'])
              .describe(
                'adjacent = phải kề nhau · near = cùng tầng, gần · separate = nên cách nhau.',
              ),
            weight: z.number().gte(0).lte(1).optional(),
          })
          .strict(),
      )
      .optional(),
    floor_allocation: z
      .array(
        z
          .object({
            floor: z.number().int().gte(1).lte(12),
            /** Mặt sàn CHỌN DÙNG của tầng này — thứ bộ giải chia hết. Từ 07/09/2026 đây không còn bằng trần xây được: sàn xây được là một GIỚI HẠN, không phải một yêu cầu, và ép chương trình lấp cho hết chỗ chỉ sinh ra hành lang mênh mông. Xem `buildable_area_m2` để biết phần còn lại. */
            usable_area_m2: z
              .number()
              .gte(0)
              .nullable()
              .describe(
                'Mặt sàn CHỌN DÙNG của tầng này — thứ bộ giải chia hết. Từ 07/09/2026 đây không còn bằng trần xây được: sàn xây được là một GIỚI HẠN, không phải một yêu cầu, và ép chương trình lấp cho hết chỗ chỉ sinh ra hành lang mênh mông. Xem `buildable_area_m2` để biết phần còn lại.',
              )
              .optional(),
            /** Trần XÂY ĐƯỢC của tầng, sau khoảng lùi và mật độ. Khai riêng để việc thu nhỏ mặt sàn là một quyết định NHÌN THẤY ĐƯỢC: chênh lệch với `usable_area_m2` là phần đất còn lại làm sân vườn. Thiếu trường này thì chương trình co lại mà không ai biết nó đã co. */
            buildable_area_m2: z
              .number()
              .gte(0)
              .nullable()
              .describe(
                'Trần XÂY ĐƯỢC của tầng, sau khoảng lùi và mật độ. Khai riêng để việc thu nhỏ mặt sàn là một quyết định NHÌN THẤY ĐƯỢC: chênh lệch với `usable_area_m2` là phần đất còn lại làm sân vườn. Thiếu trường này thì chương trình co lại mà không ai biết nó đã co.',
              )
              .optional(),
            allocated_area_m2: z.number().gte(0).nullable().optional(),
          })
          .strict(),
      )
      .optional(),
    /** Mã dự án tham chiếu trong Knowledge Base — để truy được 'số này lấy từ đâu'. */
    reference_projects: z
      .array(z.string())
      .describe("Mã dự án tham chiếu trong Knowledge Base — để truy được 'số này lấy từ đâu'.")
      .optional(),
    priors_applied: z.boolean().optional(),
  })
  .strict()
  .describe(
    'Chương trình không gian — output Layer 2. Nguồn: doc/design/03-data-contracts.md mục 3.2.',
  );

export type SpaceProgram = z.infer<typeof spaceProgramSchema>;
