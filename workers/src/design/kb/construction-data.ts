/**
 * Điểm nạp DUY NHẤT của `kb/construction_norms.yaml` vào bản dựng Worker.
 *
 * Tách khỏi `construction.ts` để phần phân tích kiểm thử được bằng dữ liệu tự dựng: Vitest
 * không nạp được tệp `.yaml` qua `import`, nên mọi mô-đun đọc YAML phải chia đôi như vậy.
 */

import constructionYaml from '../../../../kb/construction_norms.yaml';
import { parseConstructionNorms, type ConstructionNorms } from './construction';

let cached: ConstructionNorms | undefined;

/** Quy ước cấu tạo dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function constructionNorms(): ConstructionNorms {
  if (!cached) cached = parseConstructionNorms(constructionYaml as unknown as string);
  return cached;
}
