/**
 * Phát lại có bước chỉnh khu ướt / mặt thoáng của khung hai hàng (T180): vòng 3 của lượt thật 1dd74b99 (hồ sơ
 * NVO-TK-2026-9272). Khung hai hàng T179 dựng được tầng 2 nhưng đặt WC / giặt theo chỗ trống — WC chung nằm trên
 * phòng ngủ tầng 1, nhóm E «Dựng được» 0–20 %, cả nhà dưới sàn nhóm. Có bước chỉnh: khu ướt tầng 2 dồn về trên khu
 * ướt tầng 1, không khu ướt nào đè chỗ khô (E5 đạt), nhóm E 20 → 60 %, điểm 65,9 → 69,3.
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

async function roundThree(prefer: boolean) {
  const base = realContextInput(run.digest, {
    stairShape: true,
    openSetback: true,
    houseProfile: true,
  });
  const sketch = base.construction.sketch!;
  // Dải ban công mặt tiền (T181) và mặt bên (30/10/2026) tắt ở cả hai nhánh: nó lên cổng trước bản chỉnh và ở vòng này đổi khu ướt lấy mặt
  // thoáng — phép thử này đo riêng bước chỉnh khu ướt T180.
  const { prefer: _prefer, ...rows } = {
    ...sketch.skeleton_rows!,
    main_balcony_strip: false,
    side_balcony_strip: false,
  };
  const input = {
    ...base,
    mandatory,
    construction: {
      ...base.construction,
      sketch: prefer
        ? {
            ...sketch,
            skeleton_rows: {
              ...sketch.skeleton_rows!,
              main_balcony_strip: false,
              side_balcony_strip: false,
            },
          }
        : { ...sketch, skeleton_rows: rows },
    },
  };
  const context = planContext(input);
  let previous: HouseIntent | null = null;
  let keep: number[] = [];
  let result = null as ReturnType<typeof evaluateHouseBest> | null;
  for (const key of ['round1', 'round2', 'round3']) {
    const answer = run.intents[key] as HouseIntent;
    const intent: HouseIntent = previous ? mergeRevision(previous, answer, keep) : answer;
    await new Promise((resolve) => setTimeout(resolve, 0));
    result = evaluateHouseBest(input, context, intent, generator, prompts);
    previous = result.renamed ?? intent;
    keep = result.ok ? [] : (result.settled ?? []);
  }
  const ratio = input.quality.criteria.find((c) => c.code === 'E5')!.params.overlap_ratio!;
  return { result: result!, groups: input.roomGroups, ratio };
}

type Rect4 = readonly number[];
const overlap = (a: Rect4, b: Rect4) =>
  Math.max(0, Math.min(a[2]!, b[2]!) - Math.max(a[0]!, b[0]!)) *
  Math.max(0, Math.min(a[3]!, b[3]!) - Math.max(a[1]!, b[1]!));

describe('phát lại 1dd74b99 vòng 3 — khung hai hàng chỉnh khu ướt (T180)', () => {
  it('kb/construction_norms.yaml bật bước chỉnh', () => {
    expect(
      realContextInput(run.digest).construction.sketch?.skeleton_rows?.prefer?.max_moves,
    ).toBeGreaterThan(0);
  });

  /** Khu ướt tầng 2 đè chỗ khô tầng 1 (cùng phép E5 đo: phần chồng từ `overlap_ratio` diện tích khu ướt trở lên). */
  const wetOverDry = (found: Awaited<ReturnType<typeof roundThree>>): string[] => {
    const { result, groups, ratio } = found;
    const wet = new Set(groups.wet ?? []);
    const dry = new Set(groups.dry_below ?? []);
    const level = (n: number) => result.ok!.levels.find((lv) => lv.level.level === n)!.level;
    const below = level(1).rooms.filter((room) => dry.has(room.type));
    return level(2)
      .rooms.filter((room) => wet.has(room.type))
      .filter((room) => {
        const own = (room.rect[2]! - room.rect[0]!) * (room.rect[3]! - room.rect[1]!);
        return below.reduce((sum, b) => sum + overlap(room.rect, b.rect), 0) / own >= ratio;
      })
      .map((room) => room.id);
  };

  it('không chỉnh: có khu ướt tầng 2 đè chỗ khô tầng 1', { timeout: 300_000 }, async () => {
    const found = await roundThree(false);
    expect(found.result.ok).toBeTruthy();
    expect(wetOverDry(found).length).toBeGreaterThan(0);
  });

  it(
    'có chỉnh: không khu ướt tầng 2 nào đè chỗ khô tầng 1, điểm không thấp hơn',
    { timeout: 300_000 },
    async () => {
      const off = await roundThree(false);
      const found = await roundThree(true);
      expect(found.result.ok).toBeTruthy();
      expect(wetOverDry(found)).toEqual([]);
      expect(found.result.ok!.score.percent!).toBeGreaterThanOrEqual(off.result.ok!.score.percent!);
    },
  );
});
