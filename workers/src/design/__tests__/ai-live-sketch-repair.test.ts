/**
 * Phát lại có dời vách bản phác (T177): vòng 5 của lượt thật 7c6de305 — tầng 2 vẽ phòng làm việc chỉ khoảng 8,35 m²
 * (đầu bài 13 m²) và chỉ vào được qua ô thang. Không dời vách: tầng 2 hỏng, lượt thật phải gọi lại mô hình. Dời vách:
 * phòng ngủ chính (còn trên 25 m² đầu bài) và ban công nhường ô, tầng 2 qua cổng, cả nhà qua ngưỡng nhận, và mặt bằng
 * mang ghi chú `sketch_walls_moved` cho kiến trúc sư thấy chương trình đã dời gì.
 *
 * Phát lại theo đúng chuỗi vòng sửa (vòng sau là bản sửa ghép lên vòng trước, `mergeRevision`), ngữ cảnh Workflow.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('7c6de305');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

async function roundFive(repair: boolean) {
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
      // Khung hai hàng (T179) tắt ở cả hai nhánh: nó làm vòng 2 qua cổng, nên chuỗi vòng sửa phát lại rẽ khỏi chuỗi thật
      // từ vòng 3 (vòng sau ghép lên vòng trước) — phép thử này đo riêng phép dời vách trên đúng chuỗi đã ghi.
      sketch: repair
        ? { ...sketch, skeleton_rows: undefined }
        : { ...sketch, repair_walls: undefined, skeleton_rows: undefined },
    },
  };
  const context = planContext(input);
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  let result = null as ReturnType<typeof evaluateHouseBest> | null;
  for (const key of ['round1', 'round2', 'round3', 'round4', 'round5']) {
    const answer = run.intents[key] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    // Nhường lượt giữa các vòng: một vòng chạy đồng bộ vài giây, vitest cần nhận tin của tiến trình con.
    await new Promise((resolve) => setTimeout(resolve, 0));
    result = evaluateHouseBest(input, context, intent, generator, prompts);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
  }
  return result!;
}

describe('phát lại 7c6de305 vòng 5 — dời vách bản phác (T177)', () => {
  it('kb/construction_norms.yaml bật dời vách', () => {
    expect(
      realContextInput(run.digest).construction.sketch?.repair_walls?.max_moves,
    ).toBeGreaterThan(0);
  });

  it('không dời vách: tầng 2 hỏng vì phòng làm việc hụt sàn', { timeout: 300_000 }, async () => {
    const result = await roundFive(false);
    expect(result.ok).toBeFalsy();
    expect(result.rejections.some((r) => r.level === 2)).toBe(true);
  });

  it(
    'dời vách: cả nhà qua, ghi chú nói rõ phòng nào nhường bao nhiêu ô',
    { timeout: 300_000 },
    async () => {
      const result = await roundFive(true);
      expect(result.ok).toBeTruthy();
      const notes = result.ok!.levels.flatMap((level) => level.notes);
      const moved = notes.find((note) => note.code === 'sketch_walls_moved');
      expect(moved?.message).toMatch(
        /"study_1" thêm \d+ ô \(còn khoảng [\d,]+ m² ≥ 13 m² đầu bài\)/,
      );
      // Phòng nhường ô vẫn trên sàn đầu bài của nó.
      expect(moved?.message).toMatch(
        /"master_bedroom_1" bớt \d+ ô \(còn khoảng [\d,]+ m² ≥ 25 m² đầu bài\)/,
      );
    },
  );
});
