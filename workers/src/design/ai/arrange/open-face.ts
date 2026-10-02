/**
 * Đổi chỗ phòng cần mặt thoáng với phòng không cần khi phòng không cần đang chạm NHIỀU mặt thoáng hơn (T103, Haan chấm lượt b1543b8c: giặt phơi nằm trong, phòng kỹ
 * thuật chiếm mép sau thoáng — «đổi chỗ cũng cực kì đơn giản»).
 *
 * Chỉ đổi hai LÁ kề nhau trong một chuỗi cắt cùng trục: chúng cùng bề ngang, nên đổi thứ tự là mỗi phòng giữ nguyên kích
 * thước, vách ngoài của cụm không đổi. Loại phòng là dữ liệu (`passage.open_face_first`, `passage.windowless_ok`
 * trong `kb/room_vocabulary.yaml`). Hàm THUẦN.
 */

import type { Rect } from '../draw/geometry';
import { chain, leaf, type Axis, type Placed, type Side } from './placed';

export interface OpenFaceSwapInput {
  /** Loại phòng của một lá. */
  typesOf: (id: string) => readonly string[];
  openFaceFirst: ReadonlySet<string>;
  windowlessOk: ReadonlySet<string>;
  openSides: ReadonlySet<Side>;
  footprint: Rect;
}

export function swapTowardOpenFace(
  placed: Placed,
  input: OpenFaceSwapInput,
): { placed: Placed; swapped: [string, string][] } {
  const swapped: [string, string][] = [];
  const is = (id: string, set: ReadonlySet<string>) =>
    input.typesOf(id).some((type) => set.has(type));
  /** Số mặt thoáng của hình bao mà ô chạm tới — góc cuối nhà chạm hai. */
  const open = (r: Rect) =>
    [...input.openSides].filter((side) => r[side] === input.footprint[side]).length;
  /** Các con liên tiếp của một chuỗi cắt CÙNG trục — cây lồng [p1 | [p2 | p3]] hay [[p1 | p2] | p3] như nhau. */
  const flat = (node: Placed, axis: Axis): Placed[] =>
    node.kind === 'cut' && node.axis === axis
      ? [...flat(node.a, axis), ...flat(node.b, axis)]
      : [node];

  const walk = (node: Placed): Placed => {
    if (node.kind === 'leaf') return node;
    const parts = flat(node, node.axis).map(walk);
    let changed = parts.some((part, i) => part !== flat(node, node.axis)[i]);
    for (let i = 0; i + 1 < parts.length; i += 1) {
      const p = parts[i]!;
      const q = parts[i + 1]!;
      if (p.kind !== 'leaf' || q.kind !== 'leaf') continue;
      const needyFirst = is(p.id, input.openFaceFirst) && is(q.id, input.windowlessOk);
      const needySecond = is(q.id, input.openFaceFirst) && is(p.id, input.windowlessOk);
      if (!needyFirst && !needySecond) continue;
      const needy = needyFirst ? p : q;
      const other = needyFirst ? q : p;
      if (open(other.rect) <= open(needy.rect)) continue;
      // Đổi thứ tự trong đoạn [p0, q1]: mỗi lá giữ chiều dài của nó.
      const x = node.axis === 'x';
      const from = x ? p.rect.x0 : p.rect.y0;
      const qLen = x ? q.rect.x1 - q.rect.x0 : q.rect.y1 - q.rect.y0;
      const to = x ? q.rect.x1 : q.rect.y1;
      const at = from + qLen;
      const first: Rect = x ? { ...p.rect, x0: from, x1: at } : { ...p.rect, y0: from, y1: at };
      const second: Rect = x ? { ...q.rect, x0: at, x1: to } : { ...q.rect, y0: at, y1: to };
      if (open(needyFirst ? second : first) <= open(needy.rect)) continue;
      parts[i] = leaf(q.id, first);
      parts[i + 1] = leaf(p.id, second);
      swapped.push([needy.id, other.id]);
      changed = true;
      i += 1;
    }
    return changed ? chain(node.rect, node.axis, parts) : node;
  };
  return { placed: walk(placed), swapped };
}
