import { describe, expect, it } from 'vitest';
import { lightWellAdvice } from '../ai-plan-verdict';
import type { PlanDeduction } from '../plan-deductions';

const item = (code: string, refs: string[]): PlanDeduction => ({
  code,
  label: code,
  explain: null,
  lost: 1,
  refs,
});

describe('gợi ý giếng trời (lượt thật 9272, 29/10/2026)', () => {
  // D1 / D2 của phương án đã lưu: ba phòng không cửa sổ ra mặt thoáng, không có giếng trời.
  const items = [
    item('D1', ['bedroom_1', 'bedroom_4', 'study_1']),
    item('D2', ['bedroom_1', 'bedroom_4']),
    item('D5', ['balcony_2']),
  ];

  it('phòng tối, không giếng trời / sân trong → nêu từng phòng một lần', () => {
    expect(lightWellAdvice(items, ['bedroom', 'study', 'balcony'])).toEqual([
      'bedroom_1',
      'bedroom_4',
      'study_1',
    ]);
  });

  it('phương án đã có giếng trời hoặc sân trong → không gợi ý', () => {
    expect(lightWellAdvice(items, ['bedroom', 'light_well'])).toEqual([]);
    expect(lightWellAdvice(items, ['bedroom', 'courtyard'])).toEqual([]);
  });

  it('chỉ tiêu chí phòng tối mới gợi ý — ban công lệch thì không', () => {
    expect(lightWellAdvice([item('D5', ['balcony_2'])], ['balcony'])).toEqual([]);
  });
});
