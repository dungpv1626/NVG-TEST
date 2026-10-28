/**
 * Dời vách bản phác (T177, `arrange/sketch-repair.ts`) — phép thử trên lưới dựng tay: phòng hụt ô được nới bằng dời
 * vách, phòng mất lối vào được nối bằng dải hành lang mới, và ba bất biến: phòng nhường chỗ không xuống dưới mức của
 * nó, ô lõi (thang) không đổi, mọi phòng vẫn là chữ nhật. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import {
  baseId,
  cellBoxes,
  repairSketchGrid,
  type CellBox,
  type RepairRules,
} from '../ai/arrange/sketch-repair';
import type { SketchGrid } from '../ai/arrange/sketch';

const grid = (rows: string[]): SketchGrid => {
  const cells = rows.map((row) =>
    row
      .trim()
      .split(/\s+/)
      .map((id) => (id === '.' ? null : id)),
  );
  return { cols: cells[0]!.length, rows: cells.length, cells };
};

const cellsOf = (g: SketchGrid, id: string) => g.cells.flat().filter((cell) => cell === id).length;

function allRect(g: SketchGrid): boolean {
  return [...cellBoxes(g).values()].every(
    (box) => (box.c1 - box.c0) * (box.r1 - box.r0) === box.cells,
  );
}

/** Phòng `id` chạm một ô mang mã gốc `host` dọc một đoạn ≥ `run` ô liền. */
function touches(g: SketchGrid, id: string, host: string, run = 2): boolean {
  let best = 0;
  const scan = (pairs: [string | null, string | null][]) => {
    let now = 0;
    for (const [a, b] of pairs) {
      const hit =
        (a === id && b !== null && baseId(b) === host) ||
        (b === id && a !== null && baseId(a) === host);
      now = hit ? now + 1 : 0;
      best = Math.max(best, now);
    }
  };
  for (let r = 0; r + 1 < g.rows; r += 1) {
    scan(g.cells[r]!.map((a, c) => [a, g.cells[r + 1]![c]!] as [string | null, string | null]));
  }
  for (let c = 0; c + 1 < g.cols; c += 1) {
    scan(g.cells.map((row) => [row[c]!, row[c + 1]!] as [string | null, string | null]));
  }
  return best >= run;
}

const base: Omit<RepairRules, 'score' | 'shrinkOk'> = {
  movable: (id) => id !== 'S',
  corridor: (id) => id === 'H',
  maxMoves: 8,
  maxNewCorridors: 2,
  stubCells: 2,
  beam: 4,
  patience: 2,
};

const minCells =
  (min: Record<string, number>) =>
  (id: string, box: CellBox): boolean => {
    const w = box.c1 - box.c0;
    const h = box.r1 - box.r0;
    if (id === 'H') return Math.min(w, h) >= 2;
    return w * h >= (min[id] ?? 1) && Math.min(w, h) >= 1;
  };

describe('dời vách bản phác (T177)', () => {
  it('phòng hụt ô: lấy một dải của phòng kề còn dư, phòng kề không xuống dưới mức của nó', () => {
    const start = grid(['A A B B B', 'A A B B B', 'C C C C C']);
    const result = repairSketchGrid(start, {
      ...base,
      shrinkOk: minCells({ B: 4 }),
      score: (g) => [Math.max(0, 6 - cellsOf(g, 'A'))],
    });
    expect(result).not.toBeNull();
    expect(cellsOf(result!.grid, 'A')).toBeGreaterThanOrEqual(6);
    expect(cellsOf(result!.grid, 'B')).toBeGreaterThanOrEqual(4);
    expect(cellsOf(result!.grid, 'C')).toBe(5);
    expect(allRect(result!.grid)).toBe(true);
    // Lưới gốc không đổi.
    expect(cellsOf(start, 'A')).toBe(4);
  });

  it('phòng kề đã ở mức tối thiểu thì không lấy — không bịa chỗ', () => {
    const start = grid(['A A B B', 'A A B B', 'C C C C']);
    const result = repairSketchGrid(start, {
      ...base,
      shrinkOk: minCells({ B: 4, C: 4 }),
      score: (g) => [Math.max(0, 6 - cellsOf(g, 'A'))],
    });
    expect(result).toBeNull();
  });

  it('phòng mất lối vào: phòng giữa nhường một dải thành đoạn hành lang mới nối tới hành lang sẵn có', () => {
    const start = grid([
      'H H H H H',
      'D D D D D',
      'D D D D D',
      'D D D D D',
      'D D D D D',
      'R R R R R',
    ]);
    const result = repairSketchGrid(start, {
      ...base,
      shrinkOk: minCells({ D: 12 }),
      score: (g) => [touches(g, 'R', 'H') ? 0 : 1, -cellsOf(g, 'D')],
    });
    expect(result).not.toBeNull();
    expect(touches(result!.grid, 'R', 'H')).toBe(true);
    expect(result!.moves.map((move) => move.kind)).toContain('stub');
    const pieces = [...cellBoxes(result!.grid).keys()].filter((id) => id.startsWith('H#'));
    expect(pieces).toHaveLength(1);
    expect(cellsOf(result!.grid, 'D')).toBeGreaterThanOrEqual(12);
    expect(cellsOf(result!.grid, 'R')).toBe(5);
    expect(allRect(result!.grid)).toBe(true);
  });

  it('không tách hành lang khi `maxNewCorridors` = 0', () => {
    const start = grid(['H H H H H', 'D D D D D', 'D D D D D', 'D D D D D', 'R R R R R']);
    const result = repairSketchGrid(start, {
      ...base,
      maxNewCorridors: 0,
      shrinkOk: minCells({ D: 6 }),
      score: (g) => [touches(g, 'R', 'H') ? 0 : 1],
    });
    expect(result).toBeNull();
  });

  it('ô thang không bao giờ đổi, kể cả khi lấy ô của nó là cách duy nhất', () => {
    const start = grid(['A A S S S', 'A A S S S', 'C C C C C']);
    const result = repairSketchGrid(start, {
      ...base,
      shrinkOk: minCells({}),
      score: (g) => [Math.max(0, 6 - cellsOf(g, 'A'))],
    });
    // Không đường nào khác: C chỉ một hàng.
    expect(result).toBeNull();
  });

  it('phòng lấn một phần hành lang: phần còn lại tách thành hai đoạn chữ nhật đủ bề rộng', () => {
    const start = grid([
      'A A H H H H',
      'A A H H H H',
      'B B H H H H',
      'B B H H H H',
      'B B H H H H',
      'B B H H H H',
    ]);
    const result = repairSketchGrid(start, {
      ...base,
      movable: (id) => id !== 'B',
      shrinkOk: minCells({}),
      score: (g) => [Math.max(0, 6 - cellsOf(g, 'A'))],
    });
    expect(result).not.toBeNull();
    expect(cellsOf(result!.grid, 'A')).toBe(6);
    expect(cellsOf(result!.grid, 'B')).toBe(8);
    expect(allRect(result!.grid)).toBe(true);
    for (const [id, box] of cellBoxes(result!.grid)) {
      if (baseId(id) === 'H')
        expect(Math.min(box.c1 - box.c0, box.r1 - box.r0)).toBeGreaterThanOrEqual(2);
    }
  });
});
