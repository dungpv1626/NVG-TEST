/**
 * T73 — quy đổi diện tích ↔ số ô bản phác, và chỗ số ấy đi tới mô hình.
 *
 * Nguyên nhân gốc (lượt đo 011b4adc, 24/09/2026): đầu bài «phòng khách tối thiểu 45 m²», mô hình khai
 * đúng mục tiêu 45 m² mà vẽ 28 ô, vì lời dẫn 8.3.0 dặn «Do not count cells». KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { briefMinCells, planContext } from '../ai/plan';
import { clearAreaM2, corridorMinCells, minSketchCells } from '../ai/sketch-cells';
import { loadRun, prompts, realContextInput } from './ai-real-context';

const run = loadRun('011b4adc');
const input = realContextInput(run.digest);

describe('quy đổi diện tích ↔ số ô', () => {
  it('lọt lòng = chữ nhật theo tim tường trừ một tường mỗi chiều — khớp số đo 28 ô → 26,8 m²', () => {
    // Phòng khách lượt 011b4adc: 7 × 4 ô một mét, tường ngăn 11 cm.
    expect(clearAreaM2(700, 400, 11)).toBeCloseTo(26.8, 1);
  });

  it('số ô tối thiểu đủ cho phòng tỉ lệ 2 cộng tường ngoài', () => {
    expect(minSketchCells(45, 1, 0.22)).toBe(49);
    expect(minSketchCells(13, 1, 0.22)).toBe(15);
    // Ô to hơn thì ít ô hơn.
    expect(minSketchCells(45, 1.5, 0.22)).toBe(22);
  });

  it('vẽ đủ số ô gửi đi thì chắc chắn qua phép kiểm bản phác (tường ngăn, lạc quan)', () => {
    for (const area of [8, 13, 20, 25, 45, 60]) {
      const cells = minSketchCells(area, 1, 0.22);
      // Chữ nhật tỉ lệ 2 gần nhất với số ô ấy.
      const short = Math.round(Math.sqrt(cells / 2));
      const long = Math.ceil(cells / short);
      expect(clearAreaM2(long * 100, short * 100, 11), `${area} m²`).toBeGreaterThanOrEqual(area);
    }
  });
});

describe('tri thức gửi mô hình', () => {
  it('mỗi phòng đầu bài khai diện tích có một dòng số ô tối thiểu, kể cả chỗ để xe', () => {
    const rows = planContext(input).modelKnowledge.min_cells;
    expect(rows).toContainEqual({ type: 'living', floor: 1, min_m2: 45, cells: 49 });
    expect(rows).toContainEqual({ type: 'study', floor: 2, min_m2: 13, cells: 15 });
    expect(rows.some((row) => row.type === 'garage' && row.floor === null)).toBe(true);
  });

  it('giếng thang máy có dòng riêng: số ô theo đúng hình giếng khai, kèm số ô mỗi cạnh (T78)', () => {
    // 1,3 × 1,4 m + tường ngoài 0,22 m mỗi chiều → 2 × 2 ô lưới 1 m; lượt thật 913bc2ad vẽ 1 × 4 ô.
    const rows = briefMinCells([], null, { columns: 12, rows: 16, cell_m: 1 }, input.construction, {
      type: 'elevator',
      shaftWidthM: 1.3,
      shaftDepthM: 1.4,
    });
    expect(rows).toEqual([
      { type: 'elevator', floor: null, min_m2: 1.82, cells: 4, min_side_cells: 2 },
    ]);
    // Lưới ô 0,5 m: 1,52 và 1,62 m đều vượt 3 ô → 4 × 4 ô.
    expect(
      briefMinCells([], null, { columns: 24, rows: 32, cell_m: 0.5 }, input.construction, {
        type: 'elevator',
        shaftWidthM: 1.3,
        shaftDepthM: 1.4,
      }),
    ).toEqual([{ type: 'elevator', floor: null, min_m2: 1.82, cells: 16, min_side_cells: 4 }]);
    // Chưa khai kích thước thì không có dòng — không bịa.
    expect(
      briefMinCells([], null, { columns: 12, rows: 16, cell_m: 1 }, input.construction, {
        type: 'elevator',
        shaftWidthM: null,
        shaftDepthM: null,
      }),
    ).toEqual([]);
    expect(prompts.floorLevel.system).toContain('min_side_cells');
  });

  it('đầu bài không khai diện tích nào thì danh sách rỗng', () => {
    expect(
      briefMinCells(
        [{ type: 'living', floor: 1, area_m2: null }],
        null,
        { columns: 12, rows: 16, cell_m: 1 },
        input.construction,
      ),
    ).toEqual([]);
  });

  it('hành lang tối thiểu đủ lọt lòng + tường theo tim: ô 1 m → 2 ô, ô 1,5 m → 1 ô', () => {
    // 1,2 lọt lòng + 0,22 tường ngoài + 0,055 nửa tường ngăn = 1,475 m.
    expect(corridorMinCells(input.construction, 1)).toBe(2);
    expect(corridorMinCells(input.construction, 1.5)).toBe(1);
    expect(planContext(input).modelKnowledge.corridor_min_cells).toBe(2);
    // Lời dẫn không còn cho phép «one or two cells».
    expect(prompts.floorLevel.system).not.toMatch(/one or\s+two cells/);
    expect(prompts.floorLevel.system).toContain('knowledge.corridor_min_cells');
  });

  it('lời dẫn không còn dặn mô hình «đừng đếm ô», và bảo vẽ đủ `min_cells`', () => {
    expect(prompts.floorLevel.system).not.toMatch(/Do not count cells/i);
    expect(prompts.floorLevel.system).toContain('knowledge.min_cells');
  });
});

describe('lượt chạy thật 0c86c0b1 (24/09/2026, lời dẫn 8.20.0) — mô hình vẽ đủ số ô', () => {
  const live = loadRun('0c86c0b1');
  const rows = planContext(realContextInput(live.digest)).modelKnowledge.min_cells;

  it('mọi phòng khớp một dòng `min_cells` được vẽ đủ ô, và không bỏ trống ô nào', () => {
    // Trước T73 (011b4adc): phòng khách 28 ô cho 45 m², 40 ô bỏ trống làm sân.
    for (const [round, intent] of Object.entries(live.intents)) {
      for (const sketch of intent.sketches ?? []) {
        const cells = sketch.rows.flatMap((row) => row.split(' '));
        expect(
          cells.filter((cell) => cell === '.'),
          `${round} tầng ${sketch.level}`,
        ).toEqual([]);
        for (const row of rows.filter((r) => r.type === 'living' || r.type === 'study')) {
          const room = intent.rooms.find(
            (r) => r.type === row.type && (row.floor === null || r.level === row.floor),
          );
          if (!room || room.level !== sketch.level) continue;
          const drawn = cells.filter((cell) => cell === room.id).length;
          expect(drawn, `${round} ${room.id}`).toBeGreaterThanOrEqual(row.cells);
        }
      }
    }
  });
});
