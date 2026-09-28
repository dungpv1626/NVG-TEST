/**
 * Phát lại lượt chạy thật 81fd3f57 (26/09/2026, GPT-5.6 Luna, lời dẫn 8.33.0 — lượt đầu dưới T85, T86).
 * Sáu lời gọi, 0,040 USD, runtime sạch (không cảnh báo RPC), không ra phương án.
 *
 * Vòng 1 bác ở CỔNG DANH MỤC phòng (phòng ngủ tầng 1 12 / 15 m²) — chưa xếp tầng nào. Vòng 2 sửa xong,
 * qua cổng, xếp tới tầng 1 (ba lỗi bản phác). Cả hai loại lỗi đều mang tầng `0` / tầng thấp, và
 * `setbackRank` coi tầng `0` là «mọi tầng đã xếp — nhẹ nhất», nên vòng 2 bị gạt «tệ hơn (3 so với 1)»
 * và lời gọi 3, 4 gửi lại đúng câu nhắc diện tích cũ; mô hình trả y nguyên. Sửa: lời bác ở cổng danh
 * mục mang mã `program_brief`, bậc tệ nhất. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import type { StructuredCallOptions } from '../llm/text-client';
import {
  AiPlanRejected,
  evaluateHouse,
  generateAiPlan,
  planContext,
  PROGRAM_STAGE_CODE,
  programGenerator,
  retryPlan,
  revisionBase,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('81fd3f57');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const answer = (round: number) => run.intents[`round${round}`] as HouseIntent;
const failed = (intent: HouseIntent) => {
  const evaluation = evaluateHouse(input, context, intent, generator, prompts);
  const plan = retryPlan({ intent, issues: [] }, evaluation);
  if (plan.kind !== 'revise') throw new Error(`không phải revise: ${plan.kind}`);
  return { rejections: evaluation.rejections, hints: plan.avoid, plan, evaluation };
};

describe('phát lại lượt chạy thật 81fd3f57 — lời bác ở cổng danh mục bị coi là nhẹ nhất', () => {
  const round1 = failed(answer(1));

  it('T91: diện tích khai 12 m² dưới sàn 15 m² được NÂNG lên — vòng 1 không còn bác ở cổng danh mục', () => {
    expect(round1.rejections.every((r) => !(r.codes ?? []).includes(PROGRAM_STAGE_CODE))).toBe(
      true,
    );
    expect(round1.rejections.map((r) => r.level)).toContain(1);
    const notes = round1.rejections.flatMap((r) => r.notes ?? []).join(' ');
    expect(notes).toMatch(
      /mô hình khai 12 m², dưới mức đầu bài 15 m² — chương trình nâng lên 15 m²/,
    );
  });

  it('T87: lời bác ở cổng danh mục (chưa xếp tầng nào) là bậc TỆ NHẤT khi chọn gốc sửa', () => {
    const program = {
      rejections: [{ level: 0, messages: ['thiếu phòng'], codes: [PROGRAM_STAGE_CODE] }],
      hints: ['- a'],
    };
    const ground = {
      rejections: [
        { level: 1, messages: ['1', '2', '3'], codes: ['sketch_room_no_access', 'x', 'y'] },
      ],
      hints: ['- b'],
    };
    expect(revisionBase(program, ground, prompts).best).toBe(ground);
    expect(revisionBase(ground, program, prompts).best).toBe(ground);
  });

  it('vòng sửa đồng bộ: không lời gọi nào nhận câu «bản sửa tệ hơn» vì một lời bác ở cổng danh mục', async () => {
    const options: StructuredCallOptions[] = [];
    const answers = [1, 2, 3, 4, 5, 6].map(answer);
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
      }),
    ).rejects.toBeInstanceOf(AiPlanRejected);
    for (const call of options.slice(1)) expect(call.prompt).not.toMatch(/đề xuất 12 m²/);
  });
});
