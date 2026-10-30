/**
 * Lượt đầu chỉ phác tầng 1 (T187, lời dẫn 9.15.0). Mô phỏng hai bước trên vòng 4 của lượt thật a66f4aa0 (hồ sơ
 * NVO-TK-2026-9272 — vòng đã qua cổng): (1) ý định chỉ có bản phác tầng 1 → tầng 1 xếp xong và được giữ, tầng 2 «chưa vẽ»,
 * câu nhắc đòi vẽ tiếp kèm lưới tầng 1 đã dựng; (2) ghép bản phác tầng 2 như lượt kế trả về → cả nhà qua cổng.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */
import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('a66f4aa0');
const input = {
  ...realContextInput(run.digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
};
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

/** Ý định đã qua cổng của vòng 4 (ghép như Workflow từ vòng 1). */
function passedIntent(): HouseIntent {
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  let intent: HouseIntent | null = null;
  for (const key of ['round1', 'round2', 'round3', 'round4']) {
    const answer = run.intents[key] as HouseIntent;
    intent = previous ? mergeRevision(previous, answer, keep) : answer;
    const result = evaluateHouseBest(input, context, intent, generator, prompts);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
    if (result.ok) return result.ok.intent as unknown as HouseIntent;
  }
  throw new Error('vòng 4 không qua');
}

describe('lượt đầu chỉ phác tầng 1 (T187)', () => {
  it(
    'chỉ có bản phác tầng 1 → giữ tầng 1, đòi vẽ tầng 2 kèm lưới tầng 1; ghép tầng 2 → cả nhà qua',
    { timeout: 600_000 },
    () => {
      const full = passedIntent();
      const first: HouseIntent = { ...full, sketches: full.sketches!.filter((s) => s.level === 1) };
      const staged = evaluateHouseBest(input, context, first, generator, prompts);
      expect(staged.ok).toBeNull();
      expect(staged.settled).toEqual([1]);
      expect(staged.rejections.map((r) => r.level)).toEqual([2]);
      expect(staged.hints.some((h) => h.startsWith('- Storey 2: not drawn yet'))).toBe(true);
      expect(staged.hints.some((h) => h.includes('as the program built it'))).toBe(true);

      const answer: HouseIntent = {
        ...full,
        rooms: full.rooms.filter((room) => room.level === 2),
        sketches: full.sketches!.filter((s) => s.level === 2),
      };
      const merged = mergeRevision(staged.renamed ?? first, answer, staged.settled ?? []);
      const done = evaluateHouseBest(input, context, merged, generator, prompts);
      expect(done.ok).toBeTruthy();
    },
  );
});
