/**
 * Phát lại lượt chạy thật 4b0268b1 (25/09/2026, GPT-6 Sol, lời dẫn 8.29.0 — sau T76). Bốn lời gọi
 * (0,469 USD) rồi DỪNG, không ra phương án.
 *
 * Vòng 2 chỉ còn MỘT lỗi báo lên — `bedroom_5` không chạm hành lang — trong khi trên chính bản phác ấy
 * `wc_4` chỉ vào được qua ô thang (T74). Phép kiểm bản phác dừng ở lỗi đầu tiên, luật T74 chỉ chạy ở bộ
 * xếp mà bộ xếp chưa được chạy tới: mô hình sửa xong `bedroom_5` thì lộ `wc_4`, hết lượt sửa. Nay báo cùng
 * một lượt (Haan chọn hướng 1, 25/09/2026). KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('4b0268b1');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate(round: string) {
  const input = { ...realContextInput(run.digest), mandatory };
  return evaluateHouse(input, planContext(input), run.intents[round]!, generator, prompts);
}

describe('phát lại lượt chạy thật 4b0268b1 — báo hết lỗi lối vào thấy được trong một lượt', () => {
  it('vòng 2: câu nhắc nêu `bedroom_5` KÈM `wc_4` chỉ vào được qua ô thang — GỬI LẠI', () => {
    const evaluation = evaluate('round2');
    expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([2]);
    const hint = evaluation.hints.join(' ');
    expect(hint).toMatch(/"bedroom_5" have no way in/);
    expect(hint).toMatch(/Also, "wc_4" can only be entered from the stair/);
    // `wc_4` bị nêu thì không được dặn giữ nguyên.
    expect(hint).not.toMatch(/must KEEP it after your change: [^.]*"wc_4"/);
    expect(retryPlan({ intent: run.intents.round2!, issues: [] }, evaluation).kind).toBe('revise');
  });

  it('vòng 3: phòng đang bị nêu lỗi không nằm trong danh sách «giữ nguyên»', () => {
    const hint = evaluate('round3').hints.join(' ');
    expect(hint).toMatch(/Room "bedroom_4" could only be entered from the stair/);
    expect(hint).not.toMatch(/must KEEP it after your change: [^.]*"bedroom_4"/);
  });
});
