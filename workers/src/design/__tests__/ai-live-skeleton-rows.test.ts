/**
 * Phát lại có khung hai hàng (T179): vòng 2 của lượt thật 1dd74b99 (hồ sơ NVO-TK-2026-9272, biệt thự 12 × 16 m khối
 * xây, 2 tầng). Tầng 2 của bản phác có phòng ngủ chỉ 14,13 m² (đầu bài 17 m²); khung xương một hàng T102 không chia
 * được dải sau. Không có khung hai hàng: tầng 2 hỏng, lượt thật phải gọi lại mô hình (lượt 2–4 hỏng cùng lỗi, T174).
 * Có: chương trình dựng lại tầng 2 quanh ô thang đúng mốc — hành lang áp đầu bước ra, phòng theo vị trí bản phác — tầng
 * qua cổng, ghi chú `skeleton_arranged` nói rõ khung hai hàng.
 *
 * Phát lại theo đúng chuỗi vòng sửa (`mergeRevision`), ngữ cảnh Workflow. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('1dd74b99');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

async function roundTwo(rows: boolean) {
  const base = realContextInput(run.digest, {
    stairShape: true,
    openSetback: true,
    houseProfile: true,
  });
  const { skeleton_rows: _rows, ...withoutRows } = base.construction.sketch!;
  const input = {
    ...base,
    mandatory,
    construction: {
      ...base.construction,
      sketch: rows ? base.construction.sketch! : withoutRows,
    },
  };
  const context = planContext(input);
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  let result = null as ReturnType<typeof evaluateHouseBest> | null;
  for (const key of ['round1', 'round2']) {
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

describe('phát lại 1dd74b99 vòng 2 — khung hai hàng (T179)', () => {
  it('kb/construction_norms.yaml bật khung hai hàng', () => {
    expect(
      realContextInput(run.digest).construction.sketch?.skeleton_rows?.max_candidates,
    ).toBeGreaterThan(0);
  });

  it('không có khung hai hàng: tầng 2 hỏng', { timeout: 300_000 }, async () => {
    const result = await roundTwo(false);
    expect(result.ok).toBeFalsy();
    expect(result.rejections.some((r) => r.level === 2)).toBe(true);
  });

  it(
    'có khung hai hàng: cả nhà qua, tầng 2 dựng lại theo khung hai hàng, đủ phòng đầu bài',
    { timeout: 300_000 },
    async () => {
      const result = await roundTwo(true);
      expect(result.ok).toBeTruthy();
      const level2 = result.ok!.levels.find((lv) => lv.level.level === 2)!;
      const note = level2.notes.find((n) => n.code === 'skeleton_arranged');
      expect(note?.message).toMatch(/^Tầng 2: chương trình dựng lại theo khung hai hàng \(/);
      const ids = new Set(level2.level.rooms.map((room) => room.id));
      for (const id of [
        'master_bedroom_1',
        'bedroom_3',
        'bedroom_4',
        'bedroom_5',
        'study_1',
        'altar_room_1',
      ]) {
        expect(ids.has(id)).toBe(true);
      }
    },
  );
});
