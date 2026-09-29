/**
 * Phát lại lượt chạy thật 6c35ed79 (24/09/2026, gpt-5.6-terra, lời dẫn 8.22.0) — cùng đầu bài với
 * fad0c0fa, bốn lời gọi (0,315 USD), không ra phương án.
 *
 * Tầng 1 qua cả bốn lượt (đủ ô, hành lang 2 ô). Tầng 2 hỏng vì năm phòng không giáp hành lang ngay trên
 * bản phác — mà lỗi ấy không được gửi mô hình, nên ba lượt sửa chỉ sửa diện tích. T73 (c): kiểm lối vào
 * ngay trên bản phác và báo mô hình. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('6c35ed79');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate(round: string) {
  const input = { ...realContextInput(run.digest), mandatory };
  return evaluateHouse(input, planContext(input), run.intents[round]!, generator, prompts);
}

describe('T73 (c) — phòng không có lối vào ngay trên bản phác', () => {
  const round4 = evaluate('round4');

  it('WC chung vẽ ở góc chỉ giáp phòng ngủ thì bị báo, kèm tên phòng, và GỬI LẠI mô hình', () => {
    // wc_1 không khép kín, mô hình tự khai «cạnh circulation_1» mà vẽ nó giáp bedroom_1, bedroom_2,
    // wc_2. Trước (c) bộ xếp dời WC đi và tầng 1 «qua» — mô hình không bao giờ biết.
    // T92: tầng 1 hỏng thì bản phác tầng trên vẫn được SOÁT cùng lượt — tầng 2 góp lỗi của nó.
    expect(round4.rejections.map((rejection) => rejection.level)).toEqual([1, 2]);
    expect(round4.rejections[0]!.messages.join(' ')).toMatch(/Bản phác tầng 1: "wc_1"/);
    expect(round4.hints.join(' ')).toMatch(/"wc_1" have no way in/);
    expect(retryPlan({ intent: run.intents.round4!, issues: [] }, round4).kind).toBe('revise');
  });

  it('WC khép kín giáp phòng mẹ thì KHÔNG bị báo', () => {
    // wc_2 là WC khép kín của bedroom_1 và giáp nó trên bản phác.
    expect(round4.rejections[0]!.messages.join(' ')).not.toMatch(/wc_2/);
  });
});
