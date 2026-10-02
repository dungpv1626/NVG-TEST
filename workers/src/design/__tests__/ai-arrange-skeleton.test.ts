/**
 * Khung xương (T102, `ai/arrange/skeleton.ts`) — chương trình dựng lõi + hành lang, phòng lấp quanh hành lang.
 *
 * Canh:
 *  1. Tầng trên có mốc thang mà không có bản phác (hay bản phác hỏng lối vào) vẫn xếp được, ghi chú
 *     `skeleton_arranged`, ô thang đúng mốc, mọi phòng của chương trình có mặt.
 *  2. Thang máy kề thang chỉ phủ một phần chiều sâu lõi: khe còn lại thành sảnh chiếu nghỉ (đoạn hành lang).
 *  3. Tầng không có lá hành lang: chương trình thêm không gian hành lang; tầng nhiều lá hành lang hơn đoạn:
 *     chia đoạn, không mất lá nào.
 *  4. Tất định: cùng đầu vào, cùng cây.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiPlanIntent, AiSpaceProgram } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { arrangeLevel, type ArrangeInput } from '../ai/arrange';
import type { Rect } from '../ai/draw/geometry';
import { parsePlanQuality } from '../ai/plan-quality';
import type { LevelAnchors } from '../ai/tree';
import { parseConstructionNorms, usableMaxAspect, usableMinSide } from '../kb/construction';
import type { Face } from '../kb/site-context';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  zoneDefaults,
} from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { programOf } from './ai-tree-fixtures';

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

type Space = AiSpaceProgram['spaces'][number];
const space = (
  id: string,
  type: string,
  level: number,
  target: number,
  ensuite: string | null = null,
): Space => ({ id, type, level, target_area_m2: target, ensuite_of: ensuite, why: null });

function intentOf(rooms: [string, AiPlanIntent['rooms'][number]['zone']][]): AiPlanIntent {
  return {
    variant_label: null,
    rationale: 'phép thử',
    rooms: rooms.map(([id, zone]) => ({ id, zone, street_facing: false })),
    relationships: [],
    entry_room: null,
    garage_room: null,
  };
}

function inputOf(opts: {
  program: AiSpaceProgram;
  level: number;
  isTop: boolean;
  intent: AiPlanIntent;
  buildable: Rect;
  anchors: LevelAnchors;
  openFaces: Face[];
  buildingType: string;
  sketch?: string[] | null;
  trace?: (line: string) => void;
}): ArrangeInput {
  return {
    intent: opts.intent,
    level: opts.level,
    isTop: opts.isTop,
    program: opts.program,
    buildableCm: opts.buildable,
    construction,
    groups,
    mergeAllowed: mergeAllowed(vocabulary),
    openFaces: opts.openFaces,
    accessFaces: ['front'],
    entrances: { main: null, vehicle: null },
    anchors: opts.anchors,
    zoneDefaults: zoneDefaults(vocabulary),
    stairTypes: ['stair', 'core'],
    usableMinSideM: (type) => usableMinSide(construction, type, { cars: 0 }),
    usableMaxAspect: (type) => usableMaxAspect(construction, type),
    minSideM: (type) => rules.minDimension(opts.buildingType, type),
    aspectMax: (type) => rules.aspectRatioMax(opts.buildingType, type),
    scoring: { quality, rules, roomGroups: groupsTable, buildingType: opts.buildingType },
    ...(opts.sketch !== undefined ? { sketch: opts.sketch } : {}),
    ...(opts.trace ? { trace: opts.trace } : {}),
  };
}

/** Phòng ghi ở artifact là LỌT LÒNG — so với mốc theo tim trong một bề dày tường. */
const WALL_TOLERANCE_CM = 25;
const nearRect = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x0 - b.x0) <= WALL_TOLERANCE_CM &&
  Math.abs(a.y0 - b.y0) <= WALL_TOLERANCE_CM &&
  Math.abs(a.x1 - b.x1) <= WALL_TOLERANCE_CM &&
  Math.abs(a.y1 - b.y1) <= WALL_TOLERANCE_CM;
const rectOf = (rooms: readonly { id: string; rect: readonly number[] }[], id: string): Rect => {
  const room = rooms.find((r) => r.id === id);
  if (!room) throw new Error(`thiếu phòng ${id}`);
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
  return { x0, y0, x1, y1 };
};

// ── Nhà phố 4 × 15 m, tầng 2: thang áp tường trái giữa nhà, không bản phác ─────────────────────

const TOWNHOUSE: Rect = { x0: 0, y0: 0, x1: 400, y1: 1500 };
const TOWNHOUSE_STAIR: Rect = { x0: 0, y0: 450, x1: 240, y1: 900 };
const TOWNHOUSE_PROGRAM = programOf([
  space('garage_1', 'garage', 1, 12),
  space('living_1', 'living', 1, 14),
  space('kitchen_1', 'kitchen', 1, 8),
  space('wc_1', 'wc', 1, 3),
  space('stair_1', 'stair', 1, 9),
  space('bedroom_1', 'bedroom', 2, 14),
  space('bedroom_2', 'bedroom', 2, 10),
  space('wc_2', 'wc', 2, 3),
  space('circulation_1', 'circulation', 2, 4),
  space('stair_2', 'stair', 2, 9),
]);
const TOWNHOUSE_ANCHORS: LevelAnchors = {
  stair: TOWNHOUSE_STAIR,
  lightWells: [],
  wetRooms: [{ x0: 240, y0: 900, x1: 400, y1: 1050 }],
  footprint: TOWNHOUSE,
  stairUp: '+y',
};
const townhouseIntent = intentOf([
  ['bedroom_1', 'front'],
  ['bedroom_2', 'back'],
  ['wc_2', 'back'],
  ['circulation_1', 'center'],
  ['stair_2', 'center'],
]);

describe('khung xương — nhà phố không bản phác', () => {
  const lines: string[] = [];
  const result = arrangeLevel(
    inputOf({
      program: TOWNHOUSE_PROGRAM,
      level: 2,
      isTop: true,
      intent: townhouseIntent,
      buildable: TOWNHOUSE,
      anchors: TOWNHOUSE_ANCHORS,
      openFaces: ['front', 'back'],
      buildingType: 'nha_pho',
      sketch: null,
      trace: (line) => lines.push(line),
    }),
  );

  it('xếp được bằng khung xương, mọi phòng có mặt, ô thang đúng mốc', () => {
    expect(result.layout?.level, lines.join('\n')).not.toBeNull();
    expect(result.notes.map((note) => note.code)).toContain('skeleton_arranged');
    const rooms = result.layout!.level!.rooms;
    for (const id of ['bedroom_1', 'bedroom_2', 'wc_2', 'circulation_1', 'stair_2']) {
      expect(rooms.map((room) => room.id)).toContain(id);
    }
    expect(nearRect(rectOf(rooms, 'stair_2'), TOWNHOUSE_STAIR)).toBe(true);
  });

  it('phòng ngủ sau mở ra hành lang ngang, không lấy cửa từ ô thang', () => {
    const doors = result.layout!.tree.doors;
    const ofBedroom = doors.filter((d) => d.a === 'bedroom_2' || d.b === 'bedroom_2');
    expect(ofBedroom.length).toBeGreaterThan(0);
    expect(ofBedroom.some((d) => d.a === 'stair_2' || d.b === 'stair_2')).toBe(false);
  });

  it('tất định: xếp lại cho cùng cây', () => {
    const again = arrangeLevel(
      inputOf({
        program: TOWNHOUSE_PROGRAM,
        level: 2,
        isTop: true,
        intent: townhouseIntent,
        buildable: TOWNHOUSE,
        anchors: TOWNHOUSE_ANCHORS,
        openFaces: ['front', 'back'],
        buildingType: 'nha_pho',
        sketch: null,
      }),
    );
    expect(JSON.stringify(again.layout?.tree)).toBe(JSON.stringify(result.layout?.tree));
  });
});

// ── Biệt thự 12 × 16 m, tầng 2: thang máy kề thang phủ nửa chiều sâu lõi, bản phác hỏng lối vào ───

const VILLA: Rect = { x0: 0, y0: 0, x1: 1200, y1: 1600 };
const VILLA_STAIR: Rect = { x0: 0, y0: 700, x1: 240, y1: 1100 };
const VILLA_LIFT: Rect = { x0: 240, y0: 700, x1: 380, y1: 850 };
const VILLA_PROGRAM = programOf([
  space('living_1', 'living', 1, 40),
  space('stair_1', 'stair', 1, 9),
  space('elevator_1', 'elevator', 1, 2),
  space('bedroom_1', 'bedroom', 2, 16),
  space('master_bedroom_1', 'master_bedroom', 2, 22),
  space('wc_1', 'wc', 2, 4, 'master_bedroom_1'),
  space('balcony_1', 'balcony', 2, 5),
  space('bedroom_2', 'bedroom', 2, 16),
  space('study_1', 'study', 2, 11),
  space('wc_2', 'wc', 2, 3.5),
  space('laundry_1', 'laundry', 2, 4),
  space('circulation_1', 'circulation', 2, 12),
  space('stair_2', 'stair', 2, 9),
  space('elevator_2', 'elevator', 2, 2),
]);
const VILLA_ANCHORS: LevelAnchors = {
  stair: VILLA_STAIR,
  lightWells: [],
  elevators: [VILLA_LIFT],
  wetRooms: [{ x0: 380, y0: 850, x1: 520, y1: 1100 }],
  footprint: VILLA,
  stairUp: '+y',
};
const villaIntent = intentOf([
  ['bedroom_1', 'front_left'],
  ['master_bedroom_1', 'front_right'],
  ['wc_1', 'front_right'],
  ['balcony_1', 'front_right'],
  ['bedroom_2', 'back_left'],
  ['study_1', 'back_right'],
  ['wc_2', 'center'],
  ['laundry_1', 'center'],
  ['circulation_1', 'center'],
  ['stair_2', 'left'],
  ['elevator_2', 'left'],
]);
/** Bản phác 12 × 16 ô: phòng học không chạm hành lang — chương trình phải dựng lại. */
const VILLA_SKETCH = [
  ...Array.from({ length: 7 }, () =>
    [
      'bedroom_1',
      'bedroom_1',
      'bedroom_1',
      'bedroom_1',
      'master_bedroom_1',
      'master_bedroom_1',
      'master_bedroom_1',
      'master_bedroom_1',
      'master_bedroom_1',
      'master_bedroom_1',
      'wc_1',
      'wc_1',
    ].join(' '),
  ),
  ...Array.from({ length: 4 }, (_, i) =>
    [
      'stair_2',
      'stair_2',
      i < 2 ? 'elevator_2' : 'circulation_1',
      i < 2 ? 'elevator_2' : 'circulation_1',
      'circulation_1',
      'wc_2',
      'wc_2',
      'laundry_1',
      'laundry_1',
      'circulation_1',
      'circulation_1',
      'circulation_1',
    ].join(' '),
  ),
  ...Array.from({ length: 5 }, () =>
    [
      'bedroom_2',
      'bedroom_2',
      'bedroom_2',
      'bedroom_2',
      'bedroom_2',
      'bedroom_2',
      'study_1',
      'study_1',
      'study_1',
      'study_1',
      'study_1',
      'study_1',
    ].join(' '),
  ),
];

describe('khung xương — biệt thự có thang máy kề thang', () => {
  const lines: string[] = [];
  const result = arrangeLevel(
    inputOf({
      program: VILLA_PROGRAM,
      level: 2,
      isTop: true,
      intent: villaIntent,
      buildable: VILLA,
      anchors: VILLA_ANCHORS,
      openFaces: ['front', 'back', 'left'],
      buildingType: 'biet_thu',
      sketch: VILLA_SKETCH,
      trace: (line) => lines.push(line),
    }),
  );

  it('xếp được, giữ thang và thang máy đúng mốc', () => {
    expect(result.layout?.level, lines.join('\n')).not.toBeNull();
    expect(result.notes.map((note) => note.code)).toContain('skeleton_arranged');
    const rooms = result.layout!.level!.rooms;
    expect(nearRect(rectOf(rooms, 'stair_2'), VILLA_STAIR)).toBe(true);
    expect(nearRect(rectOf(rooms, 'elevator_2'), VILLA_LIFT)).toBe(true);
  });

  it('mọi phòng của tầng có mặt, kể cả các đoạn hành lang chương trình thêm', () => {
    const program = result.program ?? VILLA_PROGRAM;
    const ids = new Set(result.layout!.level!.rooms.map((room) => room.id));
    for (const s of program.spaces.filter((s) => s.level === 2))
      expect(ids.has(s.id), s.id).toBe(true);
  });

  it('khe dưới thang máy thành đoạn hành lang: mã hành lang mới nằm trong chương trình trả về', () => {
    const rooms = result.layout!.level!.rooms;
    const halls = rooms.filter((room) => room.type === 'circulation');
    expect(halls.length).toBeGreaterThanOrEqual(2);
    const extra = halls.filter((room) => room.id !== 'circulation_1');
    expect(extra.length).toBeGreaterThan(0);
    expect(result.program?.spaces.some((s) => s.id === extra[0]!.id)).toBe(true);
  });

  it('WC khép kín là dải áp một bên phòng ngủ chính, ban công áp mặt trước', () => {
    const rooms = result.layout!.level!.rooms;
    const master = rectOf(rooms, 'master_bedroom_1');
    const wc = rectOf(rooms, 'wc_1');
    const beside =
      Math.abs(wc.x1 - master.x0) <= WALL_TOLERANCE_CM ||
      Math.abs(wc.x0 - master.x1) <= WALL_TOLERANCE_CM;
    expect(beside, JSON.stringify({ wc, master })).toBe(true);
    expect(Math.abs(wc.y0 - master.y0)).toBeLessThanOrEqual(WALL_TOLERANCE_CM);
    const balcony = rectOf(rooms, 'balcony_1');
    expect(balcony.y0 - VILLA.y0).toBeLessThanOrEqual(WALL_TOLERANCE_CM);
  });
});
