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

describe('phát lại 5bc280ff — vòng 3 (85,4 điểm trước T106)', () => {
  const rounds = replay('5bc280ff', 3);

  // T106 (Haan chấm lượt f351115d: «ban công mặt trước phải nằm phần lớn ở mặt trước»): ban công sau 2,2 × 2,4 m ở góc
  // sau – trái trước đây được tính cho cả mặt trái lẫn mặt sau — nay không cho mặt nào. Mặt bằng 85,4 điểm cũ bị bác ở
  // kiểm cả nhà; lượt thật sẽ gửi mô hình câu nhắc ban công.
  it('vòng 1–2 hỏng; vòng 3 mọi tầng xếp được nhưng cả nhà bị bác vì ban công góc', () => {
    expect(rounds[0]!.ok).toBeNull();
    expect(rounds[1]!.ok).toBeNull();
    expect(rounds[2]!.ok).toBeNull();
    expect(rounds[2]!.rejections.map((rejection) => rejection.level)).toEqual([0]);
    expect(rounds[2]!.rejections[0]!.messages.join(' ')).toMatch(/ban công ở mặt (bên trái|sau)/);
  });
});

describe('phát lại 6bbc6d0e — tầng 2 hỏng vì giao thông mọi vòng (T105: vòng 4 không còn đi xuyên ô thang)', () => {
  const rounds = replay('6bbc6d0e', 6);

  it('vòng 1–3 và 5–6 không ra mặt bằng, chỉ tầng 2 hỏng từ vòng 2 (tầng 1 qua nhờ khung xương)', () => {
    for (const [i, round] of rounds.entries()) {
      if (i === 3) continue;
      expect(round.ok, `vòng ${i + 1}`).toBeNull();
      if (i >= 1) expect(round.rejections.map((rejection) => rejection.level)).toEqual([2]);
    }
  });

  // T105: mặt bằng khung xương của vòng 4 (63,6 điểm) có phòng chỉ tới được qua ô thang — nay bị bác ở tầng 2.
  it('vòng 4: tầng 2 bị bác — không còn phòng nào chỉ tới được bằng cách đi xuyên ô thang', () => {
    expect(rounds[3]!.ok).toBeNull();
    expect(rounds[3]!.rejections.map((rejection) => rejection.level)).toEqual([2]);
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
