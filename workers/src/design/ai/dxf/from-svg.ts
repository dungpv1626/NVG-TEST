/**
 * Đổi phần HÌNH của tờ mặt bằng (chuỗi SVG do chính `ai/draw/` sinh) sang thực thể DXF.
 *
 * Vì sao đi qua SVG chứ không dựng lại hình: tường đã cắt lỗ và cắt nét chỗ giao nhau, ký hiệu cửa, bậc
 * thang, chỗ đặt chữ tránh cung cửa — tất cả đã tính một lần ở bộ vẽ. Dựng lại lần hai là có hai bản
 * thực thi lệch nhau, và tệp CAD sẽ khác tờ kiến trúc sư đã duyệt trên màn hình (CLAUDE.md 8.2 điểm 5).
 *
 * Đầu vào chỉ là chuỗi của `ai/draw/svg.ts` — năm thẻ (`path`, `rect`, `line`, `circle`, `text`), lệnh
 * đường `M`/`L`/`A`/`Z`, phép quay `rotate(a cx cy)`. Không phải bộ đọc SVG tổng quát, và không cần là:
 * thẻ lạ bị bỏ qua, không ném.
 *
 * Toạ độ: giấy SVG tính bằng mm, trục y hướng XUỐNG. Mô hình DXF tính bằng mm THẬT, trục y hướng LÊN:
 * `X = x × tỷ lệ + dx`, `Y = −y × tỷ lệ + dy`.
 */

import type { SheetStyle } from '../draw/style';
import { CLS } from '../draw/svg';
import type { DxfRole } from './layers';
import type { DxfDocument, DxfLinetype, DxfTextAlign } from './writer';

type Pt = [number, number];

export interface SvgToDxfOptions {
  doc: DxfDocument;
  /** mm thật trên mỗi mm giấy — bằng mẫu số tỷ lệ (100 cho 1:100). */
  scale: number;
  offset: Pt;
  style: SheetStyle;
  layerOf: (role: DxfRole) => string;
}

/** Lớp CSS của bộ vẽ → vai trò lớp CAD. Vắng = không xuất (ruột tường tô đặc, khung giấy). */
const ROLE_OF_CLASS: Record<string, DxfRole | null> = {
  [CLS.wall]: 'wall',
  [CLS.wallFill]: null,
  [CLS.railing]: 'wall',
  [CLS.softDivider]: 'soft_divider',
  [CLS.opening]: 'wall',
  [CLS.column]: 'wall',
  [CLS.doorLeaf]: 'door',
  [CLS.window]: 'window',
  [CLS.stair]: 'stair',
  [CLS.stairArrow]: 'stair',
  [CLS.stairAbove]: 'stair',
  [CLS.stairArrowAbove]: 'stair',
  [CLS.stairDot]: 'stair',
  [CLS.textStair]: 'stair',
  [CLS.textStairNumber]: 'stair',
  [CLS.void]: 'void',
  [CLS.dimLine]: 'dimension',
  [CLS.dimTick]: 'dimension',
  [CLS.textDim]: 'dimension',
  [CLS.labelBox]: 'room_label',
  [CLS.textRoom]: 'room_label',
  [CLS.textArea]: 'room_label',
  [CLS.north]: 'annotation',
  [CLS.textNorth]: 'annotation',
  // Tờ mặt đứng (T59): khối nhà và cốt đất là nét tường, mảng trang trí là lớp hatch, ký hiệu cao
  // độ và vạch sàn là ký hiệu.
  [CLS.ground]: 'wall',
  [CLS.elevationOutline]: 'wall',
  [CLS.element]: 'hatch',
  [CLS.frontFence]: 'wall',
  [CLS.floorLine]: 'annotation',
  [CLS.levelMark]: 'annotation',
  [CLS.textLevelMark]: 'annotation',
  // Chi tiết và chú thích mặt đứng (T147). Ô che màu giấy không xuất — nó chỉ để tờ SVG che nét.
  [CLS.detail]: 'detail',
  [CLS.glass]: 'window',
  [CLS.hatchLine]: 'hatch',
  [CLS.hatchDot]: 'hatch',
  [CLS.fillTone]: 'hatch',
  [CLS.mask]: null,
  [CLS.axis]: 'grid',
  [CLS.levelLine]: 'grid',
  [CLS.axisBubble]: 'grid',
  [CLS.textAxis]: 'grid',
  [CLS.leader]: 'annotation',
  [CLS.textNoteDraw]: 'annotation',
  [CLS.textNoteDrawEnd]: 'annotation',
};

/**
 * Lớp CSS khai nét đứt / chấm gạch TRONG `sheetCss` → linetype DXF. Trước T147 bộ đổi chỉ đọc
 * `stroke-dasharray` ghi ngay trên thẻ, nên mọi nét đứt khai bằng CSS (vạch sàn, hàng rào, ranh mềm,
 * bậc trên mặt cắt) ra tệp CAD thành nét liền.
 */
const LINETYPE_OF_CLASS: Record<string, DxfLinetype> = {
  [CLS.softDivider]: 'DASHED',
  [CLS.stairAbove]: 'DASHED',
  [CLS.stairArrowAbove]: 'DASHED',
  [CLS.floorLine]: 'DASHED',
  [CLS.frontFence]: 'DASHED',
  [CLS.roofLot]: 'DASHED',
  [CLS.axis]: 'CENTER',
  [CLS.levelLine]: 'CENTER',
};

/** Lớp chữ căn trái / phải trong CSS — DXF mặc định căn giữa. */
const ALIGN_OF_CLASS: Record<string, DxfTextAlign> = {
  [CLS.textNoteDraw]: 'left',
  [CLS.textNoteDrawEnd]: 'right',
  [CLS.textLevelMark]: 'left',
};

/** Cỡ chữ mặc định theo lớp CSS — cùng bảng `sheetCss` dùng. */
function textSize(style: SheetStyle, cls: string): number {
  const t = style.text_mm;
  switch (cls) {
    case CLS.textRoom:
      return t.room_name;
    case CLS.textArea:
      return t.room_area;
    case CLS.textNorth:
      return t.north;
    case CLS.textStairNumber:
      return t.stair_number;
    case CLS.textNoteDraw:
    case CLS.textNoteDrawEnd:
      return t.note;
    case CLS.textAxis:
      return t.axis_label;
    default:
      return t.dim;
  }
}

const ELEMENT = /<(path|rect|line|circle|text)\b([^>]*?)(?:\/>|>([^<]*)<\/text>)/g;
const ATTR = /([a-zA-Z-]+)="([^"]*)"/g;

export function svgToDxf(svg: string, options: SvgToDxfOptions): void {
  const { doc, scale, offset } = options;
  const model = (p: Pt): Pt => [p[0] * scale + offset[0], -p[1] * scale + offset[1]];

  for (const match of svg.matchAll(ELEMENT)) {
    const name = match[1]!;
    const attrs = attributes(match[2] ?? '');
    const role = ROLE_OF_CLASS[attrs.class ?? ''];
    if (role === null || role === undefined) continue;
    const layer = options.layerOf(role);
    const rotate = rotation(attrs.transform);
    const place = (p: Pt): Pt => model(rotate ? rotateAbout(p, rotate) : p);

    const cls = attrs.class ?? '';
    const linetype: DxfLinetype =
      LINETYPE_OF_CLASS[cls] ?? (attrs['stroke-dasharray'] !== undefined ? 'DASHED' : 'CONTINUOUS');

    switch (name) {
      case 'path':
        if (cls === CLS.fillTone) {
          solidFromPath(attrs.d ?? '', layer, place, doc);
          break;
        }
        pathToDxf(attrs.d ?? '', layer, place, scale, doc, linetype);
        break;
      case 'rect': {
        const x = num(attrs.x);
        const y = num(attrs.y);
        const w = num(attrs.width);
        const h = num(attrs.height);
        const corners: Pt[] = [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ];
        if (cls === CLS.fillTone) doc.solid(layer, corners.map(place));
        else doc.polyline(layer, corners.map(place), true, linetype);
        break;
      }
      case 'line':
        doc.line(
          layer,
          place([num(attrs.x1), num(attrs.y1)]),
          place([num(attrs.x2), num(attrs.y2)]),
          linetype,
        );
        break;
      case 'circle':
        doc.circle(layer, place([num(attrs.cx), num(attrs.cy)]), num(attrs.r) * scale);
        break;
      case 'text': {
        const inline = /font-size:\s*([\d.]+)px/.exec(attrs.style ?? '');
        const size = inline ? Number(inline[1]) : textSize(options.style, attrs.class ?? '');
        doc.text(
          layer,
          place([num(attrs.x), num(attrs.y)]),
          size * scale,
          unescapeXml(match[3] ?? ''),
          // `rotate(-90)` trên giấy y-xuống là quay NGƯỢC chiều kim đồng hồ khi nhìn — DXF đo góc
          // ngược chiều kim đồng hồ, nên đổi dấu.
          rotate ? -rotate.deg : 0,
          ALIGN_OF_CLASS[cls] ?? 'center',
        );
        break;
      }
    }
  }
}

interface Rotation {
  deg: number;
  cx: number;
  cy: number;
}

function rotation(transform: string | undefined): Rotation | null {
  const m = /rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)/.exec(transform ?? '');
  if (!m) return null;
  return { deg: Number(m[1]), cx: Number(m[2] ?? 0), cy: Number(m[3] ?? 0) };
}

/** Phép quay SVG quanh `(cx, cy)`, trong hệ giấy y-xuống. */
function rotateAbout(p: Pt, r: Rotation): Pt {
  const a = (r.deg * Math.PI) / 180;
  const dx = p[0] - r.cx;
  const dy = p[1] - r.cy;
  return [r.cx + dx * Math.cos(a) - dy * Math.sin(a), r.cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

/**
 * `M x y L x y … Z` thành các đoạn LINE; `A rx ry 0 0 sweep x y` thành ARC. Mỗi `M` mở một đường mới,
 * nên một thẻ `path` gộp trăm đoạn tường vẫn ra đúng trăm đoạn.
 */
function pathToDxf(
  d: string,
  layer: string,
  place: (p: Pt) => Pt,
  scale: number,
  doc: DxfDocument,
  linetype: DxfLinetype,
): void {
  const tokens = d.match(/[MLAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  let i = 0;
  let start: Pt | null = null;
  let current: Pt | null = null;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const command = tokens[i++]!.toUpperCase();
    if (command === 'M') {
      current = [next(), next()];
      start = current;
    } else if (command === 'L' && current) {
      const to: Pt = [next(), next()];
      doc.line(layer, place(current), place(to), linetype);
      current = to;
    } else if (command === 'A' && current) {
      const r = next();
      next(); // ry — cung tròn, bằng rx
      next(); // xoay trục
      next(); // cờ cung lớn — bộ vẽ chỉ sinh cung nhỏ
      const sweep = next();
      const to: Pt = [next(), next()];
      arcToDxf(current, to, r, sweep, layer, place, scale, doc);
      current = to;
    } else if (command === 'Z' && current && start) {
      doc.line(layer, place(current), place(start), linetype);
      current = start;
    } else {
      // Số lẻ không đi sau lệnh nào, hoặc lệnh không hỗ trợ — dừng đường này, không đoán.
      break;
    }
  }
}

/**
 * Mảng tô `M … L … Z` → các SOLID chia quạt từ đỉnh đầu. Đúng cho đa giác lồi — mọi mảng tô của bộ
 * vẽ mặt đứng là hình chữ nhật, hoặc đường mái tam giác / hình thang.
 */
function solidFromPath(d: string, layer: string, place: (p: Pt) => Pt, doc: DxfDocument): void {
  const numbers = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const points: Pt[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2)
    points.push(place([numbers[i]!, numbers[i + 1]!]));
  if (points.length === 4) {
    doc.solid(layer, points);
    return;
  }
  for (let i = 1; i + 1 < points.length; i += 1) {
    doc.solid(layer, [points[0]!, points[i]!, points[i + 1]!]);
  }
}

/**
 * Cung nhỏ bán kính `r` từ `from` tới `to` (toạ độ giấy). `sweep = 1` nghĩa là góc TĂNG trên giấy
 * y-xuống (`arcPath` suy nó từ tích có hướng); lật trục y đổi chiều, nên trong mô hình cung ấy đi
 * NGƯỢC chiều DXF — lấy `to` làm điểm đầu.
 */
function arcToDxf(
  from: Pt,
  to: Pt,
  r: number,
  sweep: number,
  layer: string,
  place: (p: Pt) => Pt,
  scale: number,
  doc: DxfDocument,
): void {
  const a = place(from);
  const b = place(to);
  const radius = r * scale;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const chord = Math.hypot(dx, dy);
  if (chord === 0) return;
  const h = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2));
  const ux = -dy / chord;
  const uy = dx / chord;
  // Trong mô hình (y-lên) cung đi từ `a` tới `b` NGƯỢC chiều kim đồng hồ khi `sweep = 0`. Cung nhỏ
  // ngược chiều kim đồng hồ từ a tới b có tâm nằm bên TRÁI dây cung a→b.
  const ccw = sweep === 0;
  const centre: Pt = ccw ? [mx + ux * h, my + uy * h] : [mx - ux * h, my - uy * h];
  const angle = (p: Pt) =>
    normaliseDeg((Math.atan2(p[1] - centre[1], p[0] - centre[0]) * 180) / Math.PI);
  const [startPt, endPt] = ccw ? [a, b] : [b, a];
  doc.arc(layer, centre, radius, angle(startPt), angle(endPt));
}

function normaliseDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(ATTR)) out[m[1]!] = unescapeXml(m[2]!);
  return out;
}

function num(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
