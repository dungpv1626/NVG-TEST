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
  foldInBedroom,
  generateAiProgram,
  programFromProposal,
  programKnowledge,
} from '../ai/program';
import { buildableFromDigest } from '../ai/buildable';
import { parseAiPrompts } from '../ai/prompts';
import { criterionFor, parsePlanQuality } from '../ai/plan-quality';
import { parseRuleMessages } from '../ai/plan-messages';
import { reviewProgramAreas } from '../ai/rule-warnings';
import { NO_RULE_PACKS, selectedRulePack } from '../ai/rule-packs';
import { parseBriefFidelity } from '../kb/brief-fidelity';
import { parseConstructionNorms } from '../kb/construction';
import { parseVocabulary, roomGroups, VocabularyIndex } from '../kb/vocabulary';
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
const groups = roomGroups(vocabulary.vocabulary);
const construction = parseConstructionNorms(read('kb/construction_norms.yaml'));
const prompts = parseAiPrompts(load(read('kb/ai_design_prompts.yaml')));
const messages = parseRuleMessages(read('rules/messages.vi.yaml'));
const fidelity = parseBriefFidelity(read('kb/brief_fidelity.yaml'));

/**
 * Gói quy chuẩn CŨ (`rules/base/` đã xoá 13/09/2026), chép vào dữ liệu kiểm thử — để cơ chế
 * đối chiếu vẫn chạy trên một gói thật đủ loại vị từ. Không mã chạy thật nào đọc nó.
 */
const nationalRules = new RulePack(
  [
    '00-meta',
    '10-dimensions',
    '20-daylight-access',
    '30-adjacency',
    '40-vertical',
    '50-massing',
  ].flatMap((name) =>
    parseRuleFile(
      read(`workers/src/design/__tests__/fixtures/rules-legacy-base/${name}.yaml`),
      name,
    ),
  ),
  false,
);

const REF = `sha256:${'a'.repeat(64)}`;
const digest = digestOf(VILLA);
const buildable = buildableFromDigest(digest);

/** Gói kinh nghiệm nghề, tách khỏi quy chuẩn ngày 09/09/2026. */
const experienceRules = new RulePack(
  parseRuleFile(read('rules/nvg-experience.yaml'), 'nvg-experience'),
  false,
);
const PACKS = { standards: nationalRules, experience: experienceRules };
const emptyPack = selectedRulePack(NO_RULE_PACKS, PACKS);

/** Mặc định: KHÔNG tích gói nào (T20) — mô hình thiết kế tự do. */
const knowledge = programKnowledge({
  digest,
  vocabulary,
  labels,
  buildable,
  construction,
  rules: emptyPack,
  fidelity,
});

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
   * Bài này là hàng rào chính của T14, và từ T20 (09/09/2026) nó canh đúng TRẠNG THÁI MẶC
   * ĐỊNH: kỹ sư chưa tích gói nào. Bài ngay dưới canh trạng thái đã tích.
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
  it('chưa tích gói nào thì KHÔNG mang một ngưỡng nào — chỉ từ vựng, đầu bài, quy ước cấu tạo', () => {
    const text = JSON.stringify(knowledge);
    // Chỉ phần quy ước cấu tạo THẬT SỰ gửi đi — mục `usable` bị lược trước khi gửi (V-28).
    const fromKb = JSON.stringify(knowledge.construction);

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
  it('không gửi điều kiện dựng của bộ giải (`usable`) cho mô hình', () => {
    expect(construction.usable).toBeDefined();
    expect(Object.keys(knowledge.construction as object)).not.toContain('usable');
  });

  it('mỗi loại phòng chỉ mang mã, nhãn và nhóm — không diện tích, không thứ tự ưu tiên', () => {
    for (const entry of knowledge.room_types) {
      expect(Object.keys(entry).sort()).toEqual(['code', 'group', 'vi']);
    }
  });

  it('mang khoảng tỷ lệ giao thông mặt bằng sẽ được chấm (C2, theo loại hình) — vắng thước thì null', () => {
    const quality = parsePlanQuality(read('kb/plan_quality.yaml'));
    const spec = quality.criteria.find((c) => c.code === 'C2')!;
    const band = criterionFor(spec, digest.building_type);
    const k = programKnowledge({
      digest,
      vocabulary,
      labels,
      buildable,
      construction,
      rules: emptyPack,
      fidelity,
      quality,
    });
    expect(k.circulation_share).toEqual({ low: band.low, high: band.high });
    expect(knowledge.circulation_share).toBeNull();
  });

  it('chưa tích gói nào thì danh sách ràng buộc RỖNG', () => {
    expect(knowledge.constraints).toEqual([]);
  });

  /**
   * T20: gói đã tích đi vào lời dẫn, và mỗi ràng buộc mang theo NGUỒN cùng nhãn `legal` hay
   * `experience`. Không có hai trường ấy thì mô hình không phân biệt được «luật» với «thói
   * quen NVG», và màn hình cũng không.
   */
  it('tích gói quy chuẩn thì ngưỡng VÀO lời dẫn, kèm nguồn và nhãn loại', () => {
    const k = programKnowledge({
      digest,
      vocabulary,
      labels,
      buildable,
      construction,
      rules: selectedRulePack({ standards: true, experience: false }, PACKS),
      fidelity,
    });
    expect(k.constraints.length).toBeGreaterThan(0);
    expect(k.constraints.every((r) => r.kind === 'legal')).toBe(true);
    expect(k.constraints.every((r) => /QCVN|TCVN/.test(r.source))).toBe(true);

    const bedroom = k.constraints.find((r) => r.id === 'min_area_bedroom');
    expect(bedroom).toMatchObject({ target: 'bedroom', value: 9, unit: 'm2' });
  });

  it('tích gói kinh nghiệm thì ngưỡng của NVG vào, và KHÔNG lẫn quy chuẩn', () => {
    const k = programKnowledge({
      digest,
      vocabulary,
      labels,
      buildable,
      construction,
      rules: selectedRulePack({ standards: false, experience: true }, PACKS),
      fidelity,
    });
    expect(k.constraints.length).toBeGreaterThan(0);
    expect(k.constraints.every((r) => r.kind === 'experience')).toBe(true);
    expect(k.constraints.some((r) => r.id === 'min_area_living')).toBe(true);
    expect(k.constraints.some((r) => /QCVN|TCVN/.test(r.source))).toBe(false);
  });

  it('tích cả hai thì có cả hai loại, phân biệt được bằng `kind`', () => {
    const k = programKnowledge({
      digest,
      vocabulary,
      labels,
      buildable,
      construction,
      rules: selectedRulePack({ standards: true, experience: true }, PACKS),
      fidelity,
    });
    const kinds = new Set(k.constraints.map((r) => r.kind));
    expect(kinds).toEqual(new Set(['legal', 'experience']));
  });

  /**
   * Bước lập chương trình mới có DIỆN TÍCH, chưa có hình học. Gửi kèm bề rộng tối thiểu là
   * gửi con số mô hình không dùng được vào việc gì, và làm loãng lời dẫn.
   */
  it('không gửi vị từ cần hình học (bề rộng tối thiểu, khoảng lùi) ở bước này', () => {
    const k = programKnowledge({
      digest,
      vocabulary,
      labels,
      buildable,
      construction,
      rules: selectedRulePack({ standards: true, experience: true }, PACKS),
      fidelity,
    });
    const predicates = new Set(k.constraints.map((r) => r.predicate));
    expect(predicates.has('min_dimension')).toBe(false);
    expect(predicates.has('setback')).toBe(false);
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
      rules: emptyPack,
      fidelity,
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
    expect(client.calls[1]!.system).toBe(prompts.program.system);
    expect(client.calls[1]!.prompt).toMatch(/Thiếu Phòng thờ/);
    expect(client.calls[1]!.prompt.startsWith(client.calls[0]!.prompt)).toBe(true);
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
    expect(client.calls[1]!.prompt).toMatch(/Sai cấu trúc ở rationale/);
  });
});

describe('Cảnh báo trên diện tích — đo bằng ĐÚNG gói kỹ sư đã tích', () => {
  const review = (
    spaces: Array<{ id: string; type: string; target_area_m2: number }>,
    choice = { standards: true, experience: false },
  ) =>
    reviewProgramAreas({
      spaces,
      buildingType: 'biet_thu',
      rules: selectedRulePack(choice, PACKS),
      labels,
      groups,
      messages,
    });

  it('chưa tích gói nào thì KHÔNG cảnh báo gì, dù phòng bé đến đâu', () => {
    const out = review([{ id: 'bedroom_1', type: 'bedroom', target_area_m2: 1 }], NO_RULE_PACKS);
    expect(out.warnings).toEqual([]);
    expect(out.checked).toEqual([]);
    expect(out.unchecked).toEqual([]);
  });

  it('phòng khách 12 m² chỉ bị nhắc khi tích gói KINH NGHIỆM, không phải gói quy chuẩn', () => {
    const small = [{ id: 'living_1', type: 'living', target_area_m2: 12 }];
    // 14 m² là thói quen của NVG, không có văn bản pháp quy nào bắt buộc.
    expect(review(small, { standards: true, experience: false }).warnings).toEqual([]);
    const withExperience = review(small, { standards: false, experience: true });
    expect(withExperience.warnings).toHaveLength(1);
    // Khẳng định điều THẬT SỰ quan trọng: cảnh báo chỉ tên NVG, và KHÔNG nhắc một văn bản nào.
    // Bản trước khớp chuỗi `/kinh nghiệm/`, nên nó đỏ ngày 12/09/2026 khi nguồn của các quy tắc
    // đã đo được đổi thành `đo trên hồ sơ NVG` — một đổi tên vô hại làm đỏ một phép thử đúng.
    // Người đọc màn hình cần biết «đây là thói quen của chúng ta hay là luật», chứ không cần
    // biết câu ấy viết bằng đúng hai chữ nào.
    expect(withExperience.warnings[0]!.source).toMatch(/NVG/);
    expect(withExperience.warnings[0]!.source).not.toMatch(/QCVN|TCVN/);
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

describe('Bám đầu bài — sáng tạo nhưng không mâu thuẫn đầu bài (13/09/2026)', () => {
  /**
   * Đầu bài CÓ ghim tầng, diện tích, khép kín, nhu cầu riêng, số xe và khoảng sân — đúng loại
   * thông tin mà bộ kiểm cũ để mô hình nhìn thấy nhưng không kiểm.
   */
  const detailedBrief = {
    ...VILLA,
    family: [
      { role: 'ong_ba', count: 2, floor: 1, ensuite: true, needs: ['storage'] },
      { role: 'vo_chong', count: 2, floor: 2, ensuite: true, needs: ['balcony', 'study'] },
      { role: 'con', count: 2, floor: 2, needs: ['balcony'] },
    ],
    required_spaces: [
      { type: 'living', floor: 1, area_m2: 40 },
      { type: 'kitchen', floor: 1 },
      { type: 'dining' },
      { type: 'wc' },
      { type: 'garage', floor: 1 },
      { type: 'altar_room', floor: 2 },
    ],
    parking: { cars: 1, motorbikes: 2 },
    massing: { yards: ['san_ben'], yard_depth_m: { left: 3 } },
  } as typeof VILLA;
  const detailedDigest = digestOf(detailedBrief);
  const detailedBuildable = buildableFromDigest(detailedDigest);
  const detailed = programKnowledge({
    digest: detailedDigest,
    vocabulary,
    labels,
    buildable: detailedBuildable,
    construction,
    rules: emptyPack,
    fidelity,
  });

  function faithful(): AiSpaceProgramProposal {
    return {
      schema_version: '1.0.0',
      spaces: [
        { id: 'l', type: 'living', level: 1, target_area_m2: 40 },
        { id: 'k', type: 'kitchen', level: 1, target_area_m2: 14 },
        { id: 'd', type: 'dining', level: 1, target_area_m2: 16 },
        { id: 'w', type: 'wc', level: 1, target_area_m2: 4 },
        { id: 'g', type: 'garage', level: 1, target_area_m2: 22 },
        { id: 'b1', type: 'bedroom', level: 1, target_area_m2: 18 },
        { id: 'b1w', type: 'wc', level: 1, target_area_m2: 5, ensuite_of: 'b1' },
        { id: 's', type: 'storage', level: 1, target_area_m2: 4 },
        { id: 't1', type: 'stair', level: 1, target_area_m2: 12 },
        { id: 'm', type: 'master_bedroom', level: 2, target_area_m2: 26 },
        { id: 'mw', type: 'wc', level: 2, target_area_m2: 6, ensuite_of: 'm' },
        { id: 'mb', type: 'balcony', level: 2, target_area_m2: 5, ensuite_of: 'm' },
        { id: 'ms', type: 'study_area', level: 2, target_area_m2: 5, ensuite_of: 'm' },
        { id: 'c1', type: 'bedroom', level: 2, target_area_m2: 16 },
        { id: 'c1b', type: 'balcony', level: 2, target_area_m2: 4, ensuite_of: 'c1' },
        { id: 'c2', type: 'bedroom', level: 2, target_area_m2: 16 },
        { id: 'c2b', type: 'balcony', level: 2, target_area_m2: 4, ensuite_of: 'c2' },
        { id: 'a', type: 'altar_room', level: 2, target_area_m2: 12 },
        { id: 't2', type: 'stair', level: 2, target_area_m2: 12 },
        { id: 'h', type: 'circulation', level: 2, target_area_m2: 15 },
      ],
      rationale: 'Ông bà tầng một, ba phòng ngủ tầng hai có ban công riêng.',
      assumptions: [],
    };
  }
  const issuesOf = (proposal: AiSpaceProgramProposal) => checkProposal(proposal, detailed, labels);

  it('tri thức mang từng dòng đầu bài, từng nhóm thành viên, chỗ đỗ và sàn đã trừ sân', () => {
    expect(detailed.brief_spaces).toContainEqual({
      type: 'living',
      floor: 1,
      area_m2: 40,
      ensuite: null,
    });
    expect(detailed.members).toContainEqual(
      expect.objectContaining({ role: 'con', rooms: 2, floor: 2, needs: ['balcony'] }),
    );
    expect(detailed.garage_min_m2).toBe(20);
    // Lô 15 × 20, lùi trước 4 m, sân bên trái 3 m → 12 × 16.
    expect(detailed.buildable_per_level_m2[0]).toBe(192);
  });

  it('đề xuất bám đủ đầu bài thì ĐẠT — phần không ghim vẫn tự do', () => {
    expect(issuesOf(faithful())).toEqual([]);
  });

  it('diện tích khai là mức TỐI THIỂU: nhỏ hơn thì bác, lớn hơn bao nhiêu cũng được', () => {
    const small = faithful();
    small.spaces.find((s) => s.id === 'l')!.target_area_m2 = 38;
    expect(issuesOf(small).join(' ')).toMatch(
      /Phòng khách tầng 1: đầu bài khai tối thiểu 40 m², đề xuất 38 m² — nhỏ hơn mức tối thiểu/,
    );
    const large = faithful();
    large.spaces.find((s) => s.id === 'l')!.target_area_m2 = 60;
    expect(issuesOf(large)).toEqual([]);
  });

  it('phòng ghim tầng mà đặt tầng khác bị bác', () => {
    const bad = faithful();
    bad.spaces.find((s) => s.id === 'a')!.level = 1;
    expect(issuesOf(bad).join(' ')).toMatch(/Thiếu Phòng thờ ở tầng 2/);
  });

  it('thành viên khép kín mà phòng ngủ không có khu vệ sinh khép kín bị bác', () => {
    const bad = faithful();
    bad.spaces.find((s) => s.id === 'b1w')!.ensuite_of = null;
    expect(issuesOf(bad).join(' ')).toMatch(/1 Phòng ngủ ở tầng 1 khép kín/);
  });

  it('thiếu ban công riêng của từng phòng con bị bác; góc làm việc đáp ứng bằng không gian học tập', () => {
    const bad = faithful();
    bad.spaces = bad.spaces.filter((s) => s.id !== 'c2b');
    const issues = issuesOf(bad).join(' ');
    expect(issues).toMatch(/«Ban công» của thành viên cần 3 không gian ở tầng 2, đề xuất có 2/);
    expect(issues).not.toMatch(/Góc làm việc|Phòng làm việc/);
  });

  it('tủ đồ, góc học tập trong phòng ngủ là TIỆN ÍCH trong phòng, không phải nhu cầu không gian', () => {
    expect(detailed.members).toContainEqual(
      expect.objectContaining({ role: 'vo_chong', needs: ['balcony'], in_room: ['study'] }),
    );
    // Không có góc học tập riêng vẫn ĐẠT — nó nằm trong phòng ngủ.
    const noCorner = faithful();
    noCorner.spaces = noCorner.spaces.filter((s) => s.id !== 'ms');
    expect(issuesOf(noCorner)).toEqual([]);
  });

  it('mô hình lỡ tách góc học tập thành phòng khép kín thì Worker gộp lại vào phòng ngủ', () => {
    const { proposal, includes } = foldInBedroom(
      faithful(),
      fidelity.inBedroomTypes,
      fidelity.ensuiteParentTypes,
    );
    expect(proposal.spaces.find((s) => s.id === 'ms')).toBeUndefined();
    expect(proposal.spaces.find((s) => s.id === 'm')!.target_area_m2).toBe(31);
    expect(includes.get('m')).toEqual(['study_area']);
    // Ban công và WC khép kín KHÔNG gộp — chúng là không gian thật.
    expect(proposal.spaces.find((s) => s.id === 'mb')).toBeDefined();
    expect(proposal.spaces.find((s) => s.id === 'mw')).toBeDefined();

    const { payload } = programFromProposal({
      proposal,
      includes,
      briefRef: `sha256:${'a'.repeat(64)}`,
      generator: {
        kind: 'ai',
        provider: 'fake',
        model: 'fake-1',
        route: 'r',
        prompt_version: '1',
        repaired: false,
      },
    });
    expect(payload.spaces.find((s) => s.type === 'master_bedroom')!.includes).toEqual([
      'study_area',
    ]);
    expect(aiSpaceProgramSchema.safeParse(payload).success).toBe(true);
  });

  it('tiện ích đứng một mình (không thuộc phòng nào) thì giữ nguyên', () => {
    const lone = faithful();
    lone.spaces.push({ id: 'st', type: 'study_area', level: 1, target_area_m2: 6 });
    const { proposal } = foldInBedroom(lone, fidelity.inBedroomTypes, fidelity.ensuiteParentTypes);
    expect(proposal.spaces.find((s) => s.id === 'st')).toBeDefined();
  });

  it('danh sách tiện ích trong phòng ngủ khớp với bộ giải (`kb/space_norms.yaml` in_bedroom)', () => {
    const norms = load(read('kb/space_norms.yaml')) as { in_bedroom: string[] };
    expect([...fidelity.inBedroomTypes].sort()).toEqual([...norms.in_bedroom].sort());
  });

  it('chỗ để xe nhỏ hơn số xe đầu bài khai bị bác', () => {
    const bad = faithful();
    bad.spaces.find((s) => s.id === 'g')!.target_area_m2 = 10;
    expect(issuesOf(bad).join(' ')).toMatch(/Chỗ để xe 10 m² không đủ/);
  });

  it('bịt lỗ khép kín: một phòng lớn gắn `ensuite_of` không né được trần sàn', () => {
    const bad = faithful();
    bad.spaces.push({ id: 'big', type: 'garage', level: 1, target_area_m2: 90, ensuite_of: 'b1' });
    const issues = issuesOf(bad).join(' ');
    expect(issues).toMatch(/Để xe không được làm phòng khép kín/);
    expect(issues).toMatch(/Tầng 1 cộng lại .* vượt sàn xây được/);
  });

  it('nhà hai tầng mà một tầng không có thang bị bác', () => {
    const bad = faithful();
    bad.spaces = bad.spaces.filter((s) => s.id !== 't2');
    expect(issuesOf(bad).join(' ')).toMatch(/Tầng 2 không có thang/);
  });

  it('dòng phòng ngủ lệch gia đình KHÔNG làm hai phép kiểm đòi hai điều ngược nhau', () => {
    const conflicted = programKnowledge({
      digest: digestOf({
        ...detailedBrief,
        required_spaces: [...detailedBrief.required_spaces!, { type: 'bedroom', floor: 1 }],
      } as typeof VILLA),
      vocabulary,
      labels,
      buildable: detailedBuildable,
      construction,
      rules: emptyPack,
      fidelity,
    });
    expect(checkProposal(faithful(), conflicted, labels)).toEqual([]);
  });
});
