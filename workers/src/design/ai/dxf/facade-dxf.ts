/**
 * Mặt đứng mặt tiền → một tệp DXF, đơn vị mm thật, tỷ lệ trình bày 1:100 (T59).
 *
 * Cùng cách với `plan-dxf.ts`: phần HÌNH lấy nguyên `renderElevationBody` rồi đổi qua `svgToDxf`, nên
 * tệp CAD mang đúng nét kiến trúc sư đã duyệt trên màn hình. Gốc toạ độ: `x` như mặt bằng, `y` của
 * CAD là cao độ — ±0.000 nằm ở Y = 0.
 *
 * Xuất MỘT CHIỀU (CLAUDE.md 8.6).
 */

import type { AiFacadeConcept } from '@nvg/shared/design';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import {
  ELEVATION_TITLE,
  renderElevationBody,
  type ElevationOptions,
} from '../draw/elevation-sheet';
import { svgToDxf } from './from-svg';
import { DXF_ROLES, type LayerExport } from './layers';
import { DXF_SCALE, modelPaper } from './plan-dxf';
import { DxfDocument } from './writer';

/** Dòng tên và cảnh báo đặt dưới cốt đất, mm thật. */
const CAPTION_DROP_MM = 2500;

export interface FacadeDxfOptions extends ElevationOptions {
  layers: LayerExport;
}

export function renderFacadeDxf(concept: AiFacadeConcept, options: FacadeDxfOptions): string {
  const doc = new DxfDocument();
  for (const role of DXF_ROLES) {
    doc.addLayer({ name: options.layers[role].layer, color: options.layers[role].color });
  }
  const layerOf = (role: (typeof DXF_ROLES)[number]) => options.layers[role].layer;
  const text = options.style.text_mm;

  svgToDxf(renderElevationBody(concept, modelPaper(), options), {
    doc,
    scale: DXF_SCALE,
    offset: [0, 0],
    style: options.style,
    layerOf,
  });

  const e = concept.elevation;
  const xs = e.levels.flatMap((l) => [l.x0, l.x1]);
  const centreX = ((Math.min(...xs) + Math.max(...xs)) / 2) * 10;
  const bottom = e.ground_z * 10 - CAPTION_DROP_MM;
  doc.text(layerOf('annotation'), [centreX, bottom], text.sheet_title * DXF_SCALE, ELEVATION_TITLE);
  [
    AI_DISCLAIMERS.aiSheet,
    ...(options.legend ?? []).map((entry) => `${entry.label}: ${entry.value}`),
  ].forEach((line, index) => {
    doc.text(
      layerOf('annotation'),
      [centreX, bottom - (text.sheet_title + (index + 1) * (text.disclaimer + 1.5)) * DXF_SCALE],
      text.disclaimer * DXF_SCALE,
      line,
    );
  });
  return doc.toString();
}
