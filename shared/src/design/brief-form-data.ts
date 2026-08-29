/**
 * Điểm nạp DUY NHẤT của `brief-form.json`.
 *
 * Tách khỏi `brief-form.ts` để phần logic (xét điều kiện, chấm điểm) kiểm thử được bằng cấu
 * hình tự dựng, không phải lúc nào cũng kéo theo cấu hình thật.
 *
 * Validate NGAY lúc nhập mô-đun: cấu hình sai thì hỏng lúc khởi động ứng dụng, không hỏng
 * giữa lúc người dùng đang điền dở một biểu mẫu ba mươi trường.
 */

import raw from './brief-form.json';
import { briefFormConfigSchema, type BriefFormConfig } from './brief-form';

export const BRIEF_FORM: BriefFormConfig = briefFormConfigSchema.parse(raw);
