/**
 * Ban công ĐUA RA NGOÀI RANH NHÀ (T65, 22/09/2026).
 *
 * ── Vì sao chỗ này, và không phải chỗ nào khác ────────────────────────────────────────
 *
 * Cây chia (`tree/cells.ts`) chia hình bao thành các ô lấp kín, không chồng nhau. Một ban công
 * đua ra ngoài, theo định nghĩa, KHÔNG nằm trong hình bao ấy — nên nó không ra đời được từ phép
 * chia. Nó phải được nới thêm SAU khi chia xong.
 *
 * Nhưng phải nới TRƯỚC `innerRects` và `outlineOf`, và đó là điểm mấu chốt. Nới ở đây thì ba thứ
 * tự khớp mà không phải sửa chỗ nào:
 *
 *  · **hình bao tầng** (`outlineOf`) dựng từ hợp các ô đã xây, nên nó tự mọc ra phần nhô;
 *  · **tường** (`draw/derive-walls.ts`) suy từ chữ nhật phòng, và cạnh biên của một phòng ngoài
 *    trời là LAN CAN — ban công nhô ra tự có lan can ba mặt, tường chung với phòng trong nhà giữ
 *    nguyên;
 *  · **lỗ mở** (`placeOpenings`) đặt trên ô đã nới, nên `at` của cửa và cửa sổ đo trên đúng cạnh
 *    cuối cùng. Nới sau bước ấy thì mọi `at` trên hai cạnh vuông góc lệch đi đúng bằng phần nhô,
 *    và cửa ban công trượt khỏi chỗ của nó.
 *
 * ── Nới cái gì, và nới bao xa ─────────────────────────────────────────────────────────
 *
 * Chỉ ô mang loại ban công, chỉ ô ĐANG ÁP SÁT mép hình bao ở đúng mặt gia chủ khai, và chỉ xa
 * đúng `balconies.projection_m` của đầu bài. Ô ban công nằm giữa nhà thì không nhô: nhô một ô ở
 * giữa là đẩy nó xuyên qua phòng bên cạnh.
 *
 * Không có số thì KHÔNG nhô. Gia chủ khai «có đua ra ngoài» mà chưa khai bao nhiêu mét thì mặt
 * bằng giữ ban công trong ranh và nói ra là còn thiếu số — bịa một con số rồi vẽ lên bản vẽ kỹ
 * thuật tệ hơn hẳn (CLAUDE.md 5.2). Chỗ nói ra nằm ở `brief-demands.ts`.
 */

import type { BalconyDemand, Side } from '../brief-demands';
import type { Rect } from '../draw/geometry';
import type { Cell } from './cells';

/** Mép ô cách mép hình bao dưới chừng này coi như áp sát, cm. */
const FLUSH_CM = 1;

export interface ProjectionResult {
  cells: Cell[];
  /** Mã ô đã nới và mặt nhô ra — nơi gọi ghi thành ghi chú cho kiến trúc sư đọc. */
  projected: { id: string; side: Side; cm: number }[];
}

/**
 * Nới các ô ban công ra ngoài hình bao.
 *
 * Hàm THUẦN, và không nới gì thì trả về chính mảng đã nhận — nơi gọi không phải phân biệt.
 */
export function projectBalconyCells(input: {
  cells: readonly Cell[];
  /** Mã ô → mã loại phòng. */
  typeOf: ReadonlyMap<string, string>;
  balcony: BalconyDemand | null;
  level: number;
  footprint: Rect;
}): ProjectionResult {
  const { balcony, level, footprint } = input;
  const projection = balcony?.projection;
  if (!balcony || !projection || level < balcony.fromLevel) {
    return { cells: [...input.cells], projected: [] };
  }

  const projected: ProjectionResult['projected'] = [];
  const cells = input.cells.map((cell) => {
    if (cell.kind !== 'room') return cell;
    if (input.typeOf.get(cell.id) !== balcony.type) return cell;

    let rect = cell.rect;
    for (const [side, m] of Object.entries(projection) as [Side, number][]) {
      const cm = Math.round(m * 100);
      if (cm <= 0 || !isFlush(rect, footprint, side)) continue;
      rect =
        side === 'front'
          ? { ...rect, y0: rect.y0 - cm }
          : side === 'back'
            ? { ...rect, y1: rect.y1 + cm }
            : side === 'left'
              ? { ...rect, x0: rect.x0 - cm }
              : { ...rect, x1: rect.x1 + cm };
      projected.push({ id: cell.id, side, cm });
    }
    return rect === cell.rect ? cell : { ...cell, rect };
  });

  return { cells, projected };
}

/** Ô có áp sát mép hình bao ở mặt này không. */
function isFlush(rect: Rect, footprint: Rect, side: Side): boolean {
  if (side === 'front') return Math.abs(rect.y0 - footprint.y0) <= FLUSH_CM;
  if (side === 'back') return Math.abs(rect.y1 - footprint.y1) <= FLUSH_CM;
  if (side === 'left') return Math.abs(rect.x0 - footprint.x0) <= FLUSH_CM;
  return Math.abs(rect.x1 - footprint.x1) <= FLUSH_CM;
}
