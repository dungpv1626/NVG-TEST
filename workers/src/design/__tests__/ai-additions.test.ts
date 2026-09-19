/**
 * Không gian AI đề xuất thêm chỉ lấy tới đâu còn sàn tới đó (Haan, 13/09/2026).
 */

import { describe, expect, it } from 'vitest';
import type { ProgramResult } from '../program/engine';
import { fitAiAdditions } from '../program/ai-additions';
import { testNorms } from './program-fixtures';

const norms = testNorms();

/** Chương trình giả: sàn 100 m²/tầng × 2 tầng, các phòng hiện có chiếm `usedMin` m² tối thiểu. */
function baseline(usedMin: number): () => ProgramResult {
  return () =>
    ({
      payload: { spaces: [{ min_area_m2: usedMin }] },
      plateExplanation: { buildableM2: 100, floors: 2 },
    }) as unknown as ProgramResult;
}

describe('fitAiAdditions', () => {
  it('giữ theo thứ tự mô hình nêu tới khi hết phần sàn còn lại, bỏ phần vượt và nói ra', () => {
    const terrace = norms.spaces.terrace!.min_m2;
    const courtyard = norms.spaces.courtyard!.min_m2;
    const spare = terrace + 0.5; // vừa đủ cho sân thượng, không đủ thêm sân trong
    const out = fitAiAdditions(['terrace', 'courtyard'], baseline(200 - spare), norms, (c) => c);
    expect(out.kept).toEqual(['terrace']);
    expect(out.dropped).toEqual(['courtyard']);
    expect(out.notes[0]).toContain('vượt sàn cho phép');
    expect(courtyard).toBeGreaterThan(0.5);
  });

  it('sàn đã kín thì không giữ đề xuất nào', () => {
    const out = fitAiAdditions(['terrace'], baseline(200), norms, (c) => c);
    expect(out.kept).toEqual([]);
  });

  it('không đề xuất gì thì không dựng chương trình mẫu', () => {
    let called = false;
    fitAiAdditions(
      [],
      () => {
        called = true;
        return baseline(0)();
      },
      norms,
      (c) => c,
    );
    expect(called).toBe(false);
  });
});
