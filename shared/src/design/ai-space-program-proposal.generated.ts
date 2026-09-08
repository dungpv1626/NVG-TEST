/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-space-program-proposal.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiSpaceProgramProposalSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiSpaceProgramProposalSemver = z.infer<typeof aiSpaceProgramProposalSemverSchema>;

export const aiSpaceProgramProposalSpaceIdSchema = z.string().regex(/^[a-z0-9_]+$/);

export type AiSpaceProgramProposalSpaceId = z.infer<typeof aiSpaceProgramProposalSpaceIdSchema>;

/**
 * Chương trình không gian do MÔ HÌNH ĐỀ XUẤT — đầu ra thô của nhánh AI (T10–T13), TRƯỚC khi Worker kiểm và điền phần tất định.
 *
 * Đây là chỗ nới có kiểm soát của nguyên tắc bất biến 2 (CLAUDE.md 8.2): mô hình được đưa ra diện tích mong muốn (m²) cho từng không gian — không phải toạ độ — vì Haan chốt nhánh AI song song (T10). Ranh giới của nó nằm ở lớp gọi, không ở đây: mọi con số đều bị kiểm lại (tối thiểu quy chuẩn, sàn xây được từng tầng, số phòng ngủ theo gia đình, mã phòng có trong từ vựng) và mọi trường KHÔNG do mô hình quyết (min/max/priority/daylight/facade/ventilation/adjacency/floor_allocation) do Worker điền từ rule pack và kb/space_norms.yaml. Sai kiểm → một lượt sửa → vẫn sai → bác, không đúc artifact.
 *
 * Mã phòng: lấy từ kb/room_vocabulary.yaml. `id` do mô hình tự đặt để trỏ `enclosed_in`; Worker đánh số lại theo khuôn `type_n` của engine và ánh xạ mọi tham chiếu.
 */
export const aiSpaceProgramProposalSchema = z
  .object({
    schema_version: aiSpaceProgramProposalSemverSchema,
    spaces: z
      .array(
        z
          .object({
            /** Mã tạm do mô hình đặt, duy nhất trong đề xuất; chỉ để trỏ enclosed_in. */
            id: aiSpaceProgramProposalSpaceIdSchema.describe(
              'Mã tạm do mô hình đặt, duy nhất trong đề xuất; chỉ để trỏ enclosed_in.',
            ),
            /** Mã không gian trong kb/room_vocabulary.yaml (living, kitchen, bedroom, master_bedroom, wc, stair, circulation…). */
            type: aiSpaceProgramProposalSpaceIdSchema.describe(
              'Mã không gian trong kb/room_vocabulary.yaml (living, kitchen, bedroom, master_bedroom, wc, stair, circulation…).',
            ),
            /** Tầng, 1 là tầng trệt. Không vượt số tầng của đầu bài. */
            floor: z
              .number()
              .int()
              .gte(1)
              .describe('Tầng, 1 là tầng trệt. Không vượt số tầng của đầu bài.'),
            /** Diện tích mong muốn, m². Không dưới tối thiểu quy chuẩn của loại phòng (gửi kèm trong lời dẫn). */
            target_area_m2: z
              .number()
              .gt(0)
              .describe(
                'Diện tích mong muốn, m². Không dưới tối thiểu quy chuẩn của loại phòng (gửi kèm trong lời dẫn).',
              ),
            /** Mã tạm của phòng mẹ khi không gian này nằm TRONG phòng đó (vệ sinh khép kín trong phòng ngủ). Rỗng với mọi phòng khác. */
            enclosed_in: z
              .string()
              .nullable()
              .describe(
                'Mã tạm của phòng mẹ khi không gian này nằm TRONG phòng đó (vệ sinh khép kín trong phòng ngủ). Rỗng với mọi phòng khác.',
              )
              .optional(),
            /** Một câu tiếng Việt vì sao chọn tầng/diện tích này — chỉ cho phòng có quyết định đáng nói. */
            why: z
              .string()
              .max(200)
              .nullable()
              .describe(
                'Một câu tiếng Việt vì sao chọn tầng/diện tích này — chỉ cho phòng có quyết định đáng nói.',
              )
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    /** Ý đồ tổ chức không gian toàn nhà, tiếng Việt, 2–5 câu. Hiện thẳng cho kiến trúc sư: đề xuất không nói được lý do thì không kiểm lại được (PRD 2.3). */
    rationale: z
      .string()
      .max(1500)
      .describe(
        'Ý đồ tổ chức không gian toàn nhà, tiếng Việt, 2–5 câu. Hiện thẳng cho kiến trúc sư: đề xuất không nói được lý do thì không kiểm lại được (PRD 2.3).',
      ),
    /** Điều mô hình phải GIẢ ĐỊNH vì đầu bài không nói — mỗi dòng một điều, tiếng Việt. Đây là danh sách câu hỏi cho khách. */
    assumptions: z
      .array(z.string().max(200))
      .max(12)
      .describe(
        'Điều mô hình phải GIẢ ĐỊNH vì đầu bài không nói — mỗi dòng một điều, tiếng Việt. Đây là danh sách câu hỏi cho khách.',
      )
      .optional(),
  })
  .strict()
  .describe(
    'Chương trình không gian do MÔ HÌNH ĐỀ XUẤT — đầu ra thô của nhánh AI (T10–T13), TRƯỚC khi Worker kiểm và điền phần tất định.\n\nĐây là chỗ nới có kiểm soát của nguyên tắc bất biến 2 (CLAUDE.md 8.2): mô hình được đưa ra diện tích mong muốn (m²) cho từng không gian — không phải toạ độ — vì Haan chốt nhánh AI song song (T10). Ranh giới của nó nằm ở lớp gọi, không ở đây: mọi con số đều bị kiểm lại (tối thiểu quy chuẩn, sàn xây được từng tầng, số phòng ngủ theo gia đình, mã phòng có trong từ vựng) và mọi trường KHÔNG do mô hình quyết (min/max/priority/daylight/facade/ventilation/adjacency/floor_allocation) do Worker điền từ rule pack và kb/space_norms.yaml. Sai kiểm → một lượt sửa → vẫn sai → bác, không đúc artifact.\n\nMã phòng: lấy từ kb/room_vocabulary.yaml. `id` do mô hình tự đặt để trỏ `enclosed_in`; Worker đánh số lại theo khuôn `type_n` của engine và ánh xạ mọi tham chiếu.',
  );

export type AiSpaceProgramProposal = z.infer<typeof aiSpaceProgramProposalSchema>;
