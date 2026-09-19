/**
 * Hình bao của một tầng = hợp các ô ĐÃ XÂY của cây chia (T37).
 *
 * Ô `unbuilt_N` là phần footprint không xây — cách mô hình chừa sân bên, làm nhà chữ L. Ô `void_N`
 * vẫn tính là xây: lỗ thông tầng nằm trong khối nhà.
 *
 * Phép dựng trên LƯỚI của mọi toạ độ cắt: mỗi ô lưới hoặc xây hoặc không, cạnh biên là cạnh ô lưới
 * có đúng một phía xây. Cạnh biên đi theo một chiều quay thống nhất, nên nối lại thành vòng là đi
 * theo điểm cuối; vòng quay NGƯỢC chiều vòng ngoài là lỗ. Không có phép boolean đa giác nào.
 */

import { polygonArea, type Pt, type Rect } from '../draw/geometry';
import type { PlanIssue } from '../plan-check';
import type { Cell } from './cells';
import { treeIssue } from './issues';

/** Trần số đỉnh — cùng `maxItems` của `outline` trong hợp đồng artifact. */
export const OUTLINE_MAX_POINTS = 24;

export interface OutlineResult {
  points: Pt[] | null;
  issues: PlanIssue[];
}

export function outlineOf(cells: readonly Cell[], level: number): OutlineResult {
  const built = cells.filter((cell) => cell.kind !== 'unbuilt').map((cell) => cell.rect);
  const where = `tầng ${level}`;
  if (built.length === 0) {
    return {
      points: null,
      issues: [treeIssue('outline_disconnected', `Cây ${where} không có ô nào được xây.`, {})],
    };
  }

  const xs = uniqueSorted(cells.flatMap((cell) => [cell.rect.x0, cell.rect.x1]));
  const ys = uniqueSorted(cells.flatMap((cell) => [cell.rect.y0, cell.rect.y1]));
  const isBuilt = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= ys.length - 1) return false;
    const cx = (xs[i]! + xs[i + 1]!) / 2;
    const cy = (ys[j]! + ys[j + 1]!) / 2;
    return built.some((r) => inside(r, cx, cy));
  };

  // Cạnh biên có hướng: vòng quanh một ô lưới đơn lẻ đi (x1,y0) → (x0,y0) → (x0,y1) → (x1,y1).
  const edges: [Pt, Pt][] = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      if (!isBuilt(i, j)) continue;
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const y0 = ys[j]!;
      const y1 = ys[j + 1]!;
      if (!isBuilt(i, j - 1))
        edges.push([
          [x1, y0],
          [x0, y0],
        ]);
      if (!isBuilt(i - 1, j))
        edges.push([
          [x0, y0],
          [x0, y1],
        ]);
      if (!isBuilt(i, j + 1))
        edges.push([
          [x0, y1],
          [x1, y1],
        ]);
      if (!isBuilt(i + 1, j))
        edges.push([
          [x1, y1],
          [x1, y0],
        ]);
    }
  }

  const outgoing = new Map<string, [Pt, Pt][]>();
  for (const edge of edges) {
    const key = keyOf(edge[0]);
    outgoing.set(key, [...(outgoing.get(key) ?? []), edge]);
  }
  // Hai vòng chạm nhau tại một điểm: điểm ấy có hai cạnh đi ra, và khối nhà thật ra là hai khối.
  if ([...outgoing.values()].some((list) => list.length > 1)) {
    return {
      points: null,
      issues: [
        treeIssue(
          'outline_disconnected',
          `Phần xây ${where} tách thành nhiều khối chỉ chạm nhau ở góc — khối nhà phải liền.`,
          {},
        ),
      ],
    };
  }

  const loops: Pt[][] = [];
  const used = new Set<[Pt, Pt]>();
  for (const start of edges) {
    if (used.has(start)) continue;
    const loop: Pt[] = [];
    let current: [Pt, Pt] | undefined = start;
    while (current && !used.has(current)) {
      used.add(current);
      loop.push(current[0]);
      current = outgoing.get(keyOf(current[1]))?.[0];
    }
    loops.push(simplify(loop));
  }

  if (loops.length > 1) {
    // Vòng ngoài quay CÙNG chiều một ô đơn lẻ; lỗ quay ngược.
    const sign = Math.sign(
      polygonArea([
        [1, 0],
        [0, 0],
        [0, 1],
        [1, 1],
      ]),
    );
    const hole = loops.some((loop) => Math.sign(polygonArea(loop)) !== sign);
    return {
      points: null,
      issues: [
        hole
          ? treeIssue(
              'outline_has_hole',
              `Phần không xây ${where} bị khối nhà bao kín — dùng giếng trời (phòng light_well) hoặc void_N thay cho unbuilt_N ở giữa nhà.`,
              {},
            )
          : treeIssue(
              'outline_disconnected',
              `Phần xây ${where} tách thành ${loops.length} khối rời — khối nhà phải liền.`,
              { count: loops.length },
            ),
      ],
    };
  }

  const points = loops[0]!;
  if (points.length > OUTLINE_MAX_POINTS) {
    return {
      points: null,
      issues: [
        treeIssue(
          'outline_too_complex',
          `Hình bao ${where} có ${points.length} góc, quá ${OUTLINE_MAX_POINTS} — gộp bớt các ô unbuilt.`,
          { count: points.length, max: OUTLINE_MAX_POINTS },
        ),
      ],
    };
  }
  return { points, issues: [] };
}

function inside(r: Rect, x: number, y: number): boolean {
  return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function keyOf(p: Pt): string {
  return `${p[0]},${p[1]}`;
}

/** Bỏ đỉnh nằm giữa hai cạnh thẳng hàng — lưới sinh ra rất nhiều đỉnh như vậy. */
function simplify(loop: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < loop.length; i += 1) {
    const prev = loop[(i - 1 + loop.length) % loop.length]!;
    const cur = loop[i]!;
    const next = loop[(i + 1) % loop.length]!;
    const collinear =
      (prev[0] === cur[0] && cur[0] === next[0]) || (prev[1] === cur[1] && cur[1] === next[1]);
    if (!collinear) out.push(cur);
  }
  return out;
}
