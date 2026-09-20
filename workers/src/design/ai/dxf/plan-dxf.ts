/**
 * Mặt bằng AI → một tệp DXF: mọi tầng xếp CẠNH NHAU trong modelspace, đơn vị mm, tỷ lệ trình bày 1:100.
 *
 * Xếp cạnh nhau chứ không mỗi tầng một tệp: hồ sơ NVG là một tệp mỗi bộ môn, 22–73 tờ nằm chung
 * modelspace (`doc/design/13-ho-so-thuc-te.md`). Người vẽ mở một tệp là thấy cả nhà.
 *
 * Mỗi tầng mang:
 *  · phần HÌNH của tờ mặt bằng (`renderPlanBody`) — tường, cửa, cửa sổ, thang, ô thông tầng, tên và diện
 *    tích phòng, chuỗi kích thước — đổi sang thực thể DXF;
 *  · đường bao TIM của từng phòng trên lớp ranh phòng, để phần mềm CAD đo diện tích bằng một cú bấm;
 *  · tên tầng và câu cảnh báo nhánh AI, do MÃ chèn và không tắt được (CLAUDE.md 8.7).
 *
 * Xuất MỘT CHIỀU (8.7): không có, và sẽ không có, đường nhập ngược tệp đã sửa tay.
 */

import type { AiFloorPlan, AiFloorPlanLevel } from '@nvg/shared/design';
import { AI_DISCLAIMERS } from '@nvg/shared/design';
import type { Pt } from '../draw/geometry';
import { DrawNotes, type DrawNote } from '../draw/notes';
import { levelBounds, renderPlanBody, type PlanSheetOptions } from '../draw/plan-sheet';
import { mmPerCm, type Paper } from '../draw/units';
import { svgToDxf } from './from-svg';
import { DXF_ROLES, type LayerExport } from './layers';
import { DxfDocument } from './writer';

/** Tỷ lệ trình bày của tệp: chữ và ký hiệu cỡ mm giấy của `kb/sheet_style.yaml` nhân lên chừng này. */
export const DXF_SCALE = 100;

/** Khoảng trống giữa hai tầng đặt cạnh nhau, mm thật. */
const LEVEL_GAP_MM = 6000;

/** Dòng tên tầng và câu cảnh báo đặt dưới hình, mm thật tính từ mép dưới hình bao. */
const CAPTION_DROP_MM = 2500;

export interface PlanDxfOptions extends PlanSheetOptions {
  layers: LayerExport;
}

export interface PlanDxfResult {
  dxf: string;
  notes: DrawNote[];
}

export function renderPlanDxf(plan: AiFloorPlan, options: PlanDxfOptions): PlanDxfResult {
  const doc = new DxfDocument();
  for (const role of DXF_ROLES)
    doc.addLayer({ name: options.layers[role].layer, color: options.layers[role].color });
  const layerOf = (role: (typeof DXF_ROLES)[number]) => options.layers[role].layer;
  const notes = new DrawNotes();
  const text = options.style.text_mm;

  let offsetX = 0;
  for (const level of [...plan.levels].sort((a, b) => a.level - b.level)) {
    const bbox = levelBounds(level);
    // Gốc tầng: góc TRƯỚC-TRÁI hình bao đặt ở (offsetX, 0) — mm thật.
    const origin: Pt = [offsetX - bbox.x0 * 10, -bbox.y0 * 10];
    const paper = modelPaper();
    svgToDxf(renderPlanBody(plan, level, paper, options, notes), {
      doc,
      scale: DXF_SCALE,
      offset: origin,
      style: options.style,
      layerOf,
    });
    roomBoundaries(level, origin, doc, layerOf('room_boundary'));

    const centreX = offsetX + ((bbox.x1 - bbox.x0) * 10) / 2;
    const bottom = -CAPTION_DROP_MM;
    const lines = [
      AI_DISCLAIMERS.aiSheet,
      ...(plan.generator.walls_derived ? [AI_DISCLAIMERS.wallsDerived] : []),
    ];
    doc.text(
      layerOf('annotation'),
      [centreX, bottom],
      text.sheet_title * DXF_SCALE,
      `Mặt bằng công năng — ${level.name}`,
    );
    lines.forEach((line, index) => {
      doc.text(
        layerOf('annotation'),
        [centreX, bottom - (text.sheet_title + (index + 1) * (text.disclaimer + 1.5)) * DXF_SCALE],
        text.disclaimer * DXF_SCALE,
        line,
      );
    });

    offsetX += (bbox.x1 - bbox.x0) * 10 + LEVEL_GAP_MM;
  }
  return { dxf: doc.toString(), notes: notes.list() };
}

/**
 * Bộ đổi toạ độ của tệp CAD: giấy 1:100 không căn lề — `x` giấy = cm × k, `y` giấy = −cm × k. Lật y ở
 * đây rồi lật lại ở `svgToDxf` là để các hàm vẽ nhận đúng quy ước y-xuống chúng vẫn dùng cho tờ SVG
 * (chiều quét cung cửa, chữ quay dọc).
 */
export function modelPaper(): Paper {
  const k = mmPerCm(DXF_SCALE);
  const x = (cmX: number) => cmX * k;
  const y = (cmY: number) => -cmY * k;
  return {
    scale: DXF_SCALE,
    k,
    x,
    y,
    p: (point) => [x(point[0]), y(point[1])],
    len: (cm) => cm * k,
    u: (unit) => [unit[0], -unit[1]],
  };
}

/** Chữ nhật TIM của từng phòng, khép kín — lớp ranh phòng. */
function roomBoundaries(
  level: AiFloorPlanLevel,
  origin: Pt,
  doc: DxfDocument,
  layer: string,
): void {
  for (const room of level.rooms) {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
    const at = (x: number, y: number): [number, number] => [x * 10 + origin[0], y * 10 + origin[1]];
    doc.polyline(layer, [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], true);
  }
}
