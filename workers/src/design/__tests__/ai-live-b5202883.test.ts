/**
 * Phát lại lượt chạy thật b5202883 (25/09/2026, GPT-6 Sol, lời dẫn 8.28.0 — sau T74, T75). Bốn lời gọi
 * (0,402 USD) rồi DỪNG, không ra phương án.
 *
 * Mô hình đặt thang máy CHẮN GIỮA thang bộ và hành lang tầng 2 («cạnh thang bộ» hiểu theo nghĩa đen):
 * cabin không phải lối đi, nên lên tới tầng 2 là không đi tiếp được và mọi phòng tầng ấy «không có lối
 * vào». Câu nhắc cũ kể bảy phòng, dặn GIỮ NGUYÊN thang máy — mô hình nộp lại gần như y nguyên ba lượt.
 * Nay nói đúng chỗ hỏng: ô thang bị cô lập, chỉ giáp những gì. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('b5202883');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate(round: string) {
  const input = { ...realContextInput(run.digest), mandatory };
  return evaluateHouse(input, planContext(input), run.intents[round]!, generator, prompts);
}

describe('phát lại lượt chạy thật b5202883 — thang máy chắn giữa thang bộ và hành lang', () => {
  for (const round of ['round2', 'round3', 'round4']) {
    it(`${round}: câu nhắc nói ô thang tầng 2 bị cô lập, chỉ ra thang máy, không dặn giữ nguyên gì — GỬI LẠI`, () => {
      const evaluation = evaluate(round);
      expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([2]);
      const hint = evaluation.hints.join(' ');
      expect(hint).toMatch(/the stair "stair_2" touches no corridor/);
      expect(hint).toMatch(/"elevator_2"/);
      expect(hint).toMatch(/never sits between the stair and the corridor/);
      expect(hint).not.toMatch(/must KEEP/);
      expect(retryPlan({ intent: run.intents[round]!, issues: [] }, evaluation).kind).toBe(
        'revise',
      );
    });
  }

  it('round1: tầng 1 mắc đúng lỗi ấy (thang máy giữa thang bộ và hành lang) — cùng câu nhắc', () => {
    const hint = evaluate('round1').hints.join(' ');
    expect(hint).toMatch(/Storey 1: .*the stair "stair_1" touches no corridor.*"elevator_1"/);
  });
});
