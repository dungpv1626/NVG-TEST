/**
 * Điểm nạp DUY NHẤT của `kb/layer_mapping.yaml` vào bản dựng Worker — cùng khuôn với
 * `plan-quality-data.ts`: Vitest không nạp được `.yaml` qua `import`.
 */

import layerMappingYaml from '../../../../../kb/layer_mapping.yaml';
import { parseLayerExport, type LayerExport } from './layers';

let cached: LayerExport | undefined;

export function layerExport(): LayerExport {
  if (!cached) cached = parseLayerExport(layerMappingYaml as unknown as string);
  return cached;
}
