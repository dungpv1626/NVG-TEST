/**
 * Bộ giải ý định `ai/arrange/` trên ý định THẬT của mô hình — lượt đo 14/09/2026 (V-28).
 *
 * Lượt `9cce001a`, gpt-5-mini mức Thấp, «Biệt thự nhà vườn (demo)» 15 × 20 m, 2 tầng. Mô hình khai ý
 * định hợp lý mà bộ giải hỏng: tầng 2 bỏ rơi hai phòng không lối vào ở cả hai lượt, tầng 1 qua cổng
 * với phòng ngủ 1,78 × 14,6 m. Dữ liệu ở `fixtures/ai-run-9cce001a.json` — đầu bài đã lược danh tính,
 * ý định nguyên văn mô hình trả về.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  aiPlanIntentSchema,
  type AiBriefDigest,
  type AiPlanIntent,
  type AiSpaceProgram,
} from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import type { ArrangeResult } from '../ai/arrange';
import { parsePlanQuality } from '../ai/plan-quality';
import { arrangeFor, planContext, type PlanContextInput } from '../ai/plan';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms, usableMaxAspect, usableMinSide } from '../kb/construction';
import { parseSiteContext } from '../kb/site-context';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  VocabularyIndex,
  zoneDefaults,
} from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const run = JSON.parse(read('workers/src/design/__tests__/fixtures/ai-run-9cce001a.json')) as {
  digest: AiBriefDigest;
  program: AiSpaceProgram;
  intents: Record<'level1' | 'level2' | 'level2_revised', unknown>;
};
const intentOf = (key: keyof typeof run.intents): AiPlanIntent =>
  aiPlanIntentSchema.parse(run.intents[key]);

const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groupsTable = roomGroups(vocabulary);
const experience = new RulePack(
  parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
  false,
);
const scoreRules = new RulePack(
  [
    ...parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);

function contextInput(trace?: (line: string) => void): PlanContextInput {
  return {
    digest: run.digest,
    variant: { id: 'AI-A', label: 'AI-A', strategy: '' },
    labels: Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi])),
    vocabulary: new VocabularyIndex(vocabulary),
    // Lượt ghi trước T96: phát lại kiểm bộ xếp, không kiểm cổng «không bịa thêm» (xem `ai-real-context.ts`).
    fidelity: { ...parseBriefFidelity(read('kb/brief_fidelity.yaml')), onlyWhenAsked: [] },
    construction: parseConstructionNorms(read('kb/construction_norms.yaml')),
    siteContext: parseSiteContext(read('kb/site_context.yaml')),
    rules: selectedRulePack(NO_RULE_PACKS, { standards: new RulePack([], false), experience }),
    groups: {
      outdoor: new Set(groupsTable.outdoor ?? []),
      vertical: new Set(groupsTable.circulation ?? []),
      noDoorRequired: new Set(groupsTable.no_door_required ?? []),
      habitable: new Set(groupsTable.habitable ?? []),
      doorHosts: groupsTable.door_hosts ?? [],
      passage: passageRules(vocabulary),
    },
    mergeAllowed: mergeAllowed(vocabulary),
    zoneDefaults: zoneDefaults(vocabulary),
    stairTypes: ['stair', 'core'],
    scoreRules,
    quality: parsePlanQuality(read('kb/plan_quality.yaml')),
    roomGroups: groupsTable,
    ...(trace ? { trace } : {}),
  };
}

function arrange(level2: 'level2' | 'level2_revised', trace?: (line: string) => void) {
  const input = contextInput(trace);
  const context = planContext(input);
  // Danh mục phòng của lượt thật đi thẳng vào bộ giải: phép thử này đo BỘ GIẢI trên ý định thật, không
  // đo luồng một-lượt-cả-nhà (T45) — ý định của lượt 9cce001a là ý định từng tầng.
  const first = arrangeFor(input, context, run.program, 1, intentOf('level1'), null);
  const second = arrangeFor(
    input,
    context,
    run.program,
    2,
    intentOf(level2),
    first.layout?.anchors ?? null,
  );
  return [first, second] as const;
}

const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const cars = run.digest.parking?.cars ?? 0;

const rooms = (result: ArrangeResult) => result.layout?.level?.rooms ?? [];
const size = (rect: readonly number[]) => {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = rect;
  const w = (x1 - x0) / 100;
  const h = (y1 - y0) / 100;
  return { short: Math.min(w, h), long: Math.max(w, h) };
};

describe('phát lại lượt đo 9cce001a (V-28)', () => {
  for (const variant of ['level2', 'level2_revised'] as const) {
    it(`cả hai tầng qua cổng — tầng 2 theo ${variant === 'level2' ? 'ý định đầu' : 'ý định mô hình đã sửa'}`, () => {
      const results = arrange(variant);
      for (const [i, result] of results.entries()) {
        expect(
          result.issues.map((issue) => issue.message),
          `tầng ${i + 1}`,
        ).toEqual([]);
        const placed = rooms(result).flatMap((room) => [room.id, ...(room.also ?? [])]);
        // So với danh mục BỘ XẾP TRẢ VỀ: từ T48 nó được thêm hành lang khi không cách chia nào cho mọi
        // phòng một lối vào tử tế, và hành lang ấy là một phòng thật của tầng.
        const expected = (result.program ?? run.program).spaces.filter(
          (space) => space.level === i + 1,
        );
        expect(placed.sort(), `tầng ${i + 1}`).toEqual(expected.map((space) => space.id).sort());
      }
    });
  }

  it('không phòng nào dưới cạnh ngắn hay quá tỉ lệ DÙNG ĐƯỢC — trước sửa: phòng ngủ 1,78 × 14,6 m', () => {
    const ensuite = new Set(
      run.program.spaces.filter((space) => space.ensuite_of).map((space) => space.id),
    );
    for (const result of [...arrange('level2'), ...arrange('level2_revised')]) {
      for (const room of rooms(result)) {
        const { short, long } = size(room.rect);
        const min = usableMinSide(construction, room.type, { cars });
        if (min !== null) expect(short, room.id).toBeGreaterThanOrEqual(min - 1e-6);
        const aspect = usableMaxAspect(construction, room.type);
        if (aspect !== null && !ensuite.has(room.id)) {
          expect(long / short, room.id).toBeLessThanOrEqual(aspect + 1e-6);
        }
      }
    }
  });

  it('diện tích bám chương trình — trước sửa: WC chung 4 m² nuốt 49 m² sàn dư', () => {
    for (const result of [...arrange('level2'), ...arrange('level2_revised')]) {
      const target = new Map(run.program.spaces.map((space) => [space.id, space.target_area_m2]));
      for (const room of rooms(result)) {
        // Hành lang gánh phần sàn dư của khối nhà cố định — không phải phòng ở.
        if (room.type === 'circulation') continue;
        const want = [room.id, ...(room.also ?? [])].reduce(
          (sum, id) => sum + (target.get(id) ?? 0),
          0,
        );
        expect(room.area_m2, room.id).toBeLessThanOrEqual(want + Math.max(6, want));
      }
    }
  });

  it('ban công khép kín không bị kéo vào giữa nhà — phòng mẹ ra mặt thoáng, ghi chú nói đúng việc đã làm', () => {
    const [, revised] = arrange('level2_revised');
    const note = revised.notes.find(
      (n) => n.code === 'intent_ensuite_zone_forced' && n.message.includes('balcony_3'),
    );
    expect(note?.message).toContain('"bedroom_4" chuyển từ vùng center sang front_right');
    const footprint = revised.layout!.anchors!.footprint;
    for (const room of rooms(revised).filter((r) => r.type === 'balcony')) {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
      // Lọt lòng lùi khỏi hình bao đúng bề dày tường ngoài (22 cm) khi ô áp tường bao.
      const edge = 30;
      const onBoundary =
        x0 - footprint.x0 <= edge ||
        footprint.x1 - x1 <= edge ||
        y0 - footprint.y0 <= edge ||
        footprint.y1 - y1 <= edge;
      expect(onBoundary, room.id).toBe(true);
    }
  });

  it('tất định: cùng ý định, cùng hai tầng', () => {
    const once = JSON.stringify(arrange('level2').map((r) => r.layout?.level));
    expect(JSON.stringify(arrange('level2').map((r) => r.layout?.level))).toBe(once);
  });
});
