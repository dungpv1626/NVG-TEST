/**
 * Lời dẫn đường dải (v6) không tự mâu thuẫn — handoff v6 sửa lỗi đợt 1, P0-1. Lượt thật 619f0438: knowledge gửi
 * `corridor_min_mm: 1500` (làm tròn ô lưới 0,5 m) trong khi mẫu dải dạy hành lang 900 mm và `THANG (2400)` dưới
 * `rect_min_mm` 2.500 — mô hình nghĩ rất lâu để dung hoà. KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  AiPlanRejected,
  generateAiPlan,
  houseCallEffort,
  layoutPrompt,
  planContext,
  promptsFor,
} from '../ai/plan';
import { loadsIssue, storeyDepth, storeyLoads } from '../ai/feasibility';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const nhaOng = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const inputOf = (digest: AiBriefDigest) => ({
  ...realContextInput(digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
  geometry: 'rect' as const,
  pipeline: 'v6' as const,
  ...layoutKb,
});
const promptOf = (digest: AiBriefDigest) => {
  const context = planContext(inputOf(digest));
  const text = layoutPrompt(context, promptsFor(context, prompts), context.promptFlags);
  const knowledge = JSON.parse(
    text.slice(text.indexOf('<knowledge>') + 11, text.indexOf('</knowledge>')),
  ) as Record<string, unknown> & {
    corridor_min_mm: number;
    door_wall_mm: number;
    stair: { rect_min_mm: [number, number] };
    walk_through: string[];
  };
  const patterns = text.slice(text.indexOf('<patterns>'), text.indexOf('</patterns>'));
  return { context, text, knowledge, patterns };
};
// Không giếng trời: bỏ giếng khỏi danh mục đầu bài → mẫu A.
const noWell = {
  ...nhaOng,
  required_spaces: (nhaOng.required_spaces ?? []).filter((space) => space.type !== 'light_well'),
} as AiBriefDigest;

describe('lời dẫn v6 nhất quán (P0-1, T2, T4, T5)', () => {
  for (const [name, digest] of [
    ['nhà ống có giếng trời', nhaOng],
    ['nhà ống không giếng trời', noWell],
  ] as const) {
    it(`${name}: số hành lang / vách cửa / ô thang là số bộ giải dùng, mẫu dải không dưới số ấy`, () => {
      const { context, knowledge, patterns } = promptOf(digest);
      expect(knowledge.corridor_min_mm).toBe(900);
      expect(knowledge.door_wall_mm).toBe(context.bands!.doorWallCm * 10);
      expect(knowledge.stair.rect_min_mm).toEqual([
        context.bands!.stair!.width * 10,
        context.bands!.stair!.length * 10,
      ]);
      // Mọi số `gt (N)` / `hub (N)` của mẫu ≥ hành lang tối thiểu; THANG không mang số riêng.
      for (const match of patterns.matchAll(/\b(?:gt|hub) \((\d+)\)/g)) {
        expect(Number(match[1])).toBeGreaterThanOrEqual(knowledge.corridor_min_mm);
      }
      expect(patterns).not.toMatch(/THANG \(\d+\)/);
      // Phần mô hình không dùng ở đường dải.
      for (const key of ['furniture', 'clearances', 'strategy'])
        expect(knowledge).not.toHaveProperty(key);
      expect(knowledge.walk_through).not.toContain('core');
    });
  }

  it('nhà ống chèn MỘT mẫu: có giếng trời → mẫu B, không → mẫu A', () => {
    expect(promptOf(nhaOng).patterns).toMatch(/stair at the BACK with a light well/);
    expect(promptOf(nhaOng).patterns).not.toMatch(/stack\(wc_1, store\)/);
    expect(promptOf(noWell).patterns).toMatch(/stair at the BACK:/);
    expect(promptOf(noWell).patterns).not.toMatch(/light well/);
  });

  it('nhà có gara là lối vào: một luật lối vào, không hai', () => {
    const { text } = promptOf(nhaOng);
    expect(text).toMatch(/entry_room = garage_1 when the garage is on the front-door side/);
    expect(text).not.toMatch(/never kitchen or dining/);
  });
});

describe('khả thi theo mức tối thiểu (P0-4, T6)', () => {
  it('nhà ống demo: tầng 1 chật nhưng vừa (bộ dải viết tay chứng minh) — một dòng ngắn, không chặn', () => {
    const { context, knowledge } = promptOf(nhaOng);
    expect(knowledge.feasibility).toEqual({
      '1': expect.stringMatching(/^tight: \d+ of \d+ m²; depth: /),
    });
    expect(context.layout!.loads!.every((load) => load.verdict !== 'over')).toBe(true);
  });

  it('chiều sâu (lượt thật 36fb8000): tầng 1 mỗi phòng một dải thì vượt khối, ghép cạnh nhau thì vừa — dòng gửi mô hình nói cả hai và gợi ý nhóm', () => {
    const { context, knowledge } = promptOf(nhaOng);
    const depth = context.layout!.loads!.find((load) => load.level === '1')!.depth!;
    expect(depth.oneEachCm).toBeGreaterThan(depth.capCm);
    expect(depth.bestCm).toBeLessThanOrEqual(depth.capCm);
    // Mọi phòng tầng 1 và ô thang nằm đúng một nhóm; ít nhất một nhóm có hai ô trở lên.
    const ids = depth.groups.flat();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('THANG');
    expect(depth.groups.some((g) => g.length > 1)).toBe(true);
    expect((knowledge.feasibility as Record<string, string>)['1']).toMatch(
      /one room per band needs [\d.]+ m of 16\.5 m.*beside THANG.*\{/,
    );
  });

  it('chiều sâu: ghép cạnh nhau sát nhất vẫn vượt → vượt (chặn trước lời gọi), câu báo nói chiều sâu', () => {
    const depth = storeyDepth({
      rooms: [
        { id: 'garage_1', type: 'garage', m2: 14 },
        { id: 'living_1', type: 'living', m2: 18 },
        { id: 'kitchen_1', type: 'kitchen', m2: 9 },
      ],
      minSideCm: (type) => (type === 'garage' ? 460 : 300),
      areaFree: new Set(),
      stair: { width: 250, length: 414 },
      stairLabel: 'THANG',
      widthCm: 500,
      depthCm: 1200,
      wallCm: 28,
    })!;
    // Bề ngang 5 m: không hai phòng nào (cạnh ≥ 3 m) đứng cạnh nhau → bốn dải nối tiếp.
    expect(depth.bestCm).toBe(depth.oneEachCm);
    expect(depth.bestCm).toBeGreaterThan(1200);
    const loads = storeyLoads({
      program: [
        { id: 'garage_1', type: 'garage', level: '1', min_m2: 14 },
        { id: 'living_1', type: 'living', level: '1', min_m2: 18 },
        { id: 'kitchen_1', type: 'kitchen', level: '1', min_m2: 9 },
      ],
      minM2: () => 4,
      storeys: 1,
      stairAreaM2: 0,
      feasibility: { wallFactor: 1, hubM2: 0, tightRatio: 0.95 },
      envelopeM2: 60,
      maxFootprintM2: null,
      depth: {
        minSideCm: (type) => (type === 'garage' ? 460 : 300),
        areaFree: new Set(),
        stair: { width: 250, length: 414 },
        stairLabel: 'THANG',
        widthCm: 500,
        depthCm: 1200,
        wallCm: 28,
      },
    });
    expect(loads[0]!.verdict).toBe('over');
    expect(loadsIssue(loads, {})).toMatch(
      /xếp phòng cạnh nhau sát nhất vẫn cần sâu ~[\d.]+ m trên 12\.0 m/,
    );
  });

  it('đầu bài vượt sàn theo mức tối thiểu → dừng TRƯỚC lời gọi mô hình, câu báo gợi ý nới', async () => {
    const inflated = {
      ...nhaOng,
      required_spaces: (nhaOng.required_spaces ?? []).map((space) =>
        space.type === 'living' ? { ...space, area_m2: 45 } : space,
      ),
    } as AiBriefDigest;
    let calls = 0;
    const client = {
      async complete() {
        calls += 1;
        throw new Error('không được gọi');
      },
    };
    const error = await generateAiPlan({
      ...inputOf(inflated),
      briefRef: 'sha256:' + '0'.repeat(64),
      route: 'ai_text_fake',
      client,
      prompts,
      planVariants: false,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiPlanRejected);
    expect((error as AiPlanRejected).levels[0]!.messages[0]).toMatch(
      /tầng 1 cần tối thiểu.*gộp bếp và phòng ăn/,
    );
    expect(calls).toBe(0);
  });
});

describe('mức suy nghĩ (T1)', () => {
  it('kỹ sư chọn thì thắng; mặc định: vòng sửa đường dải trên OpenAI hạ low, Anthropic và lượt đầu giữ cấu hình', () => {
    expect(houseCallEffort('high', 'openai', true, true)).toBe('high');
    expect(houseCallEffort(null, 'openai', false, true)).toBeUndefined();
    expect(houseCallEffort(null, 'openai', true, true)).toBe('low');
    expect(houseCallEffort(null, 'anthropic', true, true)).toBeUndefined();
    expect(houseCallEffort(null, 'openai', true, false)).toBeUndefined();
  });
});
