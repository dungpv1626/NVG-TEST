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
  const intent = {
    level: 1,
    leaves: leaves.map((l) => ({ id: l.id, merged: [] })),
    hostOf: new Map(leaves.map((l) => [l.id, l.id])),
    relations: [],
    openings: [],
    entryRoom,
    garageRoom: null,
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
    stairNotFor: new Set(['bedroom', 'master_bedroom', 'study', 'altar_room']),
    ...extra,
  }).doors;
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
