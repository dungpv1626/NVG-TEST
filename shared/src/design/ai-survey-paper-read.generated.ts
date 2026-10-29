/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-survey-paper-read.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiSurveyPaperReadFieldSchema = z
  .object({
    /** Khoá ô: một trong sáu ô báo cáo (`needs`, `decision_maker`, `budget_note`, `schedule_note`, `commercial_terms`, `notes`) hoặc `site.<khoá>` của phiếu riêng pháp nhân (`SURVEY_SITE_FORMS`). */
    key: z
      .string()
      .min(1)
      .max(80)
      .describe(
        'Khoá ô: một trong sáu ô báo cáo (`needs`, `decision_maker`, `budget_note`, `schedule_note`, `commercial_terms`, `notes`) hoặc `site.<khoá>` của phiếu riêng pháp nhân (`SURVEY_SITE_FORMS`).',
      ),
    /** Chữ viết tay đọc được, chép gần nguyên văn (sửa chính tả hiển nhiên được, không thêm ý). */
    value: z
      .string()
      .max(2000)
      .describe(
        'Chữ viết tay đọc được, chép gần nguyên văn (sửa chính tả hiển nhiên được, không thêm ý).',
      ),
    /** `ro` = đọc rõ; `khong_ro` = có chữ nhưng đọc không chắc, người dùng phải đối chiếu với phiếu. */
    confidence: z
      .enum(['ro', 'khong_ro'])
      .describe(
        '`ro` = đọc rõ; `khong_ro` = có chữ nhưng đọc không chắc, người dùng phải đối chiếu với phiếu.',
      ),
  })
  .strict();

export type AiSurveyPaperReadField = z.infer<typeof aiSurveyPaperReadFieldSchema>;

/** Khung «Sơ đồ hiện trạng» vẽ tay trên phiếu (anh Dũng 28/10/2026: sơ đồ phải hiện trong biên bản). Toạ độ theo tỷ lệ của ảnh trang ĐÃ CHE (0 = mép trái / trên, 1 = mép phải / dưới); trình duyệt cắt đúng vùng đó từ ảnh đã che và đề xuất lưu thành ảnh hiện trạng. Khung trống hoặc không thấy thì bỏ hẳn trường này. */
export const aiSurveyPaperReadSketchSchema = z
  .object({
    /** Trang chứa sơ đồ, đếm từ 1 theo thứ tự ảnh gửi. */
    page: z
      .number()
      .int()
      .gte(1)
      .lte(4)
      .describe('Trang chứa sơ đồ, đếm từ 1 theo thứ tự ảnh gửi.'),
    x0: z.number().gte(0).lte(1),
    y0: z.number().gte(0).lte(1),
    x1: z.number().gte(0).lte(1),
    y1: z.number().gte(0).lte(1),
    /** Mô tả sơ đồ bằng chữ: hình dạng khu đất, kích thước ghi trên hình, hướng, đường / lối vào, vật cản (cột điện, giếng, cây…), nhà bên cạnh. Chỉ điều thấy trên hình, không đoán. */
    description: z
      .string()
      .max(1500)
      .describe(
        'Mô tả sơ đồ bằng chữ: hình dạng khu đất, kích thước ghi trên hình, hướng, đường / lối vào, vật cản (cột điện, giếng, cây…), nhà bên cạnh. Chỉ điều thấy trên hình, không đoán.',
      ),
  })
  .strict()
  .describe(
    'Khung «Sơ đồ hiện trạng» vẽ tay trên phiếu (anh Dũng 28/10/2026: sơ đồ phải hiện trong biên bản). Toạ độ theo tỷ lệ của ảnh trang ĐÃ CHE (0 = mép trái / trên, 1 = mép phải / dưới); trình duyệt cắt đúng vùng đó từ ảnh đã che và đề xuất lưu thành ảnh hiện trạng. Khung trống hoặc không thấy thì bỏ hẳn trường này.',
  );

export type AiSurveyPaperReadSketch = z.infer<typeof aiSurveyPaperReadSketchSchema>;

/** Gemini đọc ẢNH phiếu khảo sát giấy (viết tay) của Kinh doanh rồi trả NHÁP cho sáu ô báo cáo khảo sát và các ô «Thông tin hiện trường» riêng của pháp nhân (anh Dũng 28/10/2026). Ảnh gửi đi đã được trình duyệt TÔ TRẮNG khung thông tin khách (tên, điện thoại, địa chỉ, chữ ký) — bản PDF gốc vẫn ở kho, không gửi. Không phải artifact bất biến và không ghi gì vào biên bản: Worker loại khoá lạ, lược danh tính khách khỏi giá trị; người khảo sát chọn ô nào dùng, sửa rồi tự Lưu. Ô đọc không ra thì bỏ hẳn, không đoán. */
export const aiSurveyPaperReadSchema = z
  .object({
    fields: z.array(aiSurveyPaperReadFieldSchema).max(40),
    sketch: aiSurveyPaperReadSketchSchema.optional(),
  })
  .strict()
  .describe(
    'Gemini đọc ẢNH phiếu khảo sát giấy (viết tay) của Kinh doanh rồi trả NHÁP cho sáu ô báo cáo khảo sát và các ô «Thông tin hiện trường» riêng của pháp nhân (anh Dũng 28/10/2026). Ảnh gửi đi đã được trình duyệt TÔ TRẮNG khung thông tin khách (tên, điện thoại, địa chỉ, chữ ký) — bản PDF gốc vẫn ở kho, không gửi. Không phải artifact bất biến và không ghi gì vào biên bản: Worker loại khoá lạ, lược danh tính khách khỏi giá trị; người khảo sát chọn ô nào dùng, sửa rồi tự Lưu. Ô đọc không ra thì bỏ hẳn, không đoán.',
  );

export type AiSurveyPaperRead = z.infer<typeof aiSurveyPaperReadSchema>;
