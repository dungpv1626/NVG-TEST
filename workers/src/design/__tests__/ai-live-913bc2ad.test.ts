/**
 * Phát lại lượt chạy thật 913bc2ad (25/09/2026, GPT-6 Sol, lời dẫn 8.30.0 — sau T77). Bốn lời gọi
 * (0,256 USD) rồi DỪNG, không ra phương án.
 *
 * Mô hình vẽ HAI tầng khớp nhau: ô thang hàng 12–15 cột 7–8, ô thang máy hàng 12–15 cột 9 (1 × 4 ô cho
 * giếng 1,3 × 1,4 m). Bản phác tầng 1 hỏng vì `bedroom_2` căn vách ra 12,42 m² (< 15 m² đầu bài — giếng
 * 1 m phải nới ra 1,3 m, lấy của phòng bên). Bộ xếp «cứu» tầng 1 bằng cách chia lại: ô thang dời sang mép
 * trái, giếng thang máy thành dải 1,6 × 6,45 m dọc mép sau. Ép hai ô ấy sang tầng 2 xoá sạch dải `wc_4`,
 * mô hình nhận câu «bản phác không vẽ wc_4» mà nó đã vẽ, và nộp lại gần y nguyên ba lượt.
 *
 * T78: (1) lỗi của bản phác tầng dưới đi cùng câu nhắc khi tầng trên hỏng, và lỗi ép mốc chỉ do việc chia
 * lại tầng dưới thì không gửi mô hình; (2) giếng thang máy dài / to vô lý bị bác (`elevator_oversized`);
 * (3) `knowledge.min_cells` có dòng cho giếng, kèm số ô mỗi cạnh. KHÔNG gọi mô hình.
 *
 * T86 (26/09/2026, Haan chọn phương án 1): tầng 1 qua nhờ chia lại thì GIỮ, và bản phác tầng 1 gửi lượt
 * sửa được thay bằng chính cách chia thật. Câu nhắc thôi đòi sửa bản phác tầng 1 (mô hình dc949b49 sửa nó
 * và làm hỏng hẳn tầng 1), còn lỗi ép ô lõi của tầng 2 nay GỬI được — mô hình thấy đúng ô lõi ấy.
 */

import { describe, expect, it } from 'vitest';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('913bc2ad');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function evaluate(round: string) {
  const input = { ...realContextInput(run.digest), mandatory };
  return evaluateHouse(input, planContext(input), run.intents[round]!, generator, prompts);
}

/** Hàng/cột (đếm từ 1) các ô của `id` trên bản phác tầng 1 gửi lượt sửa. */
function cellsOf(rows: readonly string[], id: string) {
  const at = rows.flatMap((row, r) =>
    row.split(' ').flatMap((cell, c) => (cell === id ? [[r + 1, c + 1] as const] : [])),
  );
  return {
    rows: [Math.min(...at.map(([r]) => r)), Math.max(...at.map(([r]) => r))],
    cols: [Math.min(...at.map(([, c]) => c)), Math.max(...at.map(([, c]) => c))],
  };
}
const groundRows = (evaluation: ReturnType<typeof evaluate>) =>
  evaluation.renamed!.sketches!.find((sketch) => sketch.level === 1)!.rows;

describe('phát lại lượt chạy thật 913bc2ad — tầng 1 «được cứu» bằng chia lại, tầng 2 hỏng vì mốc của bản chia lại', () => {
  it('vòng 1: tầng 2 hỏng vì lối vào; tầng 1 được giữ, không còn bị đòi sửa bản phác (T86)', () => {
    const evaluation = evaluate('round1');
    expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([2]);
    expect(evaluation.settled).toEqual([1]);
    const hint = evaluation.hints.join('\n');
    expect(hint).toMatch(/Storey 2: In the sketch, "master_bedroom_1" have no way in/);
    expect(hint).toMatch(/Storey 1 passed every check and is kept/);
    expect(hint).not.toMatch(/Your sketch of storey 1 failed the checks below/);
    expect(hint).not.toMatch(/Storey 1: Room "bedroom_2"/);
    // Lỗi của bản phác tầng 1 vẫn hiện cho kỹ sư, ở ghi chú của tầng hỏng.
    expect(evaluation.rejections[0]!.notes!.join(' ')).toContain(
      '"bedroom_2" ở tầng 1 chỉ chia được ô',
    );
    expect(retryPlan({ intent: run.intents.round1!, issues: [] }, evaluation).kind).toBe('revise');
  });

  it('vòng 2: câu nhắc ép ô thang máy nói đúng hàng, cột của bản phác tầng 1 gửi kèm', () => {
    const evaluation = evaluate('round2');
    expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([2]);
    const messages = evaluation.rejections[0]!.messages.join(' ');
    expect(messages).toContain(
      'ô thang máy "elevator_2" phải nằm đúng hàng 15–16, cột 7–12 như tầng dưới đã dựng — "wc_4" vẽ đè lên đó',
    );
    expect(messages).not.toContain('không vẽ "wc_4"');
    const hints = evaluation.hints.join('\n');
    expect(hints).toMatch(/"elevator_2" must sit on exactly sketch rows 15–16, columns 7–12/);
    expect(hints).toMatch(/Storey 2: Room "wc_4" could only be entered from the stair/);
    expect(hints).not.toMatch(/Your sketch of storey 1 failed/);
    // Bản phác tầng 1 gửi lượt sửa là cách chia thật: giếng thang máy nằm ĐÚNG ô câu nhắc nói.
    expect(cellsOf(groundRows(evaluation), 'elevator_1')).toEqual({
      rows: [15, 16],
      cols: [7, 12],
    });
    expect(retryPlan({ intent: run.intents.round2!, issues: [] }, evaluation).kind).toBe('revise');
  });

  it('bản phác tầng 1 thay bằng cách chia thật đem xếp lại vẫn qua, không phải chia lại lần nữa', () => {
    const evaluation = evaluate('round1');
    const input = { ...realContextInput(run.digest), mandatory };
    const again = evaluateHouse(input, planContext(input), evaluation.renamed!, generator, prompts);
    expect(again.rejections.map((rejection) => rejection.level)).toEqual([2]);
    expect(again.settled).toEqual([1]);
    expect(again.hints.join('\n')).not.toMatch(/Your sketch of storey 1 failed/);
  });

  it('vòng 3 và 4 nộp lại gần y nguyên: vẫn giữ tầng 1, vẫn gửi lại (chưa cạn lượt)', () => {
    for (const round of ['round3', 'round4']) {
      const evaluation = evaluate(round);
      expect(evaluation.rejections.map((rejection) => rejection.level)).toEqual([2]);
      expect(evaluation.settled).toEqual([1]);
      expect(evaluation.hints.join('\n')).not.toMatch(/Storey 1: Room "bedroom_2"/);
    }
  });
});
