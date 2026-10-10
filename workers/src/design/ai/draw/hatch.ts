/**
 * Ký hiệu vật liệu trên mặt đứng — NÉT THẬT, không dùng `<pattern>` của SVG (T147).
 *
 * Vì sao nét thật: tờ SVG, ảnh neo và tệp DXF cùng đi qua `renderElevationBody`, và bộ đổi DXF chỉ
 * đọc `path`/`rect`/`line`/`circle`/`text`. Một `<pattern>` sẽ hiện trên màn hình mà biến mất trong
 * tệp CAD — hai bản vẽ của cùng một ngôi nhà lệch nhau, đúng thứ CLAUDE.md 8.2 điểm 5 cấm.
 *
 * Mọi bước tính bằng mm GIẤY (`kb/facade_detail.yaml` mục `hatch`): mẫu ký hiệu của CAD dày đều ở
 * mọi tỷ lệ, nên ở đây cũng thế. Hình tính trong hệ giấy rồi cắt theo đa giác bằng phép quét ngang,
 * nên mái tam giác, mái hình thang và đường mái `mixed` lõm vẫn cắt đúng.
 */

import type { FacadeDetail, HatchKind } from '../../kb/facade-detail';
import type { Pt } from './geometry';
import { CLS, num, tag } from './svg';
import type { Paper } from './units';

type P = [number, number];

/** Đoạn trên một đường quét ngang `y` nằm TRONG đa giác — quy tắc chẵn lẻ. */
function scan(poly: readonly P[], y: number): Array<[number, number]> {
  const xs: number[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    // Nửa mở [min, max) để đỉnh nằm đúng trên đường quét không bị đếm hai lần.
    if (a[1] <= y !== b[1] <= y) {
      xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
  }
  xs.sort((p, q) => p - q);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

function inside(poly: readonly P[], x: number, y: number): boolean {
  return scan(poly, y).some(([a, b]) => x > a && x < b);
}

function bounds(poly: readonly P[]): { x0: number; y0: number; x1: number; y1: number } {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const seg = (a: P, b: P): string => `M ${num(a[0])} ${num(a[1])} L ${num(b[0])} ${num(b[1])}`;

/** Các đường ngang cách đều `pitch`, đặt lệch nửa bước khỏi mép trên để không trùng nét viền. */
function rows(y0: number, y1: number, pitch: number): number[] {
  const out: number[] = [];
  for (let y = y0 + pitch / 2; y < y1 - 1e-6; y += pitch) out.push(y);
  return out;
}

/** Mạch so le: đường ngang mỗi lớp, mạch đứng lệch nửa viên giữa hai lớp kề nhau. */
function coursed(poly: P[], course: number, joint: number): string[] {
  const b = bounds(poly);
  const out: string[] = [];
  const levels: number[] = [];
  for (let y = b.y0 + course; y < b.y1 - 1e-6; y += course) levels.push(y);
  for (const y of levels) for (const [a, c] of scan(poly, y)) out.push(seg([a, y], [c, y]));
  // Mạch đứng giữa hai đường ngang liền nhau (kể cả mép trên / dưới của hình).
  const edges = [b.y0, ...levels, b.y1];
  for (let i = 0; i + 1 < edges.length; i += 1) {
    const top = edges[i]!;
    const bottom = edges[i + 1]!;
    const mid = (top + bottom) / 2;
    const shift = i % 2 === 0 ? 0 : joint / 2;
    for (let x = b.x0 + shift + joint / 2; x < b.x1; x += joint) {
      if (inside(poly, x, top + 1e-3) && inside(poly, x, bottom - 1e-3) && inside(poly, x, mid)) {
        out.push(seg([x, top], [x, bottom]));
      }
    }
  }
  return out;
}

/** Vân gỗ: đường ngang dày, mỗi đường đứt một khe ngắn ở vị trí lệch theo thứ tự. */
function wood(poly: P[], pitch: number, brk: number): string[] {
  const b = bounds(poly);
  const out: string[] = [];
  const gap = pitch * 0.8;
  rows(b.y0, b.y1, pitch).forEach((y, index) => {
    // Pha lệch kiểu «số vàng» — tất định, không lặp thành cột thẳng.
    const phase = (((index * 0.618) % 1) + 1) % 1;
    for (const [a, c] of scan(poly, y)) {
      let x = a;
      let next = a + phase * brk;
      while (x < c) {
        const end = Math.min(c, next);
        if (end - x > 1e-3) out.push(seg([x, y], [end, y]));
        x = end + gap;
        next = x + brk;
      }
    }
  });
  return out;
}

/** Ngói / tôn: đường ngang dày và vạch đứng ngắn so le — đọc ra lớp ngói lợp. */
function tile(poly: P[], pitch: number): string[] {
  const b = bounds(poly);
  const out: string[] = [];
  rows(b.y0, b.y1, pitch).forEach((y, index) => {
    for (const [a, c] of scan(poly, y)) {
      out.push(seg([a, y], [c, y]));
      const shift = index % 2 === 0 ? 0 : pitch;
      for (let x = a + pitch + shift; x < c - pitch / 2; x += pitch * 2) {
        if (inside(poly, x, y + pitch * 0.5)) out.push(seg([x, y], [x, y + pitch * 0.5]));
      }
    }
  });
  return out;
}

function dots(poly: P[], pitch: number, r: number): string[] {
  const b = bounds(poly);
  const out: string[] = [];
  rows(b.y0, b.y1, pitch).forEach((y, index) => {
    const shift = index % 2 === 0 ? 0 : pitch / 2;
    for (let x = b.x0 + pitch / 2 + shift; x < b.x1; x += pitch) {
      if (inside(poly, x, y)) out.push(tag('circle', { cx: x, cy: y, r, class: CLS.hatchDot }));
    }
  });
  return out;
}

/** Đổi đa giác cm thật sang mm giấy. */
export function toPaper(poly: readonly Pt[], paper: Paper): P[] {
  return poly.map((p) => paper.p(p));
}

/**
 * Ký hiệu một vật liệu trong đa giác `poly` (cm thật). `paint` và `glass` không vẽ ở đây: sơn là mảng
 * tô (`toneFill`), kính là nét xiên trên từng ô (`glassStrokes`).
 */
export function hatchSvg(
  poly: readonly Pt[],
  kind: HatchKind,
  paper: Paper,
  detail: FacadeDetail,
): string {
  if (poly.length < 3) return '';
  const p = toPaper(poly, paper);
  const h = detail.hatch;
  let parts: string[];
  switch (kind) {
    case 'stone':
      parts = coursed(p, h.stone.course, h.stone.joint);
      break;
    case 'brick':
      parts = coursed(p, h.brick.course, h.brick.joint);
      break;
    case 'wood':
      parts = wood(p, h.wood.pitch, h.wood.break);
      break;
    case 'tile':
      parts = tile(p, h.tile.pitch);
      break;
    case 'dots':
      return dots(p, h.dots.pitch, h.dots.r).join('');
    default:
      return '';
  }
  return parts.length ? tag('path', { class: CLS.hatchLine, d: parts.join(' ') }) : '';
}

/**
 * Mảng tô đặc của một lớp sơn. Độ xám suy từ độ sáng của mã màu, kẹp trong `tone_range` để nét vẽ
 * phía trên vẫn đọc được — tờ vẫn là bản vẽ đen trắng, chỉ đậm nhạt khác nhau (M5 tô xám 252).
 */
export function toneFill(poly: readonly Pt[], grey: string, paper: Paper): string {
  if (poly.length < 3) return '';
  const p = toPaper(poly, paper);
  const d = `M ${p.map(([x, y]) => `${num(x)} ${num(y)}`).join(' L ')} Z`;
  return tag('path', { class: CLS.fillTone, d, fill: grey });
}

/** Độ sáng tương đối của mã `#RRGGBB`, 0 đen — 1 trắng. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return 1;
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((v) => parseInt(v, 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * Màu xám để tô một lớp sơn màu `hex`, hoặc `null` khi màu đủ sáng để để trắng như giấy.
 */
export function paintGrey(hex: string, detail: FacadeDetail): string | null {
  const l = luminance(hex);
  if (l >= detail.paintSolidBelow) return null;
  const [lo, hi] = detail.toneRange;
  const t = lo + (hi - lo) * Math.max(0, Math.min(1, l / detail.paintSolidBelow));
  const v = Math.round(t * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${v}${v}${v}`;
}

/**
 * Nét xiên phản chiếu trên một ô kính chữ nhật (cm thật): `pairs` cặp nét 45°, mỗi cặp hai nét song
 * song cách nhau `gap` mm giấy, đặt ở phần trên–trái ô như ký hiệu kính của hồ sơ. Ô nhỏ hơn
 * `min_pane_mm` trên giấy thì bỏ — nét xiên trong ô bé chỉ thành một vệt.
 */
export function glassStrokes(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  paper: Paper,
  detail: FacadeDetail,
): string {
  const g = detail.hatch.glass;
  const [ax, ay] = paper.p([Math.min(x0, x1), Math.max(z0, z1)]);
  const w = paper.len(Math.abs(x1 - x0));
  const h = paper.len(Math.abs(z1 - z0));
  if (w < g.minPane || h < g.minPane) return '';
  const out: string[] = [];
  // Đường x + y = c trên giấy (y xuống) là nét xiên từ dưới–trái lên trên–phải.
  const span = w + h;
  for (let i = 0; i < g.pairs; i += 1) {
    const base = span * ((i + 1) / (g.pairs + 1)) * 0.6;
    for (const c of [base, base + g.gap * Math.SQRT2]) {
      const pts = clipDiagonal(w, h, c);
      if (pts) out.push(seg([ax + pts[0][0], ay + pts[0][1]], [ax + pts[1][0], ay + pts[1][1]]));
    }
  }
  return out.length ? tag('path', { class: CLS.glass, d: out.join(' ') }) : '';
}

/** Đoạn của đường `x + y = c` nằm trong hình chữ nhật [0, w] × [0, h], thu ngắn hai đầu một phần năm. */
function clipDiagonal(w: number, h: number, c: number): [P, P] | null {
  const xa = Math.max(0, c - h);
  const xb = Math.min(w, c);
  if (xb - xa <= 1e-6) return null;
  const trim = (xb - xa) * 0.2;
  const a = xa + trim;
  const b = xb - trim;
  return [
    [a, c - a],
    [b, c - b],
  ];
}
