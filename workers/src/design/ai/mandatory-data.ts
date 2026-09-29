/**
 * Điểm nạp DUY NHẤT của `rules/nvg-mandatory.yaml` vào bản dựng Worker (T71).
 *
 * Cùng khuôn với `plan-quality-data.ts`: Vitest không nạp được tệp `.yaml` qua `import`, nên phần phân
 * tích (`mandatory.ts`) tách khỏi phần nạp tệp (tệp này, chỉ bản dựng Worker chạm tới).
 */

import mandatoryYaml from '../../../../rules/nvg-mandatory.yaml';
import { parseMandatoryRules, type MandatoryRules } from './mandatory';

let cached: MandatoryRules | undefined;

/** Luật bắt buộc dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function mandatoryRules(): MandatoryRules {
  if (!cached) cached = parseMandatoryRules(mandatoryYaml as unknown as string);
  return cached;
}
