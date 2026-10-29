/**
 * Khung hai hàng (T179, `ai/arrange/skeleton-rows.ts`) — hệ toạ độ chuẩn.
 *
 * Khung dựng trong hệ mà đầu bước ra của ô thang là cạnh `y0`, rồi lật cây về hệ thật. Canh:
 *  1. Mọi phép xoay / lật: đổi sang hệ chuẩn rồi lật về trả đúng từng lá, cây vẫn hợp lệ (nhánh `a` ở phía toạ độ
 *     nhỏ, `at` là ranh giới chung, hai nhánh lấp kín nút) — sai thì cổng nhận một cây vỡ.
 *  2. Đầu bước ra của ô thang (mọi cạnh) sang hệ chuẩn thành cạnh `y0`.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '../ai/draw/geometry';
import { chain, leaf, leaves, type Placed, type Side } from '../ai/arrange/placed';
import {
  arrivalTransform,
  fwdPt,
  fwdSide,
  invPlaced,
  makeTransform,
  mapRect,
} from '../ai/arrange/skeleton-rows';

const F: Rect = { x0: 300, y0: 400, x1: 1500, y1: 2000 };

/** Cây thật: [dải trước][hành lang][phòng | thang | phòng] — đủ để có cả hai trục cắt. */
function realTree(): Placed {
  const front = chain({ ...F, y1: 900 }, 'x', [
    leaf('a', { x0: 300, y0: 400, x1: 800, y1: 900 }),
    leaf('b', { x0: 800, y0: 400, x1: 1500, y1: 900 }),
  ]);
  const hall = leaf('h', { x0: 300, y0: 900, x1: 1500, y1: 1035 });
  const back = chain({ x0: 300, y0: 1035, x1: 1500, y1: 2000 }, 'x', [
    leaf('c', { x0: 300, y0: 1035, x1: 1000, y1: 2000 }),
    leaf('s', { x0: 1000, y0: 1035, x1: 1300, y1: 2000 }),
    leaf('d', { x0: 1300, y0: 1035, x1: 1500, y1: 2000 }),
  ]);
  return chain(F, 'y', [front, hall, back]);
}

/** Đổi cả cây sang hệ chuẩn (chỉ toạ độ lá — phép thử cần lá; cây chuẩn dựng lại theo trục mới). */
function forwardLeaves(t: ReturnType<typeof makeTransform>, node: Placed) {
  return leaves(node).map((l) => ({ id: l.id, rect: mapRect(l.rect, (x, y) => fwdPt(t, x, y)) }));
}

/** Dựng cây chuẩn tương ứng bằng chính cách khung dựng: nút cắt đổi trục khi xoay, lá đổi toạ độ. */
function forwardTree(t: ReturnType<typeof makeTransform>, node: Placed): Placed {
  const fwd = (r: Rect) => mapRect(r, (x, y) => fwdPt(t, x, y));
  if (node.kind === 'leaf') return leaf(node.id, fwd(node.rect));
  const a = forwardTree(t, node.a);
  const b = forwardTree(t, node.b);
  const axis = t.transpose ? (node.axis === 'x' ? 'y' : 'x') : node.axis;
  const low = (p: Placed) => (axis === 'x' ? p.rect.x0 : p.rect.y0);
  const [first, second] = low(a) <= low(b) ? [a, b] : [b, a];
  return {
    kind: 'cut',
    axis,
    at: axis === 'x' ? first.rect.x1 : first.rect.y1,
    a: first,
    b: second,
    rect: fwd(node.rect),
  };
}

function valid(node: Placed): boolean {
  if (node.kind === 'leaf') return node.rect.x1 > node.rect.x0 && node.rect.y1 > node.rect.y0;
  const { a, b, rect, axis, at } = node;
  const lowA = axis === 'x' ? a.rect.x0 : a.rect.y0;
  const highA = axis === 'x' ? a.rect.x1 : a.rect.y1;
  const lowB = axis === 'x' ? b.rect.x0 : b.rect.y0;
  const highB = axis === 'x' ? b.rect.x1 : b.rect.y1;
  const start = axis === 'x' ? rect.x0 : rect.y0;
  const end = axis === 'x' ? rect.x1 : rect.y1;
  return lowA === start && highA === at && lowB === at && highB === end && valid(a) && valid(b);
}

const ALL = [false, true].flatMap((transpose) =>
  [false, true].flatMap((mirrorY) =>
    [false, true].map((mirrorX) => ({ transpose, mirrorY, mirrorX })),
  ),
);

describe('khung hai hàng — hệ toạ độ chuẩn', () => {
  it.each(ALL)(
    'xoay %o: sang hệ chuẩn rồi lật về trả đúng cây',
    ({ transpose, mirrorY, mirrorX }) => {
      const t = makeTransform(F, transpose, mirrorY, mirrorX);
      const tree = realTree();
      const normal = forwardTree(t, tree);
      expect(valid(normal)).toBe(true);
      for (const l of forwardLeaves(t, tree)) {
        expect(l.rect.x0).toBeGreaterThanOrEqual(t.Fn.x0);
        expect(l.rect.y1).toBeLessThanOrEqual(t.Fn.y1);
      }
      const back = invPlaced(t, normal);
      expect(valid(back)).toBe(true);
      const byId = (p: Placed) => Object.fromEntries(leaves(p).map((l) => [l.id, l.rect] as const));
      expect(byId(back)).toEqual(byId(tree));
    },
  );

  it('đầu bước ra ở cạnh nào thì sang hệ chuẩn cũng thành cạnh y0', () => {
    for (const side of ['y0', 'y1', 'x0', 'x1'] as Side[]) {
      for (const mirrorX of [false, true]) {
        expect(fwdSide(arrivalTransform(F, side, mirrorX), side)).toBe('y0');
      }
    }
  });
});
