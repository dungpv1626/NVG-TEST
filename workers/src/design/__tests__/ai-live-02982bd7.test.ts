/**
 * Phát lại lượt chạy thật 02982bd7 (26/09/2026, GPT-6 Sol, lời dẫn 8.34.0 — dưới T84–T89). Sáu lời gọi,
 * 0,412 USD, không ra phương án — nhưng vòng 3 XẾP XONG cả hai tầng, chỉ hỏng ở kiểm cả nhà: «thiếu ban
 * công mặt sau». Mô hình ĐÃ vẽ ban công ấy (hàng 16, mép sau tầng 2); bản phác tầng 2 hỏng vì phòng ngủ
 * chính 19,02 / 25 m², chương trình chia lại tầng và dời ban công sang mép trái. Câu nhắc chỉ nói «thêm
 * ban công mặt sau»; mô hình thêm ba lần, mỗi lần phá chỗ khác, hết lượt. Lỗi thật chưa từng tới nó.
 *
 * T90: kiểm cả nhà hỏng mà có tầng bị chia lại → lỗi bản phác của tầng ấy đứng ĐẦU câu nhắc. KHÔNG gọi
 * mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, mergeRevision, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('02982bd7');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const evaluate = (intent: HouseIntent) => evaluateHouse(input, context, intent, generator, prompts);

describe('phát lại lượt chạy thật 02982bd7 — «thiếu ban công» là hệ quả của việc chia lại tầng 2', () => {
  const round1 = evaluate(run.intents.round1 as HouseIntent);
  const base = retryPlan(
    { intent: run.intents.round1 as HouseIntent, issues: [] },
    round1,
  ).previous!;
  const round3 = evaluate(mergeRevision(base, run.intents.round3 as HouseIntent));

  // T105: ô thang không còn làm lối đi. Ghép thẳng vòng 3 lên gốc vòng 1, thang tầng 2 ép về đúng ô tầng dưới
  // đè mất dải hành lang mô hình vẽ quanh nó, nên tầng 2 hỏng TRƯỚC khi tới kiểm cả nhà. Cơ chế T90 bài này canh
  // vẫn vậy: lỗi bản phác của tầng đứng đầu câu nhắc, lượt sau là «sửa» chứ không lấy mẫu lại.
  it('vòng 3: tầng 2 hỏng vì ô thang ép về đúng ô tầng dưới đè mất hành lang', () => {
    expect(round3.rejections).toHaveLength(1);
    expect(round3.rejections[0]!.level).toBe(2);
    expect(round3.rejections[0]!.codes).toContain('sketch_core_overlap');
  });

  it('câu nhắc: lỗi bản phác tầng 2 đứng đầu, lượt sau là sửa', () => {
    const hints = round3.hints;
    expect(hints[0]).toMatch(/Storey 2: "stair_2" must sit on exactly sketch rows/);
    expect(retryPlan({ intent: base, issues: [] }, round3).kind).toBe('revise');
  });
});
