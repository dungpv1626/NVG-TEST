/**
 * Bộ vẽ tất định của nhánh AI — cửa vào duy nhất cho phần còn lại của Worker.
 *
 * «AI thiết kế, chương trình cầm bút» (T15, 09/09/2026). Mô hình khai NỘI DUNG bản vẽ dưới
 * dạng dữ liệu; mọi nét trên giấy do mã nguồn ở đây đặt. Vì thế tờ vẽ tái lập được: cùng một
 * artifact thì cho cùng một chuỗi SVG, không phụ thuộc lượt gọi mô hình nào.
 *
 * ⚠️ Bộ vẽ này KHÔNG dùng lại một dòng nào của bộ giải nội bộ và không gọi Container — đó là
 * ràng buộc kiến trúc, không phải sở thích (CLAUDE.md 8.5b, hộp «Ranh giới độc lập»). Khi bộ
 * giải bị xoá, thư mục này vẫn chạy nguyên vẹn.
 */

import type { AiFloorPlan } from '@nvg/shared/design';
import { roomLabels } from '../../auth-scope';
import { renderPlanSheet, type PlanSheetResult } from './plan-sheet';
import { sheetStyle } from './style-data';

export {
  PlanSheetError,
  renderPlanSheet,
  type PlanSheetOptions,
  type PlanSheetResult,
} from './plan-sheet';
export type { DrawNote } from './notes';
export { chooseLayout, drawArea, type SheetLayout } from './units';
export { prepareWalls, type WallGeom } from './walls';
export { parseSheetStyle, type Orientation, type SheetStyle } from './style';
export { sheetStyle } from './style-data';

/**
 * Tờ mặt bằng dựng bằng quy ước trình bày và bảng nhãn phòng đang cấu hình.
 *
 * Bọc mỏng quanh `renderPlanSheet` để endpoint không phải tự đi lấy hai nguồn dữ liệu đó, còn
 * `renderPlanSheet` vẫn thuần và kiểm thử được bằng dữ liệu tự dựng.
 */
export function planSheet(plan: AiFloorPlan, level: number): PlanSheetResult {
  return renderPlanSheet(plan, level, { style: sheetStyle(), labels: roomLabels() });
}
