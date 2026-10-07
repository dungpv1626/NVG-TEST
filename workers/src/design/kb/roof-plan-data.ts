/**
 * Điểm nạp DUY NHẤT của `kb/roof_plan.yaml` vào bản dựng Worker — xem `construction-data.ts`.
 */

import roofYaml from '../../../../kb/roof_plan.yaml';
import { parseRoofPlan, type RoofPlanSpec } from './roof-plan';

let cached: RoofPlanSpec | undefined;

export function roofPlanSpec(): RoofPlanSpec {
  if (!cached) cached = parseRoofPlan(roofYaml as unknown as string);
  return cached;
}
