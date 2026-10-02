/**
 * Khách – ăn – bếp liền hay tách theo đầu bài (T103, Haan chấm lượt b1543b8c: «bố trí phòng khách liền phòng bếp
 * liền phòng ăn chưa hợp lý → hãy làm rõ hơn từ đầu bài»).
 *
 * Canh:
 *  1. Câu trả lời `lifestyle.living_dining_kitchen` → đúng các cặp bị CẤM liền (`kb/brief_fidelity.yaml`
 *     `demands.open_plan`); chưa trả lời → không ràng buộc; mỗi câu trả lời có một dòng dặn mô hình.
 *  2. Bộ xếp: cặp bị cấm không gộp một ô, không nối bằng ô thông — dù mô hình khai quan hệ `open`.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { AiPlanIntent, AiSpaceProgram } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { arrangeLevel, type ArrangeInput } from '../ai/arrange';
import type { Rect } from '../ai/draw/geometry';
import { openPlanDemand } from '../ai/brief-demands';
import { parseBriefFidelity } from '../kb/brief-fidelity';
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
  anchors: LevelAnchors | null;
  openForbidden?: ReadonlySet<string> | null;
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
    entrances: { main: 'front', vehicle: null },
    openForbidden: opts.openForbidden ?? null,
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

const fidelity = parseBriefFidelity(read('kb/brief_fidelity.yaml'));

function demandsFor(answer: string | null) {
  const digest = { lifestyle: { living_dining_kitchen: answer } } as unknown as Parameters<
    typeof openPlanDemand
  >[0];
  const lines: string[] = [];
  return { openPlan: openPlanDemand(digest, fidelity.demands, lines), lines };
}

describe('đầu bài → cặp khách / ăn / bếp bị cấm liền', () => {
  it.each([
    ['lien_thong_ca_ba', []],
    ['an_bep_lien_khach_rieng', ['dining|living', 'kitchen|living']],
    ['khach_an_lien_bep_rieng', ['dining|kitchen', 'kitchen|living']],
    ['tach_rieng', ['dining|kitchen', 'dining|living', 'kitchen|living']],
  ])('%s', (answer, forbidden) => {
    const d = demandsFor(answer);
    expect([...(d.openPlan?.forbidden ?? [])].sort()).toEqual(forbidden);
    expect(d.lines.length).toBeGreaterThan(0);
  });

  it('chưa trả lời: không ràng buộc, không dòng dặn', () => {
    const d = demandsFor(null);
    expect(d.openPlan).toBeNull();
    expect(d.lines).toEqual([]);
  });

  it('mỗi câu trả lời của phiếu có mục trong tệp dữ liệu, và ngược lại', () => {
    const form = JSON.parse(read('shared/src/design/brief-form.json')) as unknown;
    const found: string[] = [];
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        const o = x as { path?: string; options?: { value: string }[] };
        if (o.path === 'lifestyle.living_dining_kitchen') {
          found.push(...(o.options ?? []).map((option) => option.value));
        }
        Object.values(o).forEach(walk);
      }
    };
    walk(form);
    expect(found.sort()).toEqual(Object.keys(fidelity.demands.openPlan.pairs).sort());
    expect(Object.keys(fidelity.demands.openPlan.say).sort()).toEqual(found.sort());
  });
});

// ── Tầng 1 nhà 8 × 14 m: mô hình khai khách – ăn – bếp thông nhau ───────────────────────────

const HOUSE: Rect = { x0: 0, y0: 0, x1: 800, y1: 1400 };
const PROGRAM = programOf([
  space('living_1', 'living', 1, 24),
  space('dining_1', 'dining', 1, 12),
  space('kitchen_1', 'kitchen', 1, 10),
  space('wc_1', 'wc', 1, 3.5),
  space('stair_1', 'stair', 1, 9),
  space('bedroom_1', 'bedroom', 1, 14),
  space('circulation_1', 'circulation', 1, 8),
]);
const INTENT: AiPlanIntent = {
  ...intentOf([
    ['living_1', 'front'],
    ['dining_1', 'center'],
    ['kitchen_1', 'back'],
    ['wc_1', 'back'],
    ['stair_1', 'center'],
    ['bedroom_1', 'back'],
    ['circulation_1', 'center'],
  ]),
  relationships: [
    { a: 'living_1', b: 'dining_1', kind: 'open' },
    { a: 'dining_1', b: 'kitchen_1', kind: 'open' },
  ],
  entry_room: 'living_1',
} as AiPlanIntent;

function arrange(openForbidden: ReadonlySet<string> | null) {
  return arrangeLevel(
    inputOf({
      program: PROGRAM,
      level: 1,
      isTop: false,
      intent: INTENT,
      buildable: HOUSE,
      anchors: null,
      openFaces: ['front', 'back'],
      buildingType: 'nha_pho',
      sketch: null,
      openForbidden,
    }),
  );
}

const SOCIAL = new Set(['living_1', 'dining_1', 'kitchen_1']);
/** Cặp phòng khách / ăn / bếp liền nhau: gộp một ô (`also`) hay nối bằng ô thông. */
function joined(result: ReturnType<typeof arrange>): string[] {
  const tree = result.layout!.tree;
  const merged = (tree.also ?? []).flatMap((also) =>
    SOCIAL.has(also.room)
      ? also.with.filter((id) => SOCIAL.has(id)).map((id) => `${also.room}+${id}`)
      : [],
  );
  const open = tree.doors
    .filter((d) => d.kind === 'opening' && SOCIAL.has(d.a) && SOCIAL.has(d.b))
    .map((d) => `${d.a}~${d.b}`);
  return [...merged, ...open];
}

describe('bộ xếp theo câu khách – ăn – bếp', () => {
  it('chưa trả lời: quan hệ `open` của mô hình vẫn liền các phòng (đối chứng)', () => {
    const result = arrange(null);
    expect(result.layout?.level, JSON.stringify(result.issues)).not.toBeNull();
    expect(joined(result).length).toBeGreaterThan(0);
  });

  it('«ba phòng tách riêng»: không gộp, không ô thông, có ghi chú', () => {
    const result = arrange(demandsFor('tach_rieng').openPlan!.forbidden);
    expect(result.layout?.level, JSON.stringify(result.issues)).not.toBeNull();
    expect(joined(result)).toEqual([]);
    expect(result.notes.map((note) => note.code)).toContain('intent_open_forbidden');
  });
});
