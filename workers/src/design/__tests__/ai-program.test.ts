/**
 * Chương trình không gian do AI lập (`ai/program.ts`) — kiểm bằng client giả, không mạng.
 *
 * Năm điều bộ này canh:
 *  1. **Lời dẫn không mang ngưỡng quy chuẩn** (T14). Đây là ràng buộc dễ mất nhất: chỉ cần một
 *     lần "thêm min_m2 vào tri thức cho mô hình đỡ đoán" là nhánh AI thành bộ giải kém hơn.
 *  2. Đề xuất sai bị bác bằng câu tiếng Việt cụ thể, và lượt sửa nhận đúng những câu đó.
 *  3. Đúng MỘT lượt sửa — không vòng lặp, vì mỗi lượt là tiền thật.
 *  4. Kết quả đi qua hợp đồng `ai-space-program` RIÊNG của nhánh, không phải `space-program`
 *     của bộ giải, và mã phòng đánh theo khuôn `type_n`.
 *  5. Cảnh báo quy chuẩn KHÔNG chặn, và danh sách quy tắc chưa đối chiếu được luôn khác rỗng.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { aiSpaceProgramSchema, type AiSpaceProgramProposal } from '@nvg/shared/design';
import {
  AiProgramRejected,
  checkProposal,
  generateAiProgram,
  programFromProposal,
  programKnowledge,
} from '../ai/program';
import { buildableFromDigest } from '../ai/buildable';
import { parseAiPrompts } from '../ai/prompts';
import { parseRuleMessages } from '../ai/plan-messages';
import { reviewProgramAreas } from '../ai/rule-warnings';
import { parseConstructionNorms } from '../kb/construction';
import { parseVocabulary, VocabularyIndex } from '../kb/vocabulary';
import { parseRuleFile, RulePack } from '../rules/rule-pack';
import type {
  StructuredCallOptions,
  StructuredCallResult,
  TextModelClient,
} from '../llm/text-client';
import { digestOf, VILLA } from './ai-digest-fixtures';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const read = (p: string) => readFileSync(root(p), 'utf8');

const vocabulary = new VocabularyIndex(parseVocabulary(read('kb/room_vocabulary.yaml')));
const labels = Object.fromEntries(vocabulary.vocabulary.types.map((t) => [t.code, t.vi]));
const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));
const messages = parseRuleMessages(read('rules/messages.vi.yaml'));

/** Gói quy chuẩn QUỐC GIA thật — cảnh báo phải đo trên `rules/base/`, không trên bản giả. */
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

const REF = `sha256:${'a'.repeat(64)}`;
const digest = digestOf(VILLA);
const buildable = buildableFromDigest(digest);
const knowledge = programKnowledge({ digest, vocabulary, labels, buildable, construction });

/** Đề xuất hợp lệ: đủ phòng đầu bài đòi, đủ phòng ngủ theo gia đình, vừa sàn xây được. */
function goodProposal(): AiSpaceProgramProposal {
  return {
    schema_version: '1.0.0',
    spaces: [
      { id: 'a1', type: 'living', level: 1, target_area_m2: 40 },
      { id: 'a2', type: 'kitchen', level: 1, target_area_m2: 16 },
      { id: 'a3', type: 'dining', level: 1, target_area_m2: 20 },
      { id: 'a4', type: 'wc', level: 1, target_area_m2: 4 },
      { id: 'a5', type: 'garage', level: 1, target_area_m2: 25 },
      { id: 'a6', type: 'altar_room', level: 2, target_area_m2: 14 },
      { id: 'a7', type: 'bedroom', level: 1, target_area_m2: 18 },
      { id: 'a8', type: 'master_bedroom', level: 2, target_area_m2: 26 },
      { id: 'a9', type: 'bedroom', level: 2, target_area_m2: 16 },
      { id: 'a10', type: 'bedroom', level: 2, target_area_m2: 16 },
      { id: 'a11', type: 'wc', level: 2, target_area_m2: 5, ensuite_of: 'a8' },
      { id: 'a12', type: 'stair', level: 1, target_area_m2: 12 },
      { id: 'a13', type: 'stair', level: 2, target_area_m2: 12 },
    ],
    rationale: 'Sinh hoạt chung tầng trệt, phòng ngủ tầng hai, thang giữa nhà.',
    assumptions: ['Ông bà ở tầng trệt vì đi lại khó.'],
  };
}

/** Client giả trả lần lượt từng phản hồi, ghi lại lời dẫn để soi. */
function fakeClient(replies: unknown[]): TextModelClient & { calls: StructuredCallOptions[] } {
  const calls: StructuredCallOptions[] = [];
  return {
    calls,
    async complete(_route, _dataClass, options): Promise<StructuredCallResult> {
      calls.push(options);
      const json = replies.shift();
      if (json === undefined) throw new Error('client giả hết phản hồi — gọi quá số lượt cho phép');
      return {
        json,
        provider: 'fake',
        model: 'fake-1',
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 1,
      };
    },
  };
}

describe('Tri thức gửi cho mô hình', () => {
  /**
   * Bài này là hàng rào chính của T14, và nó có một giới hạn phải nói rõ.
   *
   * Chỉ soi ngưỡng KHÔNG NGUYÊN: ngưỡng nguyên (1, 3, 4) trùng với số tầng, số phòng và chỉ số
   * mảng nên soi chúng chỉ sinh báo động giả — bài học 09/09/2026.
   *
   * Và phải TRỪ những con số cũng có mặt trong `kb/construction_norms.yaml`. Chín trên mười
   * lăm ngưỡng không nguyên trùng số với một quy ước cấu tạo: `0,9` vừa là bề rộng tối thiểu
   * của hành lang (quy chuẩn) vừa là bề rộng cánh cửa đi (quy ước NVG). Trùng số không phải
   * trùng nghĩa, và con số ấy đến đây từ `kb/` — đúng chỗ được phép. Đo bằng chuỗi thì không
   * có cách nào phân biệt hai nguồn, nên bài này canh phần còn lại (1,2 và 2,4) và nhường
   * phần trùng cho bài kiểm CẤU TRÚC ngay dưới.
   */
  it('KHÔNG mang một ngưỡng quy chuẩn nào (T14) — chỉ từ vựng, đầu bài và quy ước cấu tạo', () => {
    const text = JSON.stringify(knowledge);
    const fromKb = JSON.stringify(construction);

    const thresholds = nationalRules.rules
      .flatMap((r) => [r.params.value_m, r.params.value_m2, r.params.value])
      .map(Number)
      .filter((n) => Number.isFinite(n) && !Number.isInteger(n))
      .filter((n) => !fromKb.includes(String(n)));
    expect(
      thresholds.length,
      'không còn ngưỡng nào để soi — bài kiểm đã mất tác dụng',
    ).toBeGreaterThan(0);

    for (const value of new Set(thresholds)) {
      expect(text, `ngưỡng ${value} lọt vào tri thức`).not.toContain(String(value));
      expect(text).not.toContain(String(value).replace('.', ','));
    }
  });

  /**
   * Hàng rào thứ hai, và là hàng rào thật sự bền: soi HÌNH DẠNG chứ không soi con số.
   *
   * Cách hỏng dễ xảy ra nhất không phải một con số lẻ lọt vào, mà là ai đó thêm `min_m2` /
   * `max_m2` / `priority` vào `room_types` cho "mô hình đỡ đoán". Lúc ấy nhánh AI thành bộ giải
   * bằng một công cụ dở hơn — đúng thứ T14 sinh ra để tránh. Khoá lạ ở đây là đỏ ngay.
   */
  it('mỗi loại phòng chỉ mang mã, nhãn và nhóm — không diện tích, không thứ tự ưu tiên', () => {
    for (const entry of knowledge.room_types) {
      expect(Object.keys(entry).sort()).toEqual(['code', 'group', 'vi']);
    }
  });

  it('mang thứ mô hình THẬT SỰ cần: từ vựng, số phòng ngủ, sàn xây được, quy ước cấu tạo', () => {
    expect(knowledge.room_types.some((t) => t.code === 'altar_room')).toBe(true);
    expect(knowledge.bedrooms_required).toContainEqual({ type: 'master_bedroom', count: 1 });
    expect(knowledge.buildable_per_level_m2).toHaveLength(VILLA.floors);
    expect(knowledge.required_by_brief).toContain('altar_room');
    expect(JSON.stringify(knowledge.construction)).toContain('storey_height_m');
  });

  it('sàn xây được trừ đúng khoảng lùi mà ĐẦU BÀI khai, không phải khoảng lùi quy chuẩn', () => {
    // Biệt thự 15×20, đầu bài khai lùi trước 4 m → 15 × 16 = 240 m².
    expect(buildable.widthM).toBe(15);
    expect(buildable.depthM).toBe(16);
    expect(buildable.areaM2).toBe(240);
  });
});

describe('Bộ kiểm đề xuất', () => {
  it('đề xuất hợp lệ thì ĐẠT', () => {
    expect(checkProposal(goodProposal(), knowledge, labels)).toEqual([]);
  });

  it('nói ra từng lỗi bằng tiếng Việt: mã lạ, sai tầng, sai số phòng ngủ, vượt sàn, thiếu phòng', () => {
    const bad = goodProposal();
    bad.spaces.push({ id: 'x1', type: 'sauna', level: 1, target_area_m2: 6 });
    bad.spaces.push({ id: 'x2', type: 'bedroom', level: 9, target_area_m2: 12 });
    bad.spaces.find((s) => s.type === 'living')!.target_area_m2 = 10_000;
    bad.spaces = bad.spaces.filter((s) => s.type !== 'altar_room');

    const issues = checkProposal(bad, knowledge, labels);
    expect(issues.some((i) => /"sauna" không có trong từ vựng/.test(i))).toBe(true);
    expect(issues.some((i) => /tầng 9 nhưng nhà chỉ có 2 tầng/.test(i))).toBe(true);
    expect(issues.some((i) => /Cần đúng \d+ Phòng ngủ/.test(i))).toBe(true);
    expect(issues.some((i) => /vượt sàn xây được/.test(i))).toBe(true);
    expect(issues.some((i) => /Thiếu Phòng thờ/.test(i))).toBe(true);
  });

  it('không gian bắt buộc lấy từ ĐẦU BÀI, không từ danh sách mặc định của hệ thống', () => {
    // Đầu bài không đòi bể bơi, nên thiếu bể bơi không phải lỗi.
    expect(checkProposal(goodProposal(), knowledge, labels)).toEqual([]);
    expect(knowledge.required_by_brief).toEqual([
      ...new Set(VILLA.required_spaces!.map((s) => s.type)),
    ]);
  });

  it('`ensuite_of` trỏ vào mã không có thì bị bắt', () => {
    const bad = goodProposal();
    bad.spaces.find((s) => s.id === 'a11')!.ensuite_of = 'khong_co';
    expect(
      checkProposal(bad, knowledge, labels).some((i) =>
        /không có không gian nào mang mã đó/.test(i),
      ),
    ).toBe(true);
  });
});

describe('Dựng artifact từ đề xuất', () => {
  it('đi qua hợp đồng RIÊNG của nhánh AI, id theo khuôn type_n, ensuite ánh xạ đúng', () => {
    const { payload, notes } = programFromProposal({
      proposal: {
        ...goodProposal(),
        spaces: goodProposal().spaces.map((s) => ({ ...s, why: 'lý do' })),
      },
      briefRef: REF,
      generator: {
        kind: 'ai',
        provider: 'fake',
        model: 'fake-1',
        route: 'ai_text_fake',
        prompt_version: '1.0.0',
      },
    });

    expect(aiSpaceProgramSchema.safeParse(payload).success).toBe(true);
    expect(payload.generator.kind).toBe('ai');
    expect(payload.brief_ref).toBe(REF);
    for (const s of payload.spaces) {
      expect(s.id).toMatch(new RegExp(`^${s.type}_\\d+$`));
      expect(s.level).toBeGreaterThanOrEqual(1);
    }
    // Vệ sinh khép kín trỏ sang mã MỚI của phòng ngủ chính, không giữ mã tạm của mô hình.
    const ensuite = payload.spaces.find((s) => s.ensuite_of)!;
    expect(ensuite.ensuite_of).toBe('master_bedroom_1');
    expect(Object.keys(notes).length).toBe(payload.spaces.length);
  });

  it('KHÔNG mang trường nào của hợp đồng bộ giải', () => {
    const { payload } = programFromProposal({
      proposal: goodProposal(),
      briefRef: REF,
      generator: {
        kind: 'ai',
        provider: 'fake',
        model: 'fake-1',
        route: 'ai_text_fake',
        prompt_version: '1.0.0',
      },
    });
    const text = JSON.stringify(payload);
    for (const field of [
      'floor_allocation',
      'adjacency',
      'priors_applied',
      'min_area_m2',
      'needs_daylight',
    ]) {
      expect(text, `${field} là trường của bộ giải`).not.toContain(field);
    }
  });
});

describe('generateAiProgram', () => {
  const run = (client: TextModelClient) =>
    generateAiProgram({
      digest,
      briefRef: REF,
      route: 'ai_text_fake',
      client,
      prompts,
      vocabulary,
      labels,
      construction,
    });

  it('đề xuất đạt ngay → một lượt gọi; lời dẫn mang tri thức, không mang danh tính', async () => {
    const client = fakeClient([goodProposal()]);
    const out = await run(client);
    expect(out.repaired).toBe(false);
    expect(out.calls).toHaveLength(1);
    expect(out.payload.generator).toMatchObject({ kind: 'ai', provider: 'fake', model: 'fake-1' });

    const prompt = client.calls[0]!.prompt;
    expect(prompt).toContain('"bedrooms_required"');
    expect(prompt).toContain('"buildable_per_level_m2"');
    expect(prompt).not.toContain('project_code');
    expect(prompt).not.toContain('budget_range_vnd');
    expect(client.calls[0]!.system).toBe(prompts.program.system);
  });

  it('sai lượt đầu → sửa MỘT lần với danh sách lỗi cụ thể → đạt', async () => {
    const bad = goodProposal();
    bad.spaces = bad.spaces.filter((s) => s.type !== 'altar_room');
    const client = fakeClient([bad, goodProposal()]);
    const out = await run(client);
    expect(out.repaired).toBe(true);
    expect(out.calls).toHaveLength(2);
    expect(client.calls[1]!.system).toMatch(/Thiếu Phòng thờ/);
  });

  it('sai cả hai lượt → bác, KHÔNG gọi lượt thứ ba, câu lỗi đọc được', async () => {
    const bad = goodProposal();
    bad.spaces = bad.spaces.filter((s) => s.type !== 'altar_room');
    const client = fakeClient([bad, bad, goodProposal()]);
    const err = await run(client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProgramRejected);
    expect((err as AiProgramRejected).attempts).toBe(2);
    expect((err as AiProgramRejected).findings[0]).toMatch(/Thiếu Phòng thờ/);
    expect(client.calls).toHaveLength(2);
  });

  it('sai CẤU TRÚC (không qua Zod) cũng đi vào lượt sửa với chỗ sai được gọi tên', async () => {
    const { rationale: _drop, ...noRationale } = goodProposal();
    const client = fakeClient([noRationale, goodProposal()]);
    const out = await run(client);
    expect(out.repaired).toBe(true);
    expect(client.calls[1]!.system).toMatch(/Sai cấu trúc ở rationale/);
  });
});

describe('Cảnh báo quy chuẩn trên diện tích', () => {
  const review = (spaces: Array<{ id: string; type: string; target_area_m2: number }>) =>
    reviewProgramAreas({
      spaces,
      buildingType: 'biet_thu',
      rules: nationalRules,
      labels,
      messages,
    });

  it('phòng dưới diện tích tối thiểu sinh cảnh báo có nguồn văn bản', () => {
    const out = review([{ id: 'bedroom_1', type: 'bedroom', target_area_m2: 3 }]);
    expect(out.warnings.length).toBeGreaterThan(0);
    expect(out.warnings[0]!.source).toMatch(/QCVN|TCVN/);
    expect(out.warnings[0]!.message).toMatch(/Phòng ngủ/);
  });

  it('phòng đủ diện tích thì im lặng', () => {
    expect(review([{ id: 'bedroom_1', type: 'bedroom', target_area_m2: 18 }]).warnings).toEqual([]);
  });

  it('luôn trả danh sách quy tắc CHƯA đối chiếu được — cảnh báo rỗng không phải "đạt quy chuẩn"', () => {
    const out = review([{ id: 'bedroom_1', type: 'bedroom', target_area_m2: 18 }]);
    expect(out.warnings).toEqual([]);
    expect(out.unchecked.length).toBeGreaterThan(0);
    // Những vị từ cần hình học, bước này chưa có: kích thước tối thiểu, mặt thoáng, khoảng lùi.
    expect(out.unchecked.map((u) => u.predicate)).toContain('min_dimension');
  });
});
