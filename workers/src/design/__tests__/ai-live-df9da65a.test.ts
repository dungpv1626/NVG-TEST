/**
 * Phát lại lượt thật df9da65a (06/10/2026) — đường v6, nhà ống demo 5 × 18 m, GPT-5.6 Terra, 4 lời gọi, 0,218 USD, KHÔNG
 * ra mặt bằng. Câu nhắc `band_stair_clash` (T116 tiếp 11) có tác dụng: lời gọi 2 thống nhất mốc thang, chỉ còn 2 ô thiếu
 * bề ngang tầng 4; lời gọi 3 sửa xong thì lộ lỗi giả: mô hình ghi ô [WC / giếng trời] mọi tầng, [bồn nước / giếng trời]
 * trên mái — bộ giải chia chiều sâu ô theo diện tích phòng cùng ô nên giếng trời mỗi tầng một đoạn, «tầng 1 bị che ở
 * mái». Nay giếng tầng trên neo theo tầng dưới; vẫn lệch thì dựng lại với đoạn chung cho mọi tầng (T116 tiếp 12).
 * Giếng lặp ở tầng trên ra cây là lỗ thông tầng `void_N` (trước đó cổng cây bác `leaf_unknown`). Sảnh đầu thang do chương
 * trình chèn (Haan: «cho chương trình tự chèn sảnh đầu thang») khi tầng ấy còn đủ chiều sâu.
 *
 * KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest, AiHouseBands, AiHouseBandsDelta } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { bandsAttempt, generateAiPlan, planContext, promptsFor } from '../ai/plan';
import type { StructuredCallOptions } from '../llm/text-client';
import { mergeBandsDelta } from '../ai/bands/layout';
import { swapRoom } from './ai-bands-helpers';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-df9da65a.json', import.meta.url), 'utf8'),
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
/** Một câu trả lời cố định → lỗi vòng sau (câu nhắc gửi mô hình). */
const errorsFor = async (json: unknown) => {
  const options: StructuredCallOptions[] = [];
  const client = {
    async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
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
  await generateAiPlan({
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
  }).catch(() => null);
  return errorsOf(options[1]?.promptTail ?? '');
};
const outputs = recorded.outputs as [
  AiHouseBands,
  AiHouseBandsDelta,
  AiHouseBandsDelta,
  AiHouseBandsDelta,
];
const afterCall2 = mergeBandsDelta(outputs[0], outputs[1], new Set());

describe('phát lại df9da65a — GPT-5.6 Terra, đường v6', () => {
  it('lời gọi 1: MỌI lỗi một lần — chiều sâu tầng 1, bề ngang tầng 1 / 3, phòng không lối vào tầng 4 (handoff đợt 2 mục 1.1)', async () => {
    const { options } = await replay();
    const errors = errorsOf(options[1]!.promptTail ?? '');
    expect(errors).toMatch(/Storey 1: the bands .* deeper than the house/);
    expect(errors).toMatch(/Storey 3: "ngu_vc" lacks/);
    expect(errors).toMatch(/Storey 4: "laundry_1" has no way in/);
  });

  it('lời gọi 2 + 3: giếng trời [WC / giếng] mọi tầng, [bồn nước / giếng] mái — thẳng nhau, không còn lỗi giếng bị che', async () => {
    const errors = await errorsFor(mergeBandsDelta(afterCall2, outputs[2], new Set()));
    expect(errors).not.toMatch(/light well .* is covered/);
    expect(errors).not.toMatch(/leaf|light_well_1_t\d/);
  });

  it('sảnh đầu thang do chương trình chèn ở tầng 2–4; tầng 1 không còn chỗ (thiếu 750 mm) thì gửi mô hình', async () => {
    const errors = await errorsFor(mergeBandsDelta(afterCall2, outputs[2], new Set()));
    // Tầng 2–4 không có hành lang ở đầu thang: chương trình chèn sảnh suốt bề ngang (vừa chiều sâu ở tầng 2 và 4).
    expect(errors).not.toMatch(/end of THANG .* touches no corridor/);
    // Luật đợt 3 bác bộ dải này (giặt tầng 4 đè phòng ngủ, phòng ông bà không mặt thoáng) nên cổng không chạy; lối vào
    // ước trên bộ dải ĐÃ chèn sảnh. Tầng 1 [gara] ngay trước [THANG | WC]: chèn sảnh thì quá sâu — lỗi thật, mô hình sửa.
    expect(errors).toMatch(/Storey 4: "laundry_1" sits over "ngu_con_1"/);
    expect(errors).toMatch(/Storey 2: "ngu_ob" has no window/);
    expect(errors).toMatch(/Storey 1: "living_1" has no way in/);
  });

  it('giếng trời lặp ở tầng trên ra cây là lỗ thông tầng void_N — không phải mã lạ cổng cây bác', () => {
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
    // Gia chủ không xếp «lấy sáng» lên đầu, giặt tầng 4 đổi thành kho — bộ dải chỉ còn để thử giếng trời (luật đợt 3 bác
    // bản gốc trước khi tới cây).
    const context = planContext({
      ...input,
      digest: { ...input.digest, priorities: ['area_efficiency', 'easy_maintenance'] },
    });
    const attempt = bandsAttempt(
      context,
      context.layout!,
      context.bands!,
      promptsFor(context, prompts),
      swapRoom(mergeBandsDelta(afterCall2, outputs[2], new Set()), '4', 'laundry_1', 'kho_8'),
      {} as never,
      context.roof?.level,
    );
    const trees = JSON.stringify(attempt.intent?.band_trees);
    expect(trees).toMatch(/"void_1"/);
    expect(trees).not.toMatch(/light_well_1_t\d/);
  });
});
