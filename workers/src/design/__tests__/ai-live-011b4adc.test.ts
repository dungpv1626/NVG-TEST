/**
 * Phát lại lượt chạy thật 011b4adc (23/09/2026, gpt-5.6-sol, lời dẫn 8.18.0) — lượt đầu tiên sau T72,
 * cùng đầu bài với fad0c0fa. Bốn lời gọi (0,531 USD), không ra phương án: tầng 1 qua, tầng 2 hỏng cả bốn.
 *
 * Hai chỗ của chương trình:
 *
 *  1. Ô thang máy tầng 2 «không nằm trên giếng» dù mô hình vẽ đúng cùng ô với tầng 1: các khung khoét
 *     mốc chỉ khoét thang bộ và giếng trời, thang máy rơi vào chung mảnh với phòng khác.
 *  2. Câu nhắc diện tích chỉ nói «vẽ thêm ô»: phòng làm việc nhích 7,7 → 8,9 → 10,3 m² (cần 13).
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('011b4adc');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate(round: string, beforeT73 = false) {
  const base = realContextInput(run.digest);
  const { sketch: _t73, ...construction } = base.construction;
  const input = { ...base, ...(beforeT73 ? { construction } : {}), mandatory };
  return evaluateHouse(input, planContext(input), run.intents[round]!, generator, prompts);
}

describe('T73 — nguyên nhân gốc: bản phác tầng 1 vẽ phòng khách 28 ô cho mức 45 m²', () => {
  it('bản phác thiếu ô bị báo NGAY ở tầng 1, kèm số ô cần vẽ — không để bộ xếp dời ô thang «cứu» tầng', () => {
    const evaluation = evaluate('round1');
    // T92: tầng 1 hỏng thì bản phác tầng trên vẫn được SOÁT cùng lượt — tầng 2 góp lỗi của nó.
    expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([1, 2]);
    const hints = evaluation.hints.join('\n');
    expect(hints).toContain(
      'Room "living_1" came out at 26.8 m² from 28 sketch cells but the client requires at least 45 m²; it needs at least 48 cells',
    );
    // T89: không phòng kề nào nhường đủ 20 ô → câu nhắc bảo xếp lại dải phòng, không bảo «lấy của phòng kề».
    expect(hints).toMatch(/no single neighbour \("garage_1", "kitchen_1", "storage_1", "wc_1"\)/);
    expect(hints).toMatch(/may also shrink below the target you set/);
    expect(hints).not.toMatch(/take them from a neighbour that has spare area/);
  });
});

// Hai chỗ sửa T72 đo trên luật TRƯỚC T73 — từ T73 lượt này dừng ở tầng 1, không tới tầng 2 nữa.
describe('phát lại lượt chạy thật 011b4adc (luật trước T73)', () => {
  const rounds = ['round1', 'round2', 'round3', 'round4'].map((round) => evaluate(round, true));

  it('ô thang máy tầng 2 vẽ cùng ô với tầng 1 thì không còn bị báo lệch giếng', () => {
    for (const evaluation of rounds) {
      const messages = evaluation.rejections.flatMap((rejection) => rejection.messages);
      expect(messages.some((message) => message.includes('giếng thang máy'))).toBe(false);
    }
  });

  it('tầng 2 hỏng vì chính bản phác (chong chóng) — lỗi ấy được GỬI LẠI mô hình, không dừng lượt', () => {
    // Giữa chừng T73 lượt này «xếp được cả hai tầng» nhờ khung coi thang máy là hành lang — một «thang
    // máy» chạy suốt bề ngang nhà. Bỏ thang máy khỏi nhóm hành lang (`corridorIds`) thì cái đạt giả ấy
    // mất; chỗ hỏng thật là bản phác tầng 2, và mô hình được báo đúng chỗ ấy.
    const last = rounds[3]!;
    expect(last.rejections.map((rejection) => rejection.level)).toEqual([2]);
    expect(last.hints.join(' ')).toMatch(/pinwheel/);
    expect(retryPlan({ intent: run.intents.round4!, issues: [] }, last).kind).toBe('revise');
  });

  it('không còn cây nào có một phòng ở hai nút (`tree_child_reused`)', () => {
    for (const evaluation of rounds) {
      const messages = evaluation.rejections.flatMap((rejection) => rejection.messages);
      expect(messages.some((message) => message.includes('là con của'))).toBe(false);
    }
  });
});

describe('câu nhắc diện tích kèm số ô (T72)', () => {
  it('nói số ô đang vẽ và số ô cần vẽ — đo trên mức lọt lòng thật của bản phác', () => {
    const hints = evaluate('round1').hints.join('\n');
    // 26,8 m² / 28 ô ≈ 0,957 m² mỗi ô → 45 m² cần 48 ô.
    expect(hints).toContain('from 28 sketch cells');
    expect(hints).toContain('at least 48 cells');
  });
});
