/**
 * Bộ giải ý định `ai/arrange/` (T43) — ý định viết tay → tầng đã qua cổng.
 *
 * Canh, theo thứ tự quan trọng:
 *  1. Ý định hợp lý thì MỌI tầng qua trọn cổng kiểm của `ai/tree/` — cùng cổng cây viết tay đi qua.
 *  2. Tầng trên chồng khít thang tầng 1, không cần chương trình dời vách sau đó.
 *  3. Tất định: cùng ý định, cùng cây, từng byte.
 *  4. Ý định hỏng thì bị bắt với mã lỗi nêu đúng chỗ, không ném.
 *
 *  5. Ý định sai (phòng sót, phòng lạ, mâu thuẫn) được SỬA kèm ghi chú, không bác cả tầng.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiPlanIntent, AiSpaceProgram } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { arrangeLevel, outdoorOffFace, type ArrangeInput, type ArrangeResult } from '../ai/arrange';
import type { Rect } from '../ai/draw/geometry';
import { parsePlanQuality } from '../ai/plan-quality';
import type { LevelAnchors } from '../ai/tree';
import { parseConstructionNorms } from '../kb/construction';
import type { Face } from '../kb/site-context';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  zoneDefaults,
} from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { TOWNHOUSE_INTENTS, VILLA_INTENTS } from './ai-intent-fixtures';
import {
  TOWNHOUSE_BUILDABLE,
  TOWNHOUSE_PROGRAM,
  VILLA_BUILDABLE,
  VILLA_PROGRAM,
} from './ai-tree-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groupsTable = roomGroups(vocabulary);
const groups = {
  outdoor: new Set(groupsTable.outdoor ?? []),
  vertical: new Set(groupsTable.circulation ?? []),
  noDoorRequired: new Set(groupsTable.no_door_required ?? []),
  habitable: new Set(groupsTable.habitable ?? []),
  doorHosts: groupsTable.door_hosts ?? [],
  passage: passageRules(vocabulary),
};
const rules = new RulePack(
  [
    ...parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);
const quality = parsePlanQuality(read('kb/plan_quality.yaml'));

interface House {
  program: AiSpaceProgram;
  intents: AiPlanIntent[];
  buildable: Rect;
  openFaces: Face[];
  buildingType: string;
}

const TOWNHOUSE: House = {
  program: TOWNHOUSE_PROGRAM,
  intents: TOWNHOUSE_INTENTS,
  buildable: TOWNHOUSE_BUILDABLE,
  openFaces: ['front', 'back'],
  buildingType: 'nha_pho',
};
const VILLA: House = {
  program: VILLA_PROGRAM,
  intents: VILLA_INTENTS,
  buildable: VILLA_BUILDABLE,
  openFaces: ['front', 'back', 'left', 'right'],
  buildingType: 'biet_thu',
};

function input(
  house: House,
  index: number,
  anchors: LevelAnchors | null,
  intent?: AiPlanIntent,
): ArrangeInput {
  return {
    intent: intent ?? house.intents[index]!,
    level: index + 1,
    isTop: index === house.intents.length - 1,
    program: house.program,
    buildableCm: house.buildable,
    construction,
    groups,
    mergeAllowed: mergeAllowed(vocabulary),
    openFaces: house.openFaces,
    accessFaces: ['front'],
    entrances: { main: null, vehicle: null },
    anchors,
    zoneDefaults: zoneDefaults(vocabulary),
    stairTypes: ['stair', 'core'],
    minSideM: (type) => rules.minDimension(house.buildingType, type),
    aspectMax: (type) => rules.aspectRatioMax(house.buildingType, type),
    scoring: { quality, rules, roomGroups: groupsTable, buildingType: house.buildingType },
  };
}

function arrangeHouse(house: House, trace?: (line: string) => void): ArrangeResult[] {
  const first = arrangeLevel({ ...input(house, 0, null), ...(trace ? { trace } : {}) });
  const anchors = first.layout?.anchors ?? null;
  return [
    first,
    ...house.intents
      .slice(1)
      .map((_, i) =>
        arrangeLevel({ ...input(house, i + 1, anchors), ...(trace ? { trace } : {}) }),
      ),
  ];
}

const codes = (result: ArrangeResult) => result.issues.map((issue) => issue.code);
const noteCodes = (result: ArrangeResult) => [
  ...result.notes.map((note) => note.code),
  ...(result.layout?.notes ?? []).map((note) => note.code),
];

describe('ý định hợp lý: mọi tầng qua trọn cổng kiểm', () => {
  for (const [name, house] of [
    ['nhà phố 4 × 15 m, 3 tầng', TOWNHOUSE],
    ['biệt thự 15 × 20 m, 2 tầng', VILLA],
  ] as const) {
    it(name, () => {
      const results = arrangeHouse(house);
      for (const [i, result] of results.entries()) {
        expect(result.issues, `tầng ${i + 1}`).toEqual([]);
        expect(result.layout?.level, `tầng ${i + 1}`).not.toBeNull();
        expect(result.summary!.passed, `tầng ${i + 1}`).toBeGreaterThan(0);
        // Mọi phòng của chương trình có mặt đúng một lần — ghép (`open`) thành `also`, không mất phòng.
        const spaces = house.program.spaces.filter((space) => space.level === i + 1);
        const placed = result.layout!.level!.rooms.flatMap((room) => [
          room.id,
          ...(room.also ?? []),
        ]);
        expect([...placed].sort(), `tầng ${i + 1}`).toEqual(spaces.map((s) => s.id).sort());
      }
    });
  }

  it('ý định giữ trọn: không phải nới vùng, khớp ý đồ cao', () => {
    for (const house of [TOWNHOUSE, VILLA]) {
      for (const result of arrangeHouse(house)) {
        expect(result.summary!.relaxed).toBe(0);
        expect(result.summary!.intentFit).toBeGreaterThanOrEqual(0.75);
      }
    }
  });

  it('một tầng xếp xong trong ngân sách của một bước Workflow', () => {
    // Đo 14/09/2026 trên máy phát triển: nhà phố ~0,2 s, biệt thự ~0,15 s cho CẢ nhà. Trần rộng để
    // máy CI chậm không đỏ giả, nhưng vẫn bắt được một lần bùng nổ tổ hợp.
    for (const house of [TOWNHOUSE, VILLA]) {
      const started = Date.now();
      arrangeHouse(house);
      expect(Date.now() - started).toBeLessThan(5_000);
    }
  });
});

describe('tầng trên chồng khít tầng 1', () => {
  it('ô thang và giếng trời trùng đúng ô tầng dưới, không cần cổng dời vách', () => {
    for (const house of [TOWNHOUSE, VILLA]) {
      const [first, ...upper] = arrangeHouse(house);
      const below = first!.layout!.anchors!;
      for (const result of upper) {
        expect(result.layout!.anchors!.stair).toEqual(below.stair);
        expect(noteCodes(result)).not.toContain('anchor_snapped');
      }
    }
  });

  it('tầng trên dùng hình bao tầng 1, không tự chọn hình bao khác', () => {
    const [first, second] = arrangeHouse(TOWNHOUSE);
    expect(second!.layout!.tree.footprint).toEqual(first!.layout!.tree.footprint);
  });
});

describe('khu vệ sinh tầng trên chồng trục khu vệ sinh tầng dưới (Q-B, 18/09/2026)', () => {
  const wcCentre = (result: ArrangeResult, id: string) => {
    const room = result.layout!.level!.rooms.find((r) => r.id === id)!;
    return [(room.rect[0]! + room.rect[2]!) / 2, (room.rect[1]! + room.rect[3]!) / 2] as const;
  };

  it('khu vệ sinh chung ở tầng trên nhận vùng của khu vệ sinh tầng dưới', () => {
    const [first, , third] = arrangeHouse(TOWNHOUSE);
    // Ý định khai `wc_3` ở vùng sau, trong khi `wc_1` tầng dưới ở vùng giữa.
    expect(noteCodes(third!)).toContain('intent_wet_zone_forced');
    const [bx, by] = wcCentre(first!, 'wc_1');
    const [tx, ty] = wcCentre(third!, 'wc_3');
    // Trước khi ép vùng, hai tâm cách nhau hơn 5 m trên lô sâu 15 m.
    // Đo 18/09/2026: hai tâm cách 2,41 m. Vẫn trên ngưỡng 1,5 m của tiêu chí E2 dù hai ô nằm chồng
    // nhau — E2 đo khoảng cách TÂM, nên hai khu vệ sinh khác cỡ chồng nhau vẫn có thể trượt.
    expect(Math.hypot(tx - bx, ty - by)).toBeLessThan(300);
  });

  it('khu vệ sinh khép kín không bị kéo khỏi phòng mẹ', () => {
    const [, second] = arrangeHouse(TOWNHOUSE);
    // `wc_2` là khu vệ sinh khép kín của `bedroom_2`; vùng của nó phải theo phòng mẹ, không theo
    // tầng dưới — kéo đi là phòng ngủ mất khu vệ sinh riêng.
    expect(noteCodes(second!)).not.toContain('intent_wet_zone_forced');
    const rooms = second!.layout!.level!.rooms;
    const wc = rooms.find((room) => room.id === 'wc_2')!;
    const parent = rooms.find((room) => room.id === 'bedroom_2')!;
    expect(wc.rect[0]).toBeLessThanOrEqual(parent.rect[2]!);
    expect(wc.rect[2]).toBeGreaterThanOrEqual(parent.rect[0]!);
  });
});

describe('tất định', () => {
  it('cùng ý định → cùng cây, cùng tầng, từng byte', () => {
    for (const house of [TOWNHOUSE, VILLA]) {
      const once = JSON.stringify(
        arrangeHouse(house).map((r) => [r.layout?.tree, r.layout?.level]),
      );
      const twice = JSON.stringify(
        arrangeHouse(house).map((r) => [r.layout?.tree, r.layout?.level]),
      );
      expect(twice).toBe(once);
    }
  });
});

describe('diện tích đầu bài khai là sàn CỨNG ở cổng (T45)', () => {
  it('phòng dựng ra nhỏ hơn mức đầu bài khai → `arrange_room_below_brief_area`, không cây nào qua', () => {
    // 200 m² trên sàn 15 × 16 m cùng sáu phòng khác: không cây nào vừa. (Mức 120 m² từng dùng ở đây nay
    // xếp được — bộ chia ô dành sàn cho phòng có mức đầu bài trước khi chia phần còn lại.)
    const result = arrangeLevel({
      ...input(VILLA, 0, null),
      briefMinAreaM2: (id) => (id === 'living_1' ? 200 : null),
    });
    expect(result.layout).toBeNull();
    expect(codes(result)).toContain('arrange_room_below_brief_area');
    expect(result.issues.find((i) => i.code === 'arrange_room_below_brief_area')!.message).toMatch(
      /tối thiểu 200 m²/,
    );
  });

  it('mức đầu bài lớn hơn hẳn diện tích mô hình khai vẫn xếp được khi sàn còn chỗ — bộ chia ô dành sàn trước', () => {
    const result = arrangeLevel({
      ...input(VILLA, 0, null),
      briefMinAreaM2: (id) => (id === 'living_1' ? 120 : null),
    });
    expect(result.issues).toEqual([]);
    const living = result.layout!.level!.rooms.find((room) => room.id === 'living_1')!;
    expect(living.area_m2).toBeGreaterThanOrEqual(120);
  });

  it('đạt mức đầu bài thì im lặng — cùng tầng, mức thấp hơn diện tích dựng được', () => {
    const result = arrangeLevel({
      ...input(VILLA, 0, null),
      briefMinAreaM2: (id) => (id === 'living_1' ? 20 : null),
    });
    expect(result.issues).toEqual([]);
  });
});

describe('ý định không tin được: chương trình sửa, ghi chú, không bác', () => {
  it('phòng bị bỏ sót → vùng mặc định; phòng lạ, quan hệ lạ → bỏ; vẫn xếp được', () => {
    const intent = TOWNHOUSE_INTENTS[0]!;
    const broken: AiPlanIntent = {
      ...intent,
      rooms: [
        ...intent.rooms.filter((room) => room.id !== 'wc_1'),
        { id: 'bedroom_9', zone: 'front', street_facing: true },
      ],
      relationships: [
        ...intent.relationships,
        { a: 'kitchen_1', b: 'kitchen_1', kind: 'adjacent' },
        { a: 'ghost_1', b: 'living_1', kind: 'near' },
      ],
    };
    const result = arrangeLevel(input(TOWNHOUSE, 0, null, broken));
    expect(result.layout?.level).not.toBeNull();
    const notes = noteCodes(result);
    expect(notes).toContain('intent_zone_defaulted');
    expect(notes).toContain('intent_room_dropped');
    expect(notes).toContain('intent_relationship_dropped');
    expect(result.intent.stored.rooms.map((room) => room.id)).toContain('wc_1');
  });

  it('cửa chính khai vào phòng không mang được cửa → chương trình chọn phòng khác, ghi chú', () => {
    const result = arrangeLevel(
      input(TOWNHOUSE, 0, null, { ...TOWNHOUSE_INTENTS[0]!, entry_room: 'wc_1' }),
    );
    expect(noteCodes(result)).toContain('intent_entry_invalid');
    expect(result.intent.entryRoom).not.toBe('wc_1');
    expect(result.layout?.level).not.toBeNull();
  });

  it('cặp vừa «adjacent» vừa «far» → giữ «adjacent», ghi chú mâu thuẫn', () => {
    const intent = TOWNHOUSE_INTENTS[0]!;
    const result = arrangeLevel(
      input(TOWNHOUSE, 0, null, {
        ...intent,
        relationships: [...intent.relationships, { a: 'living_1', b: 'kitchen_1', kind: 'far' }],
      }),
    );
    expect(noteCodes(result)).toContain('intent_relationship_conflict');
    expect(result.intent.relations).toContainEqual(
      expect.objectContaining({ kind: 'adjacent', a: 'kitchen_1', b: 'living_1' }),
    );
  });

  it('tầng trên khai thang sai vùng → ép về vùng thang tầng dưới', () => {
    const [first] = arrangeHouse(TOWNHOUSE);
    const intent = TOWNHOUSE_INTENTS[1]!;
    const moved: AiPlanIntent = {
      ...intent,
      rooms: intent.rooms.map((room) =>
        room.id === 'stair_2' ? { ...room, zone: 'front' } : room,
      ),
    };
    const result = arrangeLevel(input(TOWNHOUSE, 1, first!.layout!.anchors, moved));
    expect(noteCodes(result)).toContain('intent_anchor_zone_forced');
    expect(result.layout!.anchors!.stair).toEqual(first!.layout!.anchors!.stair);
  });
});

describe('không xếp được: lý do có mã, không ném, nói rõ có đáng gọi lại không', () => {
  it('chương trình to hơn khối xây → `arrange_program_exceeds_footprint`, KHÔNG gọi lại mô hình', () => {
    const tight: House = { ...TOWNHOUSE, buildable: { x0: 0, y0: 0, x1: 400, y1: 700 } };
    const result = arrangeLevel(input(tight, 0, null));
    expect(result.layout).toBeNull();
    expect(result.summary).toBeNull();
    expect(codes(result)).toContain('arrange_program_exceeds_footprint');
    // Mô hình không đổi được diện tích — gọi lại chỉ tốn tiền (T41: việc của bước chương trình).
    expect(result.revisable).toBe(false);
  });

  it('dồn cả tầng vào một góc: vùng là ƯU TIÊN — vẫn xếp được, nhưng độ khớp ý đồ tụt và lỗi vùng được ghi', () => {
    // Vùng quá tải chỉ thành lý do chặn khi không cây nào dựng được (Haan 14/09/2026: chỉ loại khi
    // không dựng được hoặc không đi được). Ở đây cây vẫn dựng được — độ khớp ý đồ nói ra chỗ lệch.
    const intent = VILLA_INTENTS[0]!;
    const crowded: AiPlanIntent = {
      ...intent,
      rooms: intent.rooms.map((room) => ({ ...room, zone: 'front_left' })),
      relationships: [],
    };
    const normal = arrangeLevel(input(VILLA, 0, null));
    const result = arrangeLevel(input(VILLA, 0, null, crowded));
    expect(result.intent.issues.map((issue) => issue.code)).toContain('arrange_zone_overfull');
    expect(result.layout?.level).not.toBeNull();
    expect(result.summary!.intentFit).toBeLessThan(normal.summary!.intentFit);
  });

  it('mọi lý do chặn đều ở mức `blocking` và có câu tiếng Việt', () => {
    const tight: House = { ...TOWNHOUSE, buildable: { x0: 0, y0: 0, x1: 400, y1: 700 } };
    const result = arrangeLevel(input(tight, 0, null));
    for (const issue of result.issues) {
      expect(issue.level).toBe('blocking');
      expect(issue.message).toMatch(
        /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i,
      );
    }
  });
});

/**
 * Ban công phải quay CẠNH DÀI ra mặt thoáng (Haan 18/09/2026, chấm lượt 78be09b4: một ban công
 * 1 × 6,3 m thọc vào giữa nhà, chỉ đầu 98 cm chạm mặt tiền).
 *
 * Ghi chú, chưa chặn: chừng nào ban công chưa đua được ra ngoài khối, chặn là mất phương án —
 * đo trên bốn bản phác thật của lượt 58688ead.
 */
describe('ban công quay cạnh dài ra mặt thoáng', () => {
  const level = (rooms: { id: string; type: string; rect: [number, number, number, number] }[]) =>
    ({ level: 2, rooms }) as unknown as Parameters<typeof outdoorOffFace>[1];
  const args = {
    level: 2,
    openFaces: ['front', 'back'],
    groups,
    buildableCm: { x0: 0, y0: 0, x1: 1000, y1: 1500 },
    anchors: null,
  } as unknown as Parameters<typeof outdoorOffFace>[0];

  it('dải ban công thọc vào giữa nhà, chỉ một đầu chạm mặt tiền: có ghi chú', () => {
    const notes = outdoorOffFace(
      args,
      level([
        { id: 'balcony_1', type: 'balcony', rect: [400, 0, 500, 700] },
        { id: 'bedroom_1', type: 'bedroom', rect: [0, 0, 400, 700] },
        { id: 'bedroom_2', type: 'bedroom', rect: [500, 0, 1000, 700] },
        { id: 'circulation_1', type: 'circulation', rect: [0, 700, 1000, 1500] },
      ]),
    );
    expect(notes.map((note) => note.code)).toEqual(['outdoor_off_face']);
  });

  it('ban công chạy dọc mặt tiền trước phòng ngủ: không ghi chú', () => {
    const notes = outdoorOffFace(
      args,
      level([
        { id: 'balcony_1', type: 'balcony', rect: [300, 0, 900, 120] },
        { id: 'bedroom_1', type: 'bedroom', rect: [0, 0, 300, 700] },
        { id: 'bedroom_2', type: 'bedroom', rect: [300, 120, 1000, 700] },
        { id: 'circulation_1', type: 'circulation', rect: [0, 700, 1000, 1500] },
      ]),
    );
    expect(notes).toEqual([]);
  });
});
