/**
 * Phát lại lượt thật 822e699d (05/10/2026) — đường v6, nhà ống demo 5 × 18 m, GPT-5.6 Terra, 4 lời gọi, 0,264 USD, KHÔNG
 * ra mặt bằng dù lời gọi 2 và 4 đã vừa khối. Ba chỗ sửa:
 *
 *  - `setbackRank` coi lỗi bộ giải (tầng 0, không mã) là «mọi tầng đã xếp» → lời gọi 2 (chỉ thiếu WC chung tầng 2) bị gạt,
 *    mô hình sửa lại từ lời gọi 1. Nay câu trả lời không dùng được mang `answer_unusable`, xếp tệ nhất.
 *  - Thiếu WC chung tầng 2 có từ lời gọi 1 nhưng bị lỗi chiều sâu che — nay cổng danh mục soát luôn trên dải
 *    (`bandsProgramIssues`).
 *  - Tầng 1 và tầng 4 cùng thừa sâu (chung mốc thang): bộ dựng lại tầng 1 xét cả khoảng thang tầng trên chịu được, so mốc
 *    tầng trên trên đúng các tầng mốc có — dựng được tầng 1 [gara] [thang | ăn] [khách | WC] [bếp | giếng trời], cả nhà
 *    qua bộ giải và cổng, mô hình chỉ còn thêm WC chung tầng 2.
 *
 * Từ lời gọi 2, câu trả lời đã ghi trả lời câu nhắc CŨ. KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest, AiHouseBands } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  bandsProgramIssues,
  generateAiPlan,
  planContext,
  promptsFor,
  rescueFirstStorey,
  revisionBase,
} from '../ai/plan';
import { withoutLightWell } from './ai-bands-helpers';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-822e699d.json', import.meta.url), 'utf8'),
) as { outputs: unknown[] };

/** Bốn câu trả lời đã ghi lần lượt, như lượt thật. */
const replay = async () => {
  const options: StructuredCallOptions[] = [];
  const client = {
    async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
      const json = recorded.outputs[Math.min(options.length, recorded.outputs.length - 1)];
      options.push(callOptions);
      return {
        json,
        provider: 'fake',
        model: 'fake-1',
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      };
    },
  };
  const error = await generateAiPlan({
    ...realContextInput(digest, {
      stairShape: true,
      openSetback: true,
      houseProfile: true,
      preKtsSides: true,
    }),
    mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
    geometry: 'rect',
    pipeline: 'v6',
    ...layoutKb,
    briefRef: 'sha256:' + '0'.repeat(64),
    route: 'ai_text_fake',
    client,
    prompts,
    planVariants: false,
  }).catch((e: unknown) => e);
  return { options, error };
};

const errorsOf = (tail: string) => tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));
const WC = /Thiếu Khu vệ sinh chung ở tầng 2/;

describe('phát lại 822e699d — GPT-5.6 Terra, đường v6', () => {
  it('lời gọi 1: vòng sau có ĐỦ lỗi ngay — chiều sâu, thiếu WC chung tầng 2; giếng trời tầng trên do chương trình đặt', async () => {
    const { options } = await replay();
    const tail = options[1]!.promptTail ?? '';
    const errors = tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));
    // Tầng 1 và tầng 4 cùng ép mốc thang — một dòng nói cả hai tầng (T116 tiếp 11).
    expect(errors).toMatch(/storey 1 has 8300 mm of bands in front of THANG, storey 4 has THANG/);
    expect(errors).toMatch(WC);
    // Giếng trời chỉ khai ở tầng 1: chương trình tự đặt ở mọi tầng trên như ô thang (handoff sửa lỗi đợt 3 mục 2) — không
    // còn là lỗi gửi mô hình.
    expect(errors).not.toMatch(/light well/);
  });

  it('thang tầng 1 là mốc cố định (handoff đợt 2 mục 3.3): tầng 1 vừa khối, tầng 4 lệch → KHÔNG dựng lại tầng 1, nêu tầng 4', async () => {
    const context = planContext({
      ...realContextInput(digest, {
        stairShape: true,
        openSetback: true,
        houseProfile: true,
        preKtsSides: true,
      }),
      mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
      geometry: 'rect',
      pipeline: 'v6',
      ...layoutKb,
    });
    const input = {
      ...realContextInput(digest, {
        stairShape: true,
        openSetback: true,
        houseProfile: true,
        preKtsSides: true,
      }),
      mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
      geometry: 'rect' as const,
      pipeline: 'v6' as const,
      ...layoutKb,
    };
    const rescued = rescueFirstStorey(
      input,
      context,
      promptsFor(context, prompts),
      { model: 'fake' } as never,
      withoutLightWell((recorded.outputs as AiHouseBands[])[0]!),
      {} as never,
    );
    expect(rescued).toBeNull();
    const { options } = await replay();
    expect(errorsOf(options[1]!.promptTail ?? '')).toMatch(/The storey out of line is storey 4/);
  });

  it('cổng danh mục chạy thẳng trên dải khi bộ giải hỏng: đúng một lỗi, không lỗi giả (mái, ô thang, ban công đua)', () => {
    const context = planContext({
      ...realContextInput(digest, {
        stairShape: true,
        openSetback: true,
        houseProfile: true,
        preKtsSides: true,
      }),
      mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
      geometry: 'rect',
      pipeline: 'v6',
      ...layoutKb,
    });
    const input = realContextInput(digest, { houseProfile: true });
    const issues = bandsProgramIssues(input, context, (recorded.outputs as AiHouseBands[])[0]!);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(WC);
  });

  it('lượt chỉ thiếu một phòng đầu bài KHÔNG bị gạt vì một lượt hỏng ở bộ giải', () => {
    const solverFail = {
      rejections: [{ level: 0, messages: ['- a', '- b'], codes: ['answer_unusable'] }],
      hints: ['- a', '- b'],
    };
    const briefOnly = {
      rejections: [{ level: 0, messages: ['Thiếu WC'], codes: ['program_brief'] }],
      hints: ['- Thiếu WC'],
    };
    expect(revisionBase(solverFail, briefOnly, prompts).next).toBe(briefOnly);
    // Chiều ngược lại: lượt hỏng ở bộ giải sau một lượt có ý định thì bị gạt.
    expect(revisionBase(briefOnly, solverFail, prompts).best).toBe(briefOnly);
  });
});
