/**
 * Lượt ghi 46d6eff3 vòng 1 (biệt thự 15 × 20 m, 2 tầng) — ô thang tầng 1 thu gọn khi tầng trên hỏng (T169).
 *
 * Tầng 1 xếp được với ô thang rộng hơn mức thang cần; tầng 2 đặt theo mốc ấy thì hỏng. Bước quay lui mới thử lại tầng 1
 * với ô thang thu về cạnh tối thiểu (`ArrangeInput.stairTight`) — cả nhà qua, 70,2 điểm (ngưỡng 60). Trước T169 vòng này
 * hỏng (phòng thiếu, đầu bước ra của thang). KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */
import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

describe('phát lại 46d6eff3 vòng 1 — ô thang tầng 1 thu gọn khi tầng trên hỏng (T169)', () => {
  it('cả nhà qua cổng và đạt ngưỡng điểm', () => {
    const run = loadRun('46d6eff3');
    const input = {
      ...realContextInput(run.digest, { stairShape: true, openSetback: true, houseProfile: true }),
      mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
    };
    const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
    const result = evaluateHouseBest(
      input,
      planContext(input),
      run.intents.round1 as HouseIntent,
      generator,
      prompts,
    );
    expect(result.rejections.flatMap((rejection) => rejection.messages)).toEqual([]);
    expect(result.ok?.levels).toHaveLength(2);
    expect(result.ok!.score.percent!).toBeGreaterThanOrEqual(input.quality.acceptPercent!);
  });
});
