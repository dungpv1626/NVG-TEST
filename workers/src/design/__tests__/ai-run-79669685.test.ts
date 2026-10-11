/**
 * Lượt thật 79669685 (11/10/2026) — biệt thự 15 × 20 m, 2 tầng, ban công bắt buộc mặt trước và bên trái. Năm lượt gọi
 * (0,406 USD), không ra phương án, mà ban công trên bản phác đã đúng (T155). Ba chỗ của CHƯƠNG TRÌNH, mỗi chỗ một chốt:
 *
 *  1. Bản phác trượt cổng vì lỗi mô hình sửa được nhưng nằm ngoài `REVISABLE_CODES` (phòng không cửa, phòng hẹp): tầng
 *     chia lại được, lỗi gốc rơi mất khỏi câu nhắc (`SKETCH_FAILURE_CODES`).
 *  2. Phép kiểm lối vào trên bản phác coi giặt phơi giáp ban công RIÊNG của phòng ngủ là có lối vào (`served_from`),
 *     bộ đặt cửa thì không — phòng phục vụ phải tự tới được.
 *  3. Câu «ban công chỉ chạm mặt ấy ở góc» gửi cho một bản phác có ban công chạy suốt mặt ấy — nay nói đúng: bản phác
 *     đã đạt, khối góc là do chương trình chia lại tầng (ca đơn vị trong `ai-revision-view.test.ts`).
 *
 * Từ T157 vòng 2–3 dừng sớm hơn: bản phác tầng 2 đặt phòng làm việc chắn đầu người bước ra của thang.
 *
 * Không gọi mô hình: ý định từng vòng trích từ báo cáo lượt chạy (`fixtures/ai-run-79669685.json`).
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, planContext, programGenerator, promptsFor } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('79669685');
const input = {
  ...realContextInput(run.digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
};
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const evaluate = (intent: HouseIntent) =>
  evaluateHouseBest(input, context, intent, generator, promptsFor(context, prompts));
const round = (n: number) => run.intents[`round${n}`] as HouseIntent;

describe('lượt 79669685 — ban công đúng trên bản phác, lỗi gốc không tới mô hình (T155)', () => {
  it('vòng 4: giặt phơi chỉ giáp ban công riêng của phòng ngủ — bác ngay ở bản phác, nói đúng phòng; tầng 1 giữ', () => {
    const fourth = evaluate(round(4));
    expect(fourth.ok).toBeNull();
    expect(fourth.rejections.map((r) => r.level)).toEqual([2]);
    expect(fourth.rejections[0]!.codes).toContain('sketch_room_no_access');
    const hints = fourth.hints.join('\n');
    expect(hints).toMatch(/"laundry_1" have no way in\. "laundry_1" \(rows 14–16, columns 1–2\)/);
    expect(hints).not.toMatch(/at a corner|already runs/);
    expect(fourth.settled).toContain(1);
  });

  it('ban công riêng của phòng ngủ GIÁP hành lang vẫn không phục vụ giặt phơi — cửa không mở qua phòng con', () => {
    // Vòng 4, tầng 2 sửa tay: giặt phơi lên góc trước – trái, chỉ giáp `balcony_1` (ban công riêng của phòng ngủ chính)
    // và phòng ngủ chính; hành lang kéo lên tận mép trước nên `balcony_1` giáp hành lang.
    const r4 = round(4);
    const sketches = r4.sketches!.map((k) => {
      if (k.level !== 2) return k;
      const rows = k.rows.map((row) => row.split(' '));
      for (let r = 0; r < 3; r += 1) {
        rows[r]![8] = 'circulation_2';
        rows[r]![9] = 'circulation_2';
      }
      for (const [r, c] of [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ] as const) {
        rows[r]![c] = 'laundry_1';
      }
      for (let r = 13; r < 16; r += 1) {
        rows[r]![0] = 'bedroom_5';
        rows[r]![1] = 'bedroom_5';
      }
      return { ...k, rows: rows.map((row) => row.join(' ')) };
    });
    const result = evaluate({ ...r4, sketches });
    expect(result.rejections.map((r) => r.level)).toEqual([2]);
    expect(result.rejections[0]!.codes).toContain('sketch_room_no_access');
    expect(result.hints.join('\n')).toMatch(/"laundry_1" have no way in/);
  });

  it('vòng 2: bản phác tầng 2 đặt phòng làm việc chắn đầu bước ra của thang (T157) — bác theo tầng, nói đúng đầu thang', () => {
    const second = evaluate(round(2));
    expect(second.ok).toBeNull();
    expect(second.rejections.map((r) => r.level)).toEqual([2]);
    expect(second.rejections[0]!.codes).toContain('stair_arrival_blocked');
    const hints = second.hints.join('\n');
    expect(hints).toMatch(
      /The stair "stair_2": people from the storey below step off on its street side, but that side touches only study_1/,
    );
    // Không còn câu ban công khối góc sai sự thật — lỗi thật của bản phác được nói trước.
    expect(hints).not.toMatch(/touches that side only at a corner/);
    expect(second.settled).toContain(1);
  });
});
