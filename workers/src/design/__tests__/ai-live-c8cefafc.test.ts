/**
 * Phát lại lượt chạy thật c8cefafc (25/09/2026, GPT-6 Sol, lời dẫn 8.32.0 — lượt đầu tiên sau T78/T79).
 * Bốn lời gọi (0,394 USD), rồi runtime `wrangler dev` SẬP lúc đang xếp vòng 4 (không thông báo lỗi);
 * phát lại cục bộ bốn vòng chạy hết trong ~1,5 s, không treo.
 *
 * Diễn biến (đo lại ở đây, không gọi mô hình):
 *  · vòng 1: tầng 2 ba phòng không lối vào + `bedroom_3` chỉ giáp ô thang; cả nhà thiếu ban công trái;
 *  · vòng 2: mô hình sửa cả tầng 1 («Fix storey 1 too») và làm `living_1` mất lối vào → tệ hơn, gạt;
 *  · vòng 3 (gốc vòng 1): CHỈ CÒN `laundry_1` không lối vào — lỗi giảm 4 → 1;
 *  · vòng 4 (gốc vòng 3): mô hình chỉ trả tầng 2 (17 phòng, một bản phác) — ghép tầng 1 từ vòng 3
 *    (`mergeRevision`), nhưng vẽ lại cả tầng thành chong chóng → sáu lỗi, gạt; lời gọi 5 lẽ ra sửa từ
 *    vòng 3, thì runtime sập.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import type { HouseIntent } from '../ai/house';
import type { StructuredCallOptions } from '../llm/text-client';
import {
  AiPlanRejected,
  evaluateHouse,
  generateAiPlan,
  mergeRevision,
  planContext,
  programGenerator,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('c8cefafc');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const evaluate = (intent: HouseIntent) => evaluateHouse(input, context, intent, generator, prompts);
const levelsOf = (evaluation: ReturnType<typeof evaluate>) =>
  evaluation.rejections.map((rejection) => rejection.level);

describe('phát lại lượt chạy thật c8cefafc — lỗi giảm 4 → 1 qua ba vòng, rồi runtime sập', () => {
  const round1 = evaluate(run.intents.round1!);

  it('vòng 1: tầng 2 ba phòng không lối vào, cả nhà thiếu ban công trái; câu nhắc kèm lỗi tầng 1 bị chia lại', () => {
    expect(levelsOf(round1)).toEqual([2, 0]);
    const hint = round1.hints.join('\n');
    expect(hint).toMatch(/"altar_room_1", "circulation_2", "master_bedroom_1" have no way in/);
    expect(hint).toMatch(/Your sketch of storey 1 failed the checks below/);
    expect(hint).toMatch(/Storey 1: Room "bedroom_1" could only be entered from the stair/);
  });

  it('vòng 2 sửa cả tầng 1 và làm `living_1` mất lối vào — tệ hơn vòng 1 (hỏng ở tầng thấp hơn)', () => {
    const round2 = evaluate(mergeRevision(round1.renamed!, run.intents.round2 as HouseIntent));
    // T92: tầng 1 hỏng thì bản phác tầng trên vẫn được SOÁT cùng lượt — tầng 2 góp lỗi của nó.
    expect(levelsOf(round2)[0]).toBe(1);
    expect(round2.rejections[0]!.messages.join(' ')).toContain('"living_1" không chạm hành lang');
  });

  it('vòng 3 (gốc vòng 1): chỉ còn `laundry_1` không lối vào', () => {
    const round3 = evaluate(mergeRevision(round1.renamed!, run.intents.round3 as HouseIntent));
    expect(levelsOf(round3)).toEqual([2]);
    expect(round3.rejections[0]!.messages).toHaveLength(1);
    expect(round3.rejections[0]!.messages[0]).toContain('"laundry_1"');
  });

  it('vòng 4 trả CHỈ tầng 2: ghép tầng 1 từ vòng 3 thành ý định đủ hai tầng, nhưng vẽ lại thành chong chóng', () => {
    const answer = run.intents.round4 as HouseIntent;
    expect((answer.sketches ?? []).map((sketch) => sketch.level)).toEqual([2]);
    expect(answer.rooms.every((room) => room.level === 2)).toBe(true);
    const round3 = evaluate(mergeRevision(round1.renamed!, run.intents.round3 as HouseIntent));
    const merged = mergeRevision(round3.renamed!, answer);
    expect((merged.sketches ?? []).map((sketch) => sketch.level)).toEqual([1, 2]);
    expect(merged.rooms.filter((room) => room.level === 1)).toHaveLength(
      round3.renamed!.rooms.filter((room) => room.level === 1).length,
    );
    const round4 = evaluate(merged);
    expect(levelsOf(round4)).toEqual([2]);
    expect(round4.rejections[0]!.messages.join(' ')).toContain('chong chóng');
  });

  it('vòng sửa đồng bộ: lời gọi 3 và 5 sửa từ bản vòng 1 và vòng 3 (bản nhẹ nhất), không treo', async () => {
    const options: StructuredCallOptions[] = [];
    const answers = [
      run.intents.round1,
      run.intents.round2,
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
    const started = Date.now();
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
    expect(Date.now() - started).toBeLessThan(30_000);
    const sentFrom = (call: StructuredCallOptions) =>
      call.prompt.slice(call.prompt.indexOf('<previous_intent>'));
    // Số lỗi đếm cả bản phác tầng trên đã soát (T92), nên chỉ canh câu, không canh con số.
    expect(options[2]!.prompt).toMatch(/Your last revision was worse .*\d+ problems against \d+/);
    expect(sentFrom(options[2]!)).toBe(sentFrom(options[1]!));
    expect(options[4]!.prompt).toMatch(/Your last revision was worse .*\d+ problems against \d+/);
    expect(sentFrom(options[4]!)).toBe(sentFrom(options[3]!));
  });
});
