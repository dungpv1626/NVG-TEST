/**
 * Dựng chuỗi SVG — không DOM, không thư viện.
 *
 * Worker không có `document`, và một thư viện SVG phía máy chủ chỉ để nối chuỗi là thêm phụ
 * thuộc mà không thêm gì. Cả bộ vẽ là hàm thuần: cùng dữ liệu vào thì ra cùng chuỗi, nên
 * snapshot vàng mới có nghĩa.
 *
 * ⚠️ MỌI chữ đặt lên tờ vẽ đều đi qua `escapeXml`. Tên phòng và tên tầng do MÔ HÌNH sinh ra:
 * đó là nội dung không tin được (CLAUDE.md 8.2, ngoại lệ nhánh AI điểm 5). Tờ vẽ còn được
 * hiển thị qua `<img>` phía trình duyệt để kịch bản trong đó — nếu có — không chạy được.
 */

import type { SheetStyle } from './style';

export type AttrValue = string | number | null | undefined;
export type Attrs = Record<string, AttrValue>;

/**
 * Số đưa vào thuộc tính SVG: làm tròn 3 chữ số thập phân (dưới một phần nghìn mi-li-mét thì
 * máy in lẫn màn hình đều không phân biệt được), bỏ số 0 thừa và bỏ "-0".
 *
 * Làm tròn ở MỘT chỗ là điều kiện để snapshot vàng ổn định giữa hai máy: sai số dấu phẩy
 * động ở chữ số thứ mười lăm sẽ hiện nguyên vào chuỗi nếu không cắt.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function serialiseAttrs(attrs: Attrs): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    const text = typeof value === 'number' ? num(value) : value;
    parts.push(`${key}="${escapeXml(text)}"`);
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

/** Thẻ có nội dung. `children` đã là SVG — KHÔNG escape lần nữa. */
export function el(name: string, attrs: Attrs, children: string | string[] = ''): string {
  const inner = Array.isArray(children) ? children.join('') : children;
  return `<${name}${serialiseAttrs(attrs)}>${inner}</${name}>`;
}

/** Thẻ rỗng, tự đóng. */
export function tag(name: string, attrs: Attrs): string {
  return `<${name}${serialiseAttrs(attrs)}/>`;
}

/** Chữ. Nội dung ĐƯỢC escape ở đây — đây là cửa duy nhất chữ đi vào tờ vẽ. */
export function textEl(content: string, attrs: Attrs): string {
  return el('text', attrs, escapeXml(content));
}

export function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  return tag('line', { x1, y1, x2, y2, class: cls });
}

export function polylinePath(points: Array<[number, number]>, close: boolean): string {
  const start = points[0];
  if (!start) return '';
  const head = `M ${num(start[0])} ${num(start[1])}`;
  const rest = points
    .slice(1)
    .map(([x, y]) => `L ${num(x)} ${num(y)}`)
    .join(' ');
  return `${head} ${rest}${close ? ' Z' : ''}`.trim();
}

/**
 * Cung tròn từ `from` tới `to`, tâm `centre`, bán kính `r` — dùng cho cung quét cánh cửa.
 *
 * Chiều quét suy từ chính hình học ở TOẠ ĐỘ GIẤY, không nhận tham số: trục y của SVG hướng
 * xuống, nên "cùng chiều kim đồng hồ" trên màn hình là chiều góc TĂNG. Tự tính bằng tích có
 * hướng thì không phải nhớ quy ước đó ở từng chỗ gọi, và phép lật trục y của bộ đổi toạ độ
 * không thể làm cung quay ngược.
 */
export function arcPath(
  from: [number, number],
  to: [number, number],
  centre: [number, number],
  r: number,
): string {
  const ax = from[0] - centre[0];
  const ay = from[1] - centre[1];
  const bx = to[0] - centre[0];
  const by = to[1] - centre[1];
  const cross = ax * by - ay * bx;
  const sweep = cross > 0 ? 1 : 0;
  return `M ${num(from[0])} ${num(from[1])} A ${num(r)} ${num(r)} 0 0 ${sweep} ${num(to[0])} ${num(to[1])}`;
}

// ---------------------------------------------------------------------------
// Lớp CSS — tên ngắn, khai một lần ở đầu tệp
// ---------------------------------------------------------------------------

/**
 * Tên lớp CSS của tờ vẽ. Ngắn vì chúng lặp lại hàng trăm lần trong một tệp: một tờ nhà phố
 * có ~400 phần tử, và mỗi ký tự thừa nhân lên bấy nhiêu lần.
 *
 * CỐ Ý KHÔNG dùng quy ước lớp bản vẽ của `kb/layer_mapping.yaml`: lớp ở đó là lớp CAD của hồ
 * sơ NVG, dùng khi đọc và ghi tệp DXF. Tờ này không phải DXF và không đi vào hồ sơ phát hành.
 */
export const CLS = {
  frame: 'fr',
  titleRule: 'tr',
  wall: 'w',
  railing: 'rl',
  opening: 'op',
  doorLeaf: 'dl',
  window: 'wn',
  stair: 'st',
  stairArrow: 'sa',
  void: 'vd',
  dimLine: 'dm',
  dimTick: 'dt',
  north: 'nt',
  textRoom: 'tn',
  textArea: 'ta',
  textDim: 'td',
  textStair: 'tst',
  textLevel: 'tl',
  textDisclaimer: 'tw',
  textNote: 'ts',
  textNorth: 'tnn',
} as const;

/** Khối `<style>` của tờ vẽ, sinh từ `kb/sheet_style.yaml`. */
export function sheetCss(style: SheetStyle): string {
  const { line_mm: w, colour: c, text_mm: t } = style;
  const stroke = (cls: string, colour: string, width: number, extra = ''): string =>
    `.${cls}{stroke:${colour};stroke-width:${num(width)};fill:none;${extra}}`;
  const text = (cls: string, size: number, colour: string, extra = ''): string =>
    `.${cls}{font-size:${num(size)}px;fill:${colour};${extra}}`;

  return [
    // Quầng màu giấy vẽ TRƯỚC rồi mới tô ruột chữ (`paint-order`), nên tên phòng vẫn đọc được
    // khi nằm đè lên bậc thang hay lên ruột tường tô đặc — chỗ va chạm không tránh được vì
    // chữ phải nằm giữa phòng.
    `text{font-family:${style.font_family};text-anchor:middle;dominant-baseline:middle;` +
      `paint-order:stroke;stroke:${style.colour.paper};stroke-width:${num(style.text_halo_mm * 2)};` +
      `stroke-linejoin:round}`,
    stroke(CLS.frame, c.ink, w.frame),
    stroke(CLS.titleRule, c.ink, w.title_rule),
    `.${CLS.wall}{stroke:${c.ink};stroke-width:${num(w.wall_cut)};fill:${c.wall_fill}}`,
    stroke(CLS.railing, c.hairline, w.railing),
    stroke(CLS.opening, c.ink, w.opening),
    stroke(CLS.doorLeaf, c.hairline, w.door_leaf),
    stroke(CLS.window, c.hairline, w.window),
    stroke(CLS.stair, c.hairline, w.stair),
    stroke(CLS.stairArrow, c.hairline, w.stair_arrow),
    `.${CLS.void}{stroke:${c.hairline};stroke-width:${num(w.void)};fill:${c.void_fill}}`,
    stroke(CLS.north, c.ink, w.north),
    stroke(CLS.dimLine, c.dim, w.dim_line),
    stroke(CLS.dimTick, c.dim, w.dim_tick),
    text(CLS.textRoom, t.room_name, c.ink, 'font-weight:600;'),
    text(CLS.textArea, t.room_area, c.hairline),
    text(CLS.textDim, t.dim, c.dim),
    text(CLS.textStair, t.dim, c.hairline, 'font-weight:600;'),
    text(CLS.textLevel, t.level_name, c.ink, 'font-weight:700;text-anchor:start;'),
    text(CLS.textDisclaimer, t.disclaimer, c.ink, 'font-weight:600;text-anchor:start;'),
    text(CLS.textNote, t.strip_note, c.hairline, 'text-anchor:start;'),
    text(CLS.textNorth, t.north, c.ink, 'font-weight:700;'),
  ].join('');
}
