/**
 * Điểm nạp DUY NHẤT của `kb/sheet_style.yaml` vào bản dựng Worker.
 *
 * Tách khỏi `style.ts` để phần phân tích kiểm thử được: Vitest không nạp được tệp `.yaml` qua
 * `import`, nên mọi mô-đun đọc YAML phải chia đôi như vậy (xem `kb/construction-data.ts`).
 */

import sheetStyleYaml from '../../../../../kb/sheet_style.yaml';
import { parseSheetStyle, type SheetStyle } from './style';

let cached: SheetStyle | undefined;

/** Quy ước trình bày dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function sheetStyle(): SheetStyle {
  if (!cached) cached = parseSheetStyle(sheetStyleYaml as unknown as string);
  return cached;
}
