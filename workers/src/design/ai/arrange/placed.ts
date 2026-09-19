/**
 * Cây chia ĐÃ ĐẶT TOẠ ĐỘ — dạng làm việc của bộ giải trước khi đổ ra hợp đồng `ai-plan-tree` (T43).
 *
 * Bộ giải dựng cây từ trên xuống và cần biết kích thước thật của từng ô ngay lúc chọn cách chia (một
 * ô 2 × 9 m chia dọc hay chia ngang là hai bố cục khác nhau), nên mỗi nút mang luôn chữ nhật của nó.
 * Đổ ra hợp đồng thì chỉ còn `cut`, `at`, `a`, `b` — đúng thứ `ai/tree/` đọc.
 *
 * Mọi toạ độ là xăng-ti-mét NGUYÊN, theo TIM tường, làm tròn về mô-đun 5 cm khi chia.
 */

import type { AiPlanTree } from '@nvg/shared/design';
import type { Rect } from '../draw/geometry';

export type Axis = 'x' | 'y';
export type Side = 'x0' | 'x1' | 'y0' | 'y1';

export type Placed =
  | { kind: 'leaf'; id: string; rect: Rect }
  | { kind: 'cut'; axis: Axis; at: number; a: Placed; b: Placed; rect: Rect };

/** Mô-đun làm tròn vị trí vách — cùng mô-đun `tree/sizing.ts` dùng. */
export const MODULE_CM = 5;

export function leaf(id: string, rect: Rect): Placed {
  return { kind: 'leaf', id, rect };
}

export function extent(rect: Rect, axis: Axis): number {
  return axis === 'x' ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
}

/** Hai nửa của một chữ nhật cắt tại `at` theo trục. */
export function halves(rect: Rect, axis: Axis, at: number): [Rect, Rect] {
  return axis === 'x'
    ? [
        { ...rect, x1: at },
        { ...rect, x0: at },
      ]
    : [
        { ...rect, y1: at },
        { ...rect, y0: at },
      ];
}

/** Ghép một dãy con theo một trục thành chuỗi nút nhị phân: [p1 | [p2 | [p3 …]]]. */
export function chain(rect: Rect, axis: Axis, parts: readonly Placed[]): Placed {
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const at = axis === 'x' ? first.rect.x1 : first.rect.y1;
  const [, rest] = halves(rect, axis, at);
  return { kind: 'cut', axis, at, a: first, b: chain(rest, axis, parts.slice(1)), rect };
}

export function leaves(
  node: Placed,
  out: { id: string; rect: Rect }[] = [],
): { id: string; rect: Rect }[] {
  if (node.kind === 'leaf') out.push({ id: node.id, rect: node.rect });
  else {
    leaves(node.a, out);
    leaves(node.b, out);
  }
  return out;
}

/** Nút của hợp đồng cây, mã `n1…nK` theo thứ tự duyệt — tất định. */
export function emitNodes(root: Placed): AiPlanTree['nodes'] {
  const nodes: AiPlanTree['nodes'] = [];
  let counter = 0;
  const visit = (node: Placed): string => {
    if (node.kind === 'leaf') return node.id;
    counter += 1;
    const id = `n${counter}`;
    const entry = { id, cut: node.axis, at: Math.round(node.at), a: '', b: '' };
    nodes.push(entry);
    entry.a = visit(node.a);
    entry.b = visit(node.b);
    return id;
  };
  if (root.kind === 'cut') visit(root);
  return nodes;
}

/**
 * Chia một đoạn dài `total` thành các phần theo trọng số, mỗi phần không dưới `min`, phần `fixed` giữ
 * đúng độ dài. Ranh giới làm tròn về mô-đun 5 cm TÍNH TỪ `origin` tuyệt đối — vách rơi vào số chẵn
 * năm của toạ độ lô, như kiến trúc sư vẫn ghi. `null` khi tổng mức tối thiểu không vừa.
 */
export function splitLengths(
  origin: number,
  total: number,
  parts: readonly { weight: number; min: number; fixed?: number }[],
): number[] | null {
  const n = parts.length;
  if (n === 0) return [];
  const lengths = new Array<number>(n).fill(0);
  let remaining = total;
  const open = new Set<number>();
  parts.forEach((part, i) => {
    if (part.fixed !== undefined) {
      lengths[i] = part.fixed;
      remaining -= part.fixed;
    } else open.add(i);
  });
  if (remaining < [...open].reduce((sum, i) => sum + parts[i]!.min, 0) - 1e-6) return null;

  // Chia theo tỉ lệ, kẹp phần dưới mức tối thiểu rồi chia lại phần còn lại cho các phần chưa kẹp.
  for (;;) {
    const weight = [...open].reduce((sum, i) => sum + Math.max(parts[i]!.weight, 1e-6), 0);
    let clamped = false;
    for (const i of [...open]) {
      const share = (remaining * Math.max(parts[i]!.weight, 1e-6)) / weight;
      if (share < parts[i]!.min) {
        lengths[i] = parts[i]!.min;
        remaining -= parts[i]!.min;
        open.delete(i);
        clamped = true;
      }
    }
    if (!clamped) {
      for (const i of open) {
        lengths[i] = (remaining * Math.max(parts[i]!.weight, 1e-6)) / weight;
      }
      break;
    }
    if (open.size === 0) break;
  }

  // Ranh giới tuyệt đối, làm tròn mô-đun; phần cuối ăn phần dư.
  const bounds: number[] = [origin];
  let cursor = origin;
  for (let i = 0; i < n - 1; i += 1) {
    cursor += lengths[i]!;
    bounds.push(Math.round(cursor / MODULE_CM) * MODULE_CM);
  }
  bounds.push(origin + total);
  // Làm tròn có thể đẩy một phần xuống dưới mức tối thiểu: dời ranh giới về phía phần còn dư.
  for (let i = 0; i < n; i += 1) {
    const need = parts[i]!.fixed ?? parts[i]!.min;
    const length = bounds[i + 1]! - bounds[i]!;
    if (length >= need - 1e-6) continue;
    if (i < n - 1) bounds[i + 1] = bounds[i]! + Math.ceil(need / MODULE_CM) * MODULE_CM;
    else bounds[i] = bounds[i + 1]! - need;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const length = bounds[i + 1]! - bounds[i]!;
    const need =
      parts[i]!.fixed !== undefined ? Math.min(parts[i]!.fixed!, parts[i]!.min) : parts[i]!.min;
    if (length < need - 1e-6 || length <= 0) return null;
    out.push(length);
  }
  return out;
}

/** Các chữ nhật con khi chia `rect` theo trục bằng dãy độ dài. */
export function slices(rect: Rect, axis: Axis, lengths: readonly number[]): Rect[] {
  const out: Rect[] = [];
  let cursor = axis === 'x' ? rect.x0 : rect.y0;
  lengths.forEach((length, i) => {
    const end = i === lengths.length - 1 ? (axis === 'x' ? rect.x1 : rect.y1) : cursor + length;
    out.push(axis === 'x' ? { ...rect, x0: cursor, x1: end } : { ...rect, y0: cursor, y1: end });
    cursor = end;
  });
  return out;
}

/**
 * Ép một lá về đúng chữ nhật `target` bằng cách dời các nhát cắt tạo ra cạnh của nó — dùng để ô thang
 * và giếng trời tầng trên chồng khít tầng dưới (T38). Cạnh nào nằm trên hình bao thì target cũng phải
 * nằm đúng đó. Trả cây mới, hoặc `null` khi không dời được (cạnh hình bao lệch, nhát cắt ra ngoài ô
 * cha, ô nào đó hẹp dưới `minCell`).
 */
export function pinLeaf(root: Placed, id: string, target: Rect, minCell: number): Placed | null {
  // Đường từ gốc tới lá, và nhát cắt gần nhất sinh ra từng cạnh.
  const path: { node: Extract<Placed, { kind: 'cut' }>; side: 'a' | 'b' }[] = [];
  const find = (node: Placed): boolean => {
    if (node.kind === 'leaf') return node.id === id;
    path.push({ node, side: 'a' });
    if (find(node.a)) return true;
    path[path.length - 1]!.side = 'b';
    if (find(node.b)) return true;
    path.pop();
    return false;
  };
  if (!find(root)) return null;
  const moves = new Map<Placed, number>();
  const leafRect = leaves(root).find((l) => l.id === id)!.rect;
  for (const side of ['x0', 'x1', 'y0', 'y1'] as const) {
    if (leafRect[side] === target[side]) continue;
    const axis: Axis = side[0] as Axis;
    const wantSide = side.endsWith('1') ? 'a' : 'b';
    const owner = [...path]
      .reverse()
      .find((step) => step.node.axis === axis && step.side === wantSide);
    if (!owner) return null; // cạnh nằm trên hình bao
    moves.set(owner.node, target[side]);
  }
  if (moves.size === 0) return root;
  return rebuild(root, root.rect, moves, minCell);
}

/** Dựng lại chữ nhật mọi nút từ trên xuống, áp các `at` mới; `null` khi có ô hỏng. */
export function rebuild(
  node: Placed,
  rect: Rect,
  moves: ReadonlyMap<Placed, number>,
  minCell: number,
): Placed | null {
  if (node.kind === 'leaf') {
    if (rect.x1 - rect.x0 < minCell || rect.y1 - rect.y0 < minCell) return null;
    return { kind: 'leaf', id: node.id, rect };
  }
  const at = moves.get(node) ?? node.at;
  const lo = node.axis === 'x' ? rect.x0 : rect.y0;
  const hi = node.axis === 'x' ? rect.x1 : rect.y1;
  if (at - lo < minCell || hi - at < minCell) return null;
  const [ra, rb] = halves(rect, node.axis, at);
  const a = rebuild(node.a, ra, moves, minCell);
  const b = a ? rebuild(node.b, rb, moves, minCell) : null;
  return a && b ? { kind: 'cut', axis: node.axis, at, a, b, rect } : null;
}

export function touches(rect: Rect, outer: Rect, side: Side): boolean {
  return rect[side] === outer[side];
}

/** Độ dài đoạn chung của hai chữ nhật chạm cạnh nhau (theo tim tường); 0 khi không chạm. */
export function sharedEdge(a: Rect, b: Rect): number {
  if (a.x1 === b.x0 || b.x1 === a.x0) {
    return Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  }
  if (a.y1 === b.y0 || b.y1 === a.y0) {
    return Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  }
  return 0;
}
