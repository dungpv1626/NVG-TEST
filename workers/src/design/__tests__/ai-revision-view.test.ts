/**
 * Vòng sửa gọn và câu nhắc đúng chỗ — tổng hợp 37 lượt thật 23–30/09/2026 (bản demo, 5/37 lượt ra mặt
 * bằng, `doc/design/PHAN_TICH_THAT_BAI_MAT_BANG.md` mục 9):
 *  · lượt sửa chỉ gửi tầng chưa khoá, với mã phòng ngắn — câu lượt sửa ~17.500 ký tự, gấp đôi lượt đầu;
 *  · ban công đã đúng mặt trên bản phác mà bị dời vì chương trình chia lại tầng thì không báo là lỗi mô hình.
 */
import type { AiFloorPlan } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { fromRevisionIds, revisionView, splitClashingIds } from '../ai/plan';
import { crookedSketchRooms } from '../ai/arrange';
import type { HouseIntent } from '../ai/house';
import { balconyMovedByRepartition, sketchBalconyCornerAdvice } from '../ai/plan-demands';

const room = (id: string, type: string, level: number, ensuite_of: string | null = null) => ({
  id,
  type,
  level,
  target_area_m2: 10,
  ensuite_of,
});

const HOUSE: HouseIntent = {
  variant_label: 'thử',
  rationale: 'lý do dài',
  assumptions: ['hỏi'],
  rooms: [
    room('living_1', 'living', 1),
    room('stair_1', 'stair', 1),
    room('circulation_1', 'circulation', 1),
    room('master_bedroom_1', 'master_bedroom', 2),
    room('wc_3', 'wc', 2, 'master_bedroom_1'),
    room('study_1', 'study', 2),
    room('stair_2', 'stair', 2),
    room('circulation_2', 'circulation', 2),
  ],
  relationships: [
    { a: 'living_1', b: 'circulation_1', kind: 'adjacent' },
    { a: 'master_bedroom_1', b: 'circulation_2', kind: 'adjacent' },
    { a: 'study_1', b: 'circulation_2', kind: 'adjacent' },
  ],
  sketches: [
    { level: 1, rows: ['living_1 circulation_1 stair_1'] },
    { level: 2, rows: ['master_bedroom_1 wc_3 study_1 circulation_2 stair_2'] },
  ],
  entry_room: 'living_1',
  garage_room: null,
} as HouseIntent;

describe('revisionView — lượt sửa chỉ gửi tầng chưa khoá, mã ngắn', () => {
  const hints = [
    '- Storey 2: In the sketch, "study_1" have no way in. "study_1" touches "wc_3".',
    '- Storey 1 passed every check; "living_1" keeps its door.',
  ];
  const view = revisionView(HOUSE, hints, [1]);

  it('tầng khoá không gửi: không phòng, không bản phác, không quan hệ nội tầng của nó', () => {
    expect(view.intent.rooms.every((r) => r.level === 2)).toBe(true);
    expect(view.intent.sketches?.map((s) => s.level)).toEqual([2]);
    expect(view.intent.relationships.some((rel) => rel.a === 'living_1')).toBe(false);
    expect('rationale' in view.intent).toBe(false);
  });

  it('mã ngắn đọc ra được loại, không lẫn thang với phòng làm việc; câu nhắc dùng cùng mã', () => {
    const ids = view.intent.rooms.map((r) => r.id);
    expect(ids).toEqual(['mb1', 'wc3', 'sd1', 'st2', 'co2']);
    expect(view.intent.rooms.find((r) => r.id === 'wc3')!.ensuite_of).toBe('mb1');
    expect(view.intent.sketches![0]!.rows[0]).toBe('mb1 wc3 sd1 co2 st2');
    expect(view.avoid[0]).toContain('"sd1" have no way in. "sd1" touches "wc3"');
    // Mã tầng khoá giữ nguyên chữ — câu nhắc nhắc tới nó vẫn đọc được.
    expect(view.avoid[1]).toContain('"living_1"');
    expect(view.intent.entry_room).toBe('living_1');
  });

  it('câu trả lời về lại mã thật; mã mô hình tự đặt mới giữ nguyên', () => {
    const answer = {
      ...HOUSE,
      rooms: [
        room('mb1', 'master_bedroom', 2),
        room('sd1', 'study', 2),
        room('co9', 'circulation', 2),
      ],
      relationships: [{ a: 'sd1', b: 'co9', kind: 'adjacent' as const }],
      sketches: [{ level: 2, rows: ['mb1 sd1 co9'] }],
    } as HouseIntent;
    const back = fromRevisionIds(answer, view.back);
    expect(back.rooms.map((r) => r.id)).toEqual(['master_bedroom_1', 'study_1', 'co9']);
    expect(back.relationships[0]).toMatchObject({ a: 'study_1', b: 'co9' });
    expect(back.sketches![0]!.rows[0]).toBe('master_bedroom_1 study_1 co9');
  });

  it('không tầng nào khoá (lỗi cả nhà): gửi cả nhà', () => {
    expect(revisionView(HOUSE, [], []).intent.rooms).toHaveLength(HOUSE.rooms.length);
  });
});

describe('balconyMovedByRepartition — lỗi ban công hệ quả của việc chia lại tầng', () => {
  const plan = (x0: number, y0: number, x1: number, y1: number) =>
    ({
      levels: [
        {
          level: 2,
          outline: [
            [0, 0],
            [1000, 0],
            [1000, 1500],
            [0, 1500],
          ],
          rooms: [{ id: 'balcony_1', type: 'balcony', rect: [x0, y0, x1, y1] }],
        },
      ],
    }) as unknown as AiFloorPlan;
  // Bản phác: ban công chạy dọc mép trước (dòng đầu).
  const sketches = new Map([
    [2, ['balcony_1 balcony_1 balcony_1', 'bedroom_2 bedroom_2 bedroom_2']],
  ]);
  const missingFront = { code: 'balcony_side_missing', params: { side: 'front' } };

  it('bản phác đúng mặt, chương trình dời ban công ra mặt sau → hệ quả', () => {
    expect(
      balconyMovedByRepartition(
        missingFront,
        plan(0, 1300, 600, 1500),
        'balcony',
        sketches,
        new Set([2]),
      ),
    ).toBe(true);
  });

  it('ban công còn ở mặt trước mà bị nắn thành khối góc → vẫn báo (T106; coi là hệ quả làm phát lại 14 → 12)', () => {
    expect(
      balconyMovedByRepartition(
        missingFront,
        plan(0, 0, 250, 240),
        'balcony',
        sketches,
        new Set([2]),
        1.5,
      ),
    ).toBe(false);
  });

  it('chính bản phác đã là khối góc ngắn dọc mặt trước (T106) → lỗi thật, gửi mô hình', () => {
    const corner = new Map([
      [2, ['balcony_1 bedroom_2 bedroom_2', 'balcony_1 bedroom_2 bedroom_2']],
    ]);
    expect(
      balconyMovedByRepartition(
        missingFront,
        plan(0, 0, 250, 240),
        'balcony',
        corner,
        new Set([2]),
        1.5,
      ),
    ).toBe(false);
  });

  it('tầng không bị chia lại → không phải hệ quả', () => {
    expect(
      balconyMovedByRepartition(
        missingFront,
        plan(0, 1300, 600, 1500),
        'balcony',
        sketches,
        new Set(),
      ),
    ).toBe(false);
  });
});

describe('sketchBalconyCornerAdvice — lời khuyên ban công góc trên bản phác (T107)', () => {
  const demand = {
    type: 'balcony',
    forbidden: false,
    fromLevel: 2,
    levels: [],
    sides: ['front'],
    forbiddenSides: [],
  } as unknown as Parameters<typeof sketchBalconyCornerAdvice>[0];
  const rooms = [
    { id: 'bc1', type: 'balcony', level: 2 },
    { id: 'bd', type: 'bedroom', level: 2 },
  ];

  it('ban công duy nhất ở mặt trước là khối 3 × 3 ô ở góc (lượt bea4c6fa vòng 4) → khuyên', () => {
    const sketches = new Map([
      [2, ['bc1 bc1 bc1 bd bd', 'bc1 bc1 bc1 bd bd', 'bc1 bc1 bc1 bd bd']],
    ]);
    const advice = sketchBalconyCornerAdvice(demand, rooms, sketches, 1.5);
    expect(advice.map((a) => a.code)).toEqual(['balcony_side_corner']);
    expect(advice[0]!.params).toMatchObject({ room: 'bc1', side: 'front', along: 3, across: 3 });
  });

  it('ban công dọc mép trước (5 × 1 ô, không ở góc hoặc đủ dài) → không khuyên', () => {
    const sketches = new Map([[2, ['bc1 bc1 bc1 bc1 bc1', 'bd bd bd bd bd']]]);
    expect(sketchBalconyCornerAdvice(demand, rooms, sketches, 1.5)).toEqual([]);
  });
});

describe('lượt sửa giữ cửa chính của tầng khoá (lượt thật 46d6eff3, 01/10/2026)', () => {
  const view = revisionView(HOUSE, [], [1]);
  const answer = {
    ...HOUSE,
    rooms: view.intent.rooms,
    relationships: view.intent.relationships,
    sketches: view.intent.sketches,
    entry_room: 'living_1',
    garage_room: null,
  } as HouseIntent;

  it('mô hình chép lại mã cửa chính của tầng khoá → không thành null khi đổi mã ngắn về', () => {
    expect(fromRevisionIds(answer, view.back).entry_room).toBe('living_1');
  });
});

describe('splitClashingIds — một mã khai ở hai tầng (lượt thật 46d6eff3 lời gọi 5)', () => {
  const clash = {
    ...HOUSE,
    rooms: [...HOUSE.rooms, room('co4', 'circulation', 1), room('co4', 'circulation', 2)],
    relationships: [
      ...HOUSE.relationships,
      { a: 'co4', b: 'living_1', kind: 'adjacent' },
      { a: 'study_1', b: 'co4', kind: 'adjacent' },
    ],
    sketches: [
      { level: 1, rows: ['living_1 co4 stair_1'] },
      { level: 2, rows: ['master_bedroom_1 co4 study_1 stair_2'] },
    ],
  } as HouseIntent;
  const split = splitClashingIds(clash);

  it('lần khai sau đổi sang mã trống, chỉ trong bản phác và quan hệ của tầng ấy', () => {
    const ids = split.rooms.map((r) => `${r.id}@${r.level}`);
    expect(ids).toContain('co4@1');
    expect(ids).toContain('co4_2@2');
    expect(split.sketches?.[0]?.rows).toEqual(['living_1 co4 stair_1']);
    expect(split.sketches?.[1]?.rows).toEqual(['master_bedroom_1 co4_2 study_1 stair_2']);
    expect(split.relationships).toContainEqual({ a: 'co4', b: 'living_1', kind: 'adjacent' });
    expect(split.relationships).toContainEqual({ a: 'study_1', b: 'co4_2', kind: 'adjacent' });
  });

  it('không trùng → trả nguyên', () => {
    expect(splitClashingIds(HOUSE)).toBe(HOUSE);
  });
});

describe('crookedSketchRooms — phòng không thành một chữ nhật trên bản phác của mô hình (fdd486b1)', () => {
  it('phòng ăn chữ L được nêu; phòng chữ nhật và mã lạ không', () => {
    const rows = ['bd1 bd1 dn1 dn1', 'bd1 bd1 dn1 dn1', 'wc2 wc2 wc2 dn1', 'xx xx . .'];
    expect(crookedSketchRooms(rows, new Set(['bd1', 'dn1', 'wc2']))).toEqual(['dn1']);
  });
});
