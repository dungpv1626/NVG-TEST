/**
 * Chín vùng của lô — ngôn ngữ chung giữa ý định mô hình khai và cây chia bộ giải dựng (T43).
 *
 * Vùng là ô của lưới ba hàng × ba cột trên HÌNH BAO khối xây: hàng `front` giáp đường (y nhỏ),
 * cột `left` là x nhỏ. Lô hẹp (dưới `SPLIT_MIN_CM` theo một chiều) chỉ còn MỘT hàng/cột theo chiều
 * ấy: nhà phố 4 m không có «bên trái» và «bên phải» để chia, và cố chia là ép hai phòng 2 m nằm cạnh
 * nhau.
 */

import type { AiPlanIntentZone } from '@nvg/shared/design';
import type { Rect } from '../draw/geometry';

export type Zone = AiPlanIntentZone;

export const ZONES: readonly Zone[] = [
  'front_left',
  'front',
  'front_right',
  'left',
  'center',
  'right',
  'back_left',
  'back',
  'back_right',
];

/** Vùng → (cột 0 trái…2 phải, hàng 0 trước…2 sau). */
export const ZONE_CELL: Readonly<Record<Zone, { col: 0 | 1 | 2; row: 0 | 1 | 2 }>> = {
  front_left: { col: 0, row: 0 },
  front: { col: 1, row: 0 },
  front_right: { col: 2, row: 0 },
  left: { col: 0, row: 1 },
  center: { col: 1, row: 1 },
  right: { col: 2, row: 1 },
  back_left: { col: 0, row: 2 },
  back: { col: 1, row: 2 },
  back_right: { col: 2, row: 2 },
};

/** Chiều dài tối thiểu, cm, để một chiều của hình bao được chia ba. Dưới mức này chỉ một dải. */
export const SPLIT_MIN_CM = 750;

export function zoneAt(col: number, row: number): Zone {
  const c = Math.max(0, Math.min(2, col));
  const r = Math.max(0, Math.min(2, row));
  return ZONES[r * 3 + c]!;
}

/** Vùng chứa TÂM của một chữ nhật, chia hình bao làm ba đều theo mỗi chiều. */
export function zoneOfRect(footprint: Rect, rect: Rect): Zone {
  const third = (lo: number, hi: number, v: number) => {
    const t = (v - lo) / Math.max(1, hi - lo);
    return t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2;
  };
  return zoneAt(
    third(footprint.x0, footprint.x1, (rect.x0 + rect.x1) / 2),
    third(footprint.y0, footprint.y1, (rect.y0 + rect.y1) / 2),
  );
}

/**
 * Vùng chứa tâm, CHIẾU lên lưới hiệu dụng: lô một cột thì luôn là cột giữa (`back`, không phải
 * `back_right`). Dùng ở mọi chỗ vùng đi RA NGOÀI bộ giải — lời dẫn nói với mô hình rằng lô hẹp không có
 * trái/phải, nên tri thức gửi kèm không được nói ngược lại.
 */
export function effectiveZoneOfRect(footprint: Rect, rect: Rect): Zone {
  const raw = ZONE_CELL[zoneOfRect(footprint, rect)];
  const cols = footprint.x1 - footprint.x0 >= SPLIT_MIN_CM;
  const rows = footprint.y1 - footprint.y0 >= SPLIT_MIN_CM;
  return zoneAt(cols ? raw.col : 1, rows ? raw.row : 1);
}

/** Khoảng cách Chebyshev giữa hai vùng: 0 cùng vùng, 1 kề nhau, 2 hai đầu lô. */
export function zoneDistance(a: Zone, b: Zone): number {
  const p = ZONE_CELL[a];
  const q = ZONE_CELL[b];
  return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row));
}

/**
 * Khoảng cách vùng SAU KHI chiếu lên lưới hiệu dụng: lô một cột thì «trái» và «phải» là một.
 * Chấm khớp ý định bằng khoảng cách này — không trừ điểm một nhà phố 4 m vì không có bên trái.
 */
export function projectedDistance(footprint: Rect, a: Zone, b: Zone): number {
  const cols = footprint.x1 - footprint.x0 >= SPLIT_MIN_CM;
  const rows = footprint.y1 - footprint.y0 >= SPLIT_MIN_CM;
  const p = ZONE_CELL[a];
  const q = ZONE_CELL[b];
  return Math.max(cols ? Math.abs(p.col - q.col) : 0, rows ? Math.abs(p.row - q.row) : 0);
}
