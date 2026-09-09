/**
 * Khung tờ giấy: khung bản vẽ và dải tiêu đề.
 *
 * ⚠️ CỐ Ý KHÔNG phải khung tên của hồ sơ NVG (`kb/title_block.yaml`). Khung tên thật mang chủ
 * đầu tư, địa chỉ công trình, người ký — dữ liệu hạng 1. Tờ này sẽ được rasterise thành ảnh
 * tham chiếu và gửi cho nhà cung cấp mô hình ảnh ở bước phối cảnh, nên nó không được mang một
 * chữ nào nhận ra được khách hàng hay hồ sơ (T12, CLAUDE.md 5.1).
 *
 * Dải tiêu đề vì thế chỉ có bốn thứ: tên tầng, tỷ lệ, đơn vị, và câu cảnh báo bắt buộc.
 */

import { AI_DISCLAIMERS } from '@nvg/shared/design';
import type { Rect } from './geometry';
import { CLS, el, num, sheetCss, tag, textEl } from './svg';
import type { Orientation, SheetStyle } from './style';
import { paperSize, type DrawArea } from './units';

/** Khoảng cách từ mép ô tới chữ, mm giấy. */
const CELL_PADDING_MM = 2.5;

export interface TitleStripContent {
  /** Tên tầng, nguyên văn mô hình khai — được escape khi đặt lên tờ vẽ. */
  levelName: string;
  scale: number;
  /** Ghi chú thêm ở ô phải, tối đa hai dòng (ví dụ: tường do chương trình suy). */
  notes: string[];
}

/** Bọc toàn bộ nội dung vào một tài liệu SVG hoàn chỉnh, kèm nền giấy. */
export function svgDocument(style: SheetStyle, orientation: Orientation, body: string): string {
  const { width, height } = paperSize(style, orientation);
  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${num(width)} ${num(height)}`,
      width: `${num(width)}mm`,
      height: `${num(height)}mm`,
    },
    [
      el('style', {}, sheetCss(style)),
      tag('rect', { x: 0, y: 0, width, height, fill: style.colour.paper }),
      body,
    ],
  );
}

export function renderFrame(area: DrawArea): string {
  return tag('rect', {
    x: area.frame.x0,
    y: area.frame.y0,
    width: area.frame.x1 - area.frame.x0,
    height: area.frame.y1 - area.frame.y0,
    class: CLS.frame,
  });
}

export function renderTitleStrip(
  area: DrawArea,
  style: SheetStyle,
  content: TitleStripContent,
): string {
  const strip: Rect = area.strip;
  const divider = strip.x1 - style.title_strip.right_cell_w_mm;
  const rowY = (index: number): number =>
    strip.y0 + CELL_PADDING_MM + style.text_mm.level_name / 2 + index * style.text_mm.level_name;

  const rules = [
    tag('path', {
      class: CLS.titleRule,
      d: [
        `M ${num(strip.x0)} ${num(strip.y0)} L ${num(strip.x1)} ${num(strip.y0)}`,
        `M ${num(divider)} ${num(strip.y0)} L ${num(divider)} ${num(strip.y1)}`,
      ].join(' '),
    }),
  ];

  const left = [
    textEl(content.levelName, { x: strip.x0 + CELL_PADDING_MM, y: rowY(0), class: CLS.textLevel }),
    textEl(AI_DISCLAIMERS.aiSheet, {
      x: strip.x0 + CELL_PADDING_MM,
      y: rowY(1),
      class: CLS.textDisclaimer,
    }),
  ];

  const rightLines = [`Tỷ lệ 1:${content.scale}`, 'Kích thước ghi bằng mm', ...content.notes];
  const right = rightLines
    .slice(0, 3)
    .map((line, index) =>
      textEl(line, { x: divider + CELL_PADDING_MM, y: rowY(index), class: CLS.textNote }),
    );

  return [...rules, ...left, ...right].join('');
}
