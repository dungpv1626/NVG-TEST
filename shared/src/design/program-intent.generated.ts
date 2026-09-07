/**
 * SINH TỰ ĐỘNG TỪ `contracts/program-intent.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const programIntentSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type ProgramIntentSemver = z.infer<typeof programIntentSemverSchema>;

/**
 * Ý ĐỒ chương trình không gian — output Lớp 2a, do mô hình ngôn ngữ sinh.
 *
 * Đây là chỗ AI tham gia vào việc soạn chương trình không gian, và ranh giới của nó là tuyệt đối: **hợp đồng này không có một trường nào mang đơn vị mét vuông**. Mô hình nói phòng nào NÊN RỘNG RÃI và phòng nào NÊN TỐI GIẢN cho một hồ sơ có hình dạng như thế này; bộ cấp phát tất định (`workers/src/design/program/engine.ts::allocateAreas`) mới là nơi gán số, và nó luôn kẹp trong [tối thiểu quy chuẩn, tối đa nghề].
 *
 * Hai lý do, cả hai đều là hàng rào cứng:
 *
 * 1. **Nguyên tắc bất biến 2** (CLAUDE.md 8.2): mô hình ngôn ngữ không bao giờ sinh toạ độ hay kích thước — nó sinh cấu trúc, bộ giải gán số.
 * 2. **Khoá chính của `design_artifact` là mã băm nội dung.** Số do mô hình sinh làm "cùng đầu vào + cùng cấu hình → cùng artifact" mất nghĩa, và cùng lúc đó mất luôn khả năng truy vết một con số về nguồn của nó.
 *
 * ⚠️ Đầu vào của mô hình là bản TÓM TẮT ĐÃ ẨN DANH (hạng dữ liệu 3), không phải đầu bài. Xem `workers/src/design/program/intent.ts`.
 */
export const programIntentSchema = z
  .object({
    schema_version: programIntentSemverSchema,
    emphasis: z
      .array(
        z
          .object({
            /** Mã không gian, lấy từ kb/room_vocabulary.yaml. Mã lạ bị bỏ qua kèm ghi chú — không bao giờ tạo ra một loại phòng mới. */
            space_type: z
              .string()
              .regex(/^[a-z0-9_]+$/)
              .describe(
                'Mã không gian, lấy từ kb/room_vocabulary.yaml. Mã lạ bị bỏ qua kèm ghi chú — không bao giờ tạo ra một loại phòng mới.',
              ),
            /** Mức ưu ái khi chia phần sàn còn dư. Ba bậc rời rạc, KHÔNG phải một hệ số — số là việc của bộ cấp phát. Ba bậc đủ để diễn đạt phán đoán nghề và không đủ để lách thành một con số. */
            level: z
              .enum(['generous', 'normal', 'modest'])
              .describe(
                'Mức ưu ái khi chia phần sàn còn dư. Ba bậc rời rạc, KHÔNG phải một hệ số — số là việc của bộ cấp phát. Ba bậc đủ để diễn đạt phán đoán nghề và không đủ để lách thành một con số.',
              ),
          })
          .strict(),
      )
      .max(40),
    /** Không gian mà một hồ sơ có hình dạng như thế này thường phải có nhưng đầu bài chưa khai (ví dụ: nhà ba thế hệ thiếu phòng thờ). Chỉ ĐỀ XUẤT — engine vẫn kiểm mã có trong từ vựng và có chuẩn diện tích. */
    add_spaces: z
      .array(z.string().regex(/^[a-z0-9_]+$/))
      .max(12)
      .describe(
        'Không gian mà một hồ sơ có hình dạng như thế này thường phải có nhưng đầu bài chưa khai (ví dụ: nhà ba thế hệ thiếu phòng thờ). Chỉ ĐỀ XUẤT — engine vẫn kiểm mã có trong từ vựng và có chuẩn diện tích.',
      )
      .optional(),
    /** Vì sao lại nhấn mạnh như vậy, một hai câu tiếng Việt. Hiện thẳng cho kiến trúc sư: một đề xuất không nói được lý do thì không kiểm lại được, và AI ở đây là phụ trợ chứ không phải người quyết (PRD 2.3). */
    rationale: z
      .string()
      .max(800)
      .describe(
        'Vì sao lại nhấn mạnh như vậy, một hai câu tiếng Việt. Hiện thẳng cho kiến trúc sư: một đề xuất không nói được lý do thì không kiểm lại được, và AI ở đây là phụ trợ chứ không phải người quyết (PRD 2.3).',
      )
      .optional(),
  })
  .strict()
  .describe(
    'Ý ĐỒ chương trình không gian — output Lớp 2a, do mô hình ngôn ngữ sinh.\n\nĐây là chỗ AI tham gia vào việc soạn chương trình không gian, và ranh giới của nó là tuyệt đối: **hợp đồng này không có một trường nào mang đơn vị mét vuông**. Mô hình nói phòng nào NÊN RỘNG RÃI và phòng nào NÊN TỐI GIẢN cho một hồ sơ có hình dạng như thế này; bộ cấp phát tất định (`workers/src/design/program/engine.ts::allocateAreas`) mới là nơi gán số, và nó luôn kẹp trong [tối thiểu quy chuẩn, tối đa nghề].\n\nHai lý do, cả hai đều là hàng rào cứng:\n\n1. **Nguyên tắc bất biến 2** (CLAUDE.md 8.2): mô hình ngôn ngữ không bao giờ sinh toạ độ hay kích thước — nó sinh cấu trúc, bộ giải gán số.\n2. **Khoá chính của `design_artifact` là mã băm nội dung.** Số do mô hình sinh làm "cùng đầu vào + cùng cấu hình → cùng artifact" mất nghĩa, và cùng lúc đó mất luôn khả năng truy vết một con số về nguồn của nó.\n\n⚠️ Đầu vào của mô hình là bản TÓM TẮT ĐÃ ẨN DANH (hạng dữ liệu 3), không phải đầu bài. Xem `workers/src/design/program/intent.ts`.',
  );

export type ProgramIntent = z.infer<typeof programIntentSchema>;
