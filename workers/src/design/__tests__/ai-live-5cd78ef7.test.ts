/**
 * Phát lại lượt chạy thật 5cd78ef7 (24/09/2026, gpt-6-sol, lời dẫn 8.25.0 + T73 h) — cùng đầu bài
 * «Biệt thự nhà vườn (demo)». Bốn lời gọi (0,409 USD), không ra phương án.
 *
 * Tầng 1 qua cả bốn lượt. Tầng 2: lượt 3 chỉ còn phòng thờ không lối vào; mô hình vẽ lại cả tầng và
 * lượt 4 hỏng năm chỗ mới. Chương trình gửi lượt MỚI NHẤT đi sửa, nên lượt sửa hỏng kéo cả lượt sau
 * xuống theo (T73 i).
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import type { StructuredCallOptions } from '../llm/text-client';
import {
  AiPlanRejected,
  evaluateHouse,
  generateAiPlan,
  planContext,
  programGenerator,
  retryPlan,
  revisionBase,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('5cd78ef7');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);

function round(name: string) {
  const intent = run.intents[name]!;
  const evaluation = evaluateHouse(input, context, intent, generator, prompts);
  const plan = retryPlan({ intent, issues: [] }, evaluation);
  if (plan.kind !== 'revise') throw new Error(`${name}: ${plan.kind}`);
  return { rejections: evaluation.rejections, hints: plan.avoid, plan };
}

describe('phát lại lượt chạy thật 5cd78ef7', () => {
  const round3 = round('round3');
  const round4 = round('round4');

  it('lượt 3 chỉ còn một lỗi ở tầng 2; lượt 4 nhiều lỗi hơn hẳn', () => {
    expect(round3.rejections.map((r) => r.level)).toEqual([2]);
    expect(round3.rejections.flatMap((r) => r.messages)).toHaveLength(1);
    expect(round4.rejections.flatMap((r) => r.messages).length).toBeGreaterThan(3);
  });

  it('lượt 4 tệ hơn → lượt sau sửa từ BẢN LƯỢT 3, kèm dòng nói lần sửa vừa rồi bị gạt', () => {
    const picked = revisionBase(round3, round4, prompts);
    expect(picked.best).toBe(round3);
    expect(picked.next.plan.previous).toBe(round3.plan.previous);
    expect(picked.next.hints[0]).toMatch(/Your last revision was worse .*6 problems against 1/);
    expect(picked.next.hints.slice(1)).toEqual(round3.hints);
  });

  it('lượt mới tốt hơn hoặc bằng → sửa từ lượt mới, không thêm dòng nào', () => {
    const better = revisionBase(round4, round3, prompts);
    expect(better.next).toBe(round3);
    expect(revisionBase(round3, round3, prompts).next).toBe(round3);
    expect(revisionBase(null, round4, prompts).next).toBe(round4);
  });

  it('hỏng ở tầng thấp hơn là tệ hơn, dù ít lỗi hơn (tầng trên chưa được xét)', () => {
    const ground = { rejections: [{ level: 1, messages: ['x'] }], hints: ['- a'] };
    const upper = { rejections: [{ level: 2, messages: ['x', 'y', 'z'] }], hints: ['- b'] };
    expect(revisionBase(upper, ground, prompts).best).toBe(upper);
    // Chỉ còn lỗi cả nhà (mọi tầng đã xếp) là nhẹ nhất.
    const house = { rejections: [{ level: 0, messages: ['x', 'y'] }], hints: ['- c'] };
    expect(revisionBase(house, upper, prompts).best).toBe(house);
  });

  it('lời dẫn lượt sửa dặn chép nguyên phần không bị nêu lỗi', () => {
    expect(prompts.floorLevel.revise).toMatch(/copy every other sketch row unchanged/);
  });
});

describe('vòng sửa đồng bộ (`generateAiPlan`) đi tiếp từ lượt nhẹ nhất', () => {
  it('lượt 3 → lượt 4 tệ hơn: lời gọi thứ ba gửi lại bản lượt 3, không phải lượt 4', async () => {
    const options: StructuredCallOptions[] = [];
    const answers = [
      run.intents.round3,
      run.intents.round4,
      run.intents.round4,
      run.intents.round4,
    ];
    const client = {
      async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
        options.push(callOptions);
        return {
          json: answers[options.length - 1],
          provider: 'fake',
          model: 'fake-1',
          usage: { inputTokens: 1, outputTokens: 1 },
          latencyMs: 1,
        };
      },
    };
    await expect(
      generateAiPlan({
        ...input,
        briefRef: 'sha256:' + '0'.repeat(64),
        route: 'ai_text_fake',
        client,
        prompts,
        // Canh cơ chế vòng sửa trên câu trả lời ghi sẵn — không để biến thể T94 đổi kết quả từng vòng.
        planVariants: false,
      }),
    ).rejects.toBeInstanceOf(AiPlanRejected);
    const sentFrom = (call: StructuredCallOptions) =>
      call.prompt.slice(call.prompt.indexOf('<previous_intent>'));
    expect(options[2]!.prompt).toMatch(/Your last revision was worse/);
    // Lượt gọi thứ ba sửa từ đúng bản lượt gọi thứ hai đã sửa (bản lượt 3).
    expect(sentFrom(options[2]!)).toBe(sentFrom(options[1]!));
  });
});
