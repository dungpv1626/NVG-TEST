/**
 * Phát lại có dải ban công chính mặt tiền của khung hai hàng (T181): vòng 1 của lượt thật 46d6eff3 (biệt thự 15 × 20 m,
 * đầu bài 9272 dựng từ lượt này). Không có dải: ban công chính mặt tiền chỉ mở từ phòng riêng, ban công hông lớn hơn
 * ban công trước — nhóm D «Mặt thoáng» dưới sàn riêng 60 %, phương án dưới ngưỡng nhận. Có dải: ban công chính chạy suốt
 * mặt tiền, mở từ sảnh / đầu hành lang, mọi nhóm qua sàn — phương án đạt ngưỡng nhận (không còn câu nhắc điểm).
 *
 * Ngữ cảnh Workflow. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('46d6eff3');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function roundOne(strip: boolean) {
  const base = realContextInput(run.digest, {
    stairShape: true,
    openSetback: true,
    houseProfile: true,
  });
  const sketch = base.construction.sketch!;
  const input = {
    ...base,
    mandatory,
    construction: {
      ...base.construction,
      sketch: {
        ...sketch,
        // Dải ban công mặt BÊN (30/10/2026) tắt ở cả hai nhánh — phép thử này đo riêng dải mặt tiền T181.
        skeleton_rows: {
          ...sketch.skeleton_rows!,
          main_balcony_strip: strip,
          side_balcony_strip: false,
        },
      },
    },
  };
  return evaluateHouseBest(
    input,
    planContext(input),
    run.intents.round1 as HouseIntent,
    generator,
    prompts,
  );
}

describe('phát lại 46d6eff3 vòng 1 — dải ban công chính mặt tiền (T181)', () => {
  it('kb/construction_norms.yaml bật dải ban công chính', () => {
    expect(
      realContextInput(run.digest).construction.sketch?.skeleton_rows?.main_balcony_strip,
    ).toBe(true);
  });

  it('không có dải: qua cổng nhưng dưới ngưỡng nhận', { timeout: 300_000 }, () => {
    const result = roundOne(false);
    expect(result.ok).toBeTruthy();
    expect(result.ok!.score.hints.length).toBeGreaterThan(0);
  });

  it(
    'có dải: đạt ngưỡng nhận, tầng 2 có ghi chú khung hai hàng với dải',
    { timeout: 300_000 },
    () => {
      const result = roundOne(true);
      expect(result.ok).toBeTruthy();
      expect(result.ok!.score.hints).toEqual([]);
      const notes = result.ok!.levels.flatMap((lv) => lv.notes.map((n) => n.message));
      expect(notes.some((m) => /khung hai hàng \([^)]*\bS\b/.test(m))).toBe(true);
    },
  );
});
