/**
 * Phát lại lượt chạy thật bc504189 (26/09/2026, GPT-5.6 Luna, lời dẫn 8.33.0). Sáu lời gọi, 0,041 USD,
 * không ra phương án — nhưng vòng 3 chỉ còn MỘT lỗi: `bedroom_1` (phòng ông bà, sàn đầu bài 20 m²) vẽ 16
 * ô, cần ≥ 22. Phòng kề là `living_1` (sàn đầu bài 45 m², đang 50 ô), `bedroom_2` (sàn 15 m²), `dining_1`,
 * ô thang — không phòng nào nhường đủ. Câu nhắc cũ bảo «lấy ô của phòng kề còn dư»; mô hình ba lần đẩy lấn
 * và làm ô thang ngắn còn 3,89 m, hết lượt. T88 (dời đoạn đường cắt) đã thử và gỡ: không có ô dư để dời.
 *
 * T89: câu nhắc nói rõ không phòng kề nào nhường đủ, kể các phòng còn dư trong tầng, bảo xếp lại dải
 * phòng và giữ ô thang. KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouse, mergeRevision, planContext, programGenerator, retryPlan } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('bc504189');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const input = { ...realContextInput(run.digest), mandatory };
const context = planContext(input);
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

function round3() {
  let previous: HouseIntent | null = null;
  let evaluation = null as ReturnType<typeof evaluateHouse> | null;
  for (const round of [1, 2, 3]) {
    const answer = run.intents[`round${round}`] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer) : answer;
    evaluation = evaluateHouse(input, context, intent, generator, prompts);
    previous = retryPlan({ intent, issues: [] }, evaluation).previous ?? intent;
  }
  return evaluation!;
}

describe('phát lại lượt chạy thật bc504189 — phòng ông bà hụt sàn, không phòng kề nào nhường đủ', () => {
  const evaluation = round3();
  const hints = evaluation.hints.join('\n');

  it('vòng 3: tầng 1 còn MỘT lỗi — `bedroom_1` 14,91 / 20 m²; nhưng tầng 2 còn ba phòng không lối vào (T92)', () => {
    // Trước T92 vòng này trông như «chỉ còn một lỗi»: tầng 1 hỏng nên bản phác tầng 2 không được soát.
    expect(evaluation.rejections.map((r) => [r.level, r.codes])).toEqual([
      [1, ['arrange_room_below_brief_area']],
      [2, ['sketch_room_no_access']],
    ]);
    expect(evaluation.rejections[1]!.messages.join(' ')).toMatch(
      /"master_bedroom_1", "bedroom_3", "bedroom_4"/,
    );
  });

  it('câu nhắc: không phòng kề nào nhường đủ — xếp lại dải phòng, lấy từ phòng còn dư, giữ ô thang', () => {
    expect(hints).toMatch(/"bedroom_1" came out at 14\.91 m² from 16 sketch cells/);
    expect(hints).toMatch(/it needs at least 22 cells/);
    expect(hints).toMatch(
      /no single neighbour \("bedroom_2", "dining_1", "living_1", "stair_1"\) can give that many/,
    );
    // T91: phòng không có sàn đầu bài lùi được tới mức tối thiểu nghề — gara dư nhiều nhất.
    expect(hints).toMatch(/rooms with spare area: "garage_1" \(about \d+ m² spare\), "porch_1"/);
    expect(hints).toMatch(/Keep the stair and lift cells where they are/);
    // Câu cũ chỉ đường cụt: «lấy của phòng kề còn dư».
    expect(hints).not.toMatch(/take them from a neighbour that has spare area/);
  });
});
