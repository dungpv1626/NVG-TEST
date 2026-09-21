/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-facade-review.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiFacadeReviewSemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export type AiFacadeReviewSemver = z.infer<typeof aiFacadeReviewSemverSchema>;

export const aiFacadeReviewArtifactRefSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export type AiFacadeReviewArtifactRef = z.infer<typeof aiFacadeReviewArtifactRefSchema>;

/**
 * KỸ SƯ CHẤM LẠI một bản mặt đứng, trên đúng bảng tiêu chí mà máy vừa chấm (T63, 20/09/2026 — Haan chọn «Máy chấm + kỹ sư chấm lại»).
 *
 * Vì sao phải lưu thành artifact chứ không phải một cột trong bảng: điểm máy tính LẠI mỗi lần đọc (thước đo còn lớn lên theo số hồ sơ đã đo), còn điểm người thì không được phép đổi sau lưng ai. Hai con số ấy chỉ so được với nhau khi bản chấm tay mang theo `facade_ref` (chấm bản vẽ NÀO) và `score_version` (bằng cái thước nào) — thiếu một trong hai thì «kỹ sư chấm 70» là một câu không kiểm chứng được.
 *
 * Đây KHÔNG phải phê duyệt. Kết quả AI vẫn là nháp cho tới khi người có thẩm quyền duyệt qua đúng luồng phê duyệt (PRD 2.3); vì vậy hợp đồng này cố ý không có ô «đạt / không đạt» nào — chỉ có điểm từng tiêu chí và lời của kỹ sư.
 *
 * Artifact bất biến: chấm lại lần nữa là một artifact MỚI, bản cũ còn nguyên để truy.
 */
export const aiFacadeReviewSchema = z
  .object({
    schema_version: aiFacadeReviewSemverSchema,
    /** Bản mặt đứng được chấm. Bắt buộc — một bản chấm không gắn với bản vẽ nào thì không nói lên điều gì. */
    facade_ref: aiFacadeReviewArtifactRefSchema.describe(
      'Bản mặt đứng được chấm. Bắt buộc — một bản chấm không gắn với bản vẽ nào thì không nói lên điều gì.',
    ),
    /** `score_version` của `kb/facade_quality.yaml` lúc chấm. Thước đổi thì màn hình phải nói bản chấm này dựng trên thước cũ, đừng lặng lẽ trộn hai thang điểm. */
    score_version: z
      .number()
      .int()
      .gte(1)
      .describe(
        '`score_version` của `kb/facade_quality.yaml` lúc chấm. Thước đổi thì màn hình phải nói bản chấm này dựng trên thước cũ, đừng lặng lẽ trộn hai thang điểm.',
      ),
    /** Điểm MÁY tại thời điểm chấm tay, để về sau còn đối chiếu hai bên lệch nhau ở đâu. `null` khi máy chưa chấm được gì. */
    machine_percent: z
      .number()
      .int()
      .gte(0)
      .lte(100)
      .nullable()
      .describe(
        'Điểm MÁY tại thời điểm chấm tay, để về sau còn đối chiếu hai bên lệch nhau ở đâu. `null` khi máy chưa chấm được gì.',
      )
      .optional(),
    /** Máy chủ đặt, không tin trình duyệt. Cũng để hai lần chấm giống hệt nhau vẫn ra hai artifact khác nhau — mã artifact là băm NỘI DUNG. */
    reviewed_at: z
      .string()
      .datetime({ offset: true })
      .describe(
        'Máy chủ đặt, không tin trình duyệt. Cũng để hai lần chấm giống hệt nhau vẫn ra hai artifact khác nhau — mã artifact là băm NỘI DUNG.',
      ),
    /** `users.id` của kỹ sư đã chấm. Máy chủ đặt. */
    reviewed_by: z
      .string()
      .nullable()
      .describe('`users.id` của kỹ sư đã chấm. Máy chủ đặt.')
      .optional(),
    /** Chỉ những tiêu chí kỹ sư ĐÃ chấm. Tiêu chí không có ở đây nghĩa là «để nguyên điểm máy» — khác hẳn với chấm 0. */
    criteria: z
      .array(
        z
          .object({
            /** Mã tiêu chí trong `kb/facade_quality.yaml`. */
            code: z
              .string()
              .regex(/^[A-Z][0-9]{1,2}$/)
              .describe('Mã tiêu chí trong `kb/facade_quality.yaml`.'),
            /** Điểm kỹ sư cho tiêu chí này: 1 đạt, 0,5 đạt một phần, 0 chưa đạt. `null` = kỹ sư cũng không chấm được, chỉ để lại ghi chú. */
            score: z
              .union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(null)])
              .nullable()
              .describe(
                'Điểm kỹ sư cho tiêu chí này: 1 đạt, 0,5 đạt một phần, 0 chưa đạt. `null` = kỹ sư cũng không chấm được, chỉ để lại ghi chú.',
              ),
            /** Vì sao chấm khác máy. Tiếng Việt. */
            note: z.string().max(300).nullable().describe('Vì sao chấm khác máy. Tiếng Việt.'),
          })
          .strict(),
      )
      .max(40)
      .describe(
        'Chỉ những tiêu chí kỹ sư ĐÃ chấm. Tiêu chí không có ở đây nghĩa là «để nguyên điểm máy» — khác hẳn với chấm 0.',
      ),
    /** Nhận xét chung của kỹ sư về bản mặt đứng. Tiếng Việt. */
    note: z
      .string()
      .max(1500)
      .nullable()
      .describe('Nhận xét chung của kỹ sư về bản mặt đứng. Tiếng Việt.'),
  })
  .strict()
  .describe(
    'KỸ SƯ CHẤM LẠI một bản mặt đứng, trên đúng bảng tiêu chí mà máy vừa chấm (T63, 20/09/2026 — Haan chọn «Máy chấm + kỹ sư chấm lại»).\n\nVì sao phải lưu thành artifact chứ không phải một cột trong bảng: điểm máy tính LẠI mỗi lần đọc (thước đo còn lớn lên theo số hồ sơ đã đo), còn điểm người thì không được phép đổi sau lưng ai. Hai con số ấy chỉ so được với nhau khi bản chấm tay mang theo `facade_ref` (chấm bản vẽ NÀO) và `score_version` (bằng cái thước nào) — thiếu một trong hai thì «kỹ sư chấm 70» là một câu không kiểm chứng được.\n\nĐây KHÔNG phải phê duyệt. Kết quả AI vẫn là nháp cho tới khi người có thẩm quyền duyệt qua đúng luồng phê duyệt (PRD 2.3); vì vậy hợp đồng này cố ý không có ô «đạt / không đạt» nào — chỉ có điểm từng tiêu chí và lời của kỹ sư.\n\nArtifact bất biến: chấm lại lần nữa là một artifact MỚI, bản cũ còn nguyên để truy.',
  );

export type AiFacadeReview = z.infer<typeof aiFacadeReviewSchema>;
