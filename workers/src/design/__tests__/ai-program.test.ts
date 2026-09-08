/**
 * Chương trình không gian do AI lập (`ai/program.ts`) — kiểm bằng client giả, không mạng.
 *
 * Bốn điều bộ này canh, và cả bốn đều là ranh giới của việc nới nguyên tắc bất biến 2:
 *  1. Bản của bộ giải đưa qua bộ kiểm phải ĐẠT — bộ kiểm không chặt hơn quy tắc mà chính
 *     engine đang theo, nếu không nó bác cả những đề xuất đúng.
 *  2. Đề xuất sai (dưới tối thiểu, mã lạ, sai số phòng ngủ) bị bác bằng câu tiếng Việt cụ thể,
 *     và lượt sửa nhận đúng những câu đó.
 *  3. Đúng MỘT lượt sửa — không vòng lặp.
 *  4. Kết quả đi qua hợp đồng `space-program`, mang `generator.kind = 'ai'`, id đánh số theo
 *     khuôn `type_n`, và mọi phần tất định (min/max/needs/adjacency/floor_allocation) do mã điền.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { spaceProgramSchema, type AiSpaceProgramProposal } from '@nvg/shared/design';
import { anonymiseForAi } from '../brief/anonymise';
import {
  AiProgramRejected,
  checkProposal,
  generateAiProgram,
  programFromProposal,
  programKnowledge,
} from '../ai/program';
import { parseAiPrompts } from '../ai/prompts';
import { parseVocabulary, VocabularyIndex } from '../kb/vocabulary';
import type {
  StructuredCallOptions,
  StructuredCallResult,
  TextModelClient,
} from '../llm/text-client';
import { buildSpaceProgram } from '../program/engine';
import { parsePlausibilityRules } from '../program/plausibility';
import { CORPUS } from './program-corpus';
import { testNorms, testRulePack, testVocabularyYaml } from './program-fixtures';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));
const rules = testRulePack();
const norms = testNorms();
const vocabulary = new VocabularyIndex(parseVocabulary(testVocabularyYaml()));
const labels = Object.fromEntries(vocabulary.vocabulary.types.map((t) => [t.code, t.vi]));
const plausibility = parsePlausibilityRules(
  readFileSync(root('kb/program_plausibility.yaml'), 'utf8'),
);
const prompts = parseAiPrompts(load(readFileSync(root('kb/ai_design_prompts.yaml'), 'utf8')));
const REF = `sha256:${'a'.repeat(64)}`;

const { brief } = CORPUS[1]!; // Nhà phố 5×18, 3 tầng
const baseline = buildSpaceProgram({ brief, briefRef: REF, rules, norms, plausibility }).payload;

/** Đề xuất "chép" từ bản bộ giải — hợp lệ theo định nghĩa. */
function proposalFromBaseline(): AiSpaceProgramProposal {
  return {
    schema_version: '1.0.0',
    spaces: baseline.spaces.map((s) => ({
      id: `p_${s.id}`,
      type: s.type,
      floor: s.floor,
      target_area_m2: s.target_area_m2 ?? s.min_area_m2,
      enclosed_in: s.enclosed_in ? `p_${s.enclosed_in}` : null,
    })),
    rationale: 'Chép từ bộ giải để kiểm bộ kiểm.',
    assumptions: ['Gia đình không nuôi thú cưng.'],
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

const knowledge = programKnowledge({
  brief,
  rules,
  norms,
  labels,
  buildablePerFloor: baseline.floor_allocation!.map((f) => f.buildable_area_m2 ?? 0),
  widthBand: 'trung_binh',
});

describe('Bộ kiểm đề xuất', () => {
  it('bản của bộ giải đưa qua bộ kiểm thì ĐẠT — bộ kiểm không chặt hơn engine', () => {
    expect(checkProposal(proposalFromBaseline(), knowledge, labels)).toEqual([]);
  });

  it('nói ra từng lỗi bằng tiếng Việt: dưới tối thiểu, mã lạ, sai số phòng ngủ, vượt sàn', () => {
    const bad = proposalFromBaseline();
    const kitchen = bad.spaces.find((s) => s.type === 'kitchen')!;
    kitchen.target_area_m2 = 1;
    bad.spaces.push({ id: 'x1', type: 'sauna', floor: 1, target_area_m2: 6 });
    bad.spaces.push({ id: 'x2', type: 'bedroom', floor: 2, target_area_m2: 12 });
    const living = bad.spaces.find((s) => s.type === 'living')!;
    living.target_area_m2 = 10_000;
    const issues = checkProposal(bad, knowledge, labels);
    expect(issues.some((i) => /Bếp .* dưới mức tối thiểu/.test(i))).toBe(true);
    expect(issues.some((i) => /"sauna" không có trong từ vựng/.test(i))).toBe(true);
    expect(issues.some((i) => /Cần đúng \d+ Phòng ngủ/.test(i))).toBe(true);
    expect(issues.some((i) => /vượt sàn xây được/.test(i))).toBe(true);
  });
});

describe('Dựng SpaceProgram từ đề xuất', () => {
  it('đi qua hợp đồng, mang generator ai, id theo khuôn type_n, phần tất định do mã điền', () => {
    const { payload } = programFromProposal({
      proposal: proposalFromBaseline(),
      brief,
      briefRef: REF,
      rules,
      norms,
      knowledge,
      generator: {
        kind: 'ai',
        provider: 'fake',
        model: 'fake-1',
        route: 'ai_text_fake',
        prompt_version: '1.0.0',
      },
    });
    expect(spaceProgramSchema.safeParse(payload).success).toBe(true);
    expect(payload.generator?.kind).toBe('ai');
    expect(payload.brief_ref).toBe(REF);
    for (const s of payload.spaces) {
      expect(s.id).toMatch(new RegExp(`^${s.type}_\\d+$`));
      expect(s.min_area_m2).toBeGreaterThan(0);
      expect(s.target_area_m2!).toBeGreaterThanOrEqual(s.min_area_m2);
      expect(s.max_area_m2!).toBeGreaterThanOrEqual(s.target_area_m2!);
    }
    expect(payload.floor_allocation).toHaveLength(brief.floors);
    // Cùng bộ quan hệ với engine — không dựng bộ liền kề thứ hai.
    expect(payload.adjacency?.length).toBe(baseline.adjacency?.length);
  });
});

describe('generateAiProgram', () => {
  const digest = anonymiseForAi({ brief });
  const run = (client: TextModelClient) =>
    generateAiProgram({
      brief,
      briefRef: REF,
      digest,
      route: 'ai_text_fake',
      client,
      prompts,
      rules,
      norms,
      vocabulary,
      labels,
      plausibility,
    });

  it('đề xuất đạt ngay → một lượt gọi, không sửa; lời dẫn mang tri thức, không mang danh tính', async () => {
    const client = fakeClient([proposalFromBaseline()]);
    const out = await run(client);
    expect(out.repaired).toBe(false);
    expect(out.calls).toHaveLength(1);
    expect(out.payload.generator).toMatchObject({ kind: 'ai', provider: 'fake', model: 'fake-1' });
    const prompt = client.calls[0]!.prompt;
    expect(prompt).toContain('"bedrooms_required"');
    expect(prompt).toContain('"buildable_per_floor_m2"');
    expect(prompt).not.toContain('project_code');
    expect(client.calls[0]!.system).toBe(prompts.program.system);
  });

  it('sai lượt đầu → sửa MỘT lần với danh sách lỗi cụ thể → đạt', async () => {
    const bad = proposalFromBaseline();
    bad.spaces.find((s) => s.type === 'kitchen')!.target_area_m2 = 1;
    const client = fakeClient([bad, proposalFromBaseline()]);
    const out = await run(client);
    expect(out.repaired).toBe(true);
    expect(out.calls).toHaveLength(2);
    expect(client.calls[1]!.system).toMatch(/REJECTED/);
    expect(client.calls[1]!.system).toMatch(/Bếp .* dưới mức tối thiểu/);
  });

  it('sai cả hai lượt → bác, KHÔNG gọi lượt thứ ba, câu lỗi đọc được', async () => {
    const bad = proposalFromBaseline();
    bad.spaces.find((s) => s.type === 'kitchen')!.target_area_m2 = 1;
    const client = fakeClient([bad, bad, proposalFromBaseline()]);
    const err = await run(client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProgramRejected);
    expect((err as AiProgramRejected).attempts).toBe(2);
    expect((err as AiProgramRejected).findings[0]).toMatch(/dưới mức tối thiểu/);
    expect(client.calls).toHaveLength(2);
  });

  it('sai CẤU TRÚC (không qua Zod) cũng đi vào lượt sửa với chỗ sai được gọi tên', async () => {
    const { rationale: _drop, ...noRationale } = proposalFromBaseline();
    const client = fakeClient([noRationale, proposalFromBaseline()]);
    const out = await run(client);
    expect(out.repaired).toBe(true);
    expect(client.calls[1]!.system).toMatch(/Sai cấu trúc ở rationale/);
  });
});
