/**
 * Điểm nạp DUY NHẤT của `kb/program_plausibility.yaml` vào bản dựng Worker.
 *
 * Cùng khuôn với `norms-data.ts`: Worker không có hệ tệp lúc chạy nên tệp dữ liệu phải nhúng
 * vào bản dựng dưới dạng văn bản. Tách khỏi `plausibility.ts` để phần phân tích kiểm thử
 * được bằng dữ liệu tự dựng.
 */

import rulesYaml from '../../../../kb/program_plausibility.yaml';
import { parsePlausibilityRules, type PlausibilityRules } from './plausibility';

let cached: PlausibilityRules | undefined;

export function plausibilityRules(): PlausibilityRules {
  if (!cached) cached = parsePlausibilityRules(rulesYaml as unknown as string);
  return cached;
}
