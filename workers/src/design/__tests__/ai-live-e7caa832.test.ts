/**
 * Phát lại lượt chạy thật e7caa832 (26/09/2026, Claude Sonnet 5, lời dẫn 8.35.0). Hai lời gọi xong
 * (65.770 + 90.845 token ra, 1,605 USD), Haan bấm «Dừng». Vòng 2 sửa đúng mọi lỗi vòng 1 (hành lang tầng
 * 1, ban công trái và sau) nhưng khai `bedroom_5` 16 m² dưới sàn đầu bài 17 m² — bác ở cổng danh mục,
 * lỗi thật của bản phác (đoạn hành lang cụt tầng 1) phải chờ thêm một lượt gọi ~1 USD.
 *
 * T91 (Haan 27/09/2026 — «ưu tiên sửa để đạt đúng diện tích tối thiểu»): chương trình nâng diện tích
 * khai lên đúng sàn và xếp tiếp, nên lỗi thật lộ ngay trong vòng ấy. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  evaluateHouse,
  mergeRevision,
  planContext,
  PROGRAM_STAGE_CODE,
  programGenerator,
  retryPlan,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('e7caa832');
const input = {
  ...realContextInput(run.digest),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
};
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const evaluate = (intent: HouseIntent) => evaluateHouse(input, context, intent, generator, prompts);

describe('phát lại lượt Sonnet 5 e7caa832 — một con số khai thiếu 1 m² không còn che lỗi thật', () => {
  const answer1 = run.intents.round1 as HouseIntent;
  const round1 = evaluate(answer1);
  const round2 = evaluate(
    mergeRevision(
      retryPlan({ intent: answer1, issues: [] }, round1).previous!,
      run.intents.round2 as HouseIntent,
    ),
  );

  it('vòng 2: không bác ở cổng danh mục; diện tích khai được nâng lên sàn, và ghi chú nói ra', () => {
    expect(round2.rejections.some((r) => (r.codes ?? []).includes(PROGRAM_STAGE_CODE))).toBe(false);
    const notes = round2.rejections.flatMap((r) => r.notes ?? []).join(' ');
    expect(notes).toMatch(
      /mô hình khai 16 m², dưới mức đầu bài 17 m² — chương trình nâng lên 17 m²/,
    );
  });

  it('lỗi thật của bản phác lộ ngay trong vòng ấy: đoạn hành lang cụt ở tầng 1', () => {
    const ground = round2.rejections.find((r) => r.level === 1)!;
    expect(ground.codes).toContain('sketch_room_no_access');
    expect(ground.messages.join(' ')).toMatch(/"circulation_2"/);
  });
});
