/**
 * Cửa vào của bước Mặt đứng (T59) cho phần còn lại của Worker — bọc mỏng quanh các hàm thuần để
 * endpoint không phải tự đi lấy quy ước trình bày, quy ước cấu tạo, danh mục và bảng lớp CAD.
 */

import type { AiFacadeConcept } from '@nvg/shared/design';
import { constructionNorms } from '../../kb/construction-data';
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

function options(concept: AiFacadeConcept): ElevationOptions {
  const vocab = facadeVocabulary();
  const leaves = (code: string | null | undefined) =>
    code ? (vocab.doorTypes[code]?.leaves ?? null) : null;
  return {
    style: sheetStyle(),
    railingHeightCm: Math.round(constructionNorms().outdoor.railing_h_m * 100),
    legend: facadeLegend(concept, vocab),
    openingStyles: {
      main: leaves(concept.openings_style?.main_door_type),
      side: leaves(concept.openings_style?.side_door_type),
      garage: concept.openings_style?.garage_door_type ?? null,
    },
  };
}

export function facadeSheet(concept: AiFacadeConcept): ElevationSheetResult {
  return renderElevationSheet(concept, options(concept));
}

/** Ảnh neo — không khung tên. Đứng cạnh `facadeSheet` vì hai thứ chỉ khác nhau ở điểm ấy. */
export function facadeAnchor(concept: AiFacadeConcept): ElevationAnchorResult {
  return renderElevationAnchor(concept, options(concept));
}

export function facadeDxf(concept: AiFacadeConcept): string {
  return renderFacadeDxf(concept, { ...options(concept), layers: layerExport() });
}
