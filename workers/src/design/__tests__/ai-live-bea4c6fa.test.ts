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
   * T157 (11/10/2026): hai mặt bằng vòng 5 (67,3) và vòng 6 (64,8) mở ô thang tầng 2 bằng ô thông 2,69 m ở CẠNH DÀI
   * (thang U lên `-y`, người bước ra ở đầu `y1`) — lối ra giữa vế bậc, đúng lỗi Haan chỉ; T157 bác cả hai.
   * T158 (11/10/2026): bộ xếp khoét sảnh đầu thang từ phòng đang chắn đầu bước ra, giữ cây — vòng 6 ra mặt bằng lại,
   * lần này lối ra ở đúng đầu `y1`; vòng 5 thì phòng chắn không nhường nổi. T109 / T111 vẫn chưa có ca canh riêng (xem «còn mở» của T157).
   */
  it('vòng 6 ra mặt bằng nhờ sảnh đầu thang — lối ra tầng 2 ở đầu bước ra; vòng 5 vẫn bị bác (T158)', () => {
    // Vòng 5: phòng chắn đầu bước ra không nhường nổi một dải sảnh mà còn đủ cạnh — vẫn bác, câu nhắc gửi mô hình.
    expect(rounds[4]!.ok).toBeNull();
    expect(rounds[4]!.rejections.flatMap((r) => r.codes ?? [])).toContain('stair_arrival_blocked');
    for (const result of [rounds[5]!]) {
      expect(result.ok).not.toBeNull();
      const upper = result.ok!.levels.find((l) => l.level.level === 2)!.level;
      const ground = result.ok!.levels.find((l) => l.level.level === 1)!.level;
      expect(ground.stairs?.[0]?.up).toBe('-y');
      const stair = upper.rooms.find((room) => room.type === 'stair')!;
      // Sảnh chương trình khoét nằm ngay đầu `y1` của ô thang.
      const [x0, , x1, y1] = stair.rect as number[];
      const landing = upper.rooms.find((room) => {
        const [rx0, ry0, rx1] = room.rect as number[];
        return (
          room.type === 'circulation' &&
          Math.abs(ry0! - y1!) <= 25 &&
          Math.min(rx1!, x1!) - Math.max(rx0!, x0!) > 0
        );
      });
      expect(landing).toBeDefined();
    }
    // Ngưỡng tìm vẫn phải trên ngưỡng nhận (cấu hình T111).
    expect(input.quality.variantSearchUntilPercent!).toBeGreaterThan(input.quality.acceptPercent!);
  });
});
