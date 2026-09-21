/**
 * Điểm nạp DUY NHẤT của `kb/facade_quality.yaml` vào bản dựng Worker — xem `kb/construction-data.ts`.
 */

import facadeQualityYaml from '../../../../../kb/facade_quality.yaml';
import { parseFacadeQuality, type FacadeQuality } from './quality';

let cached: FacadeQuality | undefined;

/** Thước chấm dùng lại giữa các request trong cùng isolate — phân tích YAML một lần. */
export function facadeQuality(): FacadeQuality {
  if (!cached) cached = parseFacadeQuality(facadeQualityYaml as unknown as string);
  return cached;
}
