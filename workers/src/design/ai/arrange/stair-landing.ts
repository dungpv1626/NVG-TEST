/**
 * Sảnh đầu thang — giữ nguyên bố cục và hướng thang, chỉ dời vách (T158, Haan 11/10/2026: «ở bản vẽ chính thức có thể
 * giữ lại hướng thang, chỉ cần điều chỉnh vách và không gian hành lang ở điểm lên xuống thang»).
 *
 * Trước đó cổng BÁC cây có lối vào thang ở cạnh dài, và bộ xếp đi tìm một cây khác hẳn: lượt e1c432f4 quay thang,
 * xáo cả bếp lẫn phòng ăn. Mặt bằng mô hình vẽ vốn ổn, chỉ có kho nằm ngay đầu bậc 1.
 *
 * Cách làm: dãy ô cùng cột với ô thang theo trục dọc thang (lượt ấy: gara | kho | thang) là một chuỗi nhát cắt cùng
 * trục trong cây. Chèn dải sảnh sâu `depth` giữa ô thang và phòng đang chắn đầu ấy, rồi chia lại các vách của những
 * phòng liền nhau phía ấy: phòng chắn nhường dải, hụt mức tối thiểu thì phòng kế tiếp nhường bù (kho hụt 8 m² đầu bài
 * khai → vách kho | gara lùi vào gara 7,4 m). Ô thang và mọi khối không phải một phòng đơn giữ nguyên chỗ.
 *
 * Thuần: chỉ đổi cây đã đặt toạ độ. Chương trình, lá, cửa do nơi gọi dựng.
 */

import type { Rect } from '../draw/geometry';
import { chain, type Axis, type Placed, type Side } from './placed';

export interface LandingCarve {
  placed: Placed;
  /** Phòng đứng sát đầu thang đã nhường dải. */
  from: string;
  /** Mọi phòng bị dời vách, gồm cả `from`. */
  moved: string[];
  hall: Rect;
}

/**
 * Khoét dải sảnh ở cạnh `side` của ô thang `stair`.
 *
 * `mayGive(id)`: phòng được dời vách. `minLength(id, across)`: chiều dài tối thiểu theo trục dọc thang (cm, theo tim)
 * phòng ấy phải còn khi bề ngang của nó là `across`. `null` khi bên kia đầu thang không phải một phòng đơn phủ trọn
 * bề ngang dãy, hay khi cả dãy phòng liền nhau không đủ chỗ.
 */
export function carveStairLanding(
  root: Placed,
  stair: string,
  side: Side,
  depth: number,
  mayGive: (id: string) => boolean,
  minLength: (id: string, across: number) => number,
  hallId: string,
): LandingCarve | null {
  const axis: Axis = side === 'y0' || side === 'y1' ? 'y' : 'x';
  const low = side === 'x0' || side === 'y0';
  const lo = (r: Rect) => (axis === 'x' ? r.x0 : r.y0);
  const hi = (r: Rect) => (axis === 'x' ? r.x1 : r.y1);

  // Đường từ gốc tới lá thang.
  const path: Placed[] = [];
  const find = (node: Placed): boolean => {
    path.push(node);
    if (node.kind === 'leaf') {
      if (node.id === stair) return true;
    } else if (find(node.a) || find(node.b)) return true;
    path.pop();
    return false;
  };
  if (!find(root)) return null;
  const stairRect = path[path.length - 1]!.rect;

  // Leo lên: khối chứa ô thang phải chạm đúng cạnh ấy; nhát cắt cùng trục đầu tiên mở ra dãy.
  let part: Placed = path[path.length - 1]!;
  let top: Placed | null = null;
  for (let i = path.length - 2; i >= 0; i -= 1) {
    const node = path[i]!;
    if (node.kind !== 'cut') break;
    if (node.axis === axis) {
      top = node;
      continue;
    }
    if (top) break;
    const edge = low ? lo(node.rect) === lo(stairRect) : hi(node.rect) === hi(stairRect);
    if (!edge) return null;
    part = node;
  }
  if (!top) return null;
  const chainRoot = top;

  const flat = (node: Placed): Placed[] =>
    node.kind === 'cut' && node.axis === axis ? [...flat(node.a), ...flat(node.b)] : [node];
  const parts = flat(chainRoot);
  const k = parts.indexOf(part);
  if (k < 0) return null;
  const step = low ? -1 : 1;
  const run: number[] = [];
  for (let i = k + step; i >= 0 && i < parts.length; i += step) {
    const p = parts[i]!;
    if (p.kind !== 'leaf' || !mayGive(p.id)) break;
    run.push(i);
  }
  if (run.length === 0) return null;

  const across =
    axis === 'x' ? chainRoot.rect.y1 - chainRoot.rect.y0 : chainRoot.rect.x1 - chainRoot.rect.x0;
  const length = (p: Placed) => hi(p.rect) - lo(p.rect);
  const idOf = (i: number) => (parts[i] as { id: string }).id;
  const ids = run.map(idOf);
  const next = run.map((i) => length(parts[i]!));
  const mins = ids.map((id) => minLength(id, across));
  next[0] = next[0]! - depth;
  let deficit = Math.max(0, mins[0]! - next[0]!);
  next[0] = next[0]! + deficit;
  for (let j = 1; j < next.length && deficit > 0; j += 1) {
    const take = Math.min(deficit, Math.max(0, next[j]! - mins[j]!));
    next[j] = next[j]! - take;
    deficit -= take;
  }
  if (deficit > 0) return null;

  // Dựng lại đoạn [phòng xa nhất … phòng sát thang, sảnh]; khối ngoài đoạn giữ nguyên toạ độ.
  const runStart = Math.min(...run.map((i) => lo(parts[i]!.rect)));
  const runEnd = Math.max(...run.map((i) => hi(parts[i]!.rect)));
  const span = (a: number, b: number): Rect =>
    axis === 'x' ? { ...chainRoot.rect, x0: a, x1: b } : { ...chainRoot.rect, y0: a, y1: b };
  const rebuilt = new Map<number, Placed>();
  const moved: string[] = [];
  // Từ đầu xa của đoạn đi về phía thang; sảnh là phần còn lại sát thang.
  let at = low ? runStart : runEnd;
  for (let j = run.length - 1; j >= 0; j -= 1) {
    const rect = low ? span(at, at + next[j]!) : span(at - next[j]!, at);
    const old = parts[run[j]!]!.rect;
    rebuilt.set(run[j]!, { kind: 'leaf', id: ids[j]!, rect });
    if (lo(rect) !== lo(old) || hi(rect) !== hi(old)) moved.unshift(ids[j]!);
    at = low ? at + next[j]! : at - next[j]!;
  }
  const hall = low ? span(at, runEnd) : span(runStart, at);
  const hallLeaf: Placed = { kind: 'leaf', id: hallId, rect: hall };
  const ordered: Placed[] = [];
  parts.forEach((p, i) => {
    if (low && i === k) ordered.push(hallLeaf);
    ordered.push(rebuilt.get(i) ?? p);
    if (!low && i === k) ordered.push(hallLeaf);
  });
  const sub = chain(chainRoot.rect, axis, ordered);
  const swap = (node: Placed): Placed =>
    node === chainRoot
      ? sub
      : node.kind === 'leaf'
        ? node
        : { ...node, a: swap(node.a), b: swap(node.b) };
  return { placed: swap(root), from: ids[0]!, moved, hall };
}
