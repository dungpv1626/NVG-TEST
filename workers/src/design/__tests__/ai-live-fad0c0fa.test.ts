/**
 * Phát lại lượt chạy thật fad0c0fa (23/09/2026, gpt-5.6-sol, lời dẫn 8.17.0) — lượt đầu tiên sau T71.
 *
 * «Biệt thự nhà vườn (demo)» 2 tầng, chừa chỗ thang máy cạnh thang bộ, ban công đua 1 m ra ngoài ranh ở
 * mặt trước / trái / sau. Lượt ấy hỏng với câu «ô thang máy tầng 2 lệch 152 cm» và DỪNG sau một lời gọi.
 * Soi lại thấy bốn chỗ, không chỗ nào thuộc luật T71:
 *
 *  1. Ô thang máy không được ghim theo tầng dưới như thang bộ — mô hình vẽ CÙNG ô lưới ở hai tầng mà
 *     căn vách theo diện tích từng tầng đẩy lệch 152 cm.
 *  2. Cổng an toàn từng tầng không biết mức đua ban công đầu bài khai → mọi ban công đua ra đều bị bác.
 *  3. Ô thang máy lệch HẲN (không chồng giếng nào) lọt qua tầng, hỏng ở cổng cuối — cả lượt đổ.
 *  4. Lỗi thật nằm ở bản phác (master vẽ ~12 m² cho mức 25 m²) nhưng câu báo lên là lỗi hình học, nên
 *     lượt dừng, mô hình không được sửa. Haan chọn: gửi lại mô hình.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('fad0c0fa');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate() {
  const input = { ...realContextInput(run.digest), mandatory };
  return evaluateHouse(input, planContext(input), run.intents.round1!, generator, prompts);
}

describe('phát lại lượt chạy thật fad0c0fa', () => {
  const evaluation = evaluate();
  const messages = evaluation.rejections.flatMap((rejection) => rejection.messages);

  it('không còn hỏng vì ô thang máy «lệch N cm» khi mô hình vẽ cùng ô ở hai tầng', () => {
    expect(messages.some((message) => /thang máy.*lệch \d+ cm/.test(message))).toBe(false);
  });

  it('ban công đua ra đúng mức đầu bài khai không bị bác là «ngoài phần đất được xây»', () => {
    expect(messages.some((message) => message.includes('ngoài phần đất'))).toBe(false);
  });

  it('lỗi của bản phác (phòng vẽ thiếu ô) được báo và GỬI LẠI mô hình, không dừng lượt', () => {
    // Trước T73 lỗi báo lên là master tầng 2 (~12 m² cho 25 m²). Từ T73 phép kiểm bản phác thấy trước
    // ở tầng 1: phòng khách vẽ 32 ô cho mức 45 m² — cùng một nguyên nhân gốc, báo sớm hơn một tầng.
    expect(messages.some((message) => /Bản phác tầng 1 .*living_1/.test(message))).toBe(true);
    expect(evaluation.hints.join(' ')).toMatch(/living_1.*at least \d+ cells/);
    expect(retryPlan({ intent: run.intents.round1!, issues: [] }, evaluation).kind).toBe('revise');
  });
});
