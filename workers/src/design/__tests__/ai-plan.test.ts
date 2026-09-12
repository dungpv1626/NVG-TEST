/**
 * Bước xếp mặt bằng của nhánh AI (`ai/plan.ts`) — vòng gọi, lượt sửa, và lưới an toàn T19.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình: client giả trả về fixture viết tay, nên mỗi phép thử nói
 * đúng một điều về MÃ chứ không về mô hình hôm nay trả gì.
 *
 * Ba điều đáng canh nhất ở đây, và cả ba đều là tiền hoặc là niềm tin sai:
 *  · mô hình KHÔNG bao giờ được khai sáu trường Worker điền (mã phương án, hướng bắc…);
 *  · đúng MỘT lượt sửa, và lượt sửa làm bản vẽ tệ đi thì giữ bản cũ;
 *  · tường sai sau lượt sửa thì suy hộ, và cờ `walls_derived` phải bật.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import type { AiFloorPlan, AiSpaceProgram } from '@nvg/shared/design';
import {
  AiPlanRejected,
  generateAiPlan,
  keepRepaired,
  northDegFor,
  planContext,
  planProposalJsonSchema,
  stripWorkerFields,
  type AiPlanInput,
  type PlanVariant,
} from '../ai/plan';
import { parseAiPrompts } from '../ai/prompts';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { MEASURABLE_ON_PLAN } from '../ai/rule-warnings';
import { parseConstructionNorms } from '../kb/construction';
import { parseSiteContext } from '../kb/site-context';
import { parseVocabulary, roomGroups } from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import type {
  StructuredCallOptions,
  StructuredCallResult,
  TextModelClient,
} from '../llm/text-client';
import { digestOf, TOWNHOUSE } from './ai-digest-fixtures';
import { roomsProposalOf, TOWNHOUSE_PLAN } from './ai-plan-fixtures';

const read = (p: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${p}`, import.meta.url)), 'utf8');

const vocabulary = parseVocabulary(read('kb/room_vocabulary.yaml'));
const groups = roomGroups(vocabulary);
const labels = Object.fromEntries(vocabulary.types.map((t) => [t.code, t.vi]));
const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const siteContext = parseSiteContext(read('kb/site_context.yaml'));
const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));
const nationalRules = new RulePack(
  [
    '00-meta',
    '10-dimensions',
    '20-daylight-access',
    '30-adjacency',
    '40-vertical',
    '50-massing',
  ].flatMap((name) => parseRuleFile(read(`rules/base/${name}.yaml`), name)),
  false,
);
const PACKS = { standards: nationalRules, experience: nationalRules };
const emptyPack = selectedRulePack(NO_RULE_PACKS, PACKS);

const PROGRAM_REF = `sha256:${'b'.repeat(64)}`;
const digest = digestOf(TOWNHOUSE);
const doorExemptTypes = new Set(groups.no_door_required ?? []);
const verticalTypes = new Set(groups.circulation ?? []);
const outdoorTypes = new Set(groups.outdoor ?? []);

const VARIANT: PlanVariant = {
  id: 'AI-B',
  label: 'Lõi thang dồn về sau',
  strategy: 'Push the stair core to the back.',
};

/** Chương trình không gian suy từ chính fixture — bộ kiểm so hai bên với nhau. */
function programOf(plan: AiFloorPlan): AiSpaceProgram {
  return {
    schema_version: '1.0.0',
    brief_ref: `sha256:${'c'.repeat(64)}`,
    spaces: plan.levels.flatMap((level) =>
      level.rooms.map((room) => ({
        id: room.id,
        type: room.type,
        level: level.level,
        target_area_m2: room.area_m2,
        ensuite_of: null,
        why: null,
      })),
    ),
    rationale: 'Fixture.',
    assumptions: [],
    generator: {
      kind: 'ai',
      provider: 'fixture',
      model: 'viet-tay',
      route: 'fixture',
      prompt_version: '0.0.0',
    },
  };
}

const PROGRAM = programOf(TOWNHOUSE_PLAN);

/**
 * Phần mô hình khai (T23): phòng và lỗ mở trên cạnh phòng, suy từ artifact fixture.
 *
 * `stripWorkerFields` vẫn đi qua đây vì đó là thứ đường chạy thật dùng — và vì một trong các phép
 * thử bên dưới cố tình nhồi thêm sáu trường Worker điền để chứng minh chúng bị lược, không bị bác.
 */
function proposalOf(plan: AiFloorPlan): Record<string, unknown> {
  return stripWorkerFields(roomsProposalOf(plan)) as Record<string, unknown>;
}

interface FakeClient extends TextModelClient {
  options: StructuredCallOptions[];
}

/** Client giả: trả lần lượt các câu trả lời đã dựng, và giữ lại lời dẫn để soi. */
function fakeClient(answers: readonly unknown[]): FakeClient {
  const options: StructuredCallOptions[] = [];
  return {
    options,
    async complete(_route, _dataClass, callOptions): Promise<StructuredCallResult> {
      options.push(callOptions);
      const json = answers[options.length - 1];
      if (json === undefined) throw new Error('Client giả đã hết câu trả lời.');
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

function input(client: TextModelClient, rules = emptyPack): AiPlanInput {
  return {
    digest,
    program: PROGRAM,
    programRef: PROGRAM_REF,
    variant: VARIANT,
    route: 'ai_text_fake',
    client,
    prompts,
    labels,
    construction,
    siteContext,
    rules,
    doorExemptTypes,
    verticalTypes,
    outdoorTypes,
  };
}

describe('Hướng bắc suy từ hướng nhà', () => {
  it('nhà hướng bắc thì bắc nằm phía sau nhà trên tờ vẽ', () => {
    // Trục +y chạy vào sâu thửa, tức ngược hướng nhà. Nhà hướng bắc → +y chỉ về nam → bắc lệch
    // 180° so với +y.
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
  const schema = planProposalJsonSchema();
  const properties = schema.properties as Record<string, unknown>;

  it('không hỏi mô hình sáu trường Worker điền, và không hỏi TƯỜNG (T23)', () => {
    for (const key of [
      'schema_version',
      'program_ref',
      'variant_id',
      'strategy',
      'north_deg',
      'generator',
    ]) {
      expect(properties[key], key).toBeUndefined();
      expect(schema.required as string[]).not.toContain(key);
    }
    // Và tuyệt đối không có `walls`: đó là chỗ T23 cắt, và cũng là chỗ dễ quay lại nhất vì
    // artifact vẫn có nó.
    const level = ((schema.$defs as Record<string, { properties?: Record<string, unknown> }>).level
      ?.properties ?? {}) as Record<string, unknown>;
    expect(level.walls).toBeUndefined();
    expect(level.rooms).toBeDefined();
  });

  it('là hợp đồng `ai-plan-rooms`, gửi nguyên vẹn không cắt gì', () => {
    expect(properties.levels).toBeDefined();
    expect(schema.$defs).toBeDefined();
    expect((schema.required as string[]).sort()).toEqual(['levels', 'rationale', 'variant_label']);
    expect(schema.$id).toBe('https://nvg.vn/contracts/ai-plan-rooms.schema.json');
  });

  it('không sửa tệp hợp đồng gốc khi sao', () => {
    // `structuredClone` chứ không trả thẳng đối tượng đã import: cùng một tệp JSON được nhiều tệp
    // khác import, và sửa nó là sửa cho cả bản dựng.
    planProposalJsonSchema().properties = {} as never;
    expect((planProposalJsonSchema().properties as Record<string, unknown>).levels).toBeDefined();
  });
});

describe('Tri thức tiêm vào lời dẫn', () => {
  it('không tích gói nào thì không một ngưỡng nào đi vào lời dẫn (T20, mặc định)', () => {
    const context = planContext({
      digest,
      program: PROGRAM,
      variant: VARIANT,
      labels,
      construction,
      siteContext,
      rules: emptyPack,
    });
    expect(context.knowledge.constraints).toEqual([]);
  });

  it('tích gói quy chuẩn thì CHỈ tiêm vị từ mà bước này đo lại được', () => {
    const context = planContext({
      digest,
      program: PROGRAM,
      variant: VARIANT,
      labels,
      construction,
      siteContext,
      rules: selectedRulePack({ standards: true, experience: false }, PACKS),
    });
    expect(context.knowledge.constraints.length).toBeGreaterThan(0);
    for (const rule of context.knowledge.constraints) {
      expect(MEASURABLE_ON_PLAN.has(rule.predicate), rule.predicate).toBe(true);
    }
  });

  it('hình bao xây được gửi đi bằng cm nguyên, cùng đơn vị mô hình phải khai', () => {
    const context = planContext({
      digest,
      program: PROGRAM,
      variant: VARIANT,
      labels,
      construction,
      siteContext,
      rules: emptyPack,
    });
    const box = context.knowledge.buildable_cm;
    for (const value of [box.x0, box.y0, box.x1, box.y1]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(box.x1 - box.x0).toBe(500);
    expect(box.y1 - box.y0).toBe(1800);
  });
});

describe('Một lượt gọi là đủ khi mô hình khai đúng', () => {
  it('đúc artifact đầy đủ và không gọi lượt thứ hai', async () => {
    const client = fakeClient([proposalOf(TOWNHOUSE_PLAN)]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(1);
    expect(result.repaired).toBe(false);
    // LUÔN `true` từ T23: tường của nhánh AI không còn đường nào khác để ra đời.
    expect(result.wallsDerived).toBe(true);
    expect(result.check.blocking).toEqual([]);
    expect(result.calls).toHaveLength(1);
  });

  it('điền đúng sáu trường Worker giữ quyền, không lấy của mô hình', async () => {
    const client = fakeClient([proposalOf(TOWNHOUSE_PLAN)]);
    const { payload } = await generateAiPlan(input(client));

    expect(payload.program_ref).toBe(PROGRAM_REF);
    expect(payload.variant_id).toBe('AI-B');
    expect(payload.strategy).toBe(VARIANT.strategy);
    expect(payload.schema_version).toBe('1.0.0');
    expect(payload.generator.provider).toBe('fake');
    expect(payload.generator.route).toBe('ai_text_fake');
    expect(payload.generator.prompt_version).toBe(prompts.version);
  });

  it('bỏ qua sáu trường đó nếu mô hình vẫn khai, thay vì đốt một lượt sửa', async () => {
    // Một khoá thừa mà ta ghi đè ngay sau đó không đáng một lượt gọi tính tiền. Khoá LẠ thì
    // vẫn phải chặn — xem phép thử bác bỏ ở dưới.
    const client = fakeClient([
      { ...proposalOf(TOWNHOUSE_PLAN), variant_id: 'AI-Z', north_deg: 123 },
    ]);
    const { payload } = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(1);
    expect(payload.variant_id).toBe('AI-B');
    expect(payload.north_deg).toBe(northDegFor(digest.site.orientation));
  });
});

describe('Đúng một lượt sửa', () => {
  /** Bỏ một phòng khỏi tầng 1 — bộ kiểm báo `room_missing`, thuộc nhóm KHÔNG phải tường. */
  function missingRoom(): Record<string, unknown> {
    const plan = structuredClone(TOWNHOUSE_PLAN);
    plan.levels[0]!.rooms = plan.levels[0]!.rooms.slice(1);
    return proposalOf(plan);
  }

  it('sai kiểm thì gọi lại một lần, kèm bản cũ và danh sách lỗi', async () => {
    const client = fakeClient([missingRoom(), proposalOf(TOWNHOUSE_PLAN)]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(2);
    expect(result.repaired).toBe(true);
    expect(result.check.blocking).toEqual([]);

    const repairPrompt = client.options[1]!;
    // Lượt sửa phải mang bản cũ để mô hình VÁ, và mang đúng câu lỗi để nó biết vá chỗ nào.
    expect(repairPrompt.prompt).toContain('"previous"');
    expect(repairPrompt.system).toContain('mặt bằng không xếp phòng này');
  });

  it('không có lượt thứ ba: sai tiếp thì vẫn lưu kèm lỗi còn lại', async () => {
    const client = fakeClient([missingRoom(), missingRoom()]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(2);
    expect(result.check.blocking.map((i) => i.code)).toContain('room_missing');
    // Vẫn có artifact để trả về: bác cả bản là bắt người dùng mua thêm một loạt lượt gọi.
    expect(result.payload.levels.length).toBe(TOWNHOUSE_PLAN.levels.length);
  });

  it('lượt sửa làm tệ hơn thì giữ bản cũ', async () => {
    const worse = structuredClone(TOWNHOUSE_PLAN);
    worse.levels[0]!.rooms = worse.levels[0]!.rooms.slice(2);
    const client = fakeClient([missingRoom(), proposalOf(worse)]);
    const result = await generateAiPlan(input(client));

    // Bản cũ bỏ MỘT phòng, bản sửa bỏ HAI — nên bản sửa nhiều lỗi chặn hơn và bị loại. Số lỗi của
    // bản cũ suy ra từ chính nó, không viết cứng: thêm một cổng kiểm mới là đổi con số ấy, và một
    // phép thử viết cứng sẽ đỏ vì lý do chẳng liên quan gì tới điều nó đang nói.
    const keptRooms = result.payload.levels[0]!.rooms.length;
    expect(keptRooms).toBe(TOWNHOUSE_PLAN.levels[0]!.rooms.length - 1);
    expect(keepRepaired(result.check.blocking.length, result.check.blocking.length + 1)).toBe(
      false,
    );
  });

  it('lượt sửa trả cấu trúc hỏng thì giữ bản cũ, không mất kết quả', async () => {
    const client = fakeClient([missingRoom(), { levels: 'không phải mảng' }]);
    const result = await generateAiPlan(input(client));

    expect(result.check.blocking.map((i) => i.code)).toContain('room_missing');
    expect(result.payload.levels.length).toBeGreaterThan(0);
  });

  it('lượt đầu sai CẤU TRÚC thì lượt sau vẫn mang lý do, không gọi lại y nguyên', async () => {
    // Không có bản cũ để vá, nhưng vẫn có lý do cụ thể để nói. Gọi lại đúng lời dẫn cũ là mua
    // thêm một lượt để nhận lại đúng cái sai vừa rồi.
    const client = fakeClient([{ levels: 'không phải mảng' }, proposalOf(TOWNHOUSE_PLAN)]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(2);
    expect(client.options[1]!.system).not.toBe(client.options[0]!.system);
    expect(client.options[1]!.system).toContain('Sai cấu trúc');
    expect(client.options[1]!.prompt).not.toContain('"previous"');
    expect(result.check.blocking).toEqual([]);
  });

  it('không lượt nào cho ra cấu trúc đọc được thì bác, không đúc artifact', async () => {
    const client = fakeClient([{ sai: true }, { cũng_sai: true }]);
    await expect(generateAiPlan(input(client))).rejects.toBeInstanceOf(AiPlanRejected);
  });
});

describe('T23 — mô hình khai phòng, chương trình suy tường', () => {
  it('lỗ mở neo vào CẠNH PHÒNG trong lời gọi, và neo vào ĐOẠN TƯỜNG trong artifact', async () => {
    const client = fakeClient([proposalOf(TOWNHOUSE_PLAN)]);
    const { payload } = await generateAiPlan(input(client));

    // Phần mô hình khai: `room` + `edge`, không có `wall`.
    const sent = JSON.parse(client.options[0]!.prompt) as { knowledge: unknown };
    expect(sent).toHaveProperty('knowledge');
    const proposal = proposalOf(TOWNHOUSE_PLAN) as {
      levels: { doors: { room: string; edge: string; wall?: string }[] }[];
    };
    const firstSent = proposal.levels[0]!.doors[0]!;
    expect(firstSent.room).toBeTruthy();
    expect(firstSent.edge).toBeTruthy();
    expect(firstSent.wall).toBeUndefined();

    // Artifact: ngược lại hoàn toàn — `wall` có, `room`/`edge` không.
    const firstBuilt = payload.levels[0]!.doors![0]! as { wall: string; room?: string };
    expect(payload.levels[0]!.walls.some((wall) => wall.id === firstBuilt.wall)).toBe(true);
    expect(firstBuilt.room).toBeUndefined();
  });

  it('cờ `walls_derived` LUÔN bật, và tờ vẽ luôn nói ra', async () => {
    const client = fakeClient([proposalOf(TOWNHOUSE_PLAN)]);
    const result = await generateAiPlan(input(client));
    expect(result.wallsDerived).toBe(true);
    expect(result.payload.generator.walls_derived).toBe(true);
  });

  it('`outline_faces` do Worker điền, đúng số cạnh, và không hỏi mô hình', async () => {
    const client = fakeClient([proposalOf(TOWNHOUSE_PLAN)]);
    const { payload } = await generateAiPlan(input(client));

    for (const level of payload.levels) {
      expect(level.outline_faces).toHaveLength(level.outline.length);
    }
    // Đầu bài `TOWNHOUSE` khai hai bên giáp nhà hàng xóm, nên hai cạnh hông phải là `boundary` —
    // và lời gọi gửi cho mô hình KHÔNG chứa trường này.
    expect(payload.levels[0]!.outline_faces).toContain('boundary');
    expect(client.options[0]!.prompt).not.toContain('outline_faces');
  });

  it('cửa trỏ vào phòng không có, hoặc vượt khỏi cạnh, đều CHẶN và đi vào lượt sửa', async () => {
    const bad = structuredClone(proposalOf(TOWNHOUSE_PLAN)) as {
      levels: { doors: { room: string; at: number; w: number }[] }[];
    };
    bad.levels[0]!.doors[0]!.room = 'khong_co_phong_nay';
    bad.levels[0]!.doors[1]!.at = 9_000;
    const client = fakeClient([bad, proposalOf(TOWNHOUSE_PLAN)]);
    const result = await generateAiPlan(input(client));

    expect(client.options).toHaveLength(2);
    const repairPrompt = client.options[1]!.system;
    expect(repairPrompt).toContain('khong_co_phong_nay');
    expect(repairPrompt).toMatch(/chỉ dài \d+ cm/);
    expect(result.check.blocking).toEqual([]);
  });

  it('cửa sổ trên cạnh chung với phòng TRONG NHÀ bị chặn', async () => {
    const bad = structuredClone(proposalOf(TOWNHOUSE_PLAN)) as {
      levels: { windows: { id: string; room: string; edge: string; at: number; w: number }[] }[];
    };
    // Cạnh sau của chỗ để xe là vách chung với phòng khách — một cửa sổ ở đó không tồn tại được.
    bad.levels[0]!.windows = [{ id: 'sx', room: 'garage_1', edge: 'back', at: 10, w: 80 }];
    const client = fakeClient([bad, bad]);
    const result = await generateAiPlan(input(client));

    const codes = result.check.blocking.map((issue) => issue.code);
    expect(codes).toContain('window_on_interior_edge');
  });
});
