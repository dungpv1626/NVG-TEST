/**
 * Bộ xuất DXF của nhánh AI — cửa vào cho endpoint. Bọc mỏng quanh `renderPlanDxf` để endpoint không tự
 * đi lấy quy ước trình bày, bảng nhãn phòng và bảng lớp CAD; phần thuần vẫn kiểm thử được bằng dữ liệu
 * tự dựng.
 */

import type { AiFloorPlan } from '@nvg/shared/design';
import { roomLabels } from '../../auth-scope';
import { sheetStyle } from '../draw/style-data';
import { layerExport } from './layers-data';
import { renderPlanDxf, type PlanDxfResult } from './plan-dxf';

export { renderPlanDxf, DXF_SCALE, type PlanDxfResult } from './plan-dxf';

export function planDxf(plan: AiFloorPlan): PlanDxfResult {
  return renderPlanDxf(plan, { style: sheetStyle(), labels: roomLabels(), layers: layerExport() });
}
