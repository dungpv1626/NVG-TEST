/**
 * Cửa vào của bước Mặt đứng (T59) cho phần còn lại của Worker — bọc mỏng quanh các hàm thuần để
 * endpoint không phải tự đi lấy quy ước trình bày, quy ước cấu tạo, danh mục và bảng lớp CAD.
 */

import type { AiFacadeConcept, AiFloorPlan } from '@nvg/shared/design';
import { constructionNorms } from '../../kb/construction-data';
import { facadeDetail } from '../../kb/facade-detail-data';
import { facadeVocabulary } from '../../kb/facade-vocabulary-data';
import {
  renderElevationAnchor,
  renderElevationSheet,
  type ElevationAnchorResult,
  type ElevationOptions,
  type ElevationSheetResult,
} from '../draw/elevation-sheet';
import { sheetStyle } from '../draw/style-data';
import { renderFacadeDxf } from '../dxf/facade-dxf';
import { layerExport } from '../dxf/layers-data';
import { facadeLegend } from './describe';

/**
 * Chiều cao lan can dùng để VẼ và để CHẤM: phiếu yêu cầu của kỹ sư thắng, rồi tới quy ước cấu tạo.
 *
 * Một hàm cho cả bốn chỗ đọc (tờ SVG, DXF, ảnh neo, thước chấm) — bốn bản sao của phép ưu tiên này
 * là bốn cơ hội để tờ vẽ và điểm nói hai con số khác nhau về cùng một cái lan can.
 */
export function railingCmOf(concept: AiFacadeConcept): number {
  return (
    concept.elevation.railing_h_cm ?? Math.round(constructionNorms().outdoor.railing_h_m * 100)
  );
}

/**
 * `plan` là mặt bằng mà ý tưởng dựng trên (`concept.plan_ref`) — nguồn lưới trục và bậc tam cấp
 * (T147). Vắng thì tờ vẫn vẽ, chỉ không có trục và bậc.
 */
function options(concept: AiFacadeConcept, plan?: AiFloorPlan | null): ElevationOptions {
  const vocab = facadeVocabulary();
  const leaves = (code: string | null | undefined) =>
    code ? (vocab.doorTypes[code]?.leaves ?? null) : null;
  return {
    style: sheetStyle(),
    detail: facadeDetail(),
    vocab,
    plan: plan ?? null,
    railingHeightCm: railingCmOf(concept),
    legend: facadeLegend(concept, vocab),
    openingStyles: {
      main: leaves(concept.openings_style?.main_door_type),
      side: leaves(concept.openings_style?.side_door_type),
      garage: concept.openings_style?.garage_door_type ?? null,
    },
  };
}

export function facadeSheet(
  concept: AiFacadeConcept,
  plan?: AiFloorPlan | null,
): ElevationSheetResult {
  return renderElevationSheet(concept, options(concept, plan));
}

/** Ảnh neo — không khung tên. Đứng cạnh `facadeSheet` vì hai thứ chỉ khác nhau ở điểm ấy. */
export function facadeAnchor(
  concept: AiFacadeConcept,
  plan?: AiFloorPlan | null,
): ElevationAnchorResult {
  return renderElevationAnchor(concept, options(concept, plan));
}

export function facadeDxf(concept: AiFacadeConcept, plan?: AiFloorPlan | null): string {
  return renderFacadeDxf(concept, { ...options(concept, plan), layers: layerExport() });
}
