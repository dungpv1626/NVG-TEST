/**
 * Số ước tính trên nút «Vẽ ảnh phòng» (B3b): tiền THẬT các lượt trước cùng tuyến trước, giá niêm yết mỗi ảnh
 * sau, không có cả hai thì «Chưa đủ dữ liệu» — không bịa số (CLAUDE.md 5.2).
 */

import { describe, expect, it } from 'vitest';
import { roomImageEstimate } from '../room-image-cost';

describe('Ước tính tiền một tấm ảnh phòng', () => {
  it('có lượt «ok» cùng tuyến: trung bình tiền thật, bỏ lượt hỏng / tuyến khác / chưa có giá', () => {
    const estimate = roomImageEstimate(
      [
        { route: 'ai_image_openai', status: 'ok', cost_usd: 0.03 },
        { route: 'ai_image_openai', status: 'ok', cost_usd: 0.05 },
        { route: 'ai_image_openai', status: 'failed', cost_usd: 0.9 },
        { route: 'ai_image_openai', status: 'ok', cost_usd: null },
        { route: 'ai_image_gemini', status: 'ok', cost_usd: 0.07 },
      ],
      'ai_image_openai',
      0.5,
    );
    expect(estimate?.basis).toBe('history');
    expect(estimate?.samples).toBe(2);
    expect(estimate?.perImageUsd).toBeCloseTo(0.04);
  });

  it('chưa có lượt nào: theo giá niêm yết mỗi ảnh của tuyến', () => {
    expect(roomImageEstimate([], 'ai_image_gemini', 0.067)).toEqual({
      perImageUsd: 0.067,
      basis: 'pricing',
      samples: 0,
    });
  });

  it('không lượt nào, tuyến chưa khai giá, hoặc chưa chọn tuyến: không có số', () => {
    expect(roomImageEstimate([], 'ai_image_gemini', null)).toBeNull();
    expect(roomImageEstimate([], null, 0.03)).toBeNull();
  });
});
