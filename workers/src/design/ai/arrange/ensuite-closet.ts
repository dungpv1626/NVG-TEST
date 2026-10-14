/**
 * WC khép kín dài quá → WC gọn + tủ đồ (T160, Haan 13/10/2026: «WC trong phòng ngủ đang dài quá (5m6)»).
 *
 * Bản phác lưới ~1 m mỗi ô: mô hình hay vẽ WC khép kín thành một dải kéo suốt bề ngang phòng ngủ (phương án d084a46e
 * tầng 1: 5,47 × 1,38 m). Phòng chỉ dựng được hình chữ nhật, nên phần dư không trả về phòng ngủ được. Haan chọn: WC giữ
 * tối đa `maxLength`, phần còn lại của dải thành «Tủ đồ» — cũng là phòng khép kín của phòng ngủ ấy, cùng cạnh chung với
 * phòng ngủ nên mở cửa từ đó được.
 *
 * WC đứng ở đầu dải chạm mép khối nhà (có cửa sổ thông gió); không đầu nào chạm thì ở đầu toạ độ nhỏ. Hàm THUẦN: chỉ đổi
 * cây đã đặt toạ độ — chương trình, lá, cửa do nơi gọi dựng.
 */

import type { Rect } from '../draw/geometry';
import { MODULE_CM, type Axis, type Placed } from './placed';

export interface EnsuiteClosetInput {
  /** Lá là WC khép kín. */
  isEnsuiteWc: (id: string) => boolean;
  /** Chiều dài tối đa của WC theo tim tường, cm. */
  maxLength: number;
  /** Phần dư ngắn hơn chừng này (cm, theo tim) thì để nguyên WC. */
  minCloset: number;
  /** Khối nhà — đầu dải chạm mép khối được WC. */
  footprint: Rect;
  /** Mã cho tủ đồ mới, theo thứ tự tách. */
  newId: (wcId: string) => string;
}

export interface EnsuiteClosetSplit {
  wc: string;
  closet: string;
  rect: Rect;
}

const lo = (r: Rect, axis: Axis) => (axis === 'x' ? r.x0 : r.y0);
const hi = (r: Rect, axis: Axis) => (axis === 'x' ? r.x1 : r.y1);

export function splitLongEnsuiteWcs(
  placed: Placed,
  input: EnsuiteClosetInput,
): { placed: Placed; splits: EnsuiteClosetSplit[] } {
  const splits: EnsuiteClosetSplit[] = [];
  const walk = (node: Placed): Placed => {
    if (node.kind === 'cut') {
      const a = walk(node.a);
      const b = walk(node.b);
      return a === node.a && b === node.b ? node : { ...node, a, b };
    }
    if (!input.isEnsuiteWc(node.id)) return node;
    const r = node.rect;
    const axis: Axis = r.x1 - r.x0 >= r.y1 - r.y0 ? 'x' : 'y';
    const length = hi(r, axis) - lo(r, axis);
    const wcLength = Math.floor(input.maxLength / MODULE_CM) * MODULE_CM;
    if (length <= input.maxLength || length - wcLength < input.minCloset) return node;
    const atLow = lo(r, axis) <= lo(input.footprint, axis) + 1;
    const atHigh = hi(r, axis) >= hi(input.footprint, axis) - 1;
    const wcLow = atLow || !atHigh;
    const at = wcLow ? lo(r, axis) + wcLength : hi(r, axis) - wcLength;
    const first: Rect = axis === 'x' ? { ...r, x1: at } : { ...r, y1: at };
    const second: Rect = axis === 'x' ? { ...r, x0: at } : { ...r, y0: at };
    const closet = input.newId(node.id);
    const wcRect = wcLow ? first : second;
    const closetRect = wcLow ? second : first;
    splits.push({ wc: node.id, closet, rect: closetRect });
    const wcLeaf: Placed = { kind: 'leaf', id: node.id, rect: wcRect };
    const closetLeaf: Placed = { kind: 'leaf', id: closet, rect: closetRect };
    return {
      kind: 'cut',
      axis,
      at,
      a: wcLow ? wcLeaf : closetLeaf,
      b: wcLow ? closetLeaf : wcLeaf,
      rect: r,
    };
  };
  return { placed: walk(placed), splits };
}
