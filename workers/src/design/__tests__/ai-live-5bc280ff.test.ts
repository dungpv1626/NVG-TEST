/**
 * Phát lại hai lượt chạy thật 28/09/2026 (GPT-6 Sol, lời dẫn 8.38.0, cùng đầu bài demo 4b29326e) — T99.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * - 5bc280ff (0,524 USD): vòng 3 lưu được mặt bằng 85,2 điểm, nhóm E dưới sàn. Canh cả đường ghép lượt
 *   sửa giữ tầng đã qua (T86 / T97): chính đột biến M83 sót trong mã hôm ấy làm vòng 2 hỏng ở tầng 1.
 * - 6bbc6d0e (0,531 USD): thất bại — tầng 1 qua từ vòng 2, tầng 2 hỏng vì giao thông cả sáu vòng.
 * - Câu dặn T99 có tác dụng trên BẢN PHÁC: mọi WC chung tầng 2 mô hình vẽ nằm trọn trên ô WC tầng 1.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

/** Ghép các vòng như đường chạy thật: câu trả lời sửa ghép lên gốc vòng trước, giữ tầng đã qua. */
function replay(id: string, rounds: number) {
  const run = loadRun(id);
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

/** Loại phòng tầng 1 nằm dưới các ô của một phòng tầng 2 trên bản phác. */
function belowCells(intent: HouseIntent, ground: HouseIntent, id: string): string[] {
  const grid = (it: HouseIntent, level: number) =>
    (it.sketches ?? []).find((s) => s.level === level)!.rows.map((row) => row.trim().split(/\s+/));
  const upper = grid(intent, 2);
  const lower = grid(ground, 1);
  const types = new Map(ground.rooms.map((room) => [room.id, room.type]));
  const out: string[] = [];
  upper.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell === id) out.push(types.get(lower[r]?.[c] ?? '') ?? '?');
    }),
  );
  return out;
}

describe('phát lại 5bc280ff — mặt bằng 85,2 điểm ở vòng 3', () => {
  const rounds = replay('5bc280ff', 3);

  it('vòng 1–2 hỏng, vòng 3 xếp được với 85,2 điểm', () => {
    expect(rounds[0]!.ok).toBeNull();
    expect(rounds[1]!.ok).toBeNull();
    expect(rounds[2]!.ok?.score.percent).toBe(85.2);
  });

  it('phòng giặt tầng 2 nằm trên gara, không đè phòng ở (T99)', () => {
    const plan = rounds[2]!.ok!;
    const upper = plan.levels.find((item) => item.level.level === 2)!.level.rooms;
    const ground = plan.levels.find((item) => item.level.level === 1)!.level.rooms;
    const laundry = upper.find((room) => room.type === 'laundry')!;
    const [x0, y0, x1, y1] = laundry.rect as [number, number, number, number];
    const under = ground.filter((room) => {
      const [a0, b0, a1, b1] = room.rect as [number, number, number, number];
      return Math.min(x1, a1) - Math.max(x0, a0) > 50 && Math.min(y1, b1) - Math.max(y0, b0) > 50;
    });
    expect(under.map((room) => room.type)).toEqual(['garage']);
  });
});

describe('phát lại 6bbc6d0e — tầng 2 hỏng vì giao thông cả sáu vòng', () => {
  const rounds = replay('6bbc6d0e', 6);

  it('không vòng nào ra mặt bằng; từ vòng 2 chỉ còn tầng 2 hỏng', () => {
    expect(rounds.every((round) => round.ok === null)).toBe(true);
    for (const round of rounds.slice(1)) {
      expect(round.rejections.map((rejection) => rejection.level)).toEqual([2]);
    }
  });

  it('câu dặn T99 có tác dụng trên bản phác: mọi WC CHUNG tầng 2 nằm trọn trên ô WC tầng 1', () => {
    // WC khép kín đi theo phòng mẹ nên không tính (mw2 của lượt này nằm trên gara — vẫn không đè phòng ở).
    const run = loadRun('6bbc6d0e');
    const first = run.intents.round1 as HouseIntent;
    const shared = first.rooms.filter(
      (room) => room.level === 2 && room.type === 'wc' && !room.ensuite_of,
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const wc of shared) {
      expect(new Set(belowCells(first, first, wc.id))).toEqual(new Set(['wc']));
    }
  });
});
