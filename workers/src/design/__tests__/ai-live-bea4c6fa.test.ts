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
    expect(hints).toMatch(/Thiếu Khu vệ sinh chung ở tầng 1/);
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

  it('vòng 5: phòng thờ hụt sàn làm tầng 2 phải chia lại, nhưng ban công mặt trước giữ đúng ô → ra mặt bằng qua ngưỡng', () => {
    // Lượt thật (trước T109): chia lại dời `balcony_2` từ mặt trước sang mặt phải cấm, cả nhà bị bác.
    const ok = rounds[4]!.ok;
    expect(ok).not.toBeNull();
    expect(ok!.score.percent).toBeGreaterThanOrEqual(65);
  });

  it('vòng 6: ngưỡng nhận 60 không làm bộ xếp dừng tìm biến thể sớm — vẫn ra bản đạt mức tìm (T111)', () => {
    // Hạ ngưỡng 65 → 60 (01/10/2026) làm bản 61,8 điểm được trả ngay; mức tìm `variant_search_until_percent` giữ bản
    // 71,2. Từ T113 vòng 5 ra bản khác (nới WC hẹp, 67,5 thay 64,6), nên vòng 6 ghép từ ý định khác và ra 65,7 — vẫn
    // trên mức tìm, tức bộ xếp không dừng ở bản vừa qua ngưỡng nhận.
    // T116 nâng D4 (giặt phơi có chỗ phơi) lên nặng 2: bản tốt nhất vòng 6 còn 64,8 — dưới mức tìm 65 nên bộ xếp đã
    // thử hết biến thể; vẫn cao hơn hẳn bản vừa qua ngưỡng nhận (61,8 lúc dừng sớm), tức nó không dừng ở bản đầu tiên.
    const until = input.quality.variantSearchUntilPercent!;
    expect(until).toBeGreaterThan(input.quality.acceptPercent!);
    expect(rounds[5]!.ok?.score.percent ?? 0).toBeGreaterThan(input.quality.acceptPercent! + 4);
  });
});
