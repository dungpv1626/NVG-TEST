/**
 * Điểm nạp DUY NHẤT của `kb/space_norms.yaml` vào bản dựng Worker cho nhánh AI — xem
 * `construction-data.ts` về lý do phải tách khỏi phần phân tích.
 */

import spaceNormsYaml from '../../../../kb/space_norms.yaml';
import { parseAreaNorms, type AreaNorm } from './space-norms';

let cached: Map<string, AreaNorm> | undefined;

/** Định mức diện tích theo loại phòng, phân tích một lần cho mỗi isolate. */
export function areaNorms(): Map<string, AreaNorm> {
  if (!cached) cached = parseAreaNorms(spaceNormsYaml as unknown as string);
  return cached;
}
