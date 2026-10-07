/**
 * `arrange/doors.ts` — sảnh chạy suốt trước phòng mang cửa chính (16/09/2026, phát lại lượt 58688ead:
 * bản phác của mô hình hỏng oan `entrance_wrong_side` vì cửa chính bị đặt ở phòng khách, sau lưng sảnh).
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { deriveDoors, type DoorsInput } from '../ai/arrange/doors';
import type { LevelIntent } from '../ai/arrange/intent';
import type { PackLeaf } from '../ai/arrange/pack';
import type { Rect } from '../ai/draw/geometry';

function leaf(id: string, types: string[], role: PackLeaf['role']): PackLeaf {
  return {
    id,
    types,
    target: 10,
    techMin: 0,
    pref: null,
    aspectMax: 3,
    aspectHard: null,
    areaFloor: null,
    zone: 'center',
    street: false,
    role,
    needsOpenFace: false,
    noStairDoor: false,
    parent: null,
    stair: false,
    wet: false,
    zoneWeight: 1,
    hostTypes: null,
  } as PackLeaf;
}

function doorsFor(
  cells: { id: string; rect: Rect }[],
  leaves: PackLeaf[],
  entryRoom: string,
  extra: Partial<DoorsInput> = {},
) {
  return deriveFor(cells, leaves, entryRoom, extra).doors;
}

function deriveFor(
  cells: { id: string; rect: Rect }[],
  leaves: PackLeaf[],
  entryRoom: string | null,
  extra: Partial<DoorsInput> = {},
  garageRoom: string | null = null,
) {
  const intent = {
    level: 1,
    leaves: leaves.map((l) => ({ id: l.id, merged: [] })),
    hostOf: new Map(leaves.map((l) => [l.id, l.id])),
    relations: [],
    openings: [],
    entryRoom,
    garageRoom,
    variantLabel: null,
    rationale: '',
    stored: {},
    notes: [],
    issues: [],
  } as unknown as LevelIntent;
  return deriveDoors({
    level: 1,
    isTop: false,
    cells,
    leafById: new Map(leaves.map((l) => [l.id, l])),
    intent,
    doorHosts: ['circulation', 'living', 'dining', 'kitchen', 'garage'],
    doorShared: () => 90,
    mainEntranceDeclared: true,
    stairUp: null,
    stairIds: new Set(),
    circulation: new Set(['circulation', 'stair', 'core']),
    stairOpensTo: new Set([
      'circulation',
      'core',
      'stair',
      'elevator',
      'living',
      'dining',
      'terrace',
    ]),
    ...extra,
  });
}

describe('deriveDoors — sảnh trước phòng mang cửa chính', () => {
  const footprint: Rect = { x0: 0, y0: 0, x1: 1000, y1: 1500 };

  it('sảnh chạy suốt trước phòng khách: cửa chính mở ở sảnh, sảnh nối vào phòng khách', () => {
    const doors = doorsFor(
      [
        { id: 'porch_1', rect: { x0: 0, y0: 0, x1: 1000, y1: 200 } },
        { id: 'living_1', rect: { x0: 0, y0: 200, x1: 1000, y1: 1500 } },
      ],
      [leaf('porch_1', ['porch'], 'open'), leaf('living_1', ['living'], 'hub')],
      'living_1',
      { mainSide: { footprint, side: 'y0' } },
    );
    expect(doors).toContainEqual({ a: 'porch_1', b: 'outside', kind: 'double' });
    expect(doors).toContainEqual({ a: 'porch_1', b: 'living_1', kind: 'double' });
    expect(doors.some((door) => door.a === 'living_1' && door.b === 'outside')).toBe(false);
  });

  it('phòng khách tự chạm mặt lối vào: cửa chính vẫn ở phòng khách', () => {
    const doors = doorsFor(
      [
        { id: 'porch_1', rect: { x0: 0, y0: 0, x1: 300, y1: 200 } },
        { id: 'living_1', rect: { x0: 300, y0: 0, x1: 1000, y1: 1500 } },
      ],
      [leaf('porch_1', ['porch'], 'open'), leaf('living_1', ['living'], 'hub')],
      'living_1',
      { mainSide: { footprint, side: 'y0' } },
    );
    expect(doors).toContainEqual({ a: 'living_1', b: 'outside', kind: 'double' });
  });
});

describe('deriveDoors — gara mang lối vào chính (nhà ống, Haan 04/10/2026)', () => {
  it('cửa cuốn sát một đầu vách, cửa đi sát đầu kia — hai cửa, không bị khử trùng', () => {
    // Lượt e34f8f58: khoá khử trùng `phòng|outside` nuốt cửa đi, cổng báo «không có cửa ra ngoài (trừ cửa xe)».
    const { doors } = deriveFor(
      [
        { id: 'garage_1', rect: { x0: 0, y0: 0, x1: 500, y1: 490 } },
        { id: 'living_1', rect: { x0: 0, y0: 490, x1: 500, y1: 850 } },
      ],
      [leaf('garage_1', ['garage'], 'open'), leaf('living_1', ['living'], 'hub')],
      'garage_1',
      { garageEntry: true },
      'garage_1',
    );
    expect(doors).toContainEqual({ a: 'garage_1', b: 'outside', kind: 'garage', place: 'start' });
    expect(doors).toContainEqual({ a: 'garage_1', b: 'outside', kind: 'single', place: 'end' });
  });

  it('loại hình không khai gara làm lối vào (biệt thự): chỉ cửa cuốn, như trước', () => {
    const { doors } = deriveFor(
      [{ id: 'garage_1', rect: { x0: 0, y0: 0, x1: 500, y1: 490 } }],
      [leaf('garage_1', ['garage'], 'open')],
      'garage_1',
      {},
      'garage_1',
    );
    expect(doors.filter((door) => door.b === 'outside')).toEqual([
      { a: 'garage_1', b: 'outside', kind: 'garage' },
    ]);
  });

  it('đầu bài không khai lối vào chính: chỉ cửa cuốn, đặt như cũ', () => {
    const { doors } = deriveFor(
      [{ id: 'garage_1', rect: { x0: 0, y0: 0, x1: 500, y1: 490 } }],
      [leaf('garage_1', ['garage'], 'open')],
      'garage_1',
      { mainEntranceDeclared: false, garageEntry: true },
      'garage_1',
    );
    expect(doors.filter((door) => door.b === 'outside')).toEqual([
      { a: 'garage_1', b: 'outside', kind: 'garage' },
    ]);
  });
});

/**
 * Hai luật 18/09/2026, Haan chấm lượt 78be09b4:
 *  · «không cần cửa giữa 2 khu vực đều là hành lang giao thông» → ô thông, không cánh;
 *  · «cửa phòng thờ mở ra là thang bộ — bất hợp lý» → phòng ở không lấy cửa từ ô thang.
 */
describe('deriveDoors — hành lang nối hành lang, và cửa từ ô thang', () => {
  it('hai dải hành lang kề nhau nối bằng ô thông, không cánh', () => {
    const doors = doorsFor(
      [
        { id: 'living_1', rect: { x0: 0, y0: 0, x1: 1000, y1: 400 } },
        { id: 'circulation_1', rect: { x0: 0, y0: 400, x1: 1000, y1: 900 } },
        { id: 'circulation_2', rect: { x0: 0, y0: 900, x1: 1000, y1: 1500 } },
      ],
      [
        leaf('living_1', ['living'], 'hub'),
        leaf('circulation_1', ['circulation'], 'hub'),
        leaf('circulation_2', ['circulation'], 'hub'),
      ],
      'living_1',
    );
    const between = doors.find(
      (door) =>
        (door.a === 'circulation_1' && door.b === 'circulation_2') ||
        (door.a === 'circulation_2' && door.b === 'circulation_1'),
    );
    expect(between?.kind).toBe('opening');
  });

  it('phòng thờ kề cả ô thang lẫn hành lang: cửa mở ở hành lang', () => {
    const stair = leaf('stair_1', ['stair'], 'hub');
    const doors = doorsFor(
      [
        { id: 'living_1', rect: { x0: 0, y0: 0, x1: 1000, y1: 400 } },
        { id: 'stair_1', rect: { x0: 0, y0: 400, x1: 400, y1: 1000 } },
        { id: 'circulation_1', rect: { x0: 400, y0: 400, x1: 1000, y1: 1000 } },
        { id: 'altar_room_1', rect: { x0: 0, y0: 1000, x1: 1000, y1: 1500 } },
      ],
      [
        leaf('living_1', ['living'], 'hub'),
        { ...stair, stair: true },
        leaf('circulation_1', ['circulation'], 'hub'),
        { ...leaf('altar_room_1', ['altar_room'], 'room'), noStairDoor: true },
      ],
      'living_1',
      { stairIds: new Set(['stair_1']) },
    );
    expect(doors).toContainEqual({ a: 'circulation_1', b: 'altar_room_1', kind: 'single' });
    expect(
      doors.some(
        (door) =>
          (door.a === 'stair_1' && door.b === 'altar_room_1') ||
          (door.a === 'altar_room_1' && door.b === 'stair_1'),
      ),
    ).toBe(false);
  });
});

/**
 * T96 (Haan 27/09/2026): «vẽ tường phân cách [phòng khách – lối đi] ở giữa là không cần thiết và làm bí
 * không gian» — hai phòng cùng nhóm `passage.open_flow` kề nhau nối bằng ô thông SUỐT vách.
 */
describe('deriveDoors — khách kề lối đi: ô thông suốt vách, không vách ngăn (T96)', () => {
  const cells = [
    { id: 'living_1', rect: { x0: 0, y0: 0, x1: 600, y1: 800 } },
    { id: 'hall_1', rect: { x0: 0, y0: 800, x1: 600, y1: 1000 } },
    { id: 'bedroom_1', rect: { x0: 0, y0: 1000, x1: 600, y1: 1400 } },
  ];
  const leaves = [
    leaf('living_1', ['living'], 'hub'),
    leaf('hall_1', ['circulation'], 'hub'),
    leaf('bedroom_1', ['bedroom'], 'room'),
  ];

  it('có `open_flow`: ô thông khách – hành lang mang `full`, cửa phòng ngủ thì không', () => {
    const doors = doorsFor(cells, leaves, 'living_1', {
      openFlow: new Set(['living', 'dining', 'circulation']),
    });
    expect(doors).toContainEqual({ a: 'living_1', b: 'hall_1', kind: 'opening', full: true });
    expect(doors.find((d) => d.b === 'bedroom_1')).toEqual({
      a: 'hall_1',
      b: 'bedroom_1',
      kind: 'single',
    });
  });

  it('không có `open_flow` (kb cũ): ô thông rộng cửa như trước, không `full`', () => {
    const doors = doorsFor(cells, leaves, 'living_1');
    expect(doors).toContainEqual({ a: 'living_1', b: 'hall_1', kind: 'opening' });
  });
});

/**
 * T105 (Haan chấm lượt 25fdc90c): ô thang là vế bậc, không phải lối đi. Tầng 2: hành lang sau chỉ «tới được»
 * qua ô thang — thực tế phần ấy là chiếu nghỉ lưng chừng. Tầng 1: bậc 1 giáp tường kho, lối vào ở cạnh dài.
 */
describe('deriveDoors — ô thang có đúng một lối vào, không làm lối đi (T105)', () => {
  const stair = leaf('stair_2', ['stair'], 'hub');
  const upper = [
    { id: 'hall_front', rect: { x0: 0, y0: 0, x1: 1000, y1: 200 } },
    { id: 'stair_2', rect: { x0: 400, y0: 200, x1: 600, y1: 700 } },
    { id: 'hall_back', rect: { x0: 400, y0: 700, x1: 600, y1: 900 } },
    { id: 'bed_a', rect: { x0: 0, y0: 200, x1: 400, y1: 900 } },
    { id: 'bed_b', rect: { x0: 600, y0: 200, x1: 1000, y1: 900 } },
  ];
  const upperLeaves = [
    leaf('hall_front', ['circulation'], 'hub'),
    stair,
    leaf('hall_back', ['circulation'], 'hub'),
    leaf('bed_a', ['bedroom'], 'room'),
    leaf('bed_b', ['bedroom'], 'room'),
  ];

  it('tầng trên: ô thang mở MỘT lối, ra hành lang ở đầu vế tới; hành lang sau không tới được thì báo', () => {
    const result = deriveFor(upper, upperLeaves, null, {
      level: 2,
      isTop: true,
      stairIds: new Set(['stair_2']),
      stairUp: '+y',
    });
    const stairDoors = result.doors.filter((d) => d.a === 'stair_2' || d.b === 'stair_2');
    expect(stairDoors).toHaveLength(1);
    expect([stairDoors[0]!.a, stairDoors[0]!.b]).toContain('hall_front');
    expect(
      result.reasons.some(
        (r) => r.code === 'arrange_no_hub_wall' && r.params?.room === 'hall_back',
      ),
    ).toBe(true);
  });

  it('tầng 1: ô thang tới được từ phòng khách không loang tiếp — hành lang phía sau thang bị báo, không mở cửa xuyên thang', () => {
    const cells = [
      { id: 'living_1', rect: { x0: 0, y0: 0, x1: 1000, y1: 200 } },
      { id: 'stair_1', rect: { x0: 400, y0: 200, x1: 600, y1: 700 } },
      { id: 'hall_back', rect: { x0: 400, y0: 700, x1: 600, y1: 900 } },
      { id: 'bed_a', rect: { x0: 0, y0: 200, x1: 400, y1: 900 } },
      { id: 'bed_b', rect: { x0: 600, y0: 200, x1: 1000, y1: 900 } },
    ];
    const result = deriveFor(
      cells,
      [
        leaf('living_1', ['living'], 'hub'),
        leaf('stair_1', ['stair'], 'hub'),
        leaf('hall_back', ['circulation'], 'hub'),
        leaf('bed_a', ['bedroom'], 'room'),
        leaf('bed_b', ['bedroom'], 'room'),
      ],
      'living_1',
      { stairIds: new Set(['stair_1']) },
    );
    const stairDoors = result.doors.filter((d) => d.a === 'stair_1' || d.b === 'stair_1');
    expect(stairDoors).toHaveLength(1);
    expect(
      result.reasons.some(
        (r) => r.code === 'arrange_no_hub_wall' && r.params?.room === 'hall_back',
      ),
    ).toBe(true);
  });

  it('tầng 1: đầu ngắn của thang giáp kho, chỉ vào được từ cạnh dài → báo `stair_entry_long_side`', () => {
    const cells = [
      { id: 'store_1', rect: { x0: 400, y0: 0, x1: 600, y1: 200 } },
      { id: 'stair_1', rect: { x0: 400, y0: 200, x1: 600, y1: 700 } },
      { id: 'store_2', rect: { x0: 400, y0: 700, x1: 600, y1: 900 } },
      { id: 'living_1', rect: { x0: 600, y0: 0, x1: 1000, y1: 900 } },
      { id: 'bed_1', rect: { x0: 0, y0: 0, x1: 400, y1: 900 } },
    ];
    const result = deriveFor(
      cells,
      [
        leaf('store_1', ['storage'], 'room'),
        leaf('stair_1', ['stair'], 'hub'),
        leaf('store_2', ['storage'], 'room'),
        leaf('living_1', ['living'], 'hub'),
        leaf('bed_1', ['bedroom'], 'room'),
      ],
      'living_1',
      { stairIds: new Set(['stair_1']) },
    );
    expect(result.reasons.map((r) => r.code)).toContain('stair_entry_long_side');
  });

  it('tầng 1: hành lang ở đầu ngắn → lối vào thang ở đó, không báo', () => {
    const cells = [
      { id: 'hall_1', rect: { x0: 0, y0: 0, x1: 1000, y1: 200 } },
      { id: 'stair_1', rect: { x0: 400, y0: 200, x1: 600, y1: 700 } },
      { id: 'living_1', rect: { x0: 600, y0: 200, x1: 1000, y1: 900 } },
      { id: 'bed_1', rect: { x0: 0, y0: 200, x1: 400, y1: 900 } },
      { id: 'store_2', rect: { x0: 400, y0: 700, x1: 600, y1: 900 } },
    ];
    const result = deriveFor(
      cells,
      [
        leaf('hall_1', ['circulation'], 'hub'),
        leaf('stair_1', ['stair'], 'hub'),
        leaf('living_1', ['living'], 'hub'),
        leaf('bed_1', ['bedroom'], 'room'),
        leaf('store_2', ['storage'], 'room'),
      ],
      'living_1',
      { stairIds: new Set(['stair_1']) },
    );
    expect(result.reasons.map((r) => r.code)).not.toContain('stair_entry_long_side');
    const entry = result.doors.filter((d) => d.a === 'stair_1' || d.b === 'stair_1');
    expect(entry).toHaveLength(1);
    expect([entry[0]!.a, entry[0]!.b]).toContain('hall_1');
  });
});

describe('deriveDoors — lối vào thang theo loại (T105)', () => {
  const params = {
    shape: 'chu_u',
    risers: 21,
    going: 26,
    flightWidth: 100,
    landing: 100,
    gap: 15,
  } as const;

  it('phòng ở cạnh dài mang cửa trước — ô không đủ dài theo chiều ấy, lối vào chuyển sang hành lang ở đầu ngắn', () => {
    // Ô thang U 215 × 360: vào từ cạnh dài (phòng khách) thì vế đầu chỉ dài 215 < 360 — không xây nổi thang ấy.
    const cells = [
      { id: 'hall_1', rect: { x0: 0, y0: 0, x1: 1000, y1: 200 } },
      { id: 'stair_1', rect: { x0: 400, y0: 200, x1: 615, y1: 560 } },
      { id: 'living_1', rect: { x0: 615, y0: 200, x1: 1000, y1: 900 } },
      { id: 'bed_1', rect: { x0: 0, y0: 200, x1: 400, y1: 900 } },
      { id: 'store_1', rect: { x0: 400, y0: 560, x1: 615, y1: 900 } },
    ];
    const result = deriveFor(
      cells,
      [
        leaf('hall_1', ['circulation'], 'hub'),
        leaf('stair_1', ['stair'], 'hub'),
        leaf('living_1', ['living'], 'hub'),
        leaf('bed_1', ['bedroom'], 'room'),
        leaf('store_1', ['storage'], 'room'),
      ],
      'living_1',
      { stairIds: new Set(['stair_1']), stairParams: params },
    );
    const entry = result.doors.filter((d) => d.a === 'stair_1' || d.b === 'stair_1');
    expect(entry).toHaveLength(1);
    expect([entry[0]!.a, entry[0]!.b]).toContain('hall_1');
    expect(result.stair?.up).toBe('+y');
    expect(result.reasons.map((r) => r.code)).not.toContain('stair_entry_long_side');
  });
});
