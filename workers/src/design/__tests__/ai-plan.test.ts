/**
 * Bước xếp mặt bằng của nhánh AI (`ai/plan.ts`) — MỘT lượt cho cả nhà, mô hình khai Ý ĐỊNH, chương
 * trình kiểm theo đầu bài và xếp từng tầng (T43, T45).
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình: client giả trả ý định viết tay, nên mỗi phép thử nói đúng một
 * điều về MÃ chứ không về mô hình hôm nay trả gì.
 *
 * Những điều đáng canh nhất ở đây, và đều là tiền hoặc là niềm tin sai:
 *  · ý định xếp được thì ĐÚNG một lượt cho cả phương án;
 *  · đầu vào CHỈ là đầu bài + khảo sát — không có danh mục phòng nào từ bước chương trình không gian;
 *  · câu trả lời sai hợp đồng thì lấy mẫu lại, KHÔNG mang câu trả lời hỏng;
 *  · lý do khác thì gửi lại ý định ĐÃ ĐÁNH MÃ kèm lý do theo tầng;
 *  · tối đa BA lượt sửa — lượt thứ năm không bao giờ đi ra mạng;
 *  · vẫn hỏng thì KHÔNG đúc artifact.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { parseAreaNorms } from '../kb/space-norms';
import { aiFloorPlanSchema, aiHouseIntentSchema, type DesignBrief } from '@nvg/shared/design';
import { isRevisable } from '../ai/arrange';
import { briefMinimums, type HouseIntent } from '../ai/house';
import {
  AiPlanRejected,
  evaluateHouse,
  generateAiPlan,
  hintsFor,
  HOUSE_REVISIONS_MAX,
  houseIntentJsonSchema,
  northDegFor,
  planContext,
  programGenerator,
  retryPlan,
  type AiPlanInput,
  type HouseModelKnowledge,
  type PlanContextInput,
  type PlanVariant,
} from '../ai/plan';
import { PROGRAM_PREDICATES } from '../ai/program';
import { parseAiPrompts } from '../ai/prompts';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { MEASURABLE_ON_PLAN } from '../ai/rule-warnings';
import { knowledgeOf } from '../brief/narrative';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { parsePlanQuality } from '../ai/plan-quality';
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
import type {
  StructuredCallOptions,
  StructuredCallResult,
  TextModelClient,
} from '../llm/text-client';
import { digestOf, TOWNHOUSE, VILLA } from './ai-digest-fixtures';
import {
  TOWNHOUSE_HOUSE,
  TUBE_HOUSE,
  VILLA_HOUSE,
  VILLA_CRAMMED,
  crammedBrief,
  VILLA_ZONED,
} from './ai-house-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const areaNorms = parseAreaNorms(read('kb/space_norms.yaml'));

const vocabularyDoc = parseVocabulary(read('kb/room_vocabulary.yaml'));
const vocabulary = new VocabularyIndex(vocabularyDoc);
const groupsTable = roomGroups(vocabularyDoc);
const labels = Object.fromEntries(vocabularyDoc.types.map((t) => [t.code, t.vi]));
const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const siteContext = parseSiteContext(read('kb/site_context.yaml'));
const fidelity = parseBriefFidelity(read('kb/brief_fidelity.yaml'));
const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));
const experience = new RulePack(
  parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
  false,
);
const PACKS = { standards: new RulePack([], false), experience };
const emptyPack = selectedRulePack(NO_RULE_PACKS, PACKS);
const quality = parsePlanQuality(read('kb/plan_quality.yaml'));
const scoreRules = new RulePack(
  [
    ...parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
    ...parseRuleFile(read('rules/nvg-measured.yaml'), 'nvg-measured'),
  ],
  false,
);
const groups = {
  outdoor: new Set(groupsTable.outdoor ?? []),
  vertical: new Set(groupsTable.circulation ?? []),
  noDoorRequired: new Set(groupsTable.no_door_required ?? []),
  habitable: new Set(groupsTable.habitable ?? []),
  doorHosts: groupsTable.door_hosts ?? [],
  passage: passageRules(vocabularyDoc),
};

const BRIEF_REF = `sha256:${'b'.repeat(64)}`;
const VARIANT: PlanVariant = {
  id: 'AI-B',
  label: 'Lõi thang dồn về sau',
  strategy: 'Push the stair core to the back.',
};

/** Đầu bài khớp danh mục phòng mẫu: ba phòng ngủ + một phòng ngủ chính, không phòng thờ. */
const VILLA_BRIEF: DesignBrief = {
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

/** Nhà phố mẫu: ba phòng ngủ, không phòng ngủ chính. */
const TOWNHOUSE_BRIEF: DesignBrief = {
  ...TOWNHOUSE,
  family: [{ role: 'con', count: 3 }],
} as DesignBrief;

type House = 'villa' | 'townhouse';

interface FakeClient extends TextModelClient {
  options: StructuredCallOptions[];
}

/** Client giả trả lần lượt từng câu trả lời. */
function fakeClient(answers: unknown[]): FakeClient {
  const options: StructuredCallOptions[] = [];
  return {
    options,
    async complete(_route, _dataClass, callOptions): Promise<StructuredCallResult> {
      options.push(callOptions);
      const json = answers[options.length - 1];
      if (json === undefined)
        throw new Error(`Client giả hết câu trả lời ở lượt ${options.length}.`);
      return {
        json,
        provider: 'fake',
        model: 'fake-1',
        usage: { inputTokens: 100, outputTokens: 200 },
        latencyMs: 5,
      };
    },
  };
}

function contextInput(house: House, rules = emptyPack, brief?: DesignBrief): PlanContextInput {
  return {
    digest: digestOf(brief ?? (house === 'villa' ? VILLA_BRIEF : TOWNHOUSE_BRIEF)),
    variant: VARIANT,
    labels,
    vocabulary,
    fidelity,
    construction,
    siteContext,
    rules,
    groups,
    mergeAllowed: mergeAllowed(vocabularyDoc),
    zoneDefaults: zoneDefaults(vocabularyDoc),
    stairTypes: ['stair', 'core'],
    areaNorms,
    scoreRules,
    quality,
    roomGroups: groupsTable,
  };
}

function input(client: TextModelClient, house: House = 'villa', brief?: DesignBrief): AiPlanInput {
  return {
    ...contextInput(house, emptyPack, brief),
    briefRef: BRIEF_REF,
    route: 'ai_text_fake',
    client,
    prompts,
    quality,
    scoreRules,
    roomGroups: groupsTable,
  };
}

describe('Hướng bắc suy từ hướng nhà', () => {
  it('nhà hướng bắc thì bắc nằm phía sau nhà trên tờ vẽ', () => {
    expect(northDegFor('B')).toBe(180);
  });

  it('bốn hướng chính quay đúng chiều kim đồng hồ', () => {
    expect(northDegFor('D')).toBe(90);
    expect(northDegFor('N')).toBe(0);
    expect(northDegFor('T')).toBe(270);
  });

  it('thiếu hướng thì trả 0, không đoán', () => {
    expect(northDegFor(null)).toBe(0);
    expect(northDegFor(undefined)).toBe(0);
    expect(northDegFor('xyz')).toBe(0);
  });
});

describe('Lược đồ gửi cho mô hình', () => {
  const schema = houseIntentJsonSchema();
  const properties = schema.properties as Record<string, unknown>;

  it('là hợp đồng CẢ NHÀ `ai-house-intent` — có danh mục phòng, không cây, không toạ độ, không cửa', () => {
    expect(schema.$id).toBe('https://nvg.vn/contracts/ai-house-intent.schema.json');
    expect(properties.rooms).toBeDefined();
    expect(properties.relationships).toBeDefined();
    for (const gone of ['nodes', 'footprint', 'doors', 'levels', 'windows', 'walls', 'north_deg']) {
      expect(properties[gone], gone).toBeUndefined();
    }
  });

  it('không sửa tệp hợp đồng gốc khi sao', () => {
    houseIntentJsonSchema().properties = {} as never;
    expect((houseIntentJsonSchema().properties as Record<string, unknown>).rooms).toBeDefined();
  });
});

describe('Tri thức tiêm vào lời dẫn', () => {
  it('không tích gói nào thì không một ngưỡng nào đi vào lời dẫn (T20, mặc định)', () => {
    expect(planContext(contextInput('villa')).knowledge.constraints).toEqual([]);
  });

  it('tích gói kinh nghiệm thì CHỈ tiêm vị từ mà bước danh mục hoặc mặt bằng đo lại được', () => {
    const rules = selectedRulePack({ standards: false, experience: true }, PACKS);
    const { constraints } = planContext(contextInput('villa', rules)).knowledge;
    expect(constraints.length).toBeGreaterThan(0);
    for (const rule of constraints) {
      expect(
        PROGRAM_PREDICATES.has(rule.predicate) || MEASURABLE_ON_PLAN.has(rule.predicate),
        rule.predicate,
      ).toBe(true);
    }
  });

  it('gửi mô hình không lặp: ngưỡng diện tích gộp vào dải `room_area_m2`, quy tắc chỉ còn phần đọc được', () => {
    const rules = selectedRulePack({ standards: false, experience: true }, PACKS);
    const context = planContext(contextInput('villa', rules));
    const sent = context.modelKnowledge;
    const all = context.knowledge.constraints;
    const folded = all.filter(
      (rule) =>
        (rule.predicate === 'min_area' || rule.predicate === 'max_area') &&
        rule.target !== null &&
        rule.target in sent.room_area_m2,
    );
    expect(folded.length).toBeGreaterThan(0);
    expect(sent.constraints!.length).toBe(all.length - folded.length);
    for (const rule of folded) {
      const band = sent.room_area_m2[rule.target!]!;
      if (rule.predicate === 'min_area') expect(band[0]).toBeGreaterThanOrEqual(rule.value!);
      else expect(band[2]).toBeLessThanOrEqual(rule.value!);
      expect(sent.constraints!.some((entry) => entry.id === rule.id)).toBe(false);
    }
    for (const entry of sent.constraints!) {
      expect(entry).not.toHaveProperty('source');
      expect(entry).not.toHaveProperty('kind');
      expect(Object.values(entry)).not.toContain(null);
    }
  });

  it('chỉ đầu bài + khảo sát + từ vựng — không có danh mục phòng nào gửi sẵn', () => {
    const { knowledge } = planContext(contextInput('villa'));
    expect(knowledge).not.toHaveProperty('rooms');
    expect(knowledge.room_types.length).toBeGreaterThan(5);
    expect(knowledge.bedrooms_required).toEqual(
      expect.arrayContaining([{ type: 'master_bedroom', count: 1 }]),
    );
    expect(knowledge.floors).toBe(2);
    expect(knowledge.block_m).toEqual({ width: 15, depth: 16 });
    expect(knowledge.grid).toEqual({ columns: 3, rows: 3 });
    expect(planContext(contextInput('townhouse')).knowledge.grid).toEqual({ columns: 1, rows: 3 });
  });

  it('thang dựng từ tham số: số bậc và chiều dài ô thang do chương trình tính, gửi sẵn', () => {
    const { stair_geometry: stair } = planContext(contextInput('villa')).knowledge;
    expect(stair.risers).toBe(21);
    expect(stair.two_flights_length_m).toBeGreaterThan(2.5);
    expect(stair.one_flight_length_m).toBeGreaterThan(stair.two_flights_length_m!);
  });

  it('mọi `knowledge.<khoá>` lời dẫn nhắc tới đều có trong tri thức gửi đi (T46)', () => {
    // Đổi tên một khoá mà quên lời dẫn thì mô hình đọc một luật trỏ vào khoảng trống — không lỗi nào báo.
    const cited = [
      ...new Set(
        [...prompts.floorLevel.system.matchAll(/knowledge\.([a-z0-9_]+)/g)].map((m) => m[1]!),
      ),
    ];
    const optional = new Set(['constraints', 'garage_min_m2', 'stair_min_m']);
    const sent = planContext(contextInput('villa')).modelKnowledge as unknown as Record<
      string,
      unknown
    >;
    expect(cited.filter((key) => !(key in sent) && !optional.has(key))).toEqual([]);
    expect(Object.keys(sent).filter((key) => !cited.includes(key))).toEqual([]);
  });

  it('cặp phòng được ghép đi kèm, và không có hành lang nào trong đó', () => {
    const { knowledge } = planContext(contextInput('villa'));
    expect(knowledge.merge_allowed.length).toBeGreaterThan(0);
    expect(knowledge.merge_allowed.flat()).not.toContain('circulation');
  });

  it('đầu bài đi dạng văn xuôi tiếng Việt trong <brief>, đứng TRƯỚC tri thức', () => {
    const context = planContext(contextInput('villa'));
    expect(context.narrative).toMatch(/Biệt thự/);
    expect(context.narrative).not.toMatch(/"building_type"|biet_thu/);
  });
});

describe('Một lượt cho cả nhà khi ý định xếp được', () => {
  it('biệt thự 2 tầng: đúng MỘT lượt, đúc artifact qua được hợp đồng', async () => {
    const client = fakeClient([VILLA_HOUSE]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(1);
    expect(result.repaired).toBe(false);
    expect(result.resampledLevels).toEqual([]);
    expect(result.check.blocking).toEqual([]);
    expect(result.payload.levels).toHaveLength(2);
    expect(result.program.brief_ref).toBe(BRIEF_REF);

    const parsed = aiFloorPlanSchema.safeParse(result.payload);
    expect(
      parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    ).toEqual([]);
  });

  it('nhà phố 3 tầng: một lượt, ô thang tầng trên chồng khít tầng 1', async () => {
    const client = fakeClient([TOWNHOUSE_HOUSE]);
    const result = await generateAiPlan(input(client, 'townhouse'));

    expect(client.options).toHaveLength(1);
    const stairOf = (level: number) =>
      result.payload.levels[level - 1]!.rooms.find((room) => room.id === `stair_${level}`)!;
    for (const level of [2, 3]) {
      // So LỌT LÒNG: tim tường trùng khít, lọt lòng lệch tối đa nửa bề dày tường.
      const wall = Math.round(construction.walls.exterior_m * 100) / 2;
      stairOf(level).rect.forEach((edge, i) =>
        expect(Math.abs(edge - stairOf(1).rect[i]!), `tầng ${level} cạnh ${i}`).toBeLessThanOrEqual(
          wall,
        ),
      );
    }
    expect(result.payload.levels).toHaveLength(3);
  });

  it('điền đúng các trường Worker giữ quyền, lưu Ý ĐỊNH, CÂY và tóm tắt bộ giải của từng tầng', async () => {
    const { payload, program } = await generateAiPlan(input(fakeClient([VILLA_HOUSE])));

    expect(payload.variant_id).toBe('AI-B');
    expect(payload.strategy).toBe(VARIANT.strategy);
    expect(payload.variant_label).toBe(VILLA_HOUSE.variant_label);
    expect(payload.generator).toMatchObject({
      provider: 'fake',
      route: 'ai_text_fake',
      prompt_version: prompts.version,
      layout: 'intent',
      walls_derived: true,
      resampled_levels: [],
    });
    for (const [i, level] of payload.levels.entries()) {
      expect(level.outline_faces).toHaveLength(level.outline.length);
      expect(level.tree!.nodes.length).toBeGreaterThan(0);
      expect(level.arrange!.passed).toBeGreaterThan(0);
      expect(level.intent!.rooms.map((room) => room.id)).toEqual(
        program.spaces.filter((space) => space.level === i + 1).map((space) => space.id),
      );
    }
    // Bản phác mô hình vẽ đi thẳng qua cổng ở mọi tầng (T48): cây dựng từ bản phác, không từ khung vùng.
    for (const level of payload.levels)
      expect(level.arrange!.parti, `tầng ${level.level}`).toMatch(/phac-/);
  });

  it('danh mục phòng dựng từ ý định: mã tạm của mô hình đổi sang khuôn type_n, diện tích giữ nguyên', async () => {
    const tam = (id: string) => `tam_${id}`;
    const temporary: HouseIntent = {
      ...VILLA_HOUSE,
      rooms: VILLA_HOUSE.rooms.map((room) => ({
        ...room,
        id: tam(room.id),
        ensuite_of: room.ensuite_of && tam(room.ensuite_of),
      })),
      relationships: VILLA_HOUSE.relationships.map((rel) => ({
        ...rel,
        a: tam(rel.a),
        b: tam(rel.b),
      })),
      entry_room: VILLA_HOUSE.entry_room && tam(VILLA_HOUSE.entry_room),
      garage_room: VILLA_HOUSE.garage_room && tam(VILLA_HOUSE.garage_room),
    };
    const { program } = await generateAiPlan(input(fakeClient([temporary])));
    expect(program.spaces.every((space) => /^[a-z_]+_\d+$/.test(space.id))).toBe(true);
    expect(program.spaces.find((space) => space.id === 'living_1')?.target_area_m2).toBe(
      VILLA_HOUSE.rooms.find((room) => room.id === 'living_1')!.target_area_m2,
    );
  });

  it('cùng ý định → cùng artifact từng byte (cùng mã băm)', async () => {
    const once = await generateAiPlan(input(fakeClient([VILLA_HOUSE])));
    const twice = await generateAiPlan(input(fakeClient([VILLA_HOUSE])));
    expect(JSON.stringify(twice.payload)).toBe(JSON.stringify(once.payload));
  });

  it('lời gọi không chứa chữ nào về thước chấm hay về thứ Worker tự điền', async () => {
    const client = fakeClient([VILLA_HOUSE]);
    await generateAiPlan(input(client));
    const sent = `${client.options[0]!.system}${client.options[0]!.prompt}`;
    for (const leak of ['score', 'plan_quality', 'outline_faces', 'north_deg', 'usable']) {
      expect(sent, leak).not.toContain(leak);
    }
    expect(knowledgeOf<HouseModelKnowledge>(client.options[0]!.prompt).strategy).toBe(
      VARIANT.strategy.trim().replace(/\s+/g, ' '),
    );
  });

  it('không truyền trần token từ nơi gọi — tuyến là van duy nhất', async () => {
    const client = fakeClient([VILLA_HOUSE]);
    await generateAiPlan(input(client));
    expect(client.options[0]!.maxOutputTokens).toBeUndefined();
  });
});

describe('Vòng sửa tối đa ba lượt (T45)', () => {
  it('câu trả lời sai HỢP ĐỒNG: lấy mẫu lại, không kèm câu trả lời hỏng, lời dẫn hệ thống không đổi', async () => {
    const client = fakeClient([{ sai: true }, VILLA_HOUSE]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(2);
    expect(result.repaired).toBe(true);
    const [firstCall, retry] = client.options;
    expect(retry!.prompt).toContain('did not match the schema');
    expect(retry!.prompt).toMatch(/FRESH\s+intent/);
    expect(retry!.prompt).not.toContain('<previous_intent>');
    // Lời dẫn hệ thống và phần đầu thân lời gọi giữ nguyên từng byte như lượt đầu: nhà cung cấp
    // đọc lại từ bộ nhớ đệm, tính giá token vào đã lưu đệm.
    expect(retry!.system).toBe(firstCall!.system);
    expect(retry!.prompt.startsWith(firstCall!.prompt)).toBe(true);
  });

  it('danh mục sai đầu bài (thiếu chỗ để xe): gửi lại ý định cũ kèm lý do bằng tiếng người đọc được', async () => {
    const noGarage: HouseIntent = {
      ...VILLA_HOUSE,
      rooms: VILLA_HOUSE.rooms.map((room) =>
        room.type === 'garage' ? { ...room, type: 'storage' } : room,
      ),
      garage_room: null,
    };
    const client = fakeClient([noGarage, VILLA_HOUSE]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(2);
    expect(result.repaired).toBe(true);
    expect(client.options[1]!.prompt).toContain('<previous_intent>');
    expect(client.options[1]!.prompt).toMatch(/Thiếu Chỗ để xe|garage/i);
  });

  it('lỗi HÌNH HỌC (hai phòng lớn không vừa khối nhà): dừng sau đúng một lượt, không gọi lại mô hình — tài liệu bàn giao mục 08', async () => {
    const client = fakeClient([VILLA_CRAMMED, VILLA_HOUSE]);
    const error = await generateAiPlan(input(client, 'villa', crammedBrief(VILLA_BRIEF))).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(AiPlanRejected);
    expect(client.options).toHaveLength(1);
    const [rejection] = (error as AiPlanRejected).levels;
    expect(rejection!.level).toBe(1);
    expect(rejection!.retry).toBe('none');
    expect(rejection!.attempts).toBe(1);
    expect(rejection!.messages.join(' ')).toMatch(/chỉ chia được|chỉ rộng|tối thiểu/);
  });

  it(`lỗi NGỮ NGHĨA mãi không sửa được thì BÁC sau ${HOUSE_REVISIONS_MAX} lượt sửa — đúng ${HOUSE_REVISIONS_MAX + 1} lượt gọi`, async () => {
    const noGarage: HouseIntent = {
      ...VILLA_HOUSE,
      rooms: VILLA_HOUSE.rooms.map((room) =>
        room.type === 'garage' ? { ...room, type: 'storage' } : room,
      ),
      garage_room: null,
    };
    const client = fakeClient([noGarage, noGarage, noGarage, noGarage, VILLA_HOUSE]);
    const error = await generateAiPlan(input(client)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiPlanRejected);
    expect(client.options).toHaveLength(HOUSE_REVISIONS_MAX + 1);
    const [rejection] = (error as AiPlanRejected).levels;
    expect(rejection!.level).toBe(0);
    expect(rejection!.retry).toBe('revise');
    expect(rejection!.attempts).toBe(HOUSE_REVISIONS_MAX + 1);
    for (const call of client.options.slice(1)) expect(call.prompt).toContain('<previous_intent>');
  });

  it('quyết định gọi lại nằm ở MỘT chỗ: sai hợp đồng → lấy mẫu lại; còn lại → sửa kèm ý định đã đánh mã', () => {
    expect(retryPlan({ intent: null, issues: ['sai'] }, null).kind).toBe('resample');
    const revise = retryPlan(
      { intent: VILLA_HOUSE, issues: [] },
      { hints: ['- Storey 1: x'], renamed: TOWNHOUSE_HOUSE },
    );
    expect(revise.kind).toBe('revise');
    expect(revise.previous).toBe(TOWNHOUSE_HOUSE);
    expect(revise.avoid).toEqual(['- Storey 1: x']);
    // Có lý do mà không dòng nào ngữ nghĩa: mọi lỗi là hình học — dừng.
    expect(
      retryPlan({ intent: VILLA_HOUSE, issues: [] }, { hints: [], renamed: TOWNHOUSE_HOUSE }).kind,
    ).toBe('none');
  });

  it('chỉ lỗi về danh mục, vùng, diện tích, phòng mang cửa chính được gửi lại; phòng không cửa, ô hẹp, thang ngắn thì không', () => {
    for (const code of [
      'arrange_zone_overfull',
      'arrange_program_exceeds_footprint',
      'entrance_wrong_side',
      'vehicle_door_wrong_side',
    ]) {
      expect(isRevisable(code), code).toBe(true);
    }
    for (const code of [
      'room_without_door',
      'room_unreachable_on_level',
      'arrange_room_too_narrow',
      'arrange_stair_too_short',
      'arrange_room_below_brief_area',
      'arrange_anchor_conflict',
      'ma_moi_chua_xep_loai',
    ]) {
      expect(isRevisable(code), code).toBe(false);
    }
  });

  it('ghi chú dựng từ mã lỗi và tham số, không dịch câu tiếng Việt; có tiền tố tầng', () => {
    const lines = hintsFor(
      [
        {
          code: 'room_without_door',
          level: 'blocking',
          message: 'câu tiếng Việt',
          params: { room: 'storage_1', neighbours: 'stair_1, wc_1' },
        },
        { code: 'ma_chua_co', level: 'blocking', message: 'x', ref: 'n7' },
      ],
      prompts,
      'Storey 2: ',
    );
    expect(lines[0]).toMatch(/^- Storey 2: Room "storage_1" had no door/);
    expect(lines[0]).toContain('stair_1, wc_1');
    expect(lines[1]).toContain('ma_chua_co');
    expect(lines[1]).toContain('n7');
    expect(lines.join('')).not.toContain('câu tiếng Việt');
  });
});

describe('Diện tích đầu bài khai là sàn cứng (T45)', () => {
  it('ghép dòng đầu bài có diện tích vào phòng cùng loại, lớn với lớn; tầng ghim ghép trước', () => {
    const digest = digestOf({
      ...VILLA_BRIEF,
      required_spaces: [
        { type: 'bedroom', area_m2: 20 },
        { type: 'bedroom', floor: 1, area_m2: 18 },
        { type: 'living' },
      ],
    } as DesignBrief);
    const context = planContext(contextInput('villa'));
    const evaluation = evaluateHouse(
      { ...contextInput('villa'), quality, scoreRules, roomGroups: groupsTable },
      context,
      VILLA_HOUSE,
      programGenerator(
        {
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: 0,
        },
        'ai_text_fake',
        prompts.version,
        false,
      ),
      prompts,
    );
    const minimums = briefMinimums(digest, evaluation.ok!.program);
    // bedroom_1 là phòng ngủ DUY NHẤT ở tầng 1: dòng ghim tầng 1 lấy nó; dòng không ghim lấy phòng ngủ
    // lớn nhất còn lại (bedroom_2, 50 m²).
    expect(minimums.get('bedroom_1')).toBe(18);
    expect(minimums.get('bedroom_2')).toBe(20);
    expect(minimums.has('living_1')).toBe(false);
  });

  it('phòng dựng ra nhỏ hơn mức đầu bài khai thì tầng bị bác, dù danh mục đã khai đủ', () => {
    const brief = {
      ...VILLA_BRIEF,
      required_spaces: (VILLA_BRIEF.required_spaces ?? []).map((row) =>
        row.type === 'living' ? { ...row, area_m2: 40 } : row,
      ),
    } as DesignBrief;
    const source = {
      ...contextInput('villa', emptyPack, brief),
      quality,
      scoreRules,
      roomGroups: groupsTable,
    };
    // Danh mục khai phòng khách đúng 40 m² (đạt bộ kiểm danh mục) nhưng dồn năm phòng vào cùng vùng
    // với nó: bộ giải không cho nó đủ 40 m² lọt lòng.
    const crowded: HouseIntent = {
      ...VILLA_HOUSE,
      rooms: VILLA_HOUSE.rooms.map((room) =>
        room.level === 1 && room.type !== 'stair' ? { ...room, zone: 'front_left' } : room,
      ),
    };
    const evaluation = evaluateHouse(
      source,
      planContext(source),
      crowded,
      programGenerator(
        {
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: 0,
        },
        'ai_text_fake',
        prompts.version,
        false,
      ),
      prompts,
    );
    if (evaluation.ok) {
      const living = evaluation.ok.levels[0]!.level.rooms.find((room) => room.id === 'living_1')!;
      expect(Math.round(living.area_m2 * 10) / 10).toBeGreaterThanOrEqual(40);
    } else {
      expect(evaluation.rejections.flatMap((r) => r.messages).join(' ')).toMatch(
        /tối thiểu|không dựng|không xếp/,
      );
    }
  });
});

describe('Nhà ống 4 × 15 m (ví dụ mẫu cũ của lời dẫn)', () => {
  it('xếp được qua trọn cổng', () => {
    const example = aiHouseIntentSchema.parse(TUBE_HOUSE);
    const brief = {
      ...TOWNHOUSE,
      site: { width_m: 4, depth_m: 15 },
      floors: 2,
      family: [
        { role: 'vo_chong', count: 2 },
        { role: 'con', count: 1 },
      ],
      required_spaces: [{ type: 'garage' }],
      parking: { cars: 1 },
    } as unknown as DesignBrief;
    const source = {
      ...contextInput('townhouse', emptyPack, brief),
      quality,
      scoreRules,
      roomGroups: groupsTable,
    };
    const evaluation = evaluateHouse(
      source,
      planContext(source),
      example,
      programGenerator(
        {
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 0, outputTokens: 0 },
          latencyMs: 0,
        },
        'ai_text_fake',
        prompts.version,
        false,
      ),
      prompts,
    );
    expect(evaluation.rejections).toEqual([]);
    expect(evaluation.ok?.levels).toHaveLength(2);
  });
});

describe('Bản phác lưới và hành lang chương trình thêm (T48)', () => {
  const generator = programGenerator(
    { provider: 'fake', model: 'fake-1', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 },
    'ai_text_fake',
    prompts.version,
    false,
  );
  const evaluate = (house: HouseIntent, kind: House = 'villa') => {
    const source = { ...contextInput(kind), quality, scoreRules, roomGroups: groupsTable };
    return evaluateHouse(source, planContext(source), house, generator, prompts);
  };

  it('bản phác thiếu một phòng: không bác — lùi về xếp theo vùng suy từ bản phác, ghi chú nói rõ', () => {
    const house: HouseIntent = {
      ...VILLA_HOUSE,
      sketches: VILLA_HOUSE.sketches.map((sketch) =>
        sketch.level === 1
          ? { ...sketch, rows: sketch.rows.map((row) => row.replace(/wc_1/g, 'stair_1')) }
          : sketch,
      ),
    };
    const evaluation = evaluate(house);
    expect(evaluation.rejections).toEqual([]);
    const ground = evaluation.ok!.levels[0]!;
    expect(ground.arrange.parti).not.toMatch(/phac-/);
    const codes = ground.notes.map((note) => note.code);
    expect(codes).toContain('sketch_fallback');
    expect(ground.notes.find((note) => note.code === 'sketch_fallback')!.message).toMatch(/"wc_1"/);
  });

  it('mô hình bỏ hành lang tầng 1: chương trình thêm một hành lang, danh mục phòng mang nó, ghi chú nói rõ', () => {
    const dropped = new Set(
      VILLA_ZONED.rooms
        .filter((room) => room.level === 1 && room.type === 'circulation')
        .map((room) => room.id),
    );
    expect(dropped.size).toBe(1);
    const house: HouseIntent = {
      ...VILLA_ZONED,
      rooms: VILLA_ZONED.rooms.filter((room) => !dropped.has(room.id)),
      relationships: VILLA_ZONED.relationships.filter(
        (rel) => !dropped.has(rel.a) && !dropped.has(rel.b),
      ),
    };
    const evaluation = evaluate(house);
    expect(evaluation.rejections).toEqual([]);
    const ground = evaluation.ok!.levels[0]!;
    const note = ground.notes.find((n) => n.code === 'arrange_hall_inserted');
    expect(note?.message).toMatch(/thêm hành lang "circulation_\d+"/);
    const added = note!.message.match(/"(circulation_\d+)"/)![1]!;
    expect(evaluation.ok!.program.spaces.find((space) => space.id === added)).toMatchObject({
      level: 1,
      type: 'circulation',
    });
    expect(ground.level.rooms.map((room) => room.id)).toContain(added);
  });

  it('tầng đã khai hành lang thì không thêm hành lang nào', () => {
    const evaluation = evaluate(VILLA_HOUSE);
    for (const level of evaluation.ok!.levels) {
      expect(level.notes.map((note) => note.code)).not.toContain('arrange_hall_inserted');
    }
  });
});

describe('Đường đi hằng ngày không được xuyên gara (T48)', () => {
  const generator = programGenerator(
    { provider: 'fake', model: 'fake-1', usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 },
    'ai_text_fake',
    prompts.version,
    false,
  );

  it('bản phác đặt thang sau gara: phương án bị BÁC, và lý do gửi được cho mô hình sửa', () => {
    // Đúng hình tầng 1 của lượt đo 58d9ff66 mà Haan chấm «giao thông bất tiện»: đổi chỗ WC và ô thang
    // trong bản phác mẫu là thang chỉ còn giáp gara, không giáp phòng khách.
    const walledOff: HouseIntent = {
      ...VILLA_HOUSE,
      sketches: VILLA_HOUSE.sketches.map((sketch) =>
        sketch.level === 1
          ? {
              ...sketch,
              rows: sketch.rows.map((row) =>
                row.replace(
                  'wc_1 wc_1 stair_1 stair_1 stair_1',
                  'stair_1 stair_1 stair_1 wc_1 wc_1',
                ),
              ),
            }
          : sketch,
      ),
    };
    const source = { ...contextInput('villa'), quality, scoreRules, roomGroups: groupsTable };
    const evaluation = evaluateHouse(source, planContext(source), walledOff, generator, prompts);
    // Cổng BÁC bản phác ấy. Bộ xếp còn các vòng nới nên tầng vẫn có thể ra phương án khác — nhưng phương
    // án ra được KHÔNG BAO GIỜ là hình mô hình vẽ, và ghi chú phải nói đúng vì sao.
    const ground = evaluation.ok?.levels[0];
    const notes = (ground?.notes ?? []).map((note) => `${note.code}: ${note.message}`).join(' ');
    const messages = evaluation.rejections.flatMap((rejection) => rejection.messages).join(' ');
    expect(`${notes} ${messages}`).toMatch(/đi xuyên "garage_1"/);
    if (ground) expect(ground.arrange.parti).not.toMatch(/phac-/);
    // Lỗi NGỮ NGHĨA: mô hình vẽ sai chỗ, nên lượt sửa là đáng tiền.
    expect(isRevisable('route_through_service')).toBe(true);
  });
});
