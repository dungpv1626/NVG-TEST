/**
 * Ô theo TIM tường → phòng LỌT LÒNG (T37).
 *
 * Mỗi cạnh ô lùi vào đúng NỬA bề dày bức tường đi qua cạnh ấy — trừ cạnh giáp ngoài nhà, lùi
 * CẢ bề dày để tường bao nằm trọn trong khối xây (footprint là mặt NGOÀI tường bao, như hồ sơ
 * NVG: outline ở 0 thì mặt trong phòng ở 22).
 *
 * ── Vì sao bề dày tính theo CẢ NHÁT CẮT, không theo từng cặp phòng ────────────────────
 *
 * Phòng là chữ nhật, nên một cạnh chỉ lùi được một khoảng. Nhưng một cạnh có thể giáp nhiều ô bên
 * kia: phòng khách giáp bếp (vách 11) và giếng trời (tường bao 22) trên cùng một nhát. Lùi theo từng
 * cặp thì phòng khách lùi 11, bếp lùi 5,5, và `draw/derive-walls.ts` — vốn lấy chính khe giữa hai
 * mặt phòng làm bề dày — dựng một bức 16,5 cm không tồn tại trong quy ước cấu tạo nào.
 *
 * Nên bề dày là của NHÁT CẮT: bức dày nhất mà nhát ấy phải mang, và mọi ô hai bên cùng lùi nửa bề
 * dày đó. Đổi lại, một đoạn vách giữa hai phòng trong nhà có thể dày 22 thay vì 11 khi cùng nhát
 * cắt còn giáp giếng trời — dày hơn thực tế một chút, nhưng mọi bức tường vẫn là 11 hoặc 22, và
 * tờ vẽ không bao giờ có bức 16,5.
 */

import type { ConstructionNorms } from '../../kb/construction';
import type { Rect } from '../draw/geometry';
import type { PlanIssue } from '../plan-check';
import type { Cell } from './cells';
import { treeIssue } from './issues';

export type Side = 'x0' | 'x1' | 'y0' | 'y1';

const OPPOSITE: Record<Side, Side> = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };

/** Khoảng dọc theo cạnh `side` của một ô. */
export function spanOf(rect: Rect, side: Side): [number, number] {
  return side === 'x0' || side === 'x1' ? [rect.y0, rect.y1] : [rect.x0, rect.x1];
}

/** Ô bên kia cạnh `side` của `cell`, kèm đoạn chung theo tim tường. */
export function neighboursAcross(
  cell: Cell,
  side: Side,
  cells: readonly Cell[],
): { cell: Cell; from: number; to: number }[] {
  const node = cell.from[side];
  if (node === null) return [];
  const [lo, hi] = spanOf(cell.rect, side);
  const out: { cell: Cell; from: number; to: number }[] = [];
  for (const other of cells) {
    if (other === cell || other.from[OPPOSITE[side]] !== node) continue;
    const [olo, ohi] = spanOf(other.rect, OPPOSITE[side]);
    const from = Math.max(lo, olo);
    const to = Math.min(hi, ohi);
    // Chỉ chạm nhau tại một điểm (hai ô chéo góc qua một ngã tư) thì không phải hàng xóm.
    if (to - from > 0) out.push({ cell: other, from, to });
  }
  return out;
}

export interface InsetInput {
  cells: readonly Cell[];
  /** Mã phòng → có thuộc nhóm ngoài trời không (`kb/room_vocabulary.yaml`). */
  outdoor: (roomId: string) => boolean;
  construction: ConstructionNorms;
  level: number;
}

export interface InsetResult {
  /** Mã ô (phòng hoặc void) → chữ nhật lọt lòng, cm, lưới nửa centimet. */
  inner: Map<string, Rect>;
  /** Nhát cắt → bề dày bức tường nó mang, cm. */
  lineThickness: Map<string, number>;
  issues: PlanIssue[];
}

export function innerRects(input: InsetInput): InsetResult {
  const exterior = Math.round(input.construction.walls.exterior_m * 100);
  const partition = Math.round(input.construction.walls.partition_m * 100);
  const isOutdoorRoom = (cell: Cell): boolean => cell.kind === 'room' && input.outdoor(cell.id);

  /** Bức tường giữa hai ô, cm; `null` khi giữa chúng không có tường (unbuilt với unbuilt). */
  const pairThickness = (a: Cell, b: Cell): number | null => {
    if (a.kind === 'unbuilt' && b.kind === 'unbuilt') return null;
    if (a.kind === 'void' && b.kind === 'void') return null;
    if (a.kind === 'unbuilt' || b.kind === 'unbuilt') {
      const built = a.kind === 'unbuilt' ? b : a;
      if (built.kind === 'void') return null;
      return isOutdoorRoom(built) ? partition : exterior;
    }
    if (a.kind === 'void' || b.kind === 'void') {
      const room = a.kind === 'void' ? b : a;
      return isOutdoorRoom(room) ? partition : exterior;
    }
    // Trong nhà giáp ngoài trời (giếng trời, ban công) là tường BAO, dù nằm giữa nhà.
    return isOutdoorRoom(a) !== isOutdoorRoom(b) ? exterior : partition;
  };

  const lineThickness = new Map<string, number>();
  for (const cell of input.cells) {
    for (const side of ['x1', 'y1'] as const) {
      const node = cell.from[side];
      if (node === null) continue;
      for (const { cell: other } of neighboursAcross(cell, side, input.cells)) {
        const t = pairThickness(cell, other);
        if (t === null) continue;
        lineThickness.set(node, Math.max(lineThickness.get(node) ?? 0, t));
      }
    }
  }

  const insetOf = (cell: Cell, side: Side): number => {
    const own = cell.kind === 'void' ? 0 : isOutdoorRoom(cell) ? partition : exterior;
    const node = cell.from[side];
    if (node === null) return own;
    const across = neighboursAcross(cell, side, input.cells);
    if (across.length > 0 && across.every((n) => n.cell.kind === 'unbuilt')) return own;
    return (lineThickness.get(node) ?? partition) / 2;
  };

  const inner = new Map<string, Rect>();
  const issues: PlanIssue[] = [];
  for (const cell of input.cells) {
    if (cell.kind === 'unbuilt') continue;
    const rect: Rect = {
      x0: cell.rect.x0 + insetOf(cell, 'x0'),
      x1: cell.rect.x1 - insetOf(cell, 'x1'),
      y0: cell.rect.y0 + insetOf(cell, 'y0'),
      y1: cell.rect.y1 - insetOf(cell, 'y1'),
    };
    if (rect.x1 - rect.x0 <= 0 || rect.y1 - rect.y0 <= 0) {
      issues.push(
        treeIssue(
          'cell_collapsed',
          `Ô "${cell.id}" ở tầng ${input.level} sau khi trừ bề dày tường còn ${Math.max(0, rect.x1 - rect.x0)} × ${Math.max(0, rect.y1 - rect.y0)} cm.`,
          { id: cell.id },
          cell.id,
        ),
      );
      continue;
    }
    inner.set(cell.id, rect);
  }
  return { inner, lineThickness, issues };
}
