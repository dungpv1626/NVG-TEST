/**
 * Phát lại có dải ban công mặt BÊN của khung hai hàng (30/10/2026): vòng 1 của lượt thật f1a88ac1 (biệt thự 15 × 20 m,
 * đầu bài bắt ban công mặt trước + mặt trái). Bản phác tầng 2 có phòng không lối vào; khung hai hàng gắn ban công vào
 * phòng của hàng, mà không hàng nào chạy dọc mặt trái — mọi khung bỏ vì «không ban công nào nằm dọc mặt … đầu bài bắt
 * buộc». Có dải mặt bên: ban công chạy suốt mặt trái, tầng 2 dựng được, cả nhà qua cổng.
 *
 * Phát lại 62 lượt ghi: 26 → 27 vòng qua cổng; điểm các vòng vốn đã qua giữ nguyên (trung bình 68,3).
 * Ngữ cảnh Workflow. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('f1a88ac1');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function roundOne(side: boolean) {
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
        skeleton_rows: { ...sketch.skeleton_rows!, side_balcony_strip: side },
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

describe('phát lại f1a88ac1 vòng 1 — dải ban công mặt bên', () => {
  it('kb/construction_norms.yaml bật dải ban công mặt bên', () => {
    expect(
      realContextInput(run.digest).construction.sketch?.skeleton_rows?.side_balcony_strip,
    ).toBe(true);
  });

  it('không có dải: tầng 2 hỏng', { timeout: 300_000 }, () => {
    const result = roundOne(false);
    expect(result.ok).toBeFalsy();
    expect(result.rejections.some((r) => r.level === 2)).toBe(true);
  });

  it('có dải: cả nhà qua cổng, tầng 2 có ban công chạy dọc mặt trái', { timeout: 300_000 }, () => {
    const result = roundOne(true);
    expect(result.ok).toBeTruthy();
    const level2 = result.ok!.levels.find((lv) => lv.level.level === 2)!.level;
    // Ban công áp mặt trái (mép x nhỏ nhất — phần đua ra ngoài ranh nới ô, T91), cạnh dài chạy dọc mặt ấy.
    const x0 = Math.min(...level2.rooms.map((room) => room.rect[0]!));
    const along = level2.rooms.filter(
      (room) =>
        room.type === 'balcony' &&
        room.rect[0] === x0 &&
        room.rect[3]! - room.rect[1]! > room.rect[2]! - room.rect[0]!,
    );
    expect(along.length).toBeGreaterThan(0);
  });
});
