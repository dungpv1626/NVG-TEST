/**
 * Phát lại có bước đổi chỗ khu ướt một bước của khung hai hàng (T182): vòng 2 của lượt thật 1dd74b99 (hồ sơ
 * NVO-TK-2026-9272). Bước chỉnh T180 chỉ thử phép đơn (dời một phòng, đổi chỗ hai phòng giữ vị trí); hết phép đơn có lợi
 * thì T182 thử đổi một khu ướt với một phòng hàng khác, mỗi phòng vào mọi chỗ của hàng mới. Ở vòng này nó đổi tầng 2
 * sang cách xếp điểm cao hơn (65,0 → 69,9 %: nhóm A, C, E cùng lên, D giữ).
 *
 * Ngữ cảnh Workflow. KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, mergeRevision, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('1dd74b99');
const mandatory = parseMandatoryRules(read('rules/nvg-mandatory.yaml'));
const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);

async function roundTwo(swap: boolean) {
  const base = realContextInput(run.digest, {
    stairShape: true,
    openSetback: true,
    houseProfile: true,
  });
  const sketch = base.construction.sketch!;
  const rows = sketch.skeleton_rows!;
  const input = {
    ...base,
    mandatory,
    construction: {
      ...base.construction,
      sketch: {
        ...sketch,
        skeleton_rows: { ...rows, prefer: { ...rows.prefer!, wet_swap_insert: swap } },
      },
    },
  };
  const context = planContext(input);
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  let result = null as ReturnType<typeof evaluateHouseBest> | null;
  for (const key of ['round1', 'round2']) {
    const answer = run.intents[key] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    await new Promise((resolve) => setTimeout(resolve, 0));
    result = evaluateHouseBest(input, context, intent, generator, prompts);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
  }
  return result!;
}

describe('phát lại 1dd74b99 vòng 2 — đổi chỗ khu ướt một bước (T182)', () => {
  it('kb/construction_norms.yaml bật bước đổi chỗ', () => {
    expect(
      realContextInput(run.digest).construction.sketch?.skeleton_rows?.prefer?.wet_swap_insert,
    ).toBe(true);
  });

  it('có bước đổi chỗ: điểm cả nhà cao hơn hẳn', { timeout: 300_000 }, async () => {
    const off = await roundTwo(false);
    const on = await roundTwo(true);
    expect(off.ok).toBeTruthy();
    expect(on.ok).toBeTruthy();
    expect(on.ok!.score.percent!).toBeGreaterThan(off.ok!.score.percent! + 2);
  });
});
