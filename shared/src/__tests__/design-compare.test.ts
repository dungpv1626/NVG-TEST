/**
 * So sánh hai mặt bằng — tình huống kiểm chứng giá trị của 11-design-flow 11.6: khách đổi ý
 * từ 4 lên 5 tầng. Câu trả về phải nói đúng cái đã đổi, bằng tiếng Việt, và không nói gì khi
 * chỉ có nhiễu vài centimet của bộ giải.
 */

import { describe, expect, it } from 'vitest';
import { compareFloorPlans, type FloorPlan } from '../design';

function plan(
  levels: Array<{ level: number; rooms: Array<[string, string, number]> }>,
  coreX = 1,
): FloorPlan {
  return {
    schema_version: '1.0.0',
    intent_ref: `sha256:${'a'.repeat(64)}`,
    rule_pack_version: '2026.08.1',
    site: { width_m: 5, depth_m: 18 },
    levels: levels.map((l) => ({
      level: l.level,
      rooms: l.rooms.map(([id, type, area]) => ({
        id,
        type,
        polygon: [
          [0, 0],
          [5, 0],
          [5, area / 5],
          [0, area / 5],
        ],
        area_m2: area,
      })),
    })),
    cores: [
      {
        id: 'C1',
        polygon: [
          [coreX, 0],
          [coreX + 2, 0],
          [coreX + 2, 4],
          [coreX, 4],
        ],
        levels: levels.map((l) => l.level),
      },
    ],
    constraint_report: { status: 'pass' },
  } as FloorPlan;
}

describe('So sánh hai mặt bằng', () => {
  it('4 → 5 tầng: nói thêm tầng, phòng thờ chuyển tầng, lõi thang giữ nguyên, tổng sàn tăng', () => {
    const before = plan([
      { level: 1, rooms: [['living_1', 'living', 20]] },
      { level: 4, rooms: [['altar_room_1', 'altar_room', 16]] },
    ]);
    const after = plan([
      { level: 1, rooms: [['living_1', 'living', 20]] },
      { level: 4, rooms: [['bedroom_3', 'bedroom', 14]] },
      { level: 5, rooms: [['altar_room_1', 'altar_room', 16]] },
    ]);
    const messages = compareFloorPlans(before, after, {
      altar_room_1: 'Phòng thờ',
      bedroom_3: 'Phòng ngủ 3',
    }).map((c) => c.message);
    expect(messages).toContain('Thêm tầng 5.');
    expect(messages).toContain('Phòng thờ chuyển từ tầng 4 sang tầng 5.');
    expect(messages).toContain('Thêm Phòng ngủ 3 ở tầng 4 (14,0 m²).');
    expect(messages).toContain('Lõi thang giữ nguyên vị trí ở mọi tầng.');
    expect(messages).toContain('Tổng sàn tăng từ 36,0 lên 50,0 m².');
  });

  it('quá ba phòng đổi diện tích thì gom thành một dòng', () => {
    const before = plan([
      {
        level: 1,
        rooms: [
          ['a', 'living', 20],
          ['b', 'kitchen', 10],
          ['c', 'dining', 12],
          ['d', 'wc', 4],
        ],
      },
    ]);
    const after = plan([
      {
        level: 1,
        rooms: [
          ['a', 'living', 24],
          ['b', 'kitchen', 12],
          ['c', 'dining', 15],
          ['d', 'wc', 6],
        ],
      },
    ]);
    const messages = compareFloorPlans(before, after).map((c) => c.message);
    expect(messages.filter((m) => /diện tích/.test(m))).toEqual([
      '4 phòng đổi diện tích theo bố cục mới.',
    ]);
  });

  it('không nói gì về nhiễu vài centimet, nhưng nói khi lõi thang dời chỗ', () => {
    const before = plan([{ level: 1, rooms: [['living_1', 'living', 20]] }]);
    const after = plan([{ level: 1, rooms: [['living_1', 'living', 20.4]] }], 2.5);
    const changes = compareFloorPlans(before, after);
    expect(changes.map((c) => c.kind)).toEqual(['core_moved']);
    expect(changes[0]!.message).toMatch(/1,5 m/);
  });
});
