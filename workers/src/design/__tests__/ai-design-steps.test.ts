/**
 * Phần nghiệp vụ của Workflow nhánh AI (`workflows/ai-design-steps.ts`) — một lượt cho cả nhà (T45).
 *
 * Canh ba điều mà Workflow dựa vào và không tự kiểm được:
 *  · mã bước ổn định theo LƯỢT — màn hình tiến độ và nhật ký bám vào đúng chuỗi ấy;
 *  · một lượt gọi ghi nhật ký chi phí với mã mục đích TÁCH lượt đầu khỏi lượt sửa;
 *  · bước ghi KHÔNG đúc artifact nào — kể cả danh mục phòng — khi cả nhà trượt cổng liên tầng; trả
 *    `rejected` thay vì ném, để Workflow không thử lại một phép thuần nhiều lần.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình, KHÔNG chạm CSDL: client giả, kho giả.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseAreaNorms } from '../kb/space-norms';
import type { AiFloorPlan, AiSpaceProgram, DesignBrief } from '@nvg/shared/design';
import type { Rect } from '../ai/draw/geometry';
import { arrangedLevel, arrangeFor, planContext, type ArrangedLevel } from '../ai/plan';
import { parsePlanQuality } from '../ai/plan-quality';
import { parseAiPrompts } from '../ai/prompts';
import { RulePack } from '../rules/rule-pack';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { parseSiteContext } from '../kb/site-context';
import {
  mergeAllowed,
  parseVocabulary,
  passageRules,
  roomGroups,
  VocabularyIndex,
  zoneDefaults,
} from '../kb/vocabulary';
import type { TextModelClient } from '../llm/text-client';
import {
  arrangeHouseStep,
  houseStepId,
  keepBest,
  planStepSpecs,
  proposeHouse,
  writePlan,
  type AiDesignParams,
  type PlanStepDeps,
} from '../workflows/ai-design-steps';
import { digestOf, TOWNHOUSE, VILLA } from './ai-digest-fixtures';
import { crammedBrief, VILLA_CRAMMED, VILLA_HOUSE } from './ai-house-fixtures';
import { TOWNHOUSE_INTENTS } from './ai-intent-fixtures';
import { TOWNHOUSE_PROGRAM } from './ai-tree-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const areaNorms = parseAreaNorms(read('kb/space_norms.yaml'));

const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groupsTable = roomGroups(vocabulary);

interface Recorded {
  inserts: Record<string, unknown>[];
  writes: unknown[];
}

function depsWith(client: TextModelClient): { deps: PlanStepDeps; recorded: Recorded } {
  const recorded: Recorded = { inserts: [], writes: [] };
  const db = {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        recorded.inserts.push(row);
        return { error: null };
      },
    }),
  };
  const repo = {
    db,
    write: async (input: unknown) => {
      recorded.writes.push(input);
      return { id: `sha256:${'a'.repeat(64)}`, reused: false };
    },
  };
  const deps = {
    client,
    prompts: parseAiPrompts(load(read('kb/ai_design_prompts.yaml'))),
    labels: Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi])),
    vocabulary: new VocabularyIndex(vocabulary),
    fidelity: parseBriefFidelity(read('kb/brief_fidelity.yaml')),
    construction: parseConstructionNorms(read('kb/construction_norms.yaml')),
    siteContext: parseSiteContext(read('kb/site_context.yaml')),
    rules: new RulePack([], false),
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
    areaNorms,
    quality: parsePlanQuality(read('kb/plan_quality.yaml')),
    scoreRules: new RulePack([], false),
    roomGroups: groupsTable,
    repo,
    provider: 'fake',
    model: 'fake-1',
  } as unknown as PlanStepDeps;
  return { deps, recorded };
}

/** Đầu bài khớp ý định biệt thự mẫu: ba phòng ngủ + một phòng ngủ chính. */
const VILLA_BRIEF = {
  ...VILLA,
  family: [
    { role: 'ong_ba', count: 2 },
    { role: 'vo_chong', count: 2 },
    { role: 'con', count: 2 },
  ],
  required_spaces: [
    { type: 'living' },
    { type: 'kitchen' },
    { type: 'dining' },
    { type: 'wc' },
    { type: 'garage' },
  ],
} as DesignBrief;

const PARAMS: AiDesignParams = {
  runId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  companyId: '00000000-0000-4000-8000-000000000003',
  projectId: '00000000-0000-4000-8000-000000000004',
  actorId: null,
  discipline: 'kien_truc',
  stage: 'plan',
  textRoute: 'ai_text_fake',
  briefRef: `sha256:${'c'.repeat(64)}`,
  digest: digestOf(VILLA_BRIEF),
  rulePacks: { standards: false, experience: false },
  variants: [{ id: 'AI-A', label: 'A', strategy: 'Stair in the middle.' }],
};
const VARIANT = PARAMS.variants[0]!;

const answering = (json: unknown): TextModelClient => ({
  async complete() {
    return {
      json,
      provider: 'fake',
      model: 'fake-1',
      usage: { inputTokens: 10, outputTokens: 20 },
      latencyMs: 3,
    };
  },
});

const CALL = {
  provider: 'fake',
  model: 'fake-1',
  usage: { inputTokens: 1, outputTokens: 1 },
  latencyMs: 1,
};

describe('mã bước theo lượt', () => {
  it('mỗi phương án: «AI khai cả nhà · kiểm và xếp», rồi «lưu»; lượt sửa mang số lượt', () => {
    const specs = planStepSpecs(PARAMS.variants);
    expect(specs.map((s) => s.id)).toEqual([
      'plan:AI-A:propose:1',
      'plan:AI-A:arrange:1',
      'plan:AI-A:write',
    ]);
    expect(specs[0]!.label).toBe('AI khai ý định cả nhà · AI-A');
    expect(specs[1]!.label).toBe('Kiểm và xếp phòng các tầng · AI-A');
    expect(houseStepId('AI-A', 'propose', 3)).toBe('plan:AI-A:propose:3');
  });
});

describe('một lượt gọi', () => {
  it('ghi nhật ký chi phí, TÁCH lượt đầu khỏi lượt sửa', async () => {
    const { deps, recorded } = depsWith(answering(VILLA_HOUSE));
    const first = await proposeHouse(deps, PARAMS, VARIANT, 1);
    await proposeHouse(deps, PARAMS, VARIANT, 2, ['- avoid this']);

    expect(first.intentJson).not.toBeNull();
    expect(recorded.inserts.map((row) => row.purpose)).toEqual(['plan_house', 'plan_house_revise']);
    expect(recorded.inserts.every((row) => row.status === 'ok')).toBe(true);
  });

  it('câu trả lời sai hợp đồng: ghi `rejected`, không ném — lấy mẫu lại là việc của lớp gọi', async () => {
    const { deps, recorded } = depsWith(answering({ sai: true }));
    const outcome = await proposeHouse(deps, PARAMS, VARIANT, 1);
    expect(outcome.intentJson).toBeNull();
    expect(outcome.issues.length).toBeGreaterThan(0);
    expect(recorded.inserts[0]!.status).toBe('rejected');
  });

  it('đầu vào chỉ là đầu bài + khảo sát: thân lời gọi không mang danh mục phòng nào', async () => {
    const prompts: string[] = [];
    const client: TextModelClient = {
      async complete(_route, _dc, options) {
        prompts.push(options.prompt);
        return {
          json: VILLA_HOUSE,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    const { deps } = depsWith(client);
    await proposeHouse(deps, PARAMS, VARIANT, 1);
    expect(prompts[0]!.startsWith('<brief>')).toBe(true);
    expect(prompts[0]).not.toMatch(/"spaces"|"target_area_m2"/);
  });
});

describe('mức suy nghĩ của lượt chạy (13/09/2026)', () => {
  it('đi tới đúng lời gọi mô hình; vắng thì không gửi gì', async () => {
    const seen: Array<string | undefined> = [];
    const client: TextModelClient = {
      async complete(_route, _dc, options) {
        seen.push(options.reasoningEffort);
        return {
          json: VILLA_HOUSE,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 3,
        };
      },
    };
    const { deps } = depsWith(client);
    await proposeHouse(deps, { ...PARAMS, reasoningEffort: 'low' }, VARIANT, 1);
    await proposeHouse(deps, PARAMS, VARIANT, 1);
    expect(seen).toEqual(['low', undefined]);
  });
});

describe('lượt sửa gửi ý định cũ; lấy mẫu lại thì không', () => {
  it('`previousJson` đi vào thân lời gọi khi sửa, vắng khi lấy mẫu lại', async () => {
    const prompts: string[] = [];
    const client: TextModelClient = {
      async complete(_route, _dc, options) {
        prompts.push(options.prompt);
        return {
          json: VILLA_HOUSE,
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 10, outputTokens: 20 },
          latencyMs: 3,
        };
      },
    };
    const { deps } = depsWith(client);
    await proposeHouse(deps, PARAMS, VARIANT, 2, ['- fix it'], JSON.stringify(VILLA_HOUSE));
    await proposeHouse(deps, PARAMS, VARIANT, 2, ['- fix it']);
    expect(prompts[0]).toContain('<previous_intent>');
    expect(prompts[0]).toContain('"garage_room"');
    expect(prompts[1]).not.toContain('<previous_intent>');
    // Phần gọi lại nối SAU đầu bài và tri thức — tiền tố giữ nguyên để nhà cung cấp đọc bộ nhớ đệm.
    expect(prompts[0]!.startsWith('<brief>')).toBe(true);
  });
});

describe('bước kiểm và xếp cả nhà', () => {
  it('ý định đúng: có danh mục và mọi tầng, không gọi lại', () => {
    const { deps } = depsWith(answering(null));
    const step = arrangeHouseStep(
      deps,
      PARAMS,
      VARIANT,
      { intentJson: JSON.stringify(VILLA_HOUSE), issues: [], call: CALL },
      1,
    );
    expect(step.arrangedJson).not.toBeNull();
    const house = JSON.parse(step.arrangedJson!) as { program: AiSpaceProgram; levels: unknown[] };
    expect(house.levels).toHaveLength(2);
    expect(house.program.spaces.length).toBe(VILLA_HOUSE.rooms.length);
    // Không có ngưỡng điểm thì xếp được là xong.
    const noThreshold = { ...deps, quality: { ...deps.quality, acceptPercent: null } };
    const plain = arrangeHouseStep(
      noThreshold,
      PARAMS,
      VARIANT,
      { intentJson: JSON.stringify(VILLA_HOUSE), issues: [], call: CALL },
      1,
    );
    expect(plain.retry).toBe('none');
    expect(plain.hints).toEqual([]);
  });

  it('xếp được nhưng dưới ngưỡng 65 (T53): gọi sửa kèm tiêu chí mất điểm, gửi lại ý định đã đánh mã', () => {
    const { deps } = depsWith(answering(null));
    const threshold = (acceptPercent: number) =>
      arrangeHouseStep(
        { ...deps, quality: { ...deps.quality, acceptPercent } },
        PARAMS,
        VARIANT,
        { intentJson: JSON.stringify(VILLA_HOUSE), issues: [], call: CALL },
        1,
      );
    const percent = threshold(100).score!.percent!;
    expect(percent).toBeGreaterThan(0);
    const below = threshold(Math.min(100, percent + 1));
    expect(below.arrangedJson).not.toBeNull();
    expect(below.retry).toBe('revise');
    expect(below.hints.length).toBeGreaterThan(0);
    expect(below.hints.length).toBeLessThanOrEqual(3);
    expect(JSON.parse(below.previousJson!)).toHaveProperty('sketches');
    const passed = threshold(Math.max(1, percent - 1));
    expect(passed.retry).toBe('none');
    expect(passed.previousJson).toBeNull();
  });

  it('câu trả lời sai hợp đồng: lấy mẫu lại với ghi chú tiếng Anh, không kèm ý định cũ', () => {
    const { deps } = depsWith(answering(null));
    const step = arrangeHouseStep(
      deps,
      PARAMS,
      VARIANT,
      { intentJson: null, issues: ['Sai cấu trúc ở rooms: Required'], call: CALL },
      1,
    );
    expect(step.arrangedJson).toBeNull();
    expect(step.retry).toBe('resample');
    expect(step.previousJson).toBeNull();
    expect(step.rejections).toEqual([{ level: 0, messages: ['Sai cấu trúc ở rooms: Required'] }]);
    expect(step.hints.join('\n')).toMatch(/did not match the schema/);
  });

  it('diện tích vượt sàn xây được: GỌI LẠI để sửa — diện tích nay là của mô hình (T45)', () => {
    const tooBig = {
      ...VILLA_HOUSE,
      rooms: VILLA_HOUSE.rooms.map((room) =>
        room.level === 1 ? { ...room, target_area_m2: room.target_area_m2 * 3 } : room,
      ),
    };
    const { deps } = depsWith(answering(null));
    const step = arrangeHouseStep(
      deps,
      PARAMS,
      VARIANT,
      { intentJson: JSON.stringify(tooBig), issues: [], call: CALL },
      1,
    );
    expect(step.arrangedJson).toBeNull();
    expect(step.retry).toBe('revise');
    expect(step.rejections[0]!.messages.join(' ')).toMatch(/vượt sàn xây được/);
    expect(step.previousJson).toContain('"rooms"');
  });

  it('chỉ còn lỗi hình học (hai phòng lớn không vừa khối nhà): KHÔNG gọi lại — không ghi chú, không gửi ý định cũ', () => {
    const { deps } = depsWith(answering(null));
    const step = arrangeHouseStep(
      deps,
      { ...PARAMS, digest: digestOf(crammedBrief(VILLA_BRIEF)) },
      VARIANT,
      { intentJson: JSON.stringify(VILLA_CRAMMED), issues: [], call: CALL },
      1,
    );
    expect(step.arrangedJson).toBeNull();
    expect(step.retry).toBe('none');
    expect(step.hints).toEqual([]);
    expect(step.previousJson).toBeNull();
    expect(step.rejections[0]!.messages.join(' ')).toMatch(/chỉ chia được|chỉ rộng|tối thiểu/);
  });
});

describe('bước ghi', () => {
  it('cả nhà qua cổng liên tầng: đúc danh mục phòng rồi mặt bằng trỏ vào nó, cả hai không đặt head', async () => {
    const { deps, recorded } = depsWith(answering(null));
    const step = arrangeHouseStep(
      deps,
      PARAMS,
      VARIANT,
      { intentJson: JSON.stringify(VILLA_HOUSE), issues: [], call: CALL },
      1,
    );
    const result = await writePlan(deps, PARAMS, VARIANT, step.arrangedJson!, CALL, [], 1);
    expect('written' in result).toBe(true);
    expect(recorded.writes).toHaveLength(2);
    const [program, plan] = recorded.writes as Array<{
      kind: string;
      payload: unknown;
      inputs: string[];
      setHead: boolean;
    }>;
    expect(program!.kind).toBe('ai_space_program');
    expect(program!.inputs).toEqual([PARAMS.briefRef]);
    expect((program!.payload as AiSpaceProgram).brief_ref).toBe(PARAMS.briefRef);
    expect(plan!.kind).toBe('ai_floor_plan');
    expect(plan!.setHead).toBe(false);
    expect(program!.setHead).toBe(false);
    const payload = plan!.payload as AiFloorPlan;
    expect(payload.program_ref).toBe(`sha256:${'a'.repeat(64)}`);
    expect(payload.generator?.layout).toBe('intent');
    // T53: ý định đầy đủ (có bản phác) nằm trong artifact cho lượt sửa bố cục; kết quả mang % và ngưỡng.
    expect(payload.house_intent).toHaveProperty('sketches');
    if ('written' in result) {
      expect(result.written.acceptPercent).toBe(65);
      expect(result.written.belowThreshold).toBe(
        result.written.percent !== null && result.written.percent < 65,
      );
    }
    for (const level of payload.levels) {
      expect(level.intent?.rooms.length).toBeGreaterThan(0);
      expect(level.arrange?.passed).toBeGreaterThan(0);
      expect(level.tree?.nodes.length).toBeGreaterThan(0);
    }
  });

  it('thang hai tầng không chồng khít: KHÔNG đúc artifact nào, trả lý do', async () => {
    // Nhà phố 3 tầng: tầng 2 xếp với một mốc SAI — ô thang dời lên 1 m — như thể bước truyền mốc nhận
    // nhầm mốc. Bộ giải một tầng không thấy gì; chỉ cổng liên tầng lúc ghi mới thấy hai vế lệch.
    const brief = { ...TOWNHOUSE, family: [{ role: 'con', count: 3 }] } as DesignBrief;
    const params: AiDesignParams = { ...PARAMS, digest: digestOf(brief) };
    const { deps, recorded } = depsWith(answering(null));
    const source = {
      digest: params.digest,
      variant: VARIANT,
      labels: deps.labels,
      vocabulary: deps.vocabulary,
      fidelity: deps.fidelity,
      construction: deps.construction,
      siteContext: deps.siteContext,
      rules: deps.rules,
      groups: deps.groups,
      mergeAllowed: deps.mergeAllowed,
      zoneDefaults: deps.zoneDefaults,
      stairTypes: deps.stairTypes,
    };
    const context = planContext(source);
    const at = (level: number, anchors: Parameters<typeof arrangeFor>[5]) => {
      const result = arrangeFor(
        source,
        context,
        TOWNHOUSE_PROGRAM,
        level,
        TOWNHOUSE_INTENTS[level - 1]!,
        anchors,
      );
      expect(
        result.issues.map((i) => i.message),
        `tầng ${level}`,
      ).toEqual([]);
      return result;
    };
    const first = at(1, null);
    const anchors = first.layout!.anchors!;
    const shift = (r: Rect) => ({ ...r, y0: r.y0 - 100, y1: r.y1 - 100 });
    const second = at(2, { ...anchors, stair: shift(anchors.stair!) });
    const third = at(3, anchors);
    const levels = [first, second, third].map((r) => arrangedLevel(r)!) as ArrangedLevel[];
    const result = await writePlan(
      deps,
      params,
      VARIANT,
      JSON.stringify({ program: TOWNHOUSE_PROGRAM, levels }),
      CALL,
      [],
      1,
    );

    expect('rejected' in result).toBe(true);
    expect('rejected' in result && result.rejected.join(' ')).toMatch(/lệch \d+ cm/);
    expect(recorded.writes).toHaveLength(0);
  });
});

describe('keepBest — giữ bản điểm cao nhất qua các lượt sửa vì điểm (T53)', () => {
  const entry = (percent: number | null, tag: string) => ({
    arrangedJson: tag,
    call: CALL,
    percent,
    failedLevels: [],
  });

  it('bản đầu tiên luôn được giữ', () => {
    expect(keepBest(null, entry(40, 'a')).arrangedJson).toBe('a');
  });

  it('lượt sửa điểm cao hơn thì thay, thấp hơn hoặc bằng thì giữ bản cũ', () => {
    expect(keepBest(entry(58, 'a'), entry(63, 'b')).arrangedJson).toBe('b');
    expect(keepBest(entry(63, 'a'), entry(58, 'b')).arrangedJson).toBe('a');
    expect(keepBest(entry(63, 'a'), entry(63, 'b')).arrangedJson).toBe('a');
    expect(keepBest(entry(null, 'a'), entry(10, 'b')).arrangedJson).toBe('b');
  });
});
