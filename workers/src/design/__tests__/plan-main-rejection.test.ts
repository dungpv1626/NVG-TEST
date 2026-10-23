/**
 * Lý do CHÍNH của phương án không xếp được (lượt chạy thật ef5fbffc, 23/10/2026): lượt cuối trả câu
 * trả lời rỗng («Sai cấu trúc ở rooms…»), trong khi lượt trước nói được chỗ hỏng thật. Kết quả lượt
 * chạy phải mang lượt hỏng nhẹ nhất ra cho người đọc — chọn bằng đúng phép so của vòng lặp.
 *
 * KHÔNG chạm mạng, KHÔNG gọi mô hình.
 */

import { describe, expect, it } from 'vitest';
import { AiPlanRejected, ANSWER_STAGE_CODE, type LevelRejection } from '../ai/plan';
import {
  AiPlanRejectedWithMain,
  mainRejection,
  roundSummary,
} from '../workflows/plan-main-rejection';
import { prompts } from './ai-real-context';

const round = (rejections: LevelRejection[]) => ({ rejections, hints: [] as string[] });

const access = round([
  {
    level: 1,
    messages: [
      'Phòng "office_1" ở tầng 1 không có lối vào.',
      'Phòng "office_1" ở tầng 1 rộng 8,96 m², dưới mức tối thiểu 10 m² đầu bài khai.',
    ],
    codes: ['requires_access', 'min_area'],
  },
]);
const unusable = round([
  {
    level: 0,
    messages: ['Sai cấu trúc ở rooms: Array must contain at least 1 element(s)'],
    codes: [ANSWER_STAGE_CODE],
  },
]);

describe('mainRejection', () => {
  it('lượt cuối là câu trả lời không dùng được → trả lượt hỏng nhẹ hơn, kèm số vòng', () => {
    const main = mainRejection(access, 3, unusable, prompts);
    expect(main?.round).toBe(3);
    expect(main?.levels.flatMap((l) => l.messages)).toEqual(access.rejections[0]!.messages);
    expect(main?.levels[0]?.codes).toEqual(['requires_access', 'min_area']);
  });

  it('lượt cuối đã là lượt nhẹ nhất → null (dùng lỗi lượt cuối như trước)', () => {
    expect(mainRejection(unusable, 1, access, prompts)).toBeNull();
    expect(mainRejection(access, 2, access, prompts)).toBeNull();
  });

  it('chưa có lượt nào để so → null', () => {
    expect(mainRejection(null, 0, unusable, prompts)).toBeNull();
  });

  it('lỗi mang lượt chính vẫn là AiPlanRejected (mọi chỗ cũ vẫn nhận ra)', () => {
    const error = new AiPlanRejectedWithMain(unusable.rejections, {
      round: 3,
      levels: access.rejections,
    });
    expect(error).toBeInstanceOf(AiPlanRejected);
    expect(error.main?.round).toBe(3);
    expect(error.message).toMatch(/^Chưa xếp được mặt bằng: Sai cấu trúc/);
  });
});

describe('roundSummary', () => {
  it('lỗi đầu tiên + số lỗi còn lại', () => {
    expect(roundSummary(access.rejections)).toBe(
      'Phòng "office_1" ở tầng 1 không có lối vào. (và 1 lỗi khác)',
    );
    expect(roundSummary(unusable.rejections)).toBe(
      'Sai cấu trúc ở rooms: Array must contain at least 1 element(s)',
    );
    expect(roundSummary([])).toBeNull();
  });
});
