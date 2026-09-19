/**
 * Ký hiệu quy ước: mũi tên chỉ bắc.
 *
 * Hướng bắc lấy từ `north_deg` — góc của hướng bắc so với trục +y của bản vẽ, tính theo chiều
 * kim đồng hồ. Con số ấy do WORKER điền từ hướng nhà trong đầu bài, mô hình không biết hướng
 * và không được hỏi (hợp đồng `ai-floor-plan`). Nhờ vậy mũi tên trên tờ vẽ luôn khớp với dữ
 * liệu khảo sát chứ không khớp với phỏng đoán của mô hình.
 */

import type { Pt } from './geometry';
import { CLS, polylinePath, tag, textEl } from './svg';
import type { SheetStyle } from './style';
import type { Paper } from './units';

/** Chữ chỉ hướng bắc trên bản vẽ Việt Nam. */
const NORTH_LETTER = 'B';

export function renderNorthArrow(
  northDeg: number,
  centre: [number, number],
  paper: Paper,
  style: SheetStyle,
): string {
  const radians = (northDeg * Math.PI) / 180;
  // Hướng bắc trong hệ THẬT rồi mới đổi sang giấy: `paper.u` lo phần lật trục y, nên công thức
  // ở đây đọc đúng như định nghĩa trong hợp đồng và không phải nhớ tờ giấy quay kiểu gì.
  const northOnPaper: Pt = paper.u([Math.sin(radians), Math.cos(radians)]);
  const r = style.symbol.north_r_mm;
  const [cx, cy] = centre;
  const tip: [number, number] = [cx + northOnPaper[0] * r, cy + northOnPaper[1] * r];
  const tail: [number, number] = [cx - northOnPaper[0] * r, cy - northOnPaper[1] * r];
  const wing = (sign: number): [number, number] => [
    tip[0] - r * 0.45 * (northOnPaper[0] * 0.87 - sign * northOnPaper[1] * 0.5),
    tip[1] - r * 0.45 * (northOnPaper[1] * 0.87 + sign * northOnPaper[0] * 0.5),
  ];

  return [
    tag('circle', { cx, cy, r, class: CLS.north }),
    tag('path', {
      class: CLS.north,
      d: [polylinePath([tail, tip], false), polylinePath([wing(1), tip, wing(-1)], false)].join(
        ' ',
      ),
    }),
    textEl(NORTH_LETTER, {
      x: cx + northOnPaper[0] * (r + style.text_mm.north),
      y: cy + northOnPaper[1] * (r + style.text_mm.north),
      class: CLS.textNorth,
    }),
  ].join('');
}
