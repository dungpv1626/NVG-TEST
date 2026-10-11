/**
 * Phát lại lượt chạy thật fdd486b1 (01/10/2026, gpt-5.6-terra, lời dẫn 9.3.0, 5 lời gọi, thất bại) — T111.
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 *
 * Lượt thật: từ vòng 2 bản phác tầng 1 vẽ phòng ăn hình chữ L; chương trình cắt phần lồi, phòng ăn mất lối vào, tầng 1
 * phải chia lại và cách chia lại hỏng (gara chỉ vào được từ ô thang). Câu nhắc chỉ nói lỗi của cách chia lại, nên
 * mô hình nộp y nguyên tầng 1 bốn vòng liền. Nay câu nhắc nêu cả phòng không chữ nhật trên bản phác của chính nó.
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

describe('phát lại fdd486b1 — phòng không chữ nhật tới được mô hình (T111)', () => {
  const run = loadRun('fdd486b1');
  const input = { ...realContextInput(run.digest, { stairShape: true }), mandatory };
  const context = planContext(input);
  const round1 = evaluateHouseBest(
    input,
    context,
    run.intents.round1 as HouseIntent,
    generator,
    prompts,
  );
  const previous = round1.renamed ?? (run.intents.round1 as HouseIntent);
  const keep = round1.settled ?? [];
  const raw = run.intents.round2 as HouseIntent;
  const round2 = evaluateHouseBest(
    input,
    context,
    mergeRevision(previous, fromRevisionIds(raw, revisionView(previous, [], keep).back), keep),
    generator,
    prompts,
  );

  it('vòng 2: tầng 1 hỏng — câu nhắc nêu phòng ăn chữ L trên bản phác, đứng trước lỗi của cách chia lại', () => {
    expect(round2.ok).toBeNull();
    const hints = round2.hints.join('\n');
    expect(hints).toMatch(
      /Storey 1: In the sketch, these rooms are not one rectangle of cells: dining_1\./,
    );
    // Lỗi của cách chia lại: từ T158 cổng bác cây có lối vào thang chỉ ở cạnh dài trước khi tới lỗi đi xuyên gara.
    const regrid = hints.indexOf('can only be entered from its long side');
    expect(regrid).toBeGreaterThan(-1);
    expect(hints.indexOf('dining_1. Redraw')).toBeLessThan(regrid);
  });
});
