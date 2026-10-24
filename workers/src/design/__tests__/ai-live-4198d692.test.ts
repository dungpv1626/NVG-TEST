/**
 * Phát lại lượt chạy thật 4198d692 (25/09/2026, GPT-6 Sol, lời dẫn 8.32.0, năm lượt sửa — T79). Sáu lời
 * gọi (0,543 USD), không ra phương án.
 *
 * Diễn biến: vòng 1 tám lỗi (chong chóng, ban công, lối vào); vòng 2 còn `laundry_1`; vòng 3 còn
 * `bedroom_5` không lối vào. Vòng 4, 5 và 6 (mô hình chỉ trả tầng 2, ghép đúng) đều GỠ XONG lối vào và
 * DỰNG ĐƯỢC CÂY — chỉ còn `bedroom_3` 14,92 / 15 m² và `bedroom_5` 15,67 / 17 m². Nhưng `revisionBase`
 * đếm «2 lỗi > 1 lỗi» nên gạt cả ba, gửi lại vòng 3 với câu nhắc lối vào cũ, mô hình sửa y cách cũ ba
 * lần, hết lượt. Câu nhắc diện tích kèm số ô của vòng 4 chưa bao giờ tới mô hình.
 *
 * T81: bậc tệ xét GIAI ĐOẠN trước số lỗi — lỗi còn ở bản phác tệ hơn lỗi sau khi cây đã dựng. KHÔNG gọi
 * mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { fullPrompt, type StructuredCallOptions } from '../llm/text-client';
import {
  AiPlanRejected,
  evaluateHouse,
  generateAiPlan,
  mergeRevision,
  planContext,
  programGenerator,
  retryPlan,
  revisionBase,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('4198d692');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const answer = (round: number) => run.intents[`round${round}`] as HouseIntent;
const evaluate = (intent: HouseIntent) => evaluateHouse(input, context, intent, generator, prompts);
const failed = (intent: HouseIntent) => {
  const evaluation = evaluate(intent);
  const plan = retryPlan({ intent, issues: [] }, evaluation);
  if (plan.kind !== 'revise') throw new Error(`không phải revise: ${plan.kind}`);
  return { rejections: evaluation.rejections, hints: plan.avoid, plan, evaluation };
};

describe('phát lại lượt chạy thật 4198d692 — ba vòng cuối đã dựng được cây mà bị gạt vì «nhiều lỗi hơn»', () => {
  const round1 = failed(answer(1));
  const round2 = failed(mergeRevision(round1.evaluation.renamed!, answer(2)));
  const round3 = failed(mergeRevision(round2.evaluation.renamed!, answer(3)));
  const round4 = failed(mergeRevision(round3.evaluation.renamed!, answer(4)));

  it('vòng 3: một lỗi lối vào trên bản phác; vòng 4: cả nhà dựng được, chỉ còn lỗi ban công mặt sau của bản phác', () => {
    expect(round3.rejections.map((r) => r.level)).toEqual([2]);
    expect(round3.rejections[0]!.codes).toEqual(['sketch_room_no_access']);
    // Trước T169 vòng 4 hỏng ở tầng 2 (`bedroom_5` 15,67 / 17 m²). Quay lui ô thang tầng 1 thu gọn (T169) cho tầng 2 đủ
    // bề ngang: tầng 2 dựng được, lỗi kế tiếp là lỗi thật của bản phác — ban công mặt sau vẽ dọc mép trái, chỉ chạm mặt
    // sau ở góc.
    expect(round4.rejections.map((r) => r.level)).toEqual([0]);
    expect(round4.rejections[0]!.messages.join(' ')).toContain('cần một ban công chạy dọc mặt sau');
  });

  it('vòng 4 đi xa hơn vòng 3 → là gốc cho lượt sau; câu nhắc nói lỗi ban công mặt sau (T169)', () => {
    const picked = revisionBase(round3, round4, prompts);
    expect(picked.best).toBe(round4);
    expect(picked.next).toBe(round4);
    const hint = round4.hints.join('\n');
    expect(hint).toMatch(/Draw a separate balcony with its long side along the back edge/);
    // Chiều ngược lại vẫn đúng: từ vòng 4 mà lùi về lỗi bản phác là tệ đi.
    expect(revisionBase(round4, round3, prompts).best).toBe(round4);
  });

  // Trần riêng (T113): quay lui tầng 1 thử thêm hai bản tầng 1 cho mỗi vòng hỏng ở tầng trên — đo 5cd78ef7 một mình:
  // 8,3 s → 22,5 s. Hạn chung 30 s của nhóm `logic` không còn đủ khi máy bận.
  it(
    'vòng sửa đồng bộ: tầng 1 hỏng được khung xương dựng lại (T102), lời gọi 5 giữ tầng 1 và không lặp câu nhắc lối vào',
    { timeout: 120_000 },
    async () => {
      const options: StructuredCallOptions[] = [];
      const answers = [1, 2, 3, 4, 5, 6].map(answer);
      const client = {
        async complete(_route: string, _dataClass: unknown, callOptions: StructuredCallOptions) {
          // Phần riêng của vòng sửa nằm ở `promptTail` (T115) — canh trên thân lời gọi đầy đủ.
          options.push({ ...callOptions, prompt: fullPrompt(callOptions) });
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
      // T86: từ lời gọi 3 tầng 1 được GIỮ — bằng chính cách chia thật, vì bản phác tầng 1 của mô hình đã
      // bị chia lại ở vòng 2. Câu trả lời 4 (mô hình vẽ tầng 2 theo bản phác tầng 1 CŨ) ghép lên tầng 1 ấy
      // thì cả nhà dựng được, chỉ còn lỗi cả nhà (thang máy/thang bộ, ban công mặt sau) — lời gọi 5 sửa
      // từ đó. Các câu trả lời ghi sẵn sinh trong ngữ cảnh khác, nên từ đây chỉ canh hướng đi, không canh
      // kết cục.
      expect(options.length).toBeGreaterThanOrEqual(5);
      // T102 (khung xương): tầng 1 của câu trả lời 1 nay được chương trình dựng lại ngay (bản phác hỏng vì
      // đường đi xuyên gara), tầng 2 xếp được, cả nhà chỉ còn lỗi liên tầng — nên lời gọi 2 nói «bản phác
      // tầng 1 hỏng, chương trình chia lại» kèm đúng lỗi ấy, và không tầng nào được giữ khi lỗi là lỗi cả nhà
      // (T86: lỗi tầng 0 có thể cần sửa bất kỳ tầng nào). Tới lời gọi 5, hai lượt sửa không đỡ hơn nên gốc là
      // câu trả lời mới nhất, tầng 1 của nó qua và được GIỮ — câu nhắc chỉ còn ban công tầng 2.
      expect(options[1]!.prompt).toMatch(/Your sketch of storey 1 failed/);
      expect(options[1]!.prompt).toMatch(/Storey 1: From the living area/);
      expect(options[4]!.prompt).toMatch(/Storey 1 passed every check and is kept/);
      expect(options[4]!.prompt).not.toMatch(/Your sketch of storey 1 failed/);
      expect(options[4]!.prompt).not.toMatch(/draw a circulation that links the living area/);
    },
  );
});
