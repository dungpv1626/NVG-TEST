/**
 * Phát lại lượt chạy thật e82e3a09 (25/09/2026, GPT-6 Sol, lời dẫn 8.32.0 — lượt đầu sau T81/T82). Hai
 * lời gọi (0,227 USD) rồi runtime `wrangler dev` SẬP lần thứ hai trong ngày, ~3 s sau khi lời gọi sửa
 * vòng 2 xong (kernel: `traps: workerd[…] trap int3` — workerd tự huỷ vì một khẳng định nội bộ, không phải
 * hết bộ nhớ: phát lại vòng 2 dưới trần heap 96 MB vẫn xong trong ~1,5 s).
 *
 * Phép thử này chỉ canh phần chương trình làm được ngoài runtime: ý định vòng 2 (chỉ trả tầng 2) ghép
 * được và xếp được không treo. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('e82e3a09');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const evaluate = (intent: HouseIntent) => evaluateHouse(input, context, intent, generator, prompts);

describe('phát lại lượt chạy thật e82e3a09 — hai vòng rồi runtime sập; phần chương trình không treo', () => {
  it('vòng 1: tầng 2 năm phòng không lối vào, cả nhà thiếu ban công mặt sau', () => {
    const round1 = evaluate(run.intents.round1!);
    expect(round1.rejections.map((r) => r.level)).toEqual([2, 0]);
    expect(round1.hints.join('\n')).toMatch(/balcony on the back side/);
  });

  it('vòng 2 chỉ trả tầng 2: ghép tầng 1 từ vòng 1 và xếp xong dưới 30 s', () => {
    const round1 = evaluate(run.intents.round1!);
    const answer = run.intents.round2 as HouseIntent;
    expect((answer.sketches ?? []).map((sketch) => sketch.level)).toEqual([2]);
    const merged = mergeRevision(round1.renamed!, answer);
    expect((merged.sketches ?? []).map((sketch) => sketch.level)).toEqual([1, 2]);
    const started = Date.now();
    const round2 = evaluate(merged);
    expect(Date.now() - started).toBeLessThan(30_000);
    // Trước T96: tầng 2 bác vì WC chung nằm trên bếp tầng 1 (luật T71) và lối vào. Từ T96 cổng chia lại
    // khu bếp của không gian mở tầng 1 theo WC của chính ứng viên (khu bếp dời khỏi chỗ WC đè), nên tầng
    // 2 xếp được; chỉ còn lỗi kiểm cả nhà.
    expect(round2.rejections.map((r) => r.level)).toEqual([0]);
  });
});
