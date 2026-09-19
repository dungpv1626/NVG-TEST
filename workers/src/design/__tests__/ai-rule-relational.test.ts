/**
 * Vị từ QUAN HỆ của cảnh báo kinh nghiệm trên mặt bằng AI (16/09/2026).
 *
 * Hai phần:
 *  · `adjacency` và `floor_preference` — đã khai trong `rules/nvg-experience.yaml` và đã tiêm vào lời
 *    dẫn từ trước, nhưng chưa từng được đo lại, nên `wc_separate_from_kitchen`, `kitchen_near_dining`,
 *    `garage_ground_floor` không bao giờ sinh cảnh báo.
 *  · `stair_faces_entry` — «cầu thang không đâm thẳng cửa chính», tài liệu «Nguyên tắc vàng» mục 9.
 *
 * Mặt bằng dựng tay, nhỏ nhất đủ để mỗi ca chỉ khác đúng một chỗ. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiFloorPlanLevel } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseRuleMessages } from '../ai/plan-messages';
import { reviewPlanRooms, stairsFacingEntry } from '../ai/rule-warnings';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groups = roomGroups(vocabulary);
const labels = Object.fromEntries(vocabulary.types.map((type) => [type.code, type.vi]));
const messages = parseRuleMessages(read('rules/messages.vi.yaml'));
const experience = new RulePack(
  parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience.yaml'),
  false,
);

type Room = AiFloorPlanLevel['rooms'][number];
type Door = NonNullable<AiFloorPlanLevel['doors']>[number];
type Stair = NonNullable<AiFloorPlanLevel['stairs']>[number];

const room = (id: string, type: string, rect: [number, number, number, number]): Room => ({
  id,
  type,
  rect,
  area_m2: ((rect[2] - rect[0]) * (rect[3] - rect[1])) / 10_000,
});

/**
 * Tầng 4 × 6 m: sảnh phía trước (0–300), phòng phía sau (300–600), tường mặt tiền ở y = 0 mang cửa
 * chính tim x = 200. Trục y chạy vào sâu thửa.
 */
function level(options: {
  front?: Room;
  back?: Room;
  stairs?: Stair[];
  innerDoorCentreX?: number | null;
  entryKind?: Door['kind'];
  level?: number;
  extraRooms?: Room[];
}): AiFloorPlanLevel {
  const front = options.front ?? room('hall_1', 'circulation', [0, 0, 400, 300]);
  const back = options.back ?? room('stair_1', 'stair', [0, 300, 400, 600]);
  const inner = options.innerDoorCentreX === undefined ? 200 : options.innerDoorCentreX;
  const doors: Door[] = [
    { id: 'd1', wall: 'w_front', at: 160, w: 80, kind: options.entryKind ?? 'double' },
  ];
  if (inner !== null)
    doors.push({ id: 'd2', wall: 'w_mid', at: inner - 40, w: 80, kind: 'single' });
  return {
    level: options.level ?? 1,
    name: 'Tầng 1',
    h: 360,
    outline: [
      [0, 0],
      [400, 0],
      [400, 600],
      [0, 600],
    ],
    walls: [
      { id: 'w_front', a: [0, 0], b: [400, 0], t: 22, k: 'e' },
      { id: 'w_mid', a: [0, 300], b: [400, 300], t: 11, k: 'p' },
    ],
    rooms: [front, back, ...(options.extraRooms ?? [])],
    doors,
    stairs: options.stairs ?? [{ id: 'st1', rect: [100, 320, 300, 580], up: '+y' }],
  } as AiFloorPlanLevel;
}

describe('stairsFacingEntry — cầu thang đâm thẳng cửa chính', () => {
  it('cửa chính → sảnh → cửa trên cùng trục → vế thang chạy thẳng vào trong: bắt', () => {
    expect(stairsFacingEntry(level({})).map((r) => r.id)).toEqual(['stair_1']);
  });

  it('vế đầu chạy vuông góc với hướng đi vào: không bắt', () => {
    const across = level({ stairs: [{ id: 'st1', rect: [100, 320, 300, 580], up: '+x' }] });
    expect(stairsFacingEntry(across)).toEqual([]);
  });

  it('cửa vào ô thang lệch hẳn khỏi trục cửa chính: không bắt', () => {
    expect(stairsFacingEntry(level({ innerDoorCentreX: 350 }))).toEqual([]);
  });

  it('không có cửa nào giữa sảnh và ô thang: không bắt — tường che tầm nhìn', () => {
    expect(stairsFacingEntry(level({ innerDoorCentreX: null }))).toEqual([]);
  });

  it('ô thang lệch sang một bên trục: không bắt', () => {
    const aside = level({ stairs: [{ id: 'st1', rect: [260, 320, 390, 580], up: '+y' }] });
    expect(stairsFacingEntry(aside)).toEqual([]);
  });

  it('cửa mở thẳng vào chính phòng thang, vế chạy vào trong: bắt', () => {
    const direct = level({
      front: room('stair_1', 'stair', [0, 0, 400, 300]),
      back: room('living_1', 'living', [0, 300, 400, 600]),
      stairs: [{ id: 'st1', rect: [100, 20, 300, 280], up: '+y' }],
    });
    expect(stairsFacingEntry(direct).map((r) => r.id)).toEqual(['stair_1']);
  });

  it('cửa để xe không phải cửa chính: không bắt', () => {
    expect(stairsFacingEntry(level({ entryKind: 'garage' }))).toEqual([]);
  });

  it('tầng không có ô thang: không bắt', () => {
    expect(stairsFacingEntry(level({ stairs: [] }))).toEqual([]);
  });
});

const review = (levels: AiFloorPlanLevel[]) =>
  reviewPlanRooms({
    levels,
    buildingType: 'biet_thu',
    rules: experience,
    labels,
    groups,
    messages,
  });

describe('gói kinh nghiệm — vị từ quan hệ nay được đo', () => {
  it('ba quy tắc từng im lặng nằm trong danh sách đã đối chiếu, không còn trong danh sách chưa', () => {
    const result = review([level({})]);
    for (const id of [
      'wc_separate_from_kitchen',
      'kitchen_near_dining',
      'garage_ground_floor',
      'stair_not_facing_entry',
    ]) {
      expect(result.checked, id).toContain(id);
      expect(result.unchecked.map((rule) => rule.ruleId)).not.toContain(id);
    }
  });

  it('cầu thang đâm thẳng cửa chính ra cảnh báo tiếng Việt, không chặn', () => {
    const found = review([level({})]).warnings.filter((w) => w.ruleId === 'stair_not_facing_entry');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'warning', spaceId: 'stair_1', level: 1 });
    expect(found[0]!.message).toContain('cửa chính');
    expect(found[0]!.message).not.toContain('{');
  });

  it('WC chung tường với bếp: cảnh báo; tách ra: hết', () => {
    const touching = level({
      front: room('kitchen_1', 'kitchen', [0, 0, 400, 300]),
      back: room('wc_1', 'wc', [0, 300, 400, 600]),
      stairs: [],
    });
    const warned = review([touching]).warnings.filter(
      (w) => w.ruleId === 'wc_separate_from_kitchen',
    );
    expect(warned.map((w) => w.spaceId)).toEqual(['wc_1']);
    expect(warned[0]!.message).not.toContain('{');

    const apart = level({
      front: room('kitchen_1', 'kitchen', [0, 0, 400, 200]),
      back: room('wc_1', 'wc', [0, 400, 400, 600]),
      extraRooms: [room('hall_1', 'circulation', [0, 200, 400, 400])],
      stairs: [],
    });
    expect(review([apart]).warnings.map((w) => w.ruleId)).not.toContain('wc_separate_from_kitchen');
  });

  it('bếp không liền phòng ăn: cảnh báo; bếp và ăn chung một không gian mở: hết', () => {
    const apart = level({
      front: room('kitchen_1', 'kitchen', [0, 0, 400, 200]),
      back: room('dining_1', 'dining', [0, 400, 400, 600]),
      extraRooms: [room('hall_1', 'circulation', [0, 200, 400, 400])],
      stairs: [],
    });
    expect(review([apart]).warnings.map((w) => w.ruleId)).toContain('kitchen_near_dining');

    const open: Room = {
      ...room('kitchen_1', 'kitchen', [0, 0, 400, 600]),
      also: ['dining_1'],
      parts: [
        { id: 'kitchen_1', type: 'kitchen', rect: [0, 0, 400, 300], area_m2: 12 },
        { id: 'dining_1', type: 'dining', rect: [0, 300, 400, 600], area_m2: 12 },
      ],
    } as Room;
    const merged = { ...level({ stairs: [] }), rooms: [open] } as AiFloorPlanLevel;
    expect(review([merged]).warnings.map((w) => w.ruleId)).not.toContain('kitchen_near_dining');
  });

  it('chỗ để xe trên tầng 2: cảnh báo ở đúng tầng ấy', () => {
    const ground = level({ stairs: [] });
    const upper = level({
      level: 2,
      front: room('garage_1', 'garage', [0, 0, 400, 300]),
      back: room('bedroom_1', 'bedroom', [0, 300, 400, 600]),
      stairs: [],
    });
    const warned = review([ground, upper]).warnings.filter(
      (w) => w.ruleId === 'garage_ground_floor',
    );
    expect(warned).toEqual([expect.objectContaining({ spaceId: 'garage_1', level: 2 })]);
  });

  it('WC tầng trên nằm chồng lên phòng thờ tầng dưới: cảnh báo (scope building)', () => {
    const below = level({
      front: room('altar_1', 'altar_room', [0, 0, 400, 300]),
      back: room('hall_1', 'circulation', [0, 300, 400, 600]),
      stairs: [],
    });
    const above = level({
      level: 2,
      front: room('wc_2', 'wc', [0, 0, 400, 300]),
      back: room('bedroom_2', 'bedroom', [0, 300, 400, 600]),
      stairs: [],
    });
    const warned = review([below, above]).warnings.filter(
      (w) => w.ruleId === 'wc_separate_from_altar_room',
    );
    expect(warned.map((w) => w.spaceId)).toEqual(['wc_2']);
  });
});
