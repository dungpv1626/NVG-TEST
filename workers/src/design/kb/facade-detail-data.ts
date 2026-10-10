/**
 * Điểm nạp DUY NHẤT của `kb/facade_detail.yaml` vào bản dựng Worker — xem `construction-data.ts`.
 */

import detailYaml from '../../../../kb/facade_detail.yaml';
import { parseFacadeDetail, type FacadeDetail } from './facade-detail';

let cached: FacadeDetail | undefined;

export function facadeDetail(): FacadeDetail {
  if (!cached) cached = parseFacadeDetail(detailYaml as unknown as string);
  return cached;
}
