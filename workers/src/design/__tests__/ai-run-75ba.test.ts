/**
 * Lượt thật 75ba5793 (10/10/2026) — nhà ống 5 × 18 m, 4 tầng, gara mặt tiền. Năm lượt gọi (0,499 USD), không ra
 * phương án, trong khi vòng 1 tầng 1 đã đúng bố cục (T153). Ba chỗ hỏng của CHƯƠNG TRÌNH, mỗi chỗ một chốt:
 *
 *  1. Ô thang giáp giếng trời bị bác vì hụt 1,5 cm lọt lòng — do chính bộ xếp chừa theo vách ngăn, không theo
 *     tường bao (`sketchMinExtent`).
 *  2. Ô kho 2 m² kẹt góc sau làm cả tầng 1 bị gửi lại mô hình (`ai/stranded.ts`).
 *  3. Mô hình trả lại một câu trả lời đã chấm (vòng 3 y hệt vòng 2) mà vẫn gọi tiếp (`houseAnswerKey`).
 *
 * Không gọi mô hình: ý định từng vòng trích từ báo cáo lượt chạy (`fixtures/ai-run-75ba5793.json`).
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import {
  evaluateHouseBest,
  houseAnswerKey,
  mergeRevision,
  planContext,
  programGenerator,
  promptsFor,
} from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('75ba5793');
const input = {
  ...realContextInput(run.digest, { stairShape: true, openSetback: true, houseProfile: true }),
  mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
};
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const evaluate = (intent: HouseIntent) =>
  evaluateHouseBest(input, context, intent, generator, promptsFor(context, prompts));
const round = (n: number) => run.intents[`round${n}`] as HouseIntent;

describe('lượt 75ba5793 — nhà ống 5 m gara mặt tiền (T153)', () => {
  const first = evaluate(round(1));

  it('vòng 1: tầng 1 QUA — ô kho kẹt được nhập vào phòng kề, ô thang đủ dài; chỉ còn lỗi tầng 3 của mô hình', () => {
    const levels = first.rejections.map((r) => r.level);
    expect(levels).not.toContain(1);
    expect(levels).toContain(3);
    const notes = first.rejections.flatMap((r) => r.notes ?? []).join('\n');
    // Phép nhập chạy TRƯỚC bước đánh mã nên ghi chú mang mã mô hình trả về.
    expect(notes).toMatch(/kho "sg1" không chạm lối đi nào — chương trình nhập vào "wc1"/);
  });

  it('vòng 1 + vòng 2 (mô hình sửa tầng 3, tầng 1 đã khoá) qua cổng — điểm dưới ngưỡng từ T157', () => {
    const merged = mergeRevision(first.renamed!, round(2), first.settled ?? []);
    const second = evaluate(merged);
    expect(second.rejections).toEqual([]);
    expect(second.ok).not.toBeNull();
    // T157 (11/10/2026): phương án 66,9 điểm trước đó mở ô thang tầng 2 và 3 ở cạnh dài, giữa vế bậc. Phương án đi được
    // tốt nhất chỉ được 58,4 < 60 — lượt chạy thật gọi mô hình sửa tiếp, không nhận thang không bước ra được.
    expect(second.ok!.score.percent ?? 100).toBeLessThan(input.quality.acceptPercent ?? 0);
    // Ô thang tầng 1 không còn bị bác vì thiếu chiều dài do chính bộ xếp chừa thiếu tường bao.
    const ground = second.ok!.levels.find((l) => l.level.level === 1)!;
    expect(ground.level.stairs?.length ?? 0).toBeGreaterThan(0);
  });

  it('đổi phòng mang cửa chính vẫn hỏng thì GHI CHÚ cho kỹ sư lỗi của cách thử ấy; câu gửi mô hình không đổi', () => {
    // Ô thang tầng 1 cắt còn 3 hàng: lối vào qua gara (cách T51 thử) vướng đúng lỗi ô thang ngắn — tình huống của
    // lượt thật trước khi sửa chừa tường (mục 1), khi báo cáo chỉ nói «phòng khách không có cửa ra mặt tiền».
    const r1 = round(1);
    const sketches = r1.sketches!.map((k) =>
      k.level === 1
        ? { ...k, rows: k.rows.map((row, i) => (i === 15 ? row.replace(/st1/g, 'dn1') : row)) }
        : k,
    );
    const short = evaluate({ ...r1, sketches });
    const notes = short.rejections.flatMap((r) => r.notes ?? []).join('\n');
    expect(notes).toMatch(
      /Chương trình đã thử đặt cửa chính vào "[a-z_0-9]+" thay cho "[a-z_0-9]+" — vẫn vướng:/,
    );
    expect(short.hints.join('\n')).not.toMatch(/thử đặt cửa chính/);
  });

  it('vòng 3 trả lại đúng câu trả lời của vòng 2 — cùng khoá, nên vòng lặp dừng thay vì gọi tiếp', () => {
    expect(houseAnswerKey(round(3))).toBe(houseAnswerKey(round(2)));
    expect(houseAnswerKey(round(4))).not.toBe(houseAnswerKey(round(2)));
    // Lời văn tự do không làm khác khoá: hai câu cùng hình khác chữ ra cùng kết quả xếp.
    expect(houseAnswerKey({ ...round(2), rationale: 'khác' })).toBe(houseAnswerKey(round(2)));
    // Khác đúng MỘT ô bản phác là một câu trả lời khác — khoá phải khác, không thì dừng oan.
    const r2 = round(2);
    const swapped = {
      ...r2,
      sketches: r2.sketches!.map((k) =>
        k.level === 1
          ? {
              ...k,
              rows: k.rows.map((row, i) => (i === 16 ? row.split(' ').reverse().join(' ') : row)),
            }
          : k,
      ),
    };
    expect(houseAnswerKey(swapped)).not.toBe(houseAnswerKey(r2));
  });
});
