/**
 * Hướng bàn thờ gia chủ khai (T106, Haan chấm lượt f351115d: cửa phòng thờ mở ở vách sau lưng bàn thờ quay đông nam).
 * KHÔNG chạm mạng.
 */

import { describe, expect, it } from 'vitest';
import type { AiBriefDigest, DesignBrief } from '@nvg/shared/design';
import { altarBackSide, altarFacingBearing } from '../ai/altar-facing';
import { deriveDoors } from '../ai/arrange/doors';
import type { LevelIntent } from '../ai/arrange/intent';
import type { PackLeaf } from '../ai/arrange/pack';
import { digestOf, VILLA } from './ai-digest-fixtures';

const withAltar = (orientation: string | null, amenities: string | null): AiBriefDigest =>
  digestOf({
    ...VILLA,
    site: { ...VILLA.site, orientation },
    required_spaces: [
      ...(VILLA.required_spaces ?? []).filter((row) => row.type !== 'altar_room'),
      { type: 'altar_room', floor: 2, amenities },
    ],
  } as DesignBrief);

describe('hướng bàn thờ → vách bàn thờ dựa lưng', () => {
  it('đọc hướng từ ô tiện ích của dòng phòng thờ, có dấu hay không dấu', () => {
    expect(altarFacingBearing(withAltar('DN', 'hướng đông nam'))).toBe(135);
    expect(altarFacingBearing(withAltar('DN', 'Bàn thờ HUONG TAY BAC'))).toBe(315);
    expect(altarFacingBearing(withAltar('DN', 'hướng nam'))).toBe(180);
    expect(altarFacingBearing(withAltar('DN', 'bàn thờ gỗ'))).toBeNull();
  });

  it('nhà quay đông nam, bàn thờ quay đông nam → dựa lưng vách sau (y1)', () => {
    expect(altarBackSide(withAltar('DN', 'hướng đông nam'))).toBe('y1');
  });

  it('nhà quay đông nam, bàn thờ quay tây nam → dựa lưng vách phía đông bắc = bên phải nhìn từ đường (x1)', () => {
    expect(altarBackSide(withAltar('DN', 'hướng tây nam'))).toBe('x1');
  });

  it('không khai hướng bàn thờ, hoặc không khai hướng nhà → không ràng buộc', () => {
    expect(altarBackSide(withAltar('DN', null))).toBeNull();
    expect(altarBackSide(withAltar(null, 'hướng đông nam'))).toBeNull();
  });
});

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

function derive(
  cells: { id: string; rect: { x0: number; y0: number; x1: number; y1: number } }[],
  back: 'y1' | null,
) {
  const leaves = [
    leaf('hall_1', ['circulation'], 'hub'),
    leaf('hall_2', ['circulation'], 'hub'),
    leaf('altar_1', ['altar_room'], 'room'),
    leaf('stair_2', ['stair'], 'hub'),
  ].filter((l) => cells.some((c) => c.id === l.id));
  return deriveDoors({
    level: 2,
    isTop: true,
    cells,
    leafById: new Map(leaves.map((l) => [l.id, l])),
    intent: {
      level: 2,
      leaves: leaves.map((l) => ({ id: l.id, merged: [] })),
      hostOf: new Map(leaves.map((l) => [l.id, l.id])),
      relations: [],
      openings: [],
      entryRoom: null,
      garageRoom: null,
    } as unknown as LevelIntent,
    doorHosts: ['circulation'],
    doorShared: () => 90,
    mainEntranceDeclared: false,
    stairUp: '+y',
    stairIds: new Set(['stair_2']),
    circulation: new Set(['circulation', 'stair']),
    stairOpensTo: new Set(['circulation']),
    altarBackSide: back,
  });
}

describe('cửa phòng thờ không mở sau lưng bàn thờ', () => {
  // Phòng thờ 400 × 400; hành lang 1 ở phía sau (y lớn), hành lang 2 ở bên trái; thang nối hai hành lang.
  const cells = [
    { id: 'stair_2', rect: { x0: 0, y0: 0, x1: 200, y1: 400 } },
    { id: 'hall_2', rect: { x0: 200, y0: 0, x1: 300, y1: 600 } },
    { id: 'altar_1', rect: { x0: 300, y0: 0, x1: 700, y1: 400 } },
    { id: 'hall_1', rect: { x0: 300, y0: 400, x1: 700, y1: 600 } },
  ];

  it('có phòng chủ ở vách khác → cửa mở ở đó, không mở vách sau', () => {
    const result = derive(cells, 'y1');
    const door = result.doors.find((d) => d.a === 'altar_1' || d.b === 'altar_1')!;
    expect([door.a, door.b]).toContain('hall_2');
    expect(result.reasons.map((r) => r.code)).not.toContain('altar_door_behind');
  });

  it('chỉ còn phòng chủ ở vách sau → vẫn mở cửa ở đó, bàn thờ chuyển vách khác (T116), không báo lỗi', () => {
    // Hành lang 2 nằm dưới ô thang, nối hành lang 1; phòng thờ chỉ còn giáp hành lang 1 — ở vách sau.
    const only = cells
      .filter((c) => c.id !== 'hall_2')
      .concat({
        id: 'hall_2',
        rect: { x0: 0, y0: 400, x1: 300, y1: 600 },
      });
    const result = derive(only, 'y1');
    expect(result.reasons.map((r) => r.code)).not.toContain('altar_door_behind');
    expect(result.doors.some((d) => d.a === 'altar_1' || d.b === 'altar_1')).toBe(true);
  });

  it('không khai hướng → cửa mở theo thứ tự thường', () => {
    const result = derive(cells, null);
    expect(result.doors.some((d) => d.a === 'altar_1' || d.b === 'altar_1')).toBe(true);
  });
});
