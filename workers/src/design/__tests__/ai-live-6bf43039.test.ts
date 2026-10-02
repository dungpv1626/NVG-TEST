/**
 * Phát lại lượt chạy thật 6bf43039 (30/09/2026, gpt-5.6-terra, lời dẫn 9.1.0, 0,627 USD, thất bại) — T107.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * Lượt thật: vòng 3–6 nhận nguyên văn «chong chóng» + «thiếu ban công mặt trước» — bản phác CÓ ban công dài dọc mép
 * trước, chương trình chia lại tầng 2 nắn nó thành khối góc (vẫn báo: lọc ca này làm phát lại 14 → 12, T107); vòng
 * cuối «study_1» không chạm hành lang.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function replay(rounds: number) {
  const run = loadRun('6bf43039');
  const input = { ...realContextInput(run.digest, { stairShape: true }), mandatory };
  const context = planContext(input);
  const out = [];
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  for (let i = 1; i <= rounds; i += 1) {
    const answer = run.intents[`round${i}`] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    const result = evaluateHouseBest(input, context, intent, generator, prompts);
    out.push(result);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
  }
  return out;
}

describe('phát lại 6bf43039 — câu nhắc đúng chỗ (T107)', () => {
  const rounds = replay(6);

  it('vòng 6: phòng không lối vào kèm hàng/cột, phòng đang giáp và hành lang gần nhất', () => {
    const hints = rounds[5]!.hints.join('\n');
    expect(hints).toMatch(
      /"study_1" \(rows 9–13, columns 10–12\) touches .*"wc_3".*; the nearest corridor or shared room reaching the stair is "circulation_2", 1 cell away/,
    );
    expect(hints).toMatch(/Storey 1 passed every check/);
  });
});
