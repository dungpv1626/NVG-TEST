/**
 * Bộ nắn bản phác lưới (`ai/arrange/sketch.ts`, T48): lưới ô mô hình vẽ → cây chia đã đặt toạ độ.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình. Mỗi phép thử một điều về chỗ bản phác của mô hình có thể lệch:
 * hàng dài ngắn khác nhau, mã lạ, mép để trống, ô trống giữa nhà, phòng không chữ nhật, thiếu phòng,
 * chong chóng.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '../ai/draw/geometry';
import { leaves, type Placed } from '../ai/arrange/placed';
import {
  copySketch,
  fitRows,
  forceSketchRect,
  growSketchRoom,
  prepareSketch,
  sketchTrees,
  stackWetRooms,
  type PrepareInput,
  type SketchTreeInput,
  type WetStackInput,
} from '../ai/arrange/sketch';

const BLOCK: Rect = { x0: 0, y0: 0, x1: 1000, y1: 800 };

function prepare(rows: string[], extra: Partial<PrepareInput> = {}) {
  const ids = new Set(rows.flatMap((row) => row.split(' ')).filter((id) => id !== '.'));
  return prepareSketch({
    rows,
    level: 1,
    footprint: BLOCK,
    known: ids,
    trim: 'shrink',
    streetSides: ['y0'],
    ...extra,
  });
}

function trees(
  rows: string[],
  weight: Record<string, number> = {},
  leafIds?: string[],
  extra: Partial<SketchTreeInput> = {},
) {
  const sketch = prepare(rows)!;
  const ids = leafIds ?? [...sketch.rooms.keys()];
  return sketchTrees({
    sketch,
    level: 1,
    hostOf: new Map(ids.map((id) => [id, id])),
    leaves: ids,
    weight: (id) => weight[id] ?? 1,
    minCell: 100,
    ...extra,
  });
}

const rectOf = (placed: Placed, id: string) => leaves(placed).find((leaf) => leaf.id === id)?.rect;

describe('prepareSketch — đọc bản phác', () => {
  it('hàng thiếu ô ở cuối thì thêm ở cuối, hàng thừa cắt bớt; ghi chú nói ra', () => {
    const sketch = prepare(['a a b b', 'a a b b', 'a a b', 'a a b b b'])!;
    expect(sketch.grid.cols).toBe(4);
    expect(sketch.grid.cells[2]).toEqual(['a', 'a', 'b', 'b']);
    expect(sketch.grid.cells[3]).toEqual(['a', 'a', 'b', 'b']);
    expect(sketch.notes.map((note) => note.code)).toContain('sketch_row_length');
  });

  it('hàng thiếu ô ở GIỮA: thêm ô ở chỗ giữ phòng vuông vức, không đẩy phòng cuối hàng lệch (lượt 58688ead)', () => {
    // Ba hàng giữa thiếu một ô; bản cũ lặp ô cuối nên ô thang «s» phình sang trái ở đúng ba hàng ấy,
    // bị cắt phần lồi còn 3 × 3 ô và cả bản phác bị bỏ.
    const rows = fitRows(
      [
        ['a', 'a', 'a', 'a', 'g', 'g'],
        ['d', 'd', 'k', 's', 's'],
        ['d', 'd', 'k', 's', 's'],
        ['b', 'b', 'b', 'b', 's', 's'],
      ],
      6,
    );
    expect(rows[1]).toEqual(['d', 'd', 'd', 'k', 's', 's']);
    expect(rows[2]).toEqual(['d', 'd', 'd', 'k', 's', 's']);
    expect(rows[3]).toEqual(['b', 'b', 'b', 'b', 's', 's']);
  });

  it('mã không thuộc tầng thành ô trống, có ghi chú kèm mã', () => {
    const sketch = prepare(['a a x', 'a a b'], { known: new Set(['a', 'b']) })!;
    expect(sketch.grid.cells[0]![2]).toBeNull();
    expect(sketch.notes.find((note) => note.code === 'sketch_unknown_room')?.message).toMatch(/x/);
  });

  it('tầng 1: mép toàn «.» lùi khối xây — phần bỏ là sân; vùng tính trên khối đã lùi', () => {
    const sketch = prepare(['a a b b .', 'c c d d .', '. . . . .', '. . . . .'])!;
    expect(sketch.footprint).toEqual({ x0: 0, y0: 0, x1: 800, y1: 400 });
    expect(sketch.grid).toMatchObject({ cols: 4, rows: 2 });
    expect(sketch.rooms.get('a')).toEqual({ zone: 'front_left', street: true });
    expect(sketch.rooms.get('d')).toEqual({ zone: 'back_right', street: false });
  });

  it('tầng trên: mép «.» bỏ đi rồi co giãn về ĐÚNG hình bao tầng dưới, không lùi khối', () => {
    const sketch = prepare(['a a b b .', 'c c d d .'], { trim: 'fit' })!;
    expect(sketch.footprint).toEqual(BLOCK);
    expect(sketch.grid.cols).toBe(4);
  });

  it('bản phác không có ô nào đọc được → null', () => {
    expect(prepare(['. . .', '. . .'])).toBeNull();
  });
});

describe('sketchTrees — nắn thành cây', () => {
  it('dải trước–sau: đúng tôpô, căn theo hình vẽ giữ tỉ lệ ô', () => {
    const result = trees(['a a a b b', 'a a a b b', 'c c d d d', 'c c d d d']);
    expect(result.issues).toEqual([]);
    const drawn = result.trees.find((tree) => tree.key === 'phac-hinh')!;
    expect(rectOf(drawn.placed, 'a')).toEqual({ x0: 0, y0: 0, x1: 600, y1: 400 });
    expect(rectOf(drawn.placed, 'd')).toEqual({ x0: 400, y0: 400, x1: 1000, y1: 800 });
  });

  it('căn theo diện tích: vách dời theo tỉ trọng, tôpô giữ nguyên', () => {
    const result = trees(['a b', 'a b'], { a: 3, b: 1 });
    const byArea = result.trees.find((tree) => tree.key === 'phac-dien-tich')!;
    expect(rectOf(byArea.placed, 'a')).toEqual({ x0: 0, y0: 0, x1: 750, y1: 800 });
    expect(rectOf(byArea.placed, 'b')).toEqual({ x0: 750, y0: 0, x1: 1000, y1: 800 });
  });

  it('ô trống giữa nhà nhập vào phòng mà ô nằm trong chữ nhật bao của nó', () => {
    const result = trees(['a a b', 'a . b', 'a a b']);
    expect(result.issues).toEqual([]);
    expect(result.notes.map((note) => note.code)).toContain('sketch_hole_filled');
    const drawn = result.trees[0]!;
    expect(rectOf(drawn.placed, 'a')).toMatchObject({ x0: 0, x1: expect.any(Number) });
    expect(
      leaves(drawn.placed)
        .map((leaf) => leaf.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('phòng chữ L: giữ chữ nhật lớn nhất, phần lồi trả phòng bên cạnh', () => {
    const result = trees(['a a a b', 'a a a b', 'a c c c', 'a c c c']);
    expect(result.issues).toEqual([]);
    expect(result.notes.map((note) => note.code)).toContain('sketch_reshaped');
    for (const tree of result.trees) {
      expect(
        leaves(tree.placed)
          .map((leaf) => leaf.id)
          .sort(),
      ).toEqual(['a', 'b', 'c']);
    }
  });

  it('chong chóng: không đường chia nào chạy suốt → lý do, không cây', () => {
    const result = trees(['a a b', 'd e b', 'd c c']);
    expect(result.trees).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(['sketch_pinwheel']);
  });

  it('phòng của tầng không có trên bản phác → lý do nêu tên phòng', () => {
    const result = trees(['a b', 'a b'], {}, ['a', 'b', 'wc']);
    expect(result.trees).toEqual([]);
    expect(result.issues[0]).toMatchObject({ code: 'sketch_room_missing' });
    expect(result.issues[0]!.message).toMatch(/"wc"/);
  });

  it('phòng thông nhau gộp một lá: ô của phòng ăn thuộc lá bếp', () => {
    const sketch = prepare(['k k d d', 'k k d d', 'l l l l'])!;
    const result = sketchTrees({
      sketch,
      level: 1,
      hostOf: new Map([
        ['k', 'k'],
        ['d', 'k'],
        ['l', 'l'],
      ]),
      leaves: ['k', 'l'],
      weight: () => 1,
      minCell: 100,
    });
    expect(result.issues).toEqual([]);
    expect(rectOf(result.trees[0]!.placed, 'k')).toMatchObject({ x0: 0, x1: 1000 });
  });

  it('quá nhiều phòng trên một dải so với ô nhỏ nhất → lý do, không cây', () => {
    const row = Array.from({ length: 12 }, (_, i) => `r${i}`).join(' ');
    const result = trees([row, row]);
    expect(result.trees).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(['sketch_rooms_too_small']);
  });

  it('cùng bản phác → cùng cây (tất định)', () => {
    const rows = ['a a b b', 'c d d d', 'c d d d'];
    expect(JSON.stringify(trees(rows))).toBe(JSON.stringify(trees(rows)));
  });
});

describe('nắn bản phác — chỗ mô hình vẽ lệch (đo trên lượt 58d9ff66)', () => {
  it('phòng khép kín vẽ lọt giữa phòng mẹ: thành dải áp một cạnh, không mất phòng nào', () => {
    const result = trees(['a a a a', 'a w w a', 'a a a a', 'b b b b'], {}, ['a', 'w', 'b'], {
      ensuiteOf: (id) => (id === 'w' ? 'a' : null),
    });
    expect(result.issues).toEqual([]);
    expect(result.notes.map((note) => note.code)).toContain('sketch_island');
    const ids = leaves(result.trees[0]!.placed)
      .map((leaf) => leaf.id)
      .sort();
    expect(ids).toEqual(['a', 'b', 'w']);
    const wc = rectOf(result.trees[0]!.placed, 'w')!;
    const host = rectOf(result.trees[0]!.placed, 'a')!;
    // Dải chạy suốt một cạnh phòng mẹ, nên hai phòng chung trọn một vách.
    const sameWidth = wc.x1 - wc.x0 === host.x1 - host.x0;
    const sameHeight = wc.y1 - wc.y0 === host.y1 - host.y0;
    expect(sameWidth || sameHeight).toBe(true);
  });

  it('phòng KHÔNG khép kín vẽ lọt giữa phòng khác: báo lỗi cho mô hình sửa, không tự đặt lại', () => {
    const result = trees(['a a a a', 'a s s a', 'a a a a', 'b b b b'], {}, ['a', 's', 'b']);
    expect(result.trees).toEqual([]);
    expect(result.issues[0]).toMatchObject({ code: 'sketch_island_room' });
    expect(result.issues[0]!.message).toMatch(/"s" lọt hẳn trong "a"/);
  });

  it('phòng lồi một ô: ăn trọn khung bao khi phòng bên cạnh vẫn vuông', () => {
    const result = trees(['a a b b', 'c c b b', 'c c b b'], {}, ['a', 'b', 'c']);
    expect(result.issues).toEqual([]);
    const b = rectOf(result.trees[0]!.placed, 'b')!;
    expect(b.y0).toBe(0);
  });

  it('cạnh nhỏ nhất của từng phòng được giữ khi căn vách', () => {
    const result = trees(['a b b b', 'a b b b'], {}, ['a', 'b'], {
      minExtent: (id, axis) => (id === 'a' && axis === 'x' ? 400 : 100),
    });
    const a = rectOf(result.trees[0]!.placed, 'a')!;
    expect(a.x1 - a.x0).toBeGreaterThanOrEqual(400);
  });

  it('phòng hụt sàn đầu bài: dời vách cục bộ cho đủ, không bỏ cây', () => {
    const result = trees(['a b b b', 'a b b b'], {}, ['a', 'b'], {
      // a cần 40 m² theo tim tường; vẽ chỉ 2,5 × 8 m.
      needArea: (id) => (id === 'a' ? 400_000 : 0),
    });
    expect(result.issues).toEqual([]);
    const a = rectOf(result.trees[0]!.placed, 'a')!;
    expect((a.x1 - a.x0) * (a.y1 - a.y0)).toBeGreaterThanOrEqual(400_000);
  });

  it('ép một phòng về đúng ô mốc tầng dưới: ô cũ trả cho phòng kề', () => {
    const sketch = prepare(['a a b b', 'a a b b', 'c c c c', 'c c c c'])!;
    expect(forceSketchRect(sketch, 'b', { x0: 0, y0: 0, x1: 500, y1: 400 })).toBe(true);
    expect(sketch.grid.cells[0]!.slice(0, 2)).toEqual(['b', 'b']);
    expect(sketch.grid.cells.flat().includes(null)).toBe(false);
  });
});

/**
 * Ép khu vệ sinh tầng trên về ô khu vệ sinh tầng dưới (Q-B, 18/09/2026). Bản phác ở đây là bản SAO —
 * bên gọi cho cả bản gốc lẫn bản ép cùng đi qua cổng rồi chọn theo điểm, nên ba điều kiện dưới đây
 * không bao giờ làm mất một phương án; chúng chỉ giữ cho bản ép không hỏng ngay từ lưới ô.
 */
describe('stackWetRooms — khu vệ sinh tầng trên chồng tầng dưới', () => {
  // Khối 10 × 8 m, lưới 4 × 4 nên mỗi ô 2,5 × 2 m. Khu vệ sinh tầng dưới ở góc trên-trái.
  const BELOW: Rect = { x0: 0, y0: 0, x1: 250, y1: 200 };
  const base = (extra: Partial<WetStackInput> = {}): WetStackInput => ({
    below: [BELOW],
    wet: ['w'],
    parentOf: () => null,
    areaFloor: () => null,
    wallCm: 10,
    ...extra,
  });

  it('kéo khu vệ sinh chung về đúng ô tầng dưới, ô cũ trả cho phòng kề', () => {
    const sketch = prepare(['a a a w', 'a a a w', 'b b b b', 'b b b b'])!;
    const copy = copySketch(sketch);
    expect(stackWetRooms(copy, base())).toEqual(['w']);
    expect(copy.grid.cells[0]![0]).toBe('w');
    expect(copy.grid.cells.flat().includes(null)).toBe(false);
    // Bản gốc không đổi: bên gọi còn phải dựng cây từ nó.
    expect(sketch.grid.cells[0]![0]).toBe('a');
  });

  it('phòng khép kín không rời phòng mẹ', () => {
    const sketch = prepare(['a a a w', 'a a a w', 'b b b b', 'b b b b'])!;
    // Phòng mẹ là `b`, nằm nửa dưới — ô mốc ở góc trên-trái không chung vách với nó.
    expect(stackWetRooms(sketch, base({ parentOf: (id) => (id === 'w' ? 'b' : null) }))).toEqual(
      [],
    );
  });

  it('không lấy hết ô của một phòng khác', () => {
    // `c` chỉ có đúng ô mốc; ép `w` vào đó là xoá hẳn `c` khỏi tầng.
    const sketch = prepare(['c a a w', 'a a a w', 'b b b b', 'b b b b'])!;
    expect(stackWetRooms(sketch, base())).toEqual([]);
  });

  it('không đẩy phòng xuống dưới sàn đầu bài khai', () => {
    const sketch = prepare(['a a a w', 'a a a w', 'b b b b', 'b b b b'])!;
    // Ô mốc 2,5 × 2 m, trừ tường còn ~4,6 m² — dưới mức 8 m² đầu bài khai.
    expect(stackWetRooms(sketch, base({ areaFloor: () => 8 }))).toEqual([]);
  });

  it('đã chồng sẵn thì không đổi gì', () => {
    const sketch = prepare(['w a a a', 'a a a a', 'b b b b', 'b b b b'])!;
    expect(stackWetRooms(sketch, base())).toEqual([]);
  });
});

describe('growSketchRoom (T79) — nới phòng hụt ô thêm một dải lấy của phòng kề', () => {
  const rows = ['a a b b b', 'a a b b b', 'c c d d d', 'c c d d d'];

  it('lấy trọn một cột của phòng kề cùng hàng; phòng kề vẫn là chữ nhật', () => {
    const grown = growSketchRoom(prepare(rows)!, 'a', (other, remaining) =>
      other === 'b' ? remaining : null,
    );
    expect(grown).toMatchObject({ from: 'b', cells: 2 });
    expect(grown!.sketch.grid.cells.slice(0, 2).map((row) => row.join(' '))).toEqual([
      'a a a b b',
      'a a a b b',
    ]);
  });

  it('nhiều dải lấy được thì chọn phòng còn dư nhiều nhất', () => {
    // `d` có thể lấy hàng 2 của `b` (còn 3 ô) hay cột 2 của `c` (còn 2 ô).
    const grown = growSketchRoom(prepare(rows)!, 'd', (_other, remaining) => remaining);
    expect(grown).toMatchObject({ from: 'b', cells: 3 });
  });

  it('không lấy khi dải không phải trọn hàng / cột của phòng kề, hay phòng kề chỉ còn một dải', () => {
    // `a` lấy hàng 2 phải lấy của cả `c` lẫn `d`; `b` chỉ rộng một cột — không dải nào lấy được.
    const skew = ['a a a b', 'a a a b', 'c c d d', 'c c d d'];
    expect(growSketchRoom(prepare(skew)!, 'a', (_o, r) => r)).toBeNull();
    // `e` chỉ rộng một cột: cho đi là biến mất.
    const thin = ['a a e', 'a a e', 'a a e', 'a a e'];
    expect(growSketchRoom(prepare(thin)!, 'a', (_o, r) => r)).toBeNull();
    // Phòng kề bị chặn (ô lõi, hành lang, sẽ hụt) thì không có dải nào.
    expect(growSketchRoom(prepare(rows)!, 'a', () => null)).toBeNull();
    // Bản gốc không bị đụng.
    const base = prepare(rows)!;
    growSketchRoom(base, 'a', (_o, r) => r);
    expect(base.grid.cells[0]!.join(' ')).toBe('a a b b b');
  });
});
