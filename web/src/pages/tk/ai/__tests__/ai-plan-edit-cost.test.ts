/**
 * Chi phí và câu chữ của lượt «Sửa lại» (T184). Lượt thật 29/10/2026 (hồ sơ 9272): màn hình ghi «Chưa đủ dữ liệu» dù đã có
 * lời gọi sửa trả tiền thật (lượt sửa hỏng không ghi kết quả, gom theo lượt chạy thì bỏ mất), và hứa «một lượt, thêm tối đa
 * ba lượt» trong khi lượt ấy rơi vào vòng xếp lại cả nhà. Canh: ước tính lấy từ từng lời gọi sửa; câu dưới nút nói đúng số
 * lời gọi, trần tiền và việc lượt sửa không xếp lại bố cục.
 */

import { describe, expect, it } from 'vitest';
import { editCallsSentence } from '../ai-plan-edit';
import { costCeiling, estimateFromCalls, type CostCallRow } from '../run-cost-estimate';

const call = (over: Partial<CostCallRow>): CostCallRow => ({
  projectId: 'p',
  createdAt: '2026-10-29T11:05:44Z',
  route: 'ai_text_openai',
  purpose: 'plan_house_edit',
  status: 'ok',
  inputTokens: 5000,
  outputTokens: 1000,
  costUsd: 0.025,
  ...over,
});

describe('ước tính lượt sửa từ lời gọi sửa đã trả tiền (T184)', () => {
  it('trung bình các lời gọi sửa cùng tuyến — kể cả của lượt sửa hỏng', () => {
    const estimate = estimateFromCalls(
      [
        call({}),
        call({ costUsd: 0.035 }),
        // Khác tuyến, khác mục đích, lỗi không token: không tính.
        call({ route: 'ai_text_gemini', costUsd: 1 }),
        call({ purpose: 'plan_house_revise', costUsd: 0.13 }),
        call({ status: 'failed', costUsd: null, inputTokens: null, outputTokens: null }),
      ],
      { route: 'ai_text_openai', purposes: ['plan_house_edit'] },
    );
    expect(estimate?.samples).toBe(2);
    expect(estimate?.perCallUsd).toBeCloseTo(0.03, 6);
    expect(costCeiling(estimate, 4, 1)).toBeCloseTo(0.12, 6);
  });

  it('chưa có lời gọi sửa nào bằng tuyến này: null', () => {
    expect(
      estimateFromCalls([call({ route: 'x' })], {
        route: 'ai_text_openai',
        purposes: ['plan_house_edit'],
      }),
    ).toBeNull();
  });
});

describe('câu dưới nút «Sửa lại» (T184)', () => {
  it('nói đúng số lời gọi, trần tiền, và lượt sửa không xếp lại bố cục', () => {
    const text = editCallsSentence(4, 0.12);
    expect(text).toContain('gọi mô hình 1 lần');
    expect(text).toContain('thêm tối đa 3 lần cùng loại');
    expect(text).toContain('tối đa ≈');
    expect(text).toContain('không xếp lại cả bố cục');
    expect(text).toContain('«Xếp mặt bằng»');
  });

  it('chưa biết giá: không bịa trần tiền', () => {
    expect(editCallsSentence(4, null)).not.toContain('tối đa ≈');
  });
});
