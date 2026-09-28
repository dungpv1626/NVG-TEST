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

  it('vòng 3: mọi tầng đã xếp, chỉ hỏng kiểm cả nhà — ban công mặt sau', () => {
    expect(round3.rejections).toHaveLength(1);
    expect(round3.rejections[0]!.level).toBe(0);
    // T96: bộ xếp dời ban công sang mép khác (dải ban công tách khỏi dải WC) — thiếu mặt nào không quan trọng,
    // cơ chế T90 (lỗi bản phác đứng đầu) mới là thứ bài này canh.
    expect(round3.rejections[0]!.messages.join(' ')).toMatch(
      /ban công ở mặt (sau|bên trái|bên phải|trước)/,
    );
    // Lỗi bản phác tầng 2 (gốc) hiện cho kỹ sư ở ghi chú.
    expect(round3.rejections[0]!.notes!.join(' ')).toMatch(/"master_bedroom_1" ở tầng 2/);
  });

  it('câu nhắc: lỗi bản phác tầng 2 đứng đầu, rồi mới tới ban công', () => {
    const hints = round3.hints;
    expect(hints[0]).toMatch(/Your sketch of storey 2 failed the checks below/);
    expect(hints[1]).toMatch(/Storey 2: Room "master_bedroom_1" came out at 19\.02 m²/);
    expect(hints.join('\n')).toMatch(/balcony on the (back|left|right|front) side/);
    expect(retryPlan({ intent: base, issues: [] }, round3).kind).toBe('revise');
  });
});
