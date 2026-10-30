/**
 * Điểm nạp DUY NHẤT của `kb/concept_zoning.yaml` vào bản dựng Worker — xem `construction-data.ts`.
 */

import zoningYaml from '../../../../kb/concept_zoning.yaml';
import { parseConceptZoning, type ConceptZoningTable } from './concept-zoning';

let cached: ConceptZoningTable | undefined;

export function conceptZoningTable(): ConceptZoningTable {
  if (!cached) cached = parseConceptZoning(zoningYaml as unknown as string);
  return cached;
}
