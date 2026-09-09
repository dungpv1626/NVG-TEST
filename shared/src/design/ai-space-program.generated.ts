/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-space-program.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiSpaceProgramSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiSpaceProgramSemver = z.infer<typeof aiSpaceProgramSemverSchema>;

export const aiSpaceProgramArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiSpaceProgramArtifactRef = z.infer<typeof aiSpaceProgramArtifactRefSchema>;

export const aiSpaceProgramSpaceIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export type AiSpaceProgramSpaceId = z.infer<typeof aiSpaceProgramSpaceIdSchema>;

/** Ai sinh ra artifact này. Nhánh AI luôn `kind: ai` — trường vẫn khai enum một giá trị để phân biệt với artifact của bộ giải khi hai dòng còn sống song song. */
export const aiSpaceProgramGeneratorSchema = z
  .object({
    kind: z.enum(['ai']),
    provider: z.string().max(32),
    model: z.string().max(96),
    route: z.string().max(64),
    prompt_version: z.string().max(16),
    /** Đã phải gọi thêm một lượt sửa. Giao diện nói ra để không ai tưởng lượt đầu đã đạt. */
    repaired: z
      .boolean()
      .describe(
        'Đã phải gọi thêm một lượt sửa. Giao diện nói ra để không ai tưởng lượt đầu đã đạt.',
      )
      .optional(),
  })
  .strict()
  .describe(
    'Ai sinh ra artifact này. Nhánh AI luôn `kind: ai` — trường vẫn khai enum một giá trị để phân biệt với artifact của bộ giải khi hai dòng còn sống song song.',
  );

export type AiSpaceProgramGenerator = z.infer<typeof aiSpaceProgramGeneratorSchema>;

/**
 * Chương trình không gian của NHÁNH AI — artifact được lưu, sau khi Worker đã kiểm và đánh lại mã phòng.
 *
 * CỐ Ý KHÔNG dùng lại `space-program` của bộ giải nội bộ (T15–T18, 09/09/2026). Hợp đồng kia mang `floor_allocation`, `priors_applied`, `adjacency`, `min/max/priority/needs_*` — mọi trường ấy do mã nguồn bộ giải điền (`program/engine.ts`, `program/norms.ts`). Nhánh AI phải sống được sau khi bộ giải bị xoá, nên nó có hợp đồng riêng, hẹp hơn, chỉ gồm thứ mô hình thật sự quyết.
 *
 * Quan hệ với `ai-space-program-proposal`: kia là đầu ra THÔ của mô hình (mã phòng tạm do mô hình đặt), đây là bản đã kiểm và đánh số lại theo khuôn `type_n`. Mọi tham chiếu `ensuite_of` đã ánh xạ sang mã mới.
 *
 * Đây là đề xuất để kiến trúc sư đọc và sửa, KHÔNG phải hồ sơ phát hành.
 */
export const aiSpaceProgramSchema = z
  .object({
    schema_version: aiSpaceProgramSemverSchema,
    /** Đầu bài mà chương trình này lập theo. Worker điền, không hỏi mô hình. */
    brief_ref: aiSpaceProgramArtifactRefSchema.describe(
      'Đầu bài mà chương trình này lập theo. Worker điền, không hỏi mô hình.',
    ),
    spaces: z
      .array(
        z
          .object({
            /** Mã do Worker đánh theo khuôn `type_n` (living_1, bedroom_2…). Bước xếp mặt bằng dùng đúng mã này. */
            id: aiSpaceProgramSpaceIdSchema.describe(
              'Mã do Worker đánh theo khuôn `type_n` (living_1, bedroom_2…). Bước xếp mặt bằng dùng đúng mã này.',
            ),
            /** Mã loại phòng trong kb/room_vocabulary.yaml. */
            type: aiSpaceProgramSpaceIdSchema.describe(
              'Mã loại phòng trong kb/room_vocabulary.yaml.',
            ),
            /** Tầng, 1 là tầng trệt. Gọi là `level` chứ không `floor` để một từ vựng chạy suốt nhánh AI: chương trình, mặt bằng, lời dẫn, kiểm máy và giao diện không phải dịch tên trường cho nhau. */
            level: z
              .number()
              .int()
              .gte(1)
              .describe(
                'Tầng, 1 là tầng trệt. Gọi là `level` chứ không `floor` để một từ vựng chạy suốt nhánh AI: chương trình, mặt bằng, lời dẫn, kiểm máy và giao diện không phải dịch tên trường cho nhau.',
              ),
            /** Diện tích mong muốn, m². */
            target_area_m2: z.number().gt(0).describe('Diện tích mong muốn, m².'),
            /** Mã phòng mẹ khi không gian này nằm TRONG phòng đó (vệ sinh khép kín trong phòng ngủ). Rỗng với mọi phòng khác. */
            ensuite_of: z
              .string()
              .nullable()
              .describe(
                'Mã phòng mẹ khi không gian này nằm TRONG phòng đó (vệ sinh khép kín trong phòng ngủ). Rỗng với mọi phòng khác.',
              )
              .optional(),
            /** Một câu tiếng Việt vì sao chọn tầng/diện tích này. */
            why: z
              .string()
              .max(200)
              .nullable()
              .describe('Một câu tiếng Việt vì sao chọn tầng/diện tích này.')
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    /** Ý đồ tổ chức không gian toàn nhà, tiếng Việt, 2–5 câu. */
    rationale: z
      .string()
      .max(1500)
      .describe('Ý đồ tổ chức không gian toàn nhà, tiếng Việt, 2–5 câu.'),
    /** Điều mô hình phải GIẢ ĐỊNH vì đầu bài không nói. Giao diện bày thành danh sách câu hỏi cho khách. */
    assumptions: z
      .array(z.string().max(200))
      .max(12)
      .describe(
        'Điều mô hình phải GIẢ ĐỊNH vì đầu bài không nói. Giao diện bày thành danh sách câu hỏi cho khách.',
      )
      .optional(),
    generator: aiSpaceProgramGeneratorSchema,
  })
  .strict()
  .describe(
    'Chương trình không gian của NHÁNH AI — artifact được lưu, sau khi Worker đã kiểm và đánh lại mã phòng.\n\nCỐ Ý KHÔNG dùng lại `space-program` của bộ giải nội bộ (T15–T18, 09/09/2026). Hợp đồng kia mang `floor_allocation`, `priors_applied`, `adjacency`, `min/max/priority/needs_*` — mọi trường ấy do mã nguồn bộ giải điền (`program/engine.ts`, `program/norms.ts`). Nhánh AI phải sống được sau khi bộ giải bị xoá, nên nó có hợp đồng riêng, hẹp hơn, chỉ gồm thứ mô hình thật sự quyết.\n\nQuan hệ với `ai-space-program-proposal`: kia là đầu ra THÔ của mô hình (mã phòng tạm do mô hình đặt), đây là bản đã kiểm và đánh số lại theo khuôn `type_n`. Mọi tham chiếu `ensuite_of` đã ánh xạ sang mã mới.\n\nĐây là đề xuất để kiến trúc sư đọc và sửa, KHÔNG phải hồ sơ phát hành.',
  );

export type AiSpaceProgram = z.infer<typeof aiSpaceProgramSchema>;
