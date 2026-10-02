/**
 * Phát lại lượt chạy thật 7c6de305 (29/09/2026, gpt-5.6-sol, lời dẫn 9.0.0, đầu bài khai lại ban công theo Q-55)
 * — T103. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * Lượt thật thất bại: từ vòng 4 lỗi DUY NHẤT còn lại là «thiếu ban công mặt trước». Mô hình vẽ ban công của
 * phòng ngủ chính ở góc trước – trái; bản phác tầng 2 hỏng vì ô thang, chương trình chia lại tầng và dải khép
 * kín chung (WC + ban công) của phòng ngủ chính quay vào lòng nhà — ban công kẹp giữa WC và hành lang, không
 * cạnh nào ra ngoài. Sửa ở `pack.ts` `placeItem`: dải chung làm ban công lọt vào trong thì thử thêm hai dải
 * riêng (ban công ra mặt thoáng, WC một cạnh khác).
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

/** Ghép các vòng như đường chạy thật: câu trả lời sửa ghép lên gốc vòng trước, giữ tầng đã qua. */
function replay(id: string, rounds: number) {
  const run = loadRun(id);
  const input = { ...realContextInput(run.digest), mandatory };
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

describe('phát lại 7c6de305 — ban công phòng ngủ chính không lọt vào lòng nhà khi chia lại tầng 2', () => {
  const rounds = replay('7c6de305', 3);

  it('vòng 3 xếp được (T105: D2 trừ một phòng ngủ tối hẳn nên 63,9 — dưới ngưỡng, lượt thật sẽ xin sửa)', () => {
    const ok = rounds[2]!.ok;
    expect(ok, JSON.stringify(rounds[2]!.rejections)).not.toBeNull();
    expect(ok!.score.percent).toBeGreaterThanOrEqual(60);
  });

  it('ban công mặt trước có mặt và chạm mép trước tầng 2', () => {
    const level = rounds[2]!.ok!.levels.find((lv) => lv.level.level === 2)!.level;
    const balconies = level.rooms.filter((room) => room.type === 'balcony');
    const top = Math.min(...level.outline.map((point) => point[1] as number));
    expect(balconies.some((room) => (room.rect[1] as number) <= top + 25)).toBe(true);
  });
});
