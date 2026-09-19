/**
 * Điểm nạp DUY NHẤT của `kb/plan_quality.yaml` vào bản dựng Worker.
 *
 * Cùng khuôn với `kb/construction-data.ts`: Vitest không nạp được tệp `.yaml` qua `import`, nên mọi
 * mô-đun đọc YAML phải chia đôi — phần phân tích (`plan-quality.ts`, kiểm thử được bằng dữ liệu tự
 * dựng) và phần nạp tệp (tệp này, chỉ bản dựng Worker chạm tới).
 */

import planQualityYaml from '../../../../kb/plan_quality.yaml';
import { parsePlanQuality, type PlanQuality } from './plan-quality';

let cached: PlanQuality | undefined;

/** Thước chấm dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function planQuality(): PlanQuality {
  if (!cached) cached = parsePlanQuality(planQualityYaml as unknown as string);
  return cached;
}
