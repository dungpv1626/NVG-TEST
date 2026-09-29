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
import type { StructuredCallOptions } from '../llm/text-client';
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

  it('vòng 3: một lỗi lối vào trên bản phác; vòng 4: cây đã dựng, chỉ `bedroom_5` hụt sàn đầu bài', () => {
    expect(round3.rejections.map((r) => r.level)).toEqual([2]);
    expect(round3.rejections[0]!.codes).toEqual(['sketch_room_no_access']);
    expect(round4.rejections.map((r) => r.level)).toEqual([2]);
    // `bedroom_3` 14,92 / 15 m² (hụt 0,5 %) nằm trong dung sai 3 % của cổng (T82) — không còn là lỗi;
    // `bedroom_5` 15,67 / 17 (hụt 8 %) vẫn là lỗi thật.
    expect(round4.rejections[0]!.codes).toEqual(['arrange_room_below_brief_area']);
    expect(round4.rejections[0]!.messages[0]).toContain('"bedroom_5" ở tầng 2 chỉ được 15.67 m²');
    expect(round4.rejections[0]!.messages.join(' ')).not.toContain('"bedroom_3"');
  });

  it('vòng 4 đi xa hơn vòng 3 → là gốc cho lượt sau, dù nhiều lỗi hơn; câu nhắc nói số ô cần vẽ thêm', () => {
    const picked = revisionBase(round3, round4, prompts);
    expect(picked.best).toBe(round4);
    expect(picked.next).toBe(round4);
    const hint = round4.hints.join('\n');
    expect(hint).toMatch(/"bedroom_5" came out at 15\.67 m² from \d+ sketch cells/);
    expect(hint).not.toMatch(/"bedroom_3"/);
    // Chiều ngược lại vẫn đúng: từ vòng 4 mà lùi về lỗi bản phác là tệ đi.
    expect(revisionBase(round4, round3, prompts).best).toBe(round4);
  });

  it('vòng sửa đồng bộ: tầng 1 giữ từ lời gọi 3 (T86), lời gọi 5 không lặp lại câu nhắc lối vào', async () => {
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
    for (const call of [2, 3, 4]) {
      expect(options[call]!.prompt).toMatch(/Storey 1 passed every check and is kept/);
      expect(options[call]!.prompt).not.toMatch(/Your sketch of storey 1 failed/);
    }
    // T96 (thước 3): bộ xếp chọn cây tầng 1 khác lượt ghi (phòng khách trước, hành lang ngang giữa nhà),
    // nên câu trả lời 4 ghi sẵn — vẽ tầng 2 theo cách chia tầng 1 CŨ — nay ghép lên thành chong chóng, và
    // lời gọi 5 đúng là phải nói «bản vừa rồi tệ hơn». Trước T96 câu trả lời 4 khớp cách chia cũ và lời
    // gọi 5 không lặp câu nhắc lối vào; điều đó không còn kiểm được trên câu trả lời ghi sẵn.
  });
});
