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
 * Chương trình không gian do MÔ HÌNH ĐỀ XUẤT — đầu ra THÔ của nhánh AI, TRƯỚC khi Worker kiểm và đánh lại mã.
 *
 * Bản đã kiểm là một hợp đồng khác: `ai-space-program`. Tách hai hợp đồng vì mã phòng ở đây là MÃ TẠM do mô hình tự đặt để trỏ `ensuite_of`, còn bản lưu mang mã theo khuôn `type_n` mà mọi bước sau dùng để nói về cùng một phòng.
 *
 * v1.1.0 (09/09/2026): `floor` → `level`, `enclosed_in` → `ensuite_of`. Một bộ từ vựng chạy suốt nhánh AI — lời dẫn, kiểm máy, artifact và giao diện không phải dịch tên trường cho nhau.
 *
 * Mô hình quyết DANH MỤC không gian, TẦNG và DIỆN TÍCH mong muốn. Worker kiểm lại: mã phòng có trong từ vựng, tầng nằm trong số tầng của đầu bài, đủ không gian mà ĐẦU BÀI đòi, số phòng ngủ đúng thành phần gia đình, tổng diện tích từng tầng không vượt sàn xây được. Sai → một lượt sửa kèm danh sách lỗi → vẫn sai → bác, không đúc artifact.
 *
 * ⚠️ Lời dẫn gửi cho mô hình KHÔNG mang ngưỡng quy chuẩn nào (T14): mô hình nhận đầu bài, từ vựng phòng và quy ước cấu tạo của NVG. Ngưỡng ở `rules/` được đọc SAU khi mô hình trả về, để sinh CẢNH BÁO — không để ràng buộc mô hình. Bó nhánh AI bằng đúng ràng buộc của bộ giải là dựng lại bộ giải bằng một công cụ dở hơn.
 *
 * Mã phòng lấy từ kb/room_vocabulary.yaml.
 */
export const aiSpaceProgramProposalSchema = z
  .object({
    schema_version: aiSpaceProgramProposalSemverSchema,
    spaces: z
      .array(
        z
          .object({
            /** Mã tạm do mô hình đặt, duy nhất trong đề xuất; chỉ để trỏ ensuite_of. */
            id: aiSpaceProgramProposalSpaceIdSchema.describe(
              'Mã tạm do mô hình đặt, duy nhất trong đề xuất; chỉ để trỏ ensuite_of.',
            ),
            /** Mã không gian trong kb/room_vocabulary.yaml (living, kitchen, bedroom, master_bedroom, wc, stair, circulation…). */
            type: aiSpaceProgramProposalSpaceIdSchema.describe(
              'Mã không gian trong kb/room_vocabulary.yaml (living, kitchen, bedroom, master_bedroom, wc, stair, circulation…).',
            ),
            /** Tầng, 1 là tầng trệt. Không vượt số tầng của đầu bài. */
            level: z
              .number()
              .int()
              .gte(1)
              .describe('Tầng, 1 là tầng trệt. Không vượt số tầng của đầu bài.'),
            /** Diện tích mong muốn, m² — kích thước lọt lòng. */
            target_area_m2: z
              .number()
              .gt(0)
              .describe('Diện tích mong muốn, m² — kích thước lọt lòng.'),
            /** Mã tạm của phòng mẹ khi không gian này nằm TRONG phòng đó (vệ sinh khép kín trong phòng ngủ). Rỗng với mọi phòng khác. */
            ensuite_of: z
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
    'Chương trình không gian do MÔ HÌNH ĐỀ XUẤT — đầu ra THÔ của nhánh AI, TRƯỚC khi Worker kiểm và đánh lại mã.\n\nBản đã kiểm là một hợp đồng khác: `ai-space-program`. Tách hai hợp đồng vì mã phòng ở đây là MÃ TẠM do mô hình tự đặt để trỏ `ensuite_of`, còn bản lưu mang mã theo khuôn `type_n` mà mọi bước sau dùng để nói về cùng một phòng.\n\nv1.1.0 (09/09/2026): `floor` → `level`, `enclosed_in` → `ensuite_of`. Một bộ từ vựng chạy suốt nhánh AI — lời dẫn, kiểm máy, artifact và giao diện không phải dịch tên trường cho nhau.\n\nMô hình quyết DANH MỤC không gian, TẦNG và DIỆN TÍCH mong muốn. Worker kiểm lại: mã phòng có trong từ vựng, tầng nằm trong số tầng của đầu bài, đủ không gian mà ĐẦU BÀI đòi, số phòng ngủ đúng thành phần gia đình, tổng diện tích từng tầng không vượt sàn xây được. Sai → một lượt sửa kèm danh sách lỗi → vẫn sai → bác, không đúc artifact.\n\n⚠️ Lời dẫn gửi cho mô hình KHÔNG mang ngưỡng quy chuẩn nào (T14): mô hình nhận đầu bài, từ vựng phòng và quy ước cấu tạo của NVG. Ngưỡng ở `rules/` được đọc SAU khi mô hình trả về, để sinh CẢNH BÁO — không để ràng buộc mô hình. Bó nhánh AI bằng đúng ràng buộc của bộ giải là dựng lại bộ giải bằng một công cụ dở hơn.\n\nMã phòng lấy từ kb/room_vocabulary.yaml.',
  );

export type AiSpaceProgramProposal = z.infer<typeof aiSpaceProgramProposalSchema>;
