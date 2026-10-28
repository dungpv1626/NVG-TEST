/**
 * Phép toán thuần của bảng vẽ thửa đa giác (`site-polygon-editor.tsx`) — tách ra để có phép thử.
 *
 * Hệ toạ độ đúng quy ước hợp đồng: gốc ở góc trước-trái, x dọc mặt tiền, y đi vào chiều sâu, đường nằm ở
 * y = 0; cạnh nối đỉnh 1 với đỉnh 2 là cạnh giáp đường. Diện tích và dựng hình từ cạnh dùng lại
 * `polygonArea` / `polygonFromEdges` của `@nvg/shared/design` — không viết lại hình học ở đây.
 */

import type { Point } from '@nvg/shared/design';

/** Bước bắt lưới khi kéo đỉnh, mét. */
export const SNAP_M = 0.1;

export function snap(value: number, step = SNAP_M): number {
  // Làm tròn hai lần: 0,1 × 3 = 0,30000000000000004 không được lọt vào đầu bài.
  return Math.round(Math.round(value / step) * step * 1000) / 1000;
}

/** Chiều dài từng cạnh; cạnh i nối đỉnh i với đỉnh i + 1 (cạnh cuối khép về đỉnh đầu). */
export function edgeLengths(points: readonly Point[]): number[] {
  return points.map((p, i) => {
    const q = points[(i + 1) % points.length]!;
    return Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) * 1000) / 1000;
  });
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Hình tự cắt (hai cạnh không kề nhau cắt nhau) — kéo nhầm một đỉnh qua cạnh đối diện. */
export function selfIntersects(points: readonly Point[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Hai cạnh kề nhau chung một đỉnh — không tính.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!))
        return true;
    }
  }
  return false;
}

/** Chèn một đỉnh vào giữa cạnh `edge` (bắt lưới). */
export function insertMidpoint(points: readonly Point[], edge: number): Point[] {
  const a = points[edge]!;
  const b = points[(edge + 1) % points.length]!;
  const mid: Point = [snap((a[0] + b[0]) / 2), snap((a[1] + b[1]) / 2)];
  return [...points.slice(0, edge + 1), mid, ...points.slice(edge + 1)];
}

/**
 * Giữ Shift khi kéo: hướng từ đỉnh trước tới đỉnh đang kéo bắt về bội số 45°, giữ nguyên khoảng cách.
 * Không có đỉnh trước (đa giác rỗng) thì trả nguyên điểm.
 */
export function snapAngle(from: Point | undefined, to: Point): Point {
  if (!from) return to;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return to;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return [snap(from[0] + length * Math.cos(angle)), snap(from[1] + length * Math.sin(angle))];
}

/**
 * Góc TRONG tại mỗi đỉnh, độ (90 = vuông). Đa giác lưu CCW nên góc trong = 180 − góc quay trái.
 * Dùng để dựng sẵn bảng «Nhập theo chiều dài cạnh» từ hình đang có.
 */
export function interiorAngles(points: readonly Point[]): number[] {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const inHeading = Math.atan2(p[1] - prev[1], p[0] - prev[0]);
    const outHeading = Math.atan2(next[1] - p[1], next[0] - p[0]);
    let turn = ((outHeading - inHeading) * 180) / Math.PI;
    while (turn <= -180) turn += 360;
    while (turn > 180) turn -= 360;
    return Math.round((180 - turn) * 10) / 10;
  });
}
