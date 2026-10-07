/**
 * Phát lại lượt thật 93d212a2 (05/10/2026) — đường v6, nhà ống demo 5 × 18 m, GPT-5.6 Terra, 4 lời gọi, 0,245 USD, KHÔNG
 * ra mặt bằng. Lượt đầu theo gợi ý chiều sâu (WC cạnh thang, khách cạnh hành lang) nhưng hai lỗi của CHƯƠNG TRÌNH:
 *
 *  - Hành lang chạy suốt dọc nhà mang cùng mã `gt_1` ở nhiều dải → bị bác «xuất hiện hai lần», mất trọn một vòng chỉ để
 *    đổi mã. Nay mỗi đoạn mang hậu tố dải (`gt_1_b3`).
 *  - Tầng 1 hỏng thì tầng trên đo theo ô thang của tầng 2 (do phần dư của tầng 2 quyết) → tầng 4 dùng 13,9 m trên 16,5 m
 *    vẫn bị báo thiếu 1.200 mm và gửi mô hình. Nay tầng đặt mốc hỏng thì các tầng khác chỉ tự kiểm.
 *
 * Sau lượt này (Haan chọn hướng (a)): dải tầng 1 không vừa khối thì chương trình DỰNG LẠI tầng 1 từ cùng các phòng
 * (`rescueFirstStorey`), chấm bằng chính cổng. Phát lại: tầng 1, 2, 3 qua; mô hình chỉ còn sửa tầng 4.
 *
 * Từ lời gọi 2 trở đi, câu trả lời đã ghi là câu trả lời cho câu nhắc CŨ — chỉ dùng để xem chương trình báo gì.
 * KHÔNG chạm mạng.
 */
import { readFileSync } from 'node:fs';
import type { AiBriefDigest, AiHouseBands } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  bandsAttempt,
  generateAiPlan,
  planContext,
  promptsFor,
  rescueFirstStorey,
  type evaluateHouse,
} from '../ai/plan';
import { withoutLightWell } from './ai-bands-helpers';
import type { StructuredCallOptions } from '../llm/text-client';
import { layoutKb, prompts, read, realContextInput } from './ai-real-context';

const digest = JSON.parse(
  readFileSync(new URL('./fixtures/ai-digest-nhaong-5x18.json', import.meta.url), 'utf8'),
) as AiBriefDigest;
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/ai-bands-run-93d212a2.json', import.meta.url), 'utf8'),
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

describe('phát lại 93d212a2 — GPT-5.6 Terra, đường v6', () => {
  const context = () =>
    planContext({
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
  const first = (recorded.outputs as AiHouseBands[])[0]!;

  it('bộ giải: hành lang cùng mã nhiều dải không bị bác; tầng 1 hỏng, tầng trên KHÔNG bị báo lỗi giả theo ô thang tầng 2', () => {
    const ctx = context();
    const attempt = bandsAttempt(
      ctx,
      ctx.layout!,
      ctx.bands!,
      promptsFor(ctx, prompts),
      first,
      {} as never,
      ctx.roof?.level,
    );
    expect(attempt.intent).toBeNull();
    const text = attempt.issues.join('\n');
    expect(text).not.toMatch(/appears twice/);
    // Bề rộng mô hình ghi là LỌT LÒNG (handoff sửa lỗi đợt 2 mục 1.2): bếp 1.500 mm đủ cạnh 1,5 m; phòng ăn cạnh tường
    // ngoài vẫn thiếu bề ngang lọt lòng.
    expect(text).not.toMatch(/"kitchen_1" lacks/);
    expect(text).toMatch(/Storey 1: "dining_1" lacks \d+ mm of width/);
    expect(text).not.toMatch(/Storey [2-4]:/);
  });

  it('vòng 2: giếng trời chỉ ở tầng 1 báo ngay (T116, luật chặn) cùng lỗi bề ngang tầng 1', async () => {
    const { options } = await replay();
    const tail = options[1]!.promptTail ?? '';
    const errors = tail.slice(tail.indexOf('<errors>'), tail.indexOf('</errors>'));
    expect(errors).toMatch(/light well "light_well_1" of storey 1 is covered on storey 2/);
    expect(errors).toMatch(/Storey 1: "dining_1" lacks/);
  });

  it('bộ dựng lại tầng 1 chỉ nhận cách mà CỔNG cho tầng 1 qua — cổng bác tầng 1 mọi cách thì không dựng lại', () => {
    const input = {
      ...realContextInput(digest, { stairShape: true, openSetback: true, houseProfile: true }),
      mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
      geometry: 'rect' as const,
      pipeline: 'v6' as const,
      ...layoutKb,
    };
    const ctx = planContext(input);
    const bands = withoutLightWell((recorded.outputs as AiHouseBands[])[0]!);
    const rescue = (evaluate?: typeof evaluateHouse) =>
      rescueFirstStorey(
        input,
        ctx,
        promptsFor(ctx, prompts),
        { model: 'fake' } as never,
        bands,
        {} as never,
        evaluate,
      );
    // Cổng thật: có cách dựng lại tầng 1.
    expect(rescue()).not.toBeNull();
    // Cổng bác tầng 1 ở mọi cách (gara mang cửa chính không được, WC mở ra gara…) → không nhận cách nào.
    const rejectFirst = (() => ({
      ok: null,
      rejections: [{ level: 1, messages: ['tầng 1 hỏng'], codes: ['room_through_private'] }],
      hints: ['- tầng 1 hỏng'],
    })) as unknown as typeof evaluateHouse;
    expect(rescue(rejectFirst)).toBeNull();
  });
});
