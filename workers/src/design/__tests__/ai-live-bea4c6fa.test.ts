/**
 * Phát lại lượt chạy thật bea4c6fa (30/09/2026, gpt-5.6-terra, lời dẫn 9.2.0, 0,550 USD, thất bại) — T107.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * Lượt thật: mỗi vòng lộ đúng MỘT nhóm lỗi — vòng 1 thiếu WC chung (danh mục), vòng 2 mới lộ lối vào tầng 2 (có từ vòng
 * 1), vòng 3 diện tích, vòng 4 ban công. Danh mục sai thì nay vẫn soát bản phác mọi tầng, báo cùng một lượt.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  evaluateHouseBest,
  fromRevisionIds,
  mergeRevision,
  planContext,
  programGenerator,
  revisionView,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

describe('phát lại bea4c6fa — danh mục sai vẫn soát bản phác (T107)', () => {
  const run = loadRun('bea4c6fa');
  const input = { ...realContextInput(run.digest, { stairShape: true }), mandatory };
  const round1 = evaluateHouseBest(
    input,
    planContext(input),
    run.intents.round1 as HouseIntent,
    generator,
    prompts,
  );

  it('vòng 1: bác ở danh mục (thiếu WC chung) VÀ nêu luôn lỗi lối vào tầng 2 mà lượt thật chỉ lộ ở vòng 2', () => {
    expect(round1.ok).toBeNull();
    const hints = round1.hints.join('\n');
    expect(hints).toMatch(/Thiếu WC chung ở tầng 1/);
    expect(hints).toMatch(/Storey 2: In the sketch, .*"master_bedroom_1".* have no way in/);
    // Câu nhắc bản phác nói bằng mã đã đánh — ý định gửi kèm phải là bản đã đánh mã ấy.
    expect(round1.renamed?.rooms.some((room) => room.id === 'master_bedroom_1')).toBe(true);
  });
});

describe('phát lại bea4c6fa — ban công bắt buộc được ghim khi chia lại tầng (T109)', () => {
  const run = loadRun('bea4c6fa');
  const input = { ...realContextInput(run.digest, { stairShape: true }), mandatory };
  const context = planContext(input);
  // Ghép như đường chạy thật: câu trả lời sửa mang MÃ NGẮN (`revisionView`), đổi ngược rồi ghép lên gốc.
  const rounds = (() => {
    const out = [];
    let previous: HouseIntent | null = null;
    let keep: number[] = [];
    for (let i = 1; i <= 6; i += 1) {
      const raw = run.intents[`round${i}`] as HouseIntent;
      const intent: HouseIntent = previous
        ? mergeRevision(previous, fromRevisionIds(raw, revisionView(previous, [], keep).back), keep)
        : raw;
      const result = evaluateHouseBest(input, context, intent, generator, prompts);
      out.push(result);
      previous = result.renamed ?? intent;
      keep = result.ok ? [] : (result.settled ?? []);
    }
    return out;
  })();

  /*
   * T157 (11/10/2026): hai mặt bằng vòng 5 (67,3) và vòng 6 (64,8) mà hai ca dưới từng canh đều mở ô thang tầng 2 bằng
   * ô thông 2,69 m ở CẠNH DÀI (thang U lên `-y`, người bước ra ở đầu `y1`) — lối ra giữa vế bậc, đúng lỗi Haan chỉ. Từ
   * T157 cổng bác chúng. Hệ quả: T109 (ban công được ghim khi chia lại) và T111 (không dừng tìm biến thể ở ngưỡng nhận)
   * KHÔNG còn ca canh trên lượt ghi này — đã thử bốn lượt ghi khác còn ra mặt bằng, biến thể đầu đều đã vượt mức tìm.
   * Ghi ở «còn mở» của T157.
   */
  it('vòng 5, 6: mặt bằng từng qua mở thang giữa vế bậc — nay bị bác (T157)', () => {
    expect(rounds[4]!.ok).toBeNull();
    expect(rounds[5]!.ok).toBeNull();
    // Ngưỡng tìm vẫn phải trên ngưỡng nhận (cấu hình T111), dù không còn ca phát lại nào đo hành vi.
    expect(input.quality.variantSearchUntilPercent!).toBeGreaterThan(input.quality.acceptPercent!);
  });
});
