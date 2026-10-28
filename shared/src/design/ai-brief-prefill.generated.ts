/**
 * SINH TỰ ĐỘNG TỪ `contracts/ai-brief-prefill.schema.json` — KHÔNG SỬA TAY.
 *
 * Sửa hợp đồng dữ liệu ở tệp JSON Schema rồi chạy `npm run contracts:gen`.
 * `npm run contracts:check` sẽ báo lỗi nếu tệp này lệch với schema nguồn.
 */

import { z } from 'zod';

export const aiBriefPrefillSuggestionSchema = z
  .object({
    /** Đường dẫn câu hỏi trong `BRIEF_FORM`, ví dụ `site.width_m`, `household.religion`. */
    path: z
      .string()
      .min(1)
      .max(120)
      .describe(
        'Đường dẫn câu hỏi trong `BRIEF_FORM`, ví dụ `site.width_m`, `household.religion`.',
      ),
    /** Ô số: con số theo đơn vị của câu (dấu chấm thập phân). Ô chọn: đúng MÃ lựa chọn. Ô chọn nhiều: các mã cách nhau bởi dấu phẩy. Ô có / không: `true` hoặc `false`. Ô chữ: nguyên văn. */
    value: z
      .string()
      .max(2000)
      .describe(
        'Ô số: con số theo đơn vị của câu (dấu chấm thập phân). Ô chọn: đúng MÃ lựa chọn. Ô chọn nhiều: các mã cách nhau bởi dấu phẩy. Ô có / không: `true` hoặc `false`. Ô chữ: nguyên văn.',
      ),
    /** Câu gốc trong tài liệu khảo sát làm căn cứ cho giá trị — chép nguyên văn, ngắn. */
    quote: z
      .string()
      .max(500)
      .describe('Câu gốc trong tài liệu khảo sát làm căn cứ cho giá trị — chép nguyên văn, ngắn.'),
  })
  .strict();

export type AiBriefPrefillSuggestion = z.infer<typeof aiBriefPrefillSuggestionSchema>;

/** Gemini đọc khảo sát thiết kế (số đo, ghi chú, lời chủ nhà đã chép chữ) và báo cáo khảo sát CRM đã duyệt rồi ĐỀ XUẤT câu trả lời cho các câu của đầu bài (anh Dũng 27/10/2026). Không phải artifact bất biến và không ghi thẳng vào đầu bài: Worker kiểm từng giá trị theo `BRIEF_FORM` (đúng mã lựa chọn, đúng khoảng số), loại giá trị sai; kiến trúc sư chọn câu nào dùng rồi mới gộp vào bản nháp. `value` luôn là CHUỖI để một lược đồ phủ mọi kiểu ô — Worker đổi kiểu theo ô. Mỗi đề xuất kèm câu gốc làm căn cứ: không có căn cứ trong lời đã nói thì không đề xuất ("chưa hỏi" khác "trả lời không", T65). */
export const aiBriefPrefillSchema = z
  .object({
    suggestions: z.array(aiBriefPrefillSuggestionSchema).max(120),
  })
  .strict()
  .describe(
    'Gemini đọc khảo sát thiết kế (số đo, ghi chú, lời chủ nhà đã chép chữ) và báo cáo khảo sát CRM đã duyệt rồi ĐỀ XUẤT câu trả lời cho các câu của đầu bài (anh Dũng 27/10/2026). Không phải artifact bất biến và không ghi thẳng vào đầu bài: Worker kiểm từng giá trị theo `BRIEF_FORM` (đúng mã lựa chọn, đúng khoảng số), loại giá trị sai; kiến trúc sư chọn câu nào dùng rồi mới gộp vào bản nháp. `value` luôn là CHUỖI để một lược đồ phủ mọi kiểu ô — Worker đổi kiểu theo ô. Mỗi đề xuất kèm câu gốc làm căn cứ: không có căn cứ trong lời đã nói thì không đề xuất ("chưa hỏi" khác "trả lời không", T65).',
  );

export type AiBriefPrefill = z.infer<typeof aiBriefPrefillSchema>;
