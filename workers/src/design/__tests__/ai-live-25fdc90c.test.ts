/**
 * Phát lại lượt chạy thật 25fdc90c (30/09/2026, gpt-5.6-terra, lời dẫn 9.0.0) — mặt bằng 80,7 điểm Haan chấm (T105).
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * - Tầng 2: lên tới bậc 21 là hành lang trước; hành lang sau (giặt phơi, phòng ngủ 17,4 m²) chỉ «tới được» qua
 *   ô thang — thực tế là chiếu nghỉ lưng chừng. Nay ô thang là điểm cuối của lối đi, một lối vào mỗi tầng
 *   (`arrange/doors.ts`, `tree/openings.ts`), nên vòng 4 bị bác ở tầng 2 và mô hình phải vẽ lối đi vòng qua thang.
 * - Tầng 1: bậc 1 giáp tường kho, lối vào ở cạnh dài — nay là lỗi `stair_entry_long_side`.
 * - Phát lại phải chuẩn hoá mã phòng như đường thật (`tidyHouse` trong `loadRun`: «GAR» → «gar») — thiếu thì cả bốn vòng hỏng
 *   dù lượt thật lưu được mặt bằng ở vòng 4.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
const run = loadRun('25fdc90c');

function replay(rounds: number) {
  const input = { ...realContextInput(run.digest), mandatory };
  const context = planContext(input);
  const out = [];
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  for (let i = 1; i <= rounds; i += 1) {
    const answer = run.intents[`round${i}`] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    const result = evaluateHouseBest(input, context, intent, generator, prompts);
    out.push(result);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
  }
  return out;
}

describe('phát lại 25fdc90c — ô thang không làm lối đi (T105)', () => {
  const rounds = replay(4);

  it('mã phòng được chuẩn hoá như đường thật: mô hình trả «GAR», «LIV»… — phát lại thấy chữ thường', () => {
    const ids = (run.intents.round1 as HouseIntent).rooms.map((room) => room.id);
    expect(ids).toContain('gar');
    expect(ids.every((id) => /^[a-z0-9_]+$/.test(id))).toBe(true);
  });

  it('vòng 4: không còn mặt bằng đi xuyên ô thang — vòng này bị bác', () => {
    const round4 = rounds[3]!;
    expect(round4.ok).toBeNull();
    // Sau T106 (WC chung, cửa phòng thờ, ban công góc) bộ xếp chọn cây khác — tầng 2 nay xếp được có hành lang thật,
    // và vòng hỏng ở kiểm cả nhà vì ban công góc không còn tính là ban công mặt trước.
    expect(round4.rejections.map((rejection) => rejection.level)).toEqual([0]);
  });
});

// Khung xương cho ô thang ĐỨNG GIỮA nhà (T105): trước chỉ dựng lõi áp một tường. Lượt 5584bf0d vòng 2 có thang
// giữa nhà; khi ô thang thôi làm lối đi, chỉ khung xương mới dựng được tầng 2 có hành lang vòng qua thang.
describe('phát lại 5584bf0d — khung xương thang giữa nhà (T105), ban công góc (T106)', () => {
  const run2 = loadRun('5584bf0d');
  const input = { ...realContextInput(run2.digest), mandatory };
  const context = planContext(input);
  const round1 = evaluateHouseBest(
    input,
    context,
    run2.intents.round1 as HouseIntent,
    generator,
    prompts,
  );
  const round2 = evaluateHouseBest(
    input,
    context,
    mergeRevision(
      round1.renamed ?? (run2.intents.round1 as HouseIntent),
      run2.intents.round2 as HouseIntent,
      round1.settled ?? [],
    ),
    generator,
    prompts,
  );

  // T106: mọi tầng xếp được (tầng 2 bằng khung xương), nhưng hai ban công đầu bài đòi (trước, sau) đều là khối ở góc
  // nhà — không còn tính cho mặt trước / mặt sau, nên kiểm cả nhà bác.
  it('vòng 2: mọi tầng xếp được, cả nhà bị bác vì ban công trước / sau đều là khối ở góc', () => {
    expect(round2.ok).toBeNull();
    expect(round2.rejections.map((rejection) => rejection.level)).toEqual([0]);
    expect(round2.rejections[0]!.messages.join(' ')).toMatch(/ban công ở mặt trước/);
  });
});

// Lượt thật 1330ce12 (30/09/2026, lời dẫn 9.1.0): tầng 1 giữ từ vòng 2, tầng 2 hỏng mọi vòng — vòng 4–5 bản phác vẽ ô
// thang ở hàng 8–11 trong khi thang tầng 1 dựng ở hàng 6–11, và câu nhắc chưa từng nói vị trí ấy (chỉ nói khi mô
// hình vẽ đè lên nó). Nay vị trí ô thang đứng đầu câu nhắc của tầng hỏng (T105).
describe('phát lại 1330ce12 — câu nhắc nói ngay vị trí ô thang tầng trên', () => {
  const run3 = loadRun('1330ce12');
  const input = { ...realContextInput(run3.digest), mandatory };
  const context = planContext(input);
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  const rounds = [1, 2, 3, 4].map((i) => {
    const answer = run3.intents[`round${i}`] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    const result = evaluateHouseBest(input, context, intent, generator, prompts);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
    return result;
  });

  it('vòng 4: tầng 2 hỏng vì thiếu diện tích, nhưng dòng đầu câu nhắc là vị trí ô thang tầng dưới đã dựng', () => {
    const round4 = rounds[3]!;
    expect(round4.ok).toBeNull();
    expect(round4.hints[0]).toMatch(
      /^- Storey 2: "stair_2" is fixed on sketch rows 6–11, columns 5–6 \(counting from 1\)/,
    );
  });
});

// Lượt thật 2c522a90 (30/09/2026, đầu bài bản 22 — thang U chiếu nghỉ rộng): mô hình vẽ cột trái tầng 2 rộng 2 ô trong khi
// ô thang cần 3 ô ngang. Nay dữ liệu gửi mô hình ở lời gọi ĐẦU mang số ô ô thang phải chiếm (T106).
describe('phát lại 2c522a90 — số ô ô thang gửi mô hình ngay lời gọi đầu', () => {
  it('thang U chiếu nghỉ rộng: `stair_min_m.cells` = 3 × 5 ô, kèm tên loại', () => {
    const run4 = loadRun('2c522a90');
    const input = { ...realContextInput(run4.digest, { stairShape: true }), mandatory };
    const stair = planContext(input).modelKnowledge.stair_min_m!;
    expect(stair.shape).toBe('Thang chữ U chiếu nghỉ rộng');
    expect(stair.cells).toEqual([3, 5]);
  });
});
