/**
 * Lượt sửa gửi kèm lưới tầng đã giữ ngay dưới, như chương trình dựng (lời dẫn 9.14.0, 30/10/2026). Vòng 1 của lượt thật
 * a66f4aa0 (hồ sơ NVO-TK-2026-9272): tầng 1 qua và được giữ, tầng 2 hỏng — trước đây lượt sửa không cho mô hình thấy
 * tầng 1 (`revisionView` bỏ tầng đã khoá). KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */
import { describe, expect, it } from 'vitest';
import type { HouseIntent } from '../ai/house';
import { parseMandatoryRules } from '../ai/mandatory';
import { evaluateHouseBest, planContext, programGenerator } from '../ai/plan';
import { FAKE_CALL, loadRun, prompts, read, realContextInput } from './ai-real-context';

const run = loadRun('a66f4aa0');

describe('lượt sửa thấy tầng dưới đã dựng', () => {
  it(
    'vòng 1 a66f4aa0: câu nhắc có lưới tầng 1 cùng cỡ bản phác, ô thang đúng chỗ tầng 1 đã dựng',
    { timeout: 300_000 },
    () => {
      const input = {
        ...realContextInput(run.digest, {
          stairShape: true,
          openSetback: true,
          houseProfile: true,
        }),
        mandatory: parseMandatoryRules(read('rules/nvg-mandatory.yaml')),
      };
      const generator = programGenerator(FAKE_CALL, 'ai_text_fake', prompts.version, false);
      const result = evaluateHouseBest(
        input,
        planContext(input),
        run.intents.round1 as HouseIntent,
        generator,
        prompts,
      );
      expect(result.ok).toBeNull();
      expect(result.settled).toEqual([1]);
      const hint = result.hints.find((line) => line.includes('as the program built it'));
      expect(hint).toBeDefined();
      const grid = hint!.split('\n').slice(1);
      const sketch2 = result.renamed!.sketches!.find((sketch) => sketch.level === 2)!;
      expect(grid).toHaveLength(sketch2.rows.length);
      const cols = sketch2.rows[0]!.trim().split(/\s+/).length;
      for (const row of grid) {
        expect(row.split(' ')).toHaveLength(cols);
        expect(row).toMatch(/^[SELKAWBCG.]( [SELKAWBCG.])*$/);
      }
      // Ô thang tầng 1 đã dựng nằm trên lưới, và có khu ướt để tầng 2 chồng lên.
      expect(grid.join(' ')).toMatch(/S/);
      expect(grid.join(' ')).toMatch(/W/);
    },
  );
});
