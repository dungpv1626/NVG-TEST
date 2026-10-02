/**
 * Phát lại lượt chạy thật 894b350d (30/09/2026, gpt-5.6-sol, đầu bài phiên bản 21) — T105. KHÔNG chạm mạng,
 * KHÔNG gọi mô hình.
 *
 * Lượt thật thất bại: cả sáu vòng mọi tầng đều xếp được, cổng bác vì ban công phơi `balcony_3` (3,9 × 1 m, cạnh
 * dài ra mặt sau) có ĐẦU NGẮN chạm mép phải — mặt nhà hàng xóm, đầu bài không khai nên là mặt cấm. Haan chọn A
 * cho Q-57: ban công dài «ở» mặt mà cạnh dài mở ra (`plan-demands.ts` `shortEndOnly`).
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

describe('phát lại 894b350d — ban công mặt sau chạm mép phải bằng đầu ngắn', () => {
  const run = loadRun('894b350d');
  const input = { ...realContextInput(run.digest), mandatory };
  const result = evaluateHouseBest(
    input,
    planContext(input),
    run.intents.round1 as HouseIntent,
    generator,
    prompts,
  );

  it('vòng 1 xếp được, qua ngưỡng 65 điểm', () => {
    expect(result.ok, JSON.stringify(result.rejections)).not.toBeNull();
    expect(result.ok!.score.percent).toBeGreaterThanOrEqual(65);
  });

  it('có ban công dài chạm mép phải chỉ bằng đầu ngắn', () => {
    const levels = result.ok!.levels.map((lv) => lv.level);
    const hit = levels.some((level) => {
      const right = Math.max(...level.outline.map((p) => p[0] as number));
      return level.rooms.some((room) => {
        if (room.type !== 'balcony') return false;
        const [x0, y0, x1, y1] = room.rect as number[];
        return x1! >= right - 30 && x1! - x0! > 1.5 * (y1! - y0!);
      });
    });
    expect(hit).toBe(true);
  });
});
