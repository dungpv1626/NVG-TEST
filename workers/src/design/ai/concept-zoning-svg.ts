/**
 * Tờ «Sơ đồ công năng» — «Bộ ý tưởng cho khách» B2 (doc/design/KE_HOACH_BO_Y_TUONG_KHACH.md).
 *
 * Các tầng đặt cạnh nhau, mỗi tầng một cột: mặt đường ở DƯỚI, đi lên là đi vào trong lô. Khối màu theo nhóm công năng,
 * kèm tên phòng; cỡ khối theo tỉ lệ nhu cầu đã đo ở `concept-zoning.ts` nhưng KHÔNG in số nào — không kích thước, không
 * tường, không cửa. Khung nét đứt là khối xây được; tầng không vừa thì khối vượt ra ngoài khung và có dòng báo đỏ.
 *
 * Hàm THUẦN, chuỗi SVG tất định. Mọi chữ đi qua `textEl` (escape XML) như tờ vẽ của `ai/draw/` — tên phòng ở đây là của
 * chương trình, nhưng vẫn thoát ký tự; giao diện hiển thị qua `<img>`.
 */

import type { ConceptZoningTable } from '../kb/concept-zoning';
import type { ConceptZoning, ZoningFloor } from './concept-zoning';
import { el, tag, textEl } from './draw/svg';

export const ZONING_CAPTION = 'Sơ đồ công năng — phương án ý tưởng, chưa phải thiết kế';

const MARGIN = 24;
const GAP = 48;
const HEAD = 62;
const FOOT = 52;
const COLUMN_MAX = 240;
const HEIGHT_MAX = 620;
/** Bề ngang vẽ tối thiểu của một khối, px. */
const MIN_CELL = 48;

export function conceptZoningSvg(
  zoning: ConceptZoning,
  table: ConceptZoningTable,
  fontFamily: string,
): string {
  const c = table.colours;
  const fillOf = (types: readonly string[]) =>
    c.groups.find((g) => types.some((t) => g.types.includes(t)))?.fill ?? c.other;
  const widthCm = Math.max(1, zoning.widthM * 100);
  const deepest = Math.max(zoning.depthM * 100, ...zoning.floors.map((f) => f.needM * 100), 1);
  const scale = Math.min(COLUMN_MAX / widthCm, HEIGHT_MAX / deepest);
  const colW = widthCm * scale;
  const bodyH = deepest * scale;
  const n = Math.max(1, zoning.floors.length);
  const width = MARGIN * 2 + n * colW + (n - 1) * GAP;
  const height = MARGIN + HEAD + bodyH + FOOT + MARGIN;
  const base = MARGIN + HEAD + bodyH;
  const text = (
    content: string,
    x: number,
    y: number,
    attrs: Record<string, string | number> = {},
  ) =>
    textEl(content, {
      x,
      y,
      'font-family': fontFamily,
      'font-size': 13,
      fill: c.text,
      'text-anchor': 'middle',
      ...attrs,
    });

  const columns = zoning.floors.map((floor, i) => {
    const x0 = MARGIN + i * (colW + GAP);
    return floorColumn(floor, x0, base, colW, scale, zoning.depthM * 100, {
      fillOf,
      text,
      table,
    });
  });

  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: Math.ceil(width),
      height: Math.ceil(height),
      viewBox: `0 0 ${Math.ceil(width)} ${Math.ceil(height)}`,
      role: 'img',
      'aria-label': ZONING_CAPTION,
    },
    [
      el('defs', {}, [
        el(
          'pattern',
          {
            id: 'vuot-lo',
            width: 8,
            height: 8,
            patternUnits: 'userSpaceOnUse',
            patternTransform: 'rotate(45)',
          },
          tag('line', {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 8,
            stroke: c.over,
            'stroke-width': 2.5,
            'stroke-opacity': 0.55,
          }),
        ),
      ]),
      tag('rect', {
        x: 0,
        y: 0,
        width: Math.ceil(width),
        height: Math.ceil(height),
        fill: '#FFFFFF',
      }),
      ...columns,
      text(ZONING_CAPTION, width / 2, height - MARGIN + 4, {
        'font-size': 13,
        'font-style': 'italic',
      }),
    ],
  );
}

interface Painter {
  fillOf: (types: readonly string[]) => string;
  text: (content: string, x: number, y: number, attrs?: Record<string, string | number>) => string;
  table: ConceptZoningTable;
}

function floorColumn(
  floor: ZoningFloor,
  x0: number,
  base: number,
  colW: number,
  scale: number,
  haveCm: number,
  p: Painter,
): string {
  const c = p.table.colours;
  const parts: string[] = [];
  const top = base - haveCm * scale;
  const status =
    floor.verdict === 'over' ? 'Chưa vừa lô' : floor.verdict === 'tight' ? 'Khá chật' : null;
  parts.push(
    p.text(`Tầng ${floor.level}`, x0 + colW / 2, MARGIN + 16, {
      'font-weight': 700,
      'font-size': 15,
    }),
  );
  if (status) {
    parts.push(
      p.text(status, x0 + colW / 2, MARGIN + 34, {
        fill: floor.verdict === 'over' ? c.over : c.text,
        'font-size': 12,
        'font-weight': 600,
      }),
    );
  }
  if (floor.verdict === 'over') {
    parts.push(
      p.text('Phần gạch đỏ vượt khỏi lô', x0 + colW / 2, MARGIN + 50, {
        fill: c.over,
        'font-size': 11,
      }),
    );
  }
  let y = base;
  for (const row of floor.rows) {
    const h = row.depthCm * scale;
    // Lối đi giữ đúng bề rộng của nó; các phòng giãn ra lấp phần còn lại của bề ngang.
    const roomsW = colW - Math.min(row.passageCm * scale, colW / 2);
    const widths = cellWidths(
      row.cells.map((cell) => cell.widthCm),
      roomsW,
    );
    let x = x0;
    row.cells.forEach((cell, j) => {
      const w = widths[j]!;
      parts.push(
        tag('rect', {
          x,
          y: y - h,
          width: w,
          height: h,
          fill: p.fillOf(cell.types),
          stroke: c.stroke,
          'stroke-width': 1,
        }),
        label(cell.label, x, y - h, w, h, p),
      );
      x += w;
    });
    if (row.passageCm > 0) {
      parts.push(
        tag('rect', {
          x,
          y: y - h,
          width: x0 + colW - x,
          height: h,
          fill: c.passage,
          stroke: c.stroke,
          'stroke-width': 0.5,
          'stroke-dasharray': '3 3',
        }),
        label('Lối đi', x, y - h, x0 + colW - x, h, p, 10),
      );
    }
    y -= h;
  }
  // Khung khối xây được (nét đứt) — tầng không vừa thì các khối vượt lên trên khung.
  parts.push(
    tag('rect', {
      x: x0,
      y: top,
      width: colW,
      height: base - top,
      fill: 'none',
      stroke: c.text,
      'stroke-width': 1.5,
      'stroke-dasharray': '6 4',
    }),
  );
  if (floor.verdict === 'over') {
    // Phần vượt khối xây được: gạch chéo đỏ phủ lên các khối nằm ngoài khung.
    parts.push(
      tag('rect', {
        x: x0,
        y,
        width: colW,
        height: Math.max(0, top - y),
        fill: 'url(#vuot-lo)',
      }),
      tag('line', {
        x1: x0 - 6,
        y1: top,
        x2: x0 + colW + 6,
        y2: top,
        stroke: c.over,
        'stroke-width': 2,
      }),
    );
  }
  // Mặt đường dưới chân cột.
  parts.push(
    tag('line', {
      x1: x0 - 8,
      y1: base + 10,
      x2: x0 + colW + 8,
      y2: base + 10,
      stroke: c.stroke,
      'stroke-width': 3,
    }),
    p.text('Mặt đường', x0 + colW / 2, base + 28, { 'font-size': 12 }),
  );
  return el('g', {}, parts);
}

/** Bề ngang vẽ của từng khối: theo tỉ lệ nhu cầu, giãn lấp đầy hàng, khối nào cũng đủ chỗ cho một chữ ngắn. */
function cellWidths(need: readonly number[], room: number): number[] {
  const floor = Math.min(MIN_CELL, room / Math.max(1, need.length));
  const total = Math.max(
    1,
    need.reduce((s, w) => s + w, 0),
  );
  const raw = need.map((w) => (w / total) * room);
  const short = raw.reduce((s, w) => s + Math.max(0, floor - w), 0);
  const spare = raw.reduce((s, w) => s + Math.max(0, w - floor), 0);
  return raw.map((w) => (w < floor ? floor : w - (spare > 0 ? ((w - floor) / spare) * short : 0)));
}

/** Tên phòng giữa khối, ngắt dòng theo bề ngang; khối quá nhỏ thì thu chữ, vẫn không vừa thì chỉ dòng đầu. */
function label(
  content: string,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Painter,
  start = 12,
): string {
  for (const size of [start, start - 1, start - 2, 9]) {
    const perLine = Math.max(1, Math.floor((w - 6) / (size * 0.56)));
    const lines = wrap(content, perLine);
    const lineH = size * 1.2;
    if (lines.length * lineH <= h - 4 || size === 9) {
      const shown = lines.length * lineH <= h - 4 ? lines : lines.slice(0, 1);
      const y0 = y + h / 2 - ((shown.length - 1) * lineH) / 2 + size * 0.35;
      return shown
        .map((line, i) => p.text(line, x + w / 2, y0 + i * lineH, { 'font-size': size }))
        .join('');
    }
  }
  return '';
}

function wrap(content: string, perLine: number): string[] {
  const words = content.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= perLine || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
