/**
 * V-27 (13/09/2026): phòng không được vào bằng cách đi xuyên phòng riêng của ai, và vị trí vách do
 * chương trình căn theo diện tích chương trình.
 *
 * Hai lượt thật hôm ấy — Claude Sonnet 5 và gpt-5 — đều qua cổng cũ với kho mở từ WC, phòng ngủ đi
 * xuyên phòng ngủ. Phép thử phát lại đúng các cây ấy (`ai-tree-fixtures.ts` `REAL_0913B_*`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AiFloorPlan, AiPlanTree } from '@nvg/shared/design';
import { parseConstructionNorms } from '../kb/construction';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  type RoomVocabulary,
} from '../kb/vocabulary';
import { layoutLevel, type LevelAnchors, type LevelLayout } from '../ai/tree';
import { mayEnter, passageViolations, type PassageInput } from '../ai/tree/passage';
import { resizeTree } from '../ai/tree/sizing';
import { levelFromRooms } from '../ai/plan-geometry';
import { outlineFaces } from '../ai/outline-faces';
import { scorePlan } from '../ai/plan-score';
import { parsePlanQuality } from '../ai/plan-quality';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import { REAL_0913B_GPT5, REAL_0913B_PROGRAM, REAL_0913B_SONNET } from './ai-tree-fixtures';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const table = roomGroups(vocabulary);
const passage = passageRules(vocabulary)!;
const groups = {
  outdoor: new Set(table.outdoor ?? []),
  vertical: new Set(table.circulation ?? []),
  noDoorRequired: new Set(table.no_door_required ?? []),
  habitable: new Set(table.habitable ?? []),
  doorHosts: table.door_hosts ?? [],
  passage,
};
const scoreRules = new RulePack(
  [
    ...parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);
const minSideM = (type: string) => scoreRules.minDimension('nha_vuon', type);
const BUILDABLE = { x0: 200, y0: 300, x1: 1500, y1: 2000 };
const OPEN = ['front', 'back', 'left'] as const;

interface RunOptions {
  sizing?: boolean;
  passage?: boolean;
}

function run(
  tree: AiPlanTree,
  level: number,
  anchors: LevelAnchors | null,
  options: RunOptions & { relax?: ReadonlySet<string> } = {},
): LevelLayout {
  return layoutLevel({
    tree,
    level,
    isTop: level === 2,
    program: REAL_0913B_PROGRAM,
    buildableCm: BUILDABLE,
    construction,
    groups: options.passage === false ? { ...groups, passage: null } : groups,
    mergeAllowed: mergeAllowed(vocabulary),
    openFaces: [...OPEN],
    accessFaces: ['front', 'left'],
    anchors,
    entrances: { main: 'front', vehicle: 'front' },
    ...(options.sizing ? { minSideM } : {}),
    ...(options.relax ? { relax: options.relax } : {}),
  });
}

const codes = (layout: LevelLayout) => layout.issues.map((issue) => `${issue.code}:${issue.ref}`);

describe('luật đi xuyên phòng — năm điều của `mayEnter`', () => {
  const base = (over: Partial<PassageInput> = {}): PassageInput => ({
    starts: ['hall'],
    entries: new Set(['garage']),
    links: [],
    typesOf: new Map([
      ['hall', new Set(['circulation'])],
      ['garage', new Set(['garage'])],
      ['living', new Set(['living'])],
      ['bed', new Set(['bedroom'])],
      ['bed2', new Set(['bedroom'])],
      ['wc', new Set(['wc'])],
      ['store', new Set(['storage'])],
      ['kitchen', new Set(['kitchen'])],
      ['open', new Set(['kitchen', 'dining'])],
      ['balcony', new Set(['balcony'])],
    ]),
    parentOf: new Map([['wc', 'bed']]),
    noDoorRequired: groups.noDoorRequired,
    rules: passage,
    ...over,
  });

  it('đi xuyên được hành lang và ô bếp ghép phòng ăn; không đi xuyên được bếp riêng, WC, phòng ngủ', () => {
    const input = base();
    expect(mayEnter(input, 'hall', 'bed')).toBe(true);
    expect(mayEnter(input, 'open', 'bed')).toBe(true);
    expect(mayEnter(input, 'kitchen', 'bed')).toBe(false);
    expect(mayEnter(input, 'wc', 'store')).toBe(false);
    expect(mayEnter(input, 'bed2', 'bed')).toBe(false);
  });

  it('gara có cửa ra ngoài chỉ dẫn vào phòng đi xuyên được — không vào thẳng phòng ngủ', () => {
    const input = base();
    expect(mayEnter(input, 'garage', 'living')).toBe(true);
    expect(mayEnter(input, 'garage', 'bed')).toBe(false);
    expect(mayEnter({ ...input, entries: new Set() }, 'garage', 'living')).toBe(false);
  });

  it('WC khép kín vào từ phòng mẹ, ban công từ bất kỳ phòng nào, kho từ bếp', () => {
    const input = base();
    expect(mayEnter(input, 'bed', 'wc')).toBe(true);
    expect(mayEnter(input, 'bed2', 'wc')).toBe(false);
    expect(mayEnter(input, 'bed', 'balcony')).toBe(true);
    expect(mayEnter(input, 'kitchen', 'store')).toBe(true);
  });

  it('chỉ nêu phòng có BƯỚC CUỐI sai — ban công của phòng ngủ đang bị đi xuyên không bị nêu thêm', () => {
    const input = base({
      links: [
        ['hall', 'bed'],
        ['bed', 'bed2'],
        ['bed2', 'balcony'],
      ],
    });
    expect(passageViolations(input)).toEqual([{ room: 'bed2', via: 'bed' }]);
  });

  // Ví dụ mẫu của lời dẫn tầng nay là Ý ĐỊNH (T43), không còn cửa để đo luật đi xuyên trực tiếp:
  // `ai-arrange.test.ts` xếp chính ví dụ ấy và đòi nó qua trọn cổng, gồm cả luật này.

  it('mã phòng lạ trong mục `passage` ném lỗi ngay lúc nạp', () => {
    const broken: RoomVocabulary = { ...vocabulary, passage: { through: ['corridor_typo'] } };
    expect(() => passageRules(broken)).toThrow(/corridor_typo/);
  });
});

describe('phát lại cây thật 13/09/2026 — cổng mới không cho qua lối đi xuyên phòng', () => {
  it('Claude Sonnet tầng 1: ô thông tầng ở tầng 1 bị bác', () => {
    const result = run(REAL_0913B_SONNET[0]!, 1, null);
    expect(result.level).toBeNull();
    expect(codes(result)).toEqual(['void_on_ground:void_1']);
  });

  it('Claude Sonnet tầng 1 (ô thông tầng đổi thành phần không xây): kho chỉ vào được qua WC → bác', () => {
    const tree = JSON.parse(
      JSON.stringify(REAL_0913B_SONNET[0]!).replaceAll('"void_1"', '"unbuilt_1"'),
    ) as AiPlanTree;
    const result = run(tree, 1, null);
    expect(result.level).toBeNull();
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'room_through_private',
        ref: 'storage_1',
        params: expect.objectContaining({ via: 'wc_2' }),
      }),
    );
  });

  it('gpt-5 tầng 2: phòng ngủ 4 qua phòng ngủ 5, phòng làm việc qua phòng ngủ chính → bác; giặt phơi được chuyển lối vào sang hành lang', () => {
    const ground = run(REAL_0913B_GPT5[0]!, 1, null);
    expect(ground.level).not.toBeNull();
    const upper = run(REAL_0913B_GPT5[1]!, 2, ground.anchors);
    expect(upper.level).toBeNull();
    expect(codes(upper).sort()).toEqual([
      // Phòng thờ lấy cửa thẳng từ ô thang — luật 18/09/2026, Haan chấm trên lượt 78be09b4.
      'door_from_stair:altar_room_1',
      'room_through_private:bedroom_4',
      'room_through_private:study_1',
    ]);
    const rerouted = upper.notes.filter((note) => note.code === 'door_rerouted');
    expect(rerouted.map((note) => note.message)).toEqual([
      expect.stringMatching(/"laundry_1".*"circulation_2".*bỏ cửa "laundry_1–wc_4"/),
    ]);
  });

  it('lượt sửa của kỹ sư (`relax`) hạ «cửa từ ô thang» xuống ghi chú — bản vẽ có trước luật vẫn sửa được', () => {
    const ground = run(REAL_0913B_GPT5[0]!, 1, null);
    const upper = run(REAL_0913B_GPT5[1]!, 2, ground.anchors, {
      relax: new Set(['door_from_stair']),
    });
    expect(codes(upper)).not.toContain('door_from_stair:altar_room_1');
    expect(upper.notes.some((note) => note.code === 'door_from_stair_kept')).toBe(true);
  });

  it('tắt luật bằng dữ liệu (`passage: null`) thì trở lại hành vi cũ — cùng cây ấy qua cổng', () => {
    const ground = run(REAL_0913B_GPT5[0]!, 1, null, { passage: false });
    const upper = run(REAL_0913B_GPT5[1]!, 2, ground.anchors, { passage: false });
    expect(upper.issues).toEqual([]);
  });
});

describe('chương trình căn lại vị trí vách theo diện tích chương trình', () => {
  const ground = () => run(REAL_0913B_GPT5[0]!, 1, null, { passage: false, sizing: true });

  it('gpt-5 tầng 1: lệch diện tích giảm, không phòng nào hẹp dưới mức tối thiểu, ghi chú nói rõ', () => {
    const result = ground();
    expect(result.issues).toEqual([]);
    const note = result.notes.find((n) => n.code === 'rooms_resized');
    const [, was, now] = /lệch diện tích bình quân (\d+)% → (\d+)%/.exec(note?.message ?? '') ?? [];
    expect(Number(now)).toBeLessThan(Number(was));
    expect(note?.message).toMatch(/phòng hẹp dưới mức tối thiểu 1 → 0/);
  });

  it('tất định: cùng cây cho cùng vị trí vách', () => {
    expect(ground().tree.nodes).toEqual(ground().tree.nodes);
  });

  it('không có quy tắc cạnh tối thiểu (`minSideM` vắng) thì giữ nguyên mọi con số của mô hình', () => {
    const result = run(REAL_0913B_GPT5[0]!, 1, null, { passage: false });
    expect(result.tree.nodes).toEqual(REAL_0913B_GPT5[0]!.nodes);
    expect(result.notes.some((n) => n.code === 'rooms_resized')).toBe(false);
  });

  it('tầng trên: ô thang đứng yên đúng mốc tầng dưới, hành lang (cùng nhóm giao thông) vẫn được căn', () => {
    const below = run(REAL_0913B_GPT5[0]!, 1, null, { passage: false });
    const upper = run(REAL_0913B_GPT5[1]!, 2, below.anchors, { passage: false, sizing: true });
    expect(upper.issues).toEqual([]);
    expect(upper.notes.some((n) => n.code === 'rooms_resized')).toBe(true);
    expect(upper.anchors?.stair).toEqual(below.anchors?.stair);
    const moved = (id: string) =>
      upper.tree.nodes.find((n) => n.id === id)!.at !==
      REAL_0913B_GPT5[1]!.nodes.find((n) => n.id === id)!.at;
    expect(moved('nmidleft')).toBe(true);
  });

  it('ô không xây giữ nguyên độ dài mô hình khai; phần còn lại chia theo diện tích yêu cầu', () => {
    const nodes = resizeTree({
      tree: {
        footprint: [0, 0, 1000, 1000],
        nodes: [
          { id: 'n1', cut: 'x', at: 300, a: 'unbuilt_1', b: 'n2' },
          { id: 'n2', cut: 'x', at: 600, a: 'living_1', b: 'bedroom_1' },
        ],
        also: [],
      },
      spaces: new Map([
        ['living_1', { type: 'living', target: 20 }],
        ['bedroom_1', { type: 'bedroom', target: 40 }],
      ]),
      minSideM: () => null,
      pinnedLeaves: new Set(),
    });
    expect(nodes?.find((n) => n.id === 'n1')?.at).toBe(300);
    // 700 cm còn lại chia 1 : 2 theo diện tích yêu cầu → 533,3, làm tròn 5 cm.
    expect(nodes?.find((n) => n.id === 'n2')?.at).toBe(535);
  });

  it('điểm chấm cả nhà gpt-5 tăng khi căn vách, và không tiêu chí nào tụt (cùng tôpô, không gọi mô hình)', () => {
    const quality = parsePlanQuality(read('kb/plan_quality.yaml'));
    const score = (sizing: boolean) => {
      const plain = run(REAL_0913B_GPT5[0]!, 1, null, { passage: false });
      const levels = [
        sizing ? run(REAL_0913B_GPT5[0]!, 1, null, { passage: false, sizing }) : plain,
        // Cây tầng 2 thật được sinh theo mốc tầng 1 CHƯA căn.
        run(REAL_0913B_GPT5[1]!, 2, plain.anchors, { passage: false, sizing }),
      ];
      const plan = {
        levels: levels.map((result) => {
          const geometry = levelFromRooms(result.level!, construction, groups.outdoor);
          return {
            ...geometry.level,
            outline_faces: outlineFaces(
              geometry.level.outline.map(([x, y]) => [x, y] as [number, number]),
              [...OPEN],
            ),
          };
        }),
      } as unknown as AiFloorPlan;
      return scorePlan({
        plan,
        program: REAL_0913B_PROGRAM,
        buildingType: 'nha_vuon',
        quality,
        rules: scoreRules,
        groups: table,
      });
    };
    const before = score(false);
    const after = score(true);
    expect(after.points).toBeGreaterThan(before.points + 5);
    for (const criterion of after.criteria) {
      const was = before.criteria.find((c) => c.code === criterion.code)!;
      if (criterion.score === null || was.score === null) continue;
      // C8 (chiều dài hành lang trên mỗi phòng phục vụ, T48) được phép tụt: bước căn vách trả cho hành
      // lang đúng diện tích mô hình khai, nên một hành lang khai rộng thì dài ra. Đó là lựa chọn của
      // mô hình, không phải bước căn vách làm hỏng — và chính C8 sẽ trừ điểm lựa chọn ấy.
      if (criterion.code === 'C8') continue;
      expect(criterion.score, criterion.code).toBeGreaterThanOrEqual(was.score);
    }
  });
});
