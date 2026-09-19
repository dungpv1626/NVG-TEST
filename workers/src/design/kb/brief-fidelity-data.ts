/**
 * Điểm nạp DUY NHẤT của `kb/brief_fidelity.yaml` vào bản dựng Worker — xem `construction-data.ts`.
 */

import fidelityYaml from '../../../../kb/brief_fidelity.yaml';
import { parseBriefFidelity, type BriefFidelity } from './brief-fidelity';

let cached: BriefFidelity | undefined;

export function briefFidelity(): BriefFidelity {
  if (!cached) cached = parseBriefFidelity(fidelityYaml as unknown as string);
  return cached;
}
