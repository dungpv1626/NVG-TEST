/**
 * Bộ giải dải (T116, handoff v6 B3): dựng lại mặt bằng thật từ dải viết tay, lệch ≤ 30 cm; thang tầng trên chồng
 * đúng thang tầng 1; không khả thi thì báo số thiếu, không bóp méo. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */
import { describe, expect, it } from 'vitest';
import { chooseBandDoors, sharedEdge } from '../ai/bands/doors';
import { rebuildStorey } from '../ai/bands/rebuild';
import { stairAnchorOf } from '../ai/tree/index';
import { solveBands, type BandRoom, type BandSolveInput, type Rect } from '../ai/bands/solve';

/** Tầng 3 nhà MR Dương (oracle, `ai-oracle-fixtures.ts`), cm, y = 0 ở mặt tiền. */
const ORACLE: Record<string, [string, Rect]> = {
  master_bedroom_1: ['master_bedroom', { x0: 156, y0: 0, x1: 478, y1: 520 }],
  closet_1: ['closet', { x0: 0, y0: 0, x1: 156, y1: 122 }],
  wc_2: ['wc', { x0: 0, y0: 122, x1: 156, y1: 327 }],
  circulation_2: ['circulation', { x0: 0, y0: 327, x1: 156, y1: 520 }],
  bedroom_2: ['bedroom', { x0: 122, y0: 520, x1: 478, y1: 800 }],
  bedroom_1: ['bedroom', { x0: 122, y0: 800, x1: 478, y1: 1075 }],
  circulation_3: ['circulation', { x0: 122, y0: 1075, x1: 238, y1: 1227 }],
  wc_1: ['wc', { x0: 238, y0: 1075, x1: 478, y1: 1227 }],
  circulation_4: ['circulation', { x0: 0, y0: 1227, x1: 211, y1: 1610 }],
};
const WALL = 20;
/**
 * Mức tối thiểu = 90 % diện tích lọt lòng của phòng thật — để phép thử kiểm HÌNH HỌC của bộ giải, không kiểm ngưỡng;
 * nhà thật luôn rộng hơn mức sàn, và bộ giải làm tròn LÊN 10 cm từng phòng.
 */
const clear = (r: Rect) => (0.9 * ((r.x1 - r.x0 - WALL) * (r.y1 - r.y0 - WALL))) / 1e4;
const rooms: BandRoom[] = [
  ...Object.entries(ORACLE).map(([id, [type, r]]) => ({ id, type, min_m2: clear(r) })),
  { id: 'circulation_1', type: 'circulation', min_m2: 0.5 },
  { id: 'circulation_1b', type: 'circulation', min_m2: 0.5 },
];

const base = (
  storeys: BandSolveInput['storeys'],
  footprint = { x0: 0, y0: 0, x1: 478, y1: 1610 },
): BandSolveInput => ({
  footprint,
  storeys,
  rooms,
  stairToken: 'THANG',
  stair: { width: 267, length: 383 },
  minSide: (type) => (type === 'circulation' ? 90 : type === 'wc' ? 110 : 100),
  usualM2: () => 8,
  wallCm: WALL,
  stepCm: 10,
});

const T3 = {
  level: 3,
  bands: [
    {
      cells: [
        { w: 156, stack: [{ id: 'closet_1' }, { id: 'wc_2' }, { id: 'circulation_2' }] },
        { id: 'master_bedroom_1' },
      ],
    },
    {
      cells: [
        { id: 'circulation_1', w: 122 },
        { stack: [{ id: 'bedroom_2' }, { id: 'bedroom_1' }] },
      ],
    },
    { cells: [{ id: 'circulation_1b', w: 122 }, { id: 'circulation_3', w: 116 }, { id: 'wc_1' }] },
    { cells: [{ id: 'circulation_4', w: 211 }, { id: 'THANG' }] },
  ],
};

describe('solveBands — dựng lại tầng 3 nhà MR Dương', () => {
  const result = solveBands(base([T3]));

  it('không lỗi, mọi phòng có chữ nhật', () => {
    expect(result.issues.map((i) => i.message)).toEqual([]);
    expect(result.storeys).toHaveLength(1);
  });

  it('mỗi phòng lệch bản vẽ thật ≤ 30 cm mỗi cạnh', () => {
    const rects = result.storeys[0]!.rects;
    for (const [id, [, real]] of Object.entries(ORACLE)) {
      const got = rects.get(id)!;
      for (const key of ['x0', 'y0', 'x1', 'y1'] as const) {
        expect(
          Math.abs(got[key] - real[key]),
          `${id}.${key}: ${got[key]} so với ${real[key]}`,
        ).toBeLessThanOrEqual(30);
      }
    }
  });

  it('cây lát kín khối nhà: tổng diện tích lá = diện tích khối', () => {
    const rects = [...result.storeys[0]!.rects.values()];
    const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
    expect(area).toBe(478 * 1610);
  });

  it('ô thang tầng 1 thành mốc; tất định', () => {
    expect(result.stairRect).toEqual(result.storeys[0]!.rects.get('thang_3'));
    expect(solveBands(base([T3])).storeys[0]!.tree).toEqual(result.storeys[0]!.tree);
  });
});

describe('solveBands — liên tầng và không khả thi', () => {
  const ground = {
    level: 1,
    bands: [
      { cells: [{ id: 'bedroom_2' }] },
      { cells: [{ id: 'circulation_4', w: 211 }, { id: 'THANG' }] },
    ],
  };
  const upper = {
    level: 2,
    bands: [
      { cells: [{ id: 'bedroom_1' }] },
      { cells: [{ id: 'THANG' }, { id: 'circulation_3' }] },
    ],
  };

  it('tầng trên: ô thang chồng ĐÚNG toạ độ tầng 1, dù mô hình đổi thứ tự ô trong dải', () => {
    const r = solveBands(base([ground, upper]));
    expect(r.issues).toEqual([]);
    expect(r.storeys[1]!.rects.get('thang_2')).toEqual(r.storeys[0]!.rects.get('thang_1'));
  });

  it('dải trước thang ở tầng trên sâu hơn chỗ tầng 1 để lại → lỗi cấu trúc có số thiếu', () => {
    const tall = {
      level: 2,
      bands: [
        { cells: [{ id: 'bedroom_1' }] },
        { cells: [{ id: 'master_bedroom_1' }] },
        { cells: [{ id: 'wc_1' }] },
        { cells: [{ id: 'circulation_3' }, { id: 'THANG' }] },
      ],
    };
    const r = solveBands(base([ground, tall], { x0: 0, y0: 0, x1: 478, y1: 900 }));
    const codes = r.issues.map((i) => i.code);
    expect(codes).toContain('band_before_stair_too_deep');
    expect(r.issues.find((i) => i.code === 'band_before_stair_too_deep')!.shortCm).toBeGreaterThan(
      0,
    );
  });

  it('các dải cần sâu hơn khối nhà → `band_too_deep`, không bóp méo phòng', () => {
    const r = solveBands(base([T3], { x0: 0, y0: 0, x1: 478, y1: 1200 }));
    expect(r.issues.map((i) => i.code)).toEqual(['band_too_deep']);
    expect(r.storeys).toEqual([]);
  });

  it('mã lạ, mã trùng, thiếu thang', () => {
    const bad = {
      level: 1,
      bands: [{ cells: [{ id: 'phong_la' }, { id: 'wc_1' }, { id: 'wc_1' }] }],
    };
    const codes = solveBands(base([bad]))
      .issues.map((i) => i.code)
      .sort();
    expect(codes).toEqual(['band_room_twice', 'band_stair_missing', 'band_unknown_room']);
  });
});

describe('chooseBandDoors', () => {
  const solved = solveBands(base([T3]));
  const r = solved.storeys[0] ?? { rects: new Map() };
  const types = Object.fromEntries([
    ...Object.entries(ORACLE).map(([id, [t]]) => [id, t]),
    ['circulation_1', 'circulation'],
    ['circulation_1b', 'circulation'],
    ['thang_3', 'stair'],
  ]);
  const doors = chooseBandDoors({
    level: 3,
    rects: r.rects,
    typeOf: (id) => types[id] ?? '',
    parentOf: (id) => (id === 'wc_2' || id === 'closet_1' ? 'master_bedroom_1' : null),
    through: new Set(['circulation', 'stair', 'living', 'dining', 'kitchen']),
    doorWallCm: 90,
    prefer: [],
    entryRoom: null,
    garageRoom: null,
  });
  const has = (a: string, b: string) =>
    doors.some((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));

  it('phòng khép kín mở vào phòng mẹ; phòng ngủ mở ra hành lang; hành lang nối thang', () => {
    expect(has('wc_2', 'master_bedroom_1')).toBe(true);
    expect(has('bedroom_1', 'circulation_1')).toBe(true);
    expect(has('bedroom_2', 'circulation_1')).toBe(true);
    expect(has('circulation_1b', 'circulation_4')).toBe(true);
    expect(has('circulation_4', 'thang_3')).toBe(true);
  });

  it('sharedEdge: cạnh chung của hai ô kề nhau, 0 khi chỉ chạm góc', () => {
    expect(sharedEdge({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 2, x1: 20, y1: 8 })).toBe(6);
    expect(sharedEdge({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 10, x1: 20, y1: 20 })).toBe(
      0,
    );
  });
});

describe('solveBands — hành lang rộng quá mức thông thuỷ (T104, lượt thật 03718834)', () => {
  const kitchenRooms: BandRoom[] = [
    { id: 'gt_1', type: 'circulation', min_m2: null },
    { id: 'kitchen_1', type: 'kitchen', min_m2: 6 },
    { id: 'dining_1', type: 'dining', min_m2: 8 },
  ];
  const storey = {
    level: 1,
    bands: [
      {
        cells: [
          { id: 'gt_1', w: 150 },
          { id: 'kitchen_1', w: 150 },
          { id: 'dining_1', w: 200 },
        ],
      },
    ],
  };
  const solve = (corridorClearCm?: number) =>
    solveBands({
      ...base([storey], { x0: 0, y0: 0, x1: 500, y1: 600 }),
      rooms: kitchenRooms,
      stair: null,
      // Cạnh tối thiểu là lọt lòng: phòng ăn ở mép khối cần 190 + 22 + 5,5 cm theo tim tường.
      minSide: (type) => (type === 'dining' ? 190 : type === 'kitchen' ? 150 : 90),
      walls: { exterior: 22, partition: 11 },
      clearWidthTypes: new Set(['circulation']),
      areaFree: new Set(['circulation']),
      ...(corridorClearCm ? { corridorClearCm } : {}),
    });

  it('không khai mức thông thuỷ → phòng ăn thiếu bề ngang (hành vi cũ)', () => {
    expect(solve().issues.map((i) => i.code)).toContain('band_cell_too_narrow');
  });

  it('hành lang 150 cm thu về 90 cm, phòng ăn nhận phần nhả ra; có ghi chú tự sửa', () => {
    const r = solve(90);
    expect(r.issues).toEqual([]);
    const rects = r.storeys[0]!.rects;
    const w = (id: string) => rects.get(id)!.x1 - rects.get(id)!.x0;
    expect(w('gt_1')).toBeLessThan(150);
    expect(w('dining_1')).toBeGreaterThanOrEqual(190 + 22 + 5.5);
    expect(r.fixes.join(' ')).toMatch(/gt_1.*thu hẹp/);
  });
});

describe('solveBands — số mô hình ghi chỉ là gợi ý (lượt thật 619f0438)', () => {
  const rooms3: BandRoom[] = [
    { id: 'kho_1', type: 'storage', min_m2: 2 },
    { id: 'kitchen_1', type: 'kitchen', min_m2: 9 },
    { id: 'dining_1', type: 'dining', min_m2: 12 },
  ];
  const run = (depth: number) =>
    solveBands({
      ...base(
        [
          {
            level: 1,
            bands: [{ depth, cells: [{ id: 'kho_1' }, { id: 'kitchen_1' }, { id: 'dining_1' }] }],
          },
        ],
        { x0: 0, y0: 0, x1: 500, y1: 1000 },
      ),
      rooms: rooms3,
      stair: null,
      minSide: (type) => (type === 'storage' ? 110 : type === 'dining' ? 150 : 100),
    });

  it('bề ngang chia theo diện tích nhưng không ô nào dưới cạnh tối thiểu (kho từng thiếu 10 cm)', () => {
    const r = run(0);
    expect(r.issues).toEqual([]);
    const kho = r.storeys[0]!.rects.get('kho_1')!;
    expect(kho.x1 - kho.x0).toBeGreaterThanOrEqual(110);
  });

  it('chiều sâu dải mô hình ghi là mức sàn: ghi 200 cm mà ô cần sâu hơn thì lấy mức cần', () => {
    const r = run(200);
    expect(r.issues).toEqual([]);
    const dining = r.storeys[0]!.rects.get('dining_1')!;
    const w = dining.x1 - dining.x0 - WALL;
    expect((w * (dining.y1 - dining.y0 - WALL)) / 1e4).toBeGreaterThanOrEqual(12);
  });
});

describe('solveBands — ô thiếu bề ngang mượn ô cùng dải (lượt thật 36fb8000)', () => {
  const rooms4: BandRoom[] = [
    { id: 'wc_3', type: 'wc', min_m2: null },
    { id: 'laundry_1', type: 'laundry', min_m2: null },
    { id: 'gt_4', type: 'circulation', min_m2: null },
    { id: 'altar_room_1', type: 'altar_room', min_m2: null },
  ];
  const run = (altarW: number) =>
    solveBands({
      ...base(
        [
          {
            level: 1,
            bands: [
              {
                depth: 460,
                cells: [
                  {
                    w: 90,
                    stack: [
                      { id: 'wc_3', d: 200 },
                      { id: 'laundry_1', d: 260 },
                    ],
                  },
                  { id: 'gt_4', w: 90 },
                  { id: 'altar_room_1', w: altarW },
                ],
              },
            ],
          },
        ],
        { x0: 0, y0: 0, x1: 90 + 90 + altarW, y1: 460 },
      ),
      rooms: rooms4,
      stair: null,
      minSide: (type) => (type === 'laundry' ? 100 : type === 'altar_room' ? 200 : 90),
      areaFree: new Set(['circulation']),
    });

  it('giặt thiếu 10 cm lấy từ phòng thờ còn dư; hành lang giữ nguyên; có ghi chú tự sửa', () => {
    const r = run(320);
    expect(r.issues).toEqual([]);
    const rects = r.storeys[0]!.rects;
    const w = (id: string) => rects.get(id)!.x1 - rects.get(id)!.x0;
    expect(w('laundry_1')).toBe(100);
    expect(w('gt_4')).toBe(90);
    expect(w('altar_room_1')).toBe(310);
    expect(r.fixes.join(' ')).toMatch(/laundry_1.*altar_room_1/);
  });

  it('ô cùng dải không còn dư trên cạnh tối thiểu → vẫn báo thiếu bề ngang', () => {
    expect(run(200).issues.map((i) => i.code)).toContain('band_cell_too_narrow');
  });
});

describe('bộ giải / chọn cửa — các chỗ đo lệch lộ ra khi dựng lại tầng 1 (phát lại 93d212a2)', () => {
  it('cạnh tối thiểu là LỌT LÒNG: hai ô 225 cm theo tim tường, cần 200 cm lọt lòng → thiếu (không tường thì đủ)', () => {
    const run = (walls?: { exterior: number; partition: number }) =>
      solveBands({
        ...base([{ level: 1, bands: [{ cells: [{ id: 'a_1' }, { id: 'b_1' }] }] }], {
          x0: 0,
          y0: 0,
          x1: 450,
          y1: 600,
        }),
        rooms: [
          { id: 'a_1', type: 'bedroom', min_m2: null },
          { id: 'b_1', type: 'bedroom', min_m2: null },
        ],
        stair: null,
        minSide: () => 200,
        ...(walls ? { walls } : {}),
      });
    expect(run().issues).toEqual([]);
    expect(run({ exterior: 22, partition: 11 }).issues.map((i) => i.code)).toContain(
      'band_cell_too_narrow',
    );
  });

  it('tầng trên: dải thang sâu hơn ô thang tầng 1 → ô thang giữ đúng chiều dài, phần dư thành sảnh', () => {
    const r = solveBands({
      ...base(
        [
          {
            level: 1,
            bands: [
              { cells: [{ id: 'garage_1' }] },
              { cells: [{ id: 'dining_1' }, { id: 'THANG' }] },
              { cells: [{ id: 'kitchen_1' }] },
            ],
          },
          {
            level: 2,
            bands: [
              { cells: [{ id: 'bed_1' }] },
              {
                cells: [
                  {
                    stack: [
                      { id: 'wc_a', d: 250 },
                      { id: 'laundry_a', d: 250 },
                    ],
                  },
                  { id: 'THANG' },
                ],
              },
              { cells: [{ id: 'bed_2' }] },
            ],
          },
        ],
        { x0: 0, y0: 0, x1: 500, y1: 1600 },
      ),
      rooms: [
        { id: 'garage_1', type: 'garage', min_m2: 14 },
        { id: 'dining_1', type: 'dining', min_m2: 8 },
        { id: 'kitchen_1', type: 'kitchen', min_m2: 8 },
        { id: 'bed_1', type: 'bedroom', min_m2: 10 },
        { id: 'bed_2', type: 'bedroom', min_m2: 10 },
        { id: 'wc_a', type: 'wc', min_m2: null },
        { id: 'laundry_a', type: 'laundry', min_m2: null },
      ],
      stair: { width: 250, length: 400 },
      landingId: (level) => `gt_s${level}`,
    });
    expect(r.issues).toEqual([]);
    const at = (level: number, id: string) =>
      r.storeys.find((s) => s.level === level)!.rects.get(id)!;
    expect(at(2, 'thang_2')).toEqual(at(1, 'thang_1'));
    const landing = at(2, 'gt_s2');
    expect(landing.y0).toBe(at(2, 'thang_2').y1);
    expect(landing.x0).toBe(at(2, 'thang_2').x0);
    expect(r.fixes.join(' ')).toMatch(/gt_s2/);
  });

  const doorsOf = (rects: Map<string, Rect>, types: Record<string, string>, extra = {}) =>
    chooseBandDoors({
      level: 2,
      rects,
      typeOf: (id) => types[id] ?? '',
      parentOf: () => null,
      through: new Set(['circulation', 'stair', 'garage', 'dining']),
      doorWallCm: 90,
      prefer: [],
      entryRoom: null,
      garageRoom: null,
      ...extra,
    });
  const has = (doors: { a: string; b: string }[], a: string, b: string) =>
    doors.some((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));

  it('ô thang chỉ mở ra loại trong stairOpensTo: gara kề ô thang không có ô thông sang thang', () => {
    const rects = new Map<string, Rect>([
      ['garage_1', { x0: 0, y0: 0, x1: 500, y1: 460 }],
      ['dining_1', { x0: 0, y0: 460, x1: 250, y1: 874 }],
      ['thang_2', { x0: 250, y0: 460, x1: 500, y1: 874 }],
    ]);
    const types = { garage_1: 'garage', dining_1: 'dining', thang_2: 'stair' };
    const doors = doorsOf(rects, types, {
      stairOpensTo: new Set(['circulation', 'dining']),
      stairTypes: new Set(['stair']),
    });
    expect(has(doors, 'garage_1', 'thang_2')).toBe(false);
    expect(has(doors, 'dining_1', 'thang_2')).toBe(true);
    expect(has(doors, 'garage_1', 'dining_1')).toBe(true);
  });

  it('cửa ở ĐẦU hành lang 90 cm thông thuỷ: trừ nửa vách mỗi đầu trong nhà thì đủ, trừ 28 cm mọi vách thì không', () => {
    const rects = new Map<string, Rect>([
      ['bed_1', { x0: 0, y0: 0, x1: 500, y1: 400 }],
      ['gt_1', { x0: 150, y0: 400, x1: 251, y1: 1000 }],
      ['bed_2', { x0: 0, y0: 400, x1: 150, y1: 1000 }],
      ['bed_3', { x0: 251, y0: 400, x1: 500, y1: 1000 }],
    ]);
    const types = { bed_1: 'bedroom', bed_2: 'bedroom', bed_3: 'bedroom', gt_1: 'circulation' };
    const perEnd = doorsOf(rects, types, {
      walls: { footprint: { x0: 0, y0: 0, x1: 500, y1: 1000 }, exterior: 22, partition: 11 },
    });
    expect(has(perEnd, 'bed_1', 'gt_1')).toBe(true);
    expect(has(doorsOf(rects, types, { wallAllowanceCm: 28 }), 'bed_1', 'gt_1')).toBe(false);
  });
});

describe('rebuildStorey — dựng lại dải tầng 1 từ cùng các phòng (hướng (a))', () => {
  const storey = {
    level: '1',
    bands: [
      { depth: 0, cells: [{ id: 'garage_1', w: 0, stack: [] }] },
      { depth: 0, cells: [{ id: 'living_1', w: 0, stack: [] }] },
      {
        depth: 0,
        cells: [
          { id: 'gt_1', w: 900, stack: [] },
          { id: 'THANG', w: 0, stack: [] },
        ],
      },
      { depth: 0, cells: [{ id: 'kitchen_1', w: 0, stack: [] }] },
      { depth: 0, cells: [{ id: 'dining_1', w: 0, stack: [] }] },
      { depth: 0, cells: [{ id: 'wc_1', w: 0, stack: [] }] },
    ],
  };
  const types: Record<string, string> = {
    garage_1: 'garage',
    living_1: 'living',
    gt_1: 'circulation',
    kitchen_1: 'kitchen',
    dining_1: 'dining',
    wc_1: 'wc',
  };
  const input = (attempt: (s: typeof storey) => number | null) => ({
    storey,
    typeOf: (id: string) => types[id] ?? (id.startsWith('gt_') ? 'circulation' : null),
    needM2: (id: string) =>
      ({ garage_1: 14, living_1: 14, kitchen_1: 6, dining_1: 8, wc_1: 2.5 })[id] ?? 0,
    minSideCm: (type: string) =>
      ({ garage: 260, living: 300, kitchen: 150, dining: 220, wc: 110 })[type] ?? 90,
    stair: { width: 250, length: 414 },
    stairToken: 'THANG',
    widthCm: 500,
    depthCm: 1650,
    wallCm: 28,
    corridorClearCm: 90,
    corridorId: 'gt_r1',
    entryRoom: 'garage_1',
    attempt: attempt as never,
  });

  it('cách đầu tiên: dải lối vào đứng đầu, ô thang giữ phía phải như mô hình, hành lang mô hình bỏ, mỗi phòng đúng một lần', () => {
    const r = rebuildStorey(input(() => 0))!;
    expect(r.bands[0]).toContain('garage_1');
    const stairBand = r.bands.find((ids) => ids.includes('THANG'))!;
    expect(stairBand.at(-1)).toBe('THANG');
    const ids = r.bands.flat();
    expect(ids).not.toContain('gt_1');
    for (const id of ['garage_1', 'living_1', 'kitchen_1', 'dining_1', 'wc_1'])
      expect(ids.filter((x) => x === id)).toHaveLength(1);
    // Ghép phòng cạnh nhau: ít dải hơn mỗi phòng một dải.
    expect(r.bands.length).toBeLessThan(6);
    expect(r.penalty).toBe(0);
  });

  it('lấy cách phạt ít nhất; mọi cách bị loại → null', () => {
    let n = 0;
    const r = rebuildStorey(input(() => ((n += 1) === 3 ? 1 : 5)))!;
    expect(r.penalty).toBe(1);
    expect(rebuildStorey(input(() => null))).toBeNull();
  });
});

describe('WC gầm thang (T116 — Haan: «với nhà ống có thể tận dụng gầm cầu thang làm nhà vệ sinh nhỏ»)', () => {
  const rooms2: BandRoom[] = [
    { id: 'garage_1', type: 'garage', min_m2: 12 },
    { id: 'wc_1', type: 'wc', min_m2: null },
    { id: 'dining_1', type: 'dining', min_m2: 8 },
    { id: 'kitchen_1', type: 'kitchen', min_m2: 6 },
    { id: 'bed_1', type: 'bedroom', min_m2: 9 },
    { id: 'gt_2', type: 'circulation', min_m2: null },
    { id: 'bed_2', type: 'bedroom', min_m2: 9 },
  ];
  const run = (underStairCm?: number) =>
    solveBands({
      ...base(
        [
          {
            level: 1,
            bands: [
              { cells: [{ id: 'garage_1' }] },
              {
                cells: [
                  {
                    stack: [
                      { id: 'THANG', d: 0 },
                      { id: 'wc_1', d: 0 },
                    ],
                  },
                  { id: 'dining_1' },
                ],
              },
              { cells: [{ id: 'kitchen_1' }] },
            ],
          },
          {
            level: 2,
            bands: [
              { cells: [{ id: 'bed_1' }] },
              { cells: [{ id: 'THANG' }, { id: 'gt_2' }] },
              { cells: [{ id: 'bed_2' }] },
            ],
          },
        ],
        { x0: 0, y0: 0, x1: 400, y1: 1600 },
      ),
      rooms: rooms2,
      stair: { width: 120, length: 620 },
      minSide: (type) =>
        type === 'circulation' || type === 'wc' ? 90 : type === 'stair' ? 100 : 200,
      areaFree: new Set(['circulation']),
      ...(underStairCm ? { underStairCm } : {}),
    });

  it('tầng 1: phần thang dài stair.length − gầm, WC nằm dưới đầu cao; chiều lên hướng về WC; ô thang ghi `over`', () => {
    const r = run(160);
    expect(r.issues).toEqual([]);
    const s1 = r.storeys.find((s) => s.level === 1)!;
    const stair = s1.rects.get('thang_1')!;
    const wc = s1.rects.get('wc_1')!;
    expect(stair.y1 - stair.y0).toBe(620 - 160);
    expect(wc.y0).toBe(stair.y1);
    expect(wc.x0).toBe(stair.x0);
    expect(s1.tree.stair).toEqual({ room: 'thang_1', up: '+y', over: 'wc_1' });
    // Tầng 2 chồng trọn ô gộp (thang + gầm), không chỉ phần thang.
    const s2 = r.storeys.find((s) => s.level === 2)!.rects.get('thang_2')!;
    expect([s2.x0, s2.y0, s2.x1]).toEqual([stair.x0, stair.y0, stair.x1]);
    expect(s2.y1).toBeGreaterThanOrEqual(wc.y1);
  });

  it('không cho gầm thang (loại thang khác) → ô chồng là thang đủ dài + phòng, không có `over`', () => {
    const r = run();
    const s1 = r.storeys.find((s) => s.level === 1);
    expect(s1?.tree.stair?.over).toBeUndefined();
  });

  it('mốc tầng trên của cổng cây gộp ô thang và ô gầm thang', () => {
    const cells = [
      { id: 'thang_1', rect: { x0: 0, y0: 100, x1: 120, y1: 560 } },
      { id: 'wc_1', rect: { x0: 0, y0: 560, x1: 120, y1: 720 } },
    ];
    expect(stairAnchorOf(cells, 'thang_1', 'wc_1')).toEqual({ x0: 0, y0: 100, x1: 120, y1: 720 });
    expect(stairAnchorOf(cells, 'thang_1', null)).toEqual(cells[0]!.rect);
  });
});

describe('giếng trời trong ô xếp chồng thẳng mọi tầng (lượt thật df9da65a, T116 tiếp 12)', () => {
  // Hai tầng, dải thang [THANG | phòng / giếng trời]. Phòng phía trước tầng 2 cần sâu hơn tầng 1 (kho 2 m² vs WC 1 m²;
  // bồn nước mái 2,1 m trong lượt thật) — chia theo diện tích từng tầng thì giếng mỗi tầng một đoạn.
  const wellRooms: BandRoom[] = [
    { id: 'living_1', type: 'living', min_m2: 12 },
    { id: 'wc_1', type: 'wc', min_m2: 1 },
    { id: 'big_2', type: 'storage', min_m2: 4 },
    { id: 'small_2', type: 'storage', min_m2: 1 },
    { id: 'light_well_1', type: 'light_well', min_m2: null },
    { id: 'light_well_1_t2', type: 'light_well', min_m2: null },
    { id: 'bed_2', type: 'bedroom', min_m2: 12 },
  ];
  const wellInput = (front2: string): BandSolveInput => ({
    footprint: { x0: 0, y0: 0, x1: 500, y1: 1000 },
    rooms: wellRooms,
    stairToken: 'THANG',
    stair: { width: 250, length: 414 },
    minSide: () => 100,
    usualM2: () => 8,
    areaFree: new Set(['light_well']),
    wallCm: WALL,
    stepCm: 10,
    storeys: [
      {
        level: 1,
        bands: [
          { cells: [{ id: 'living_1' }] },
          { cells: [{ id: 'THANG' }, { stack: [{ id: 'wc_1' }, { id: 'light_well_1' }] }] },
        ],
      },
      {
        level: 2,
        bands: [
          { cells: [{ id: 'bed_2' }] },
          { cells: [{ id: 'THANG' }, { stack: [{ id: front2 }, { id: 'light_well_1_t2' }] }] },
        ],
      },
    ],
  });
  const wells = (front2: string) => {
    const result = solveBands(wellInput(front2));
    expect(result.issues.map((i) => i.message)).toEqual([]);
    return result.storeys.map((s) => [...s.rects].find(([id]) => id.startsWith('light_well'))![1]);
  };
  it('phòng trước tầng 2 nhỏ hơn: giếng tầng 2 neo đúng đoạn giếng tầng 1', () => {
    const [w1, w2] = wells('small_2');
    expect(w2).toEqual(w1);
  });
  it('phòng trước tầng 2 sâu hơn: dựng lại với đoạn chung — hai giếng trùng nhau', () => {
    const [w1, w2] = wells('big_2');
    expect(w2).toEqual(w1);
  });
});

describe('dải giếng trời giữa nhà: tầng 1 chừa chỗ trước giếng cho tầng trên (mẫu C, handoff đợt 3)', () => {
  // Tầng 1 dư chiều sâu; tầng 2 có phòng ngủ sâu trước dải giếng. Phần dư tầng 1 phải dồn lên TRƯỚC giếng, không vào dải
  // giếng — giếng tầng 2 neo theo giếng tầng 1 nên mép trước giếng tầng 1 là chỗ tầng 2 có trước giếng.
  const rooms: BandRoom[] = [
    { id: 'living_1', type: 'living', min_m2: 12 },
    { id: 'wc_1', type: 'wc', min_m2: 2 },
    { id: 'light_well_1', type: 'light_well', min_m2: null },
    { id: 'light_well_1_t2', type: 'light_well', min_m2: null },
    { id: 'bed_2', type: 'bedroom', min_m2: 40 },
    { id: 'gt_2', type: 'corridor', min_m2: null },
  ];
  const input: BandSolveInput = {
    footprint: { x0: 0, y0: 0, x1: 500, y1: 1600 },
    rooms,
    stairToken: 'THANG',
    stair: { width: 250, length: 414 },
    minSide: () => 100,
    usualM2: () => 8,
    areaFree: new Set(['light_well', 'corridor']),
    wallCm: WALL,
    stepCm: 10,
    storeys: [
      {
        level: 1,
        bands: [
          { cells: [{ id: 'living_1' }] },
          { cells: [{ id: 'light_well_1', w: 1200 }, { id: 'wc_1' }] },
          { cells: [{ id: 'THANG' }] },
        ],
      },
      {
        level: 2,
        bands: [
          { cells: [{ id: 'bed_2' }] },
          { cells: [{ id: 'light_well_1_t2', w: 1200 }, { id: 'gt_2' }] },
          { cells: [{ id: 'THANG' }] },
        ],
      },
    ],
  };
  it('phòng ngủ tầng 2 sâu 8 m trước giếng: dựng được, hai giếng trùng nhau', () => {
    const result = solveBands(input);
    expect(result.issues.map((i) => i.message)).toEqual([]);
    const [w1, w2] = result.storeys.map(
      (s) => [...s.rects].find(([id]) => id.startsWith('light_well'))![1],
    );
    expect(w2).toEqual(w1);
    expect(w1!.y0).toBeGreaterThanOrEqual(800);
  });
});
