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

export const spaceProgramSpaceTypeSchema = z.string().regex(/^[a-z0-9_]+$/);

export type SpaceProgramSpaceType = z.infer<typeof spaceProgramSpaceTypeSchema>;

/**
 * Chương trình không gian — output Layer 2. Nguồn: doc/design/03-data-contracts.md mục 3.2.
 *
 * v1.1.0 (13/09/2026): diện tích khách khai ở đầu bài là TỐI THIỂU (T41), không còn đứng thành diện tích đề xuất cố định. Thêm `min_source`, `target_source` để màn hình nói được mỗi con số do ai quyết, `architect_edits` — những chỗ kiến trúc sư sửa diện tích đề xuất trước khi chốt, và `ai_intent` — đề xuất ưu tiên của AI mà bản chốt đã dùng.
 */
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
            /** Diện tích ĐỀ XUẤT. Chương trình chia phần sàn còn dư của tầng theo trọng số chuẩn nghề, hoặc lấy trung vị thống kê, hoặc kiến trúc sư sửa tay — xem `target_source`. Không bao giờ nhỏ hơn `min_area_m2`. */
            target_area_m2: z
              .number()
              .gt(0)
              .nullable()
              .describe(
                'Diện tích ĐỀ XUẤT. Chương trình chia phần sàn còn dư của tầng theo trọng số chuẩn nghề, hoặc lấy trung vị thống kê, hoặc kiến trúc sư sửa tay — xem `target_source`. Không bao giờ nhỏ hơn `min_area_m2`.',
              )
              .optional(),
            /** Diện tích TỐI THIỂU — số lớn nhất trong ba nguồn: đầu bài khách khai, gói quy tắc (kinh nghiệm NVG), chuẩn nghề (`kb/space_norms.yaml`). Nguồn thắng ghi ở `min_source`. */
            min_area_m2: z
              .number()
              .gt(0)
              .describe(
                'Diện tích TỐI THIỂU — số lớn nhất trong ba nguồn: đầu bài khách khai, gói quy tắc (kinh nghiệm NVG), chuẩn nghề (`kb/space_norms.yaml`). Nguồn thắng ghi ở `min_source`.',
              ),
            max_area_m2: z.number().gt(0).nullable().optional(),
            /** Nguồn của `min_area_m2`: brief = khách khai ở đầu bài · rule_pack = gói quy tắc của bộ giải (từ 13/09/2026 chỉ còn kinh nghiệm nghề NVG — không còn quy chuẩn) · practice = chuẩn nghề (`kb/space_norms.yaml`). Trùng nhau thì ưu tiên theo đúng thứ tự đó. Vắng ở artifact trước v1.1.0. */
            min_source: z
              .enum(['brief', 'rule_pack', 'practice'])
              .describe(
                'Nguồn của `min_area_m2`: brief = khách khai ở đầu bài · rule_pack = gói quy tắc của bộ giải (từ 13/09/2026 chỉ còn kinh nghiệm nghề NVG — không còn quy chuẩn) · practice = chuẩn nghề (`kb/space_norms.yaml`). Trùng nhau thì ưu tiên theo đúng thứ tự đó. Vắng ở artifact trước v1.1.0.',
              )
              .optional(),
            /** Ai quyết `target_area_m2`: program = chương trình chia sàn theo chuẩn nghề · statistics = trung vị công trình NVG đã làm · architect = kiến trúc sư sửa tay trước khi chốt. Vắng ở artifact trước v1.1.0. */
            target_source: z
              .enum(['program', 'statistics', 'architect'])
              .describe(
                'Ai quyết `target_area_m2`: program = chương trình chia sàn theo chuẩn nghề · statistics = trung vị công trình NVG đã làm · architect = kiến trúc sư sửa tay trước khi chốt. Vắng ở artifact trước v1.1.0.',
              )
              .optional(),
            /** Phòng của ai — «Ông bà · 2 người», «Con 2 · 1 người», «khép kín — Vợ chồng · 2 người». Chỉ phòng ngủ suy từ «Thành viên gia đình» (và khu vệ sinh khép kín của nó) mới có; vắng = engine không biết phòng dành cho ai. Thêm 13/09/2026. */
            occupant: z
              .string()
              .max(80)
              .nullable()
              .describe(
                'Phòng của ai — «Ông bà · 2 người», «Con 2 · 1 người», «khép kín — Vợ chồng · 2 người». Chỉ phòng ngủ suy từ «Thành viên gia đình» (và khu vệ sinh khép kín của nó) mới có; vắng = engine không biết phòng dành cho ai. Thêm 13/09/2026.',
              )
              .optional(),
            /** Tiện ích NẰM TRONG phòng này — tủ đồ, góc học tập, phòng thay đồ… — khai ở nhu cầu riêng của nhóm thành viên. Diện tích của chúng đã cộng vào ba con số diện tích của phòng; không có dòng không gian riêng. Danh sách mã ở `kb/space_norms.yaml` `in_bedroom`. Thêm 13/09/2026. */
            includes: z
              .array(spaceProgramSpaceTypeSchema)
              .max(8)
              .describe(
                'Tiện ích NẰM TRONG phòng này — tủ đồ, góc học tập, phòng thay đồ… — khai ở nhu cầu riêng của nhóm thành viên. Diện tích của chúng đã cộng vào ba con số diện tích của phòng; không có dòng không gian riêng. Danh sách mã ở `kb/space_norms.yaml` `in_bedroom`. Thêm 13/09/2026.',
              )
              .optional(),
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
    /** Diện tích đề xuất kiến trúc sư đã sửa trước khi chốt, mỗi không gian một dòng, xếp theo `space_id`. Lưu RIÊNG ngoài `spaces` để lần sau mở màn hình, chương trình tính lại từ đầu bài rồi áp lại đúng những chỗ sửa này — nhờ đó biết bản chốt còn khớp đầu bài hay không, và chỗ nào là của người. */
    architect_edits: z
      .array(
        z
          .object({
            space_id: spaceProgramSpaceIdSchema,
            target_area_m2: z.number().gt(0),
          })
          .strict(),
      )
      .max(200)
      .describe(
        'Diện tích đề xuất kiến trúc sư đã sửa trước khi chốt, mỗi không gian một dòng, xếp theo `space_id`. Lưu RIÊNG ngoài `spaces` để lần sau mở màn hình, chương trình tính lại từ đầu bài rồi áp lại đúng những chỗ sửa này — nhờ đó biết bản chốt còn khớp đầu bài hay không, và chỗ nào là của người.',
      )
      .optional(),
    /** Đề xuất mức ưu tiên diện tích của AI (Lớp 2a) mà bản chốt đã dùng. Từ 13/09/2026 AI chỉ chạy khi kiến trúc sư BẤM NÚT và chọn mô hình — không còn tự gọi mỗi lần mở màn hình. Lưu kèm bản chốt để lần sau tính lại từ đầu bài vẫn áp đúng đề xuất ấy mà không gọi mô hình lần nữa. Vắng = chương trình lập thuần theo chuẩn nghề. */
    ai_intent: z
      .object({
        route: z.string().min(1),
        provider: z.string().min(1),
        model: z.string().min(1),
        emphasis: z
          .array(
            z
              .object({
                space_type: spaceProgramSpaceTypeSchema,
                level: z.enum(['generous', 'normal', 'modest']),
              })
              .strict(),
          )
          .max(40),
        add_spaces: z.array(spaceProgramSpaceTypeSchema).max(12),
        rationale: z.string().max(800),
      })
      .strict()
      .nullable()
      .describe(
        'Đề xuất mức ưu tiên diện tích của AI (Lớp 2a) mà bản chốt đã dùng. Từ 13/09/2026 AI chỉ chạy khi kiến trúc sư BẤM NÚT và chọn mô hình — không còn tự gọi mỗi lần mở màn hình. Lưu kèm bản chốt để lần sau tính lại từ đầu bài vẫn áp đúng đề xuất ấy mà không gọi mô hình lần nữa. Vắng = chương trình lập thuần theo chuẩn nghề.',
      )
      .optional(),
    /** Nguồn sinh artifact — nhánh AI (T10) ghi để truy vết: kind 'ai' kèm nhà cung cấp, mô hình, tuyến, phiên bản lời dẫn và lý do mô hình đưa ra. Vắng hoặc 'solver' = nhánh tất định. Trường tuỳ chọn, thêm 08/09/2026; artifact cũ không có vẫn hợp lệ. */
    generator: z
      .object({
        kind: z.enum(['solver', 'ai']),
        provider: z.string().nullable().optional(),
        model: z.string().nullable().optional(),
        route: z.string().nullable().optional(),
        prompt_version: z.string().nullable().optional(),
        rationale: z.string().max(2000).nullable().optional(),
      })
      .strict()
      .nullable()
      .describe(
        "Nguồn sinh artifact — nhánh AI (T10) ghi để truy vết: kind 'ai' kèm nhà cung cấp, mô hình, tuyến, phiên bản lời dẫn và lý do mô hình đưa ra. Vắng hoặc 'solver' = nhánh tất định. Trường tuỳ chọn, thêm 08/09/2026; artifact cũ không có vẫn hợp lệ.",
      )
      .optional(),
  })
  .strict()
  .describe(
    'Chương trình không gian — output Layer 2. Nguồn: doc/design/03-data-contracts.md mục 3.2.\n\nv1.1.0 (13/09/2026): diện tích khách khai ở đầu bài là TỐI THIỂU (T41), không còn đứng thành diện tích đề xuất cố định. Thêm `min_source`, `target_source` để màn hình nói được mỗi con số do ai quyết, `architect_edits` — những chỗ kiến trúc sư sửa diện tích đề xuất trước khi chốt, và `ai_intent` — đề xuất ưu tiên của AI mà bản chốt đã dùng.',
  );

export type SpaceProgram = z.infer<typeof spaceProgramSchema>;
