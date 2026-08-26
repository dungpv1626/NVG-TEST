/**
 * Phép tính của Dashboard điều hành (Module BC).
 *
 * Sai ở đây không làm hỏng màn hình nào — nó chỉ làm con số sai. Đó chính là lý do phải có
 * test: Ban Giám đốc dùng màn hình này để ra quyết định, và một chỉ số sai nhìn y hệt một
 * chỉ số đúng (PRD BC-06).
 */

import { describe, expect, it } from 'vitest';
import {
  conversionRate,
  countByStatus,
  isWithinPeriod,
  periodStartDate,
} from '../bc';
import { sumMoney, toMoney } from '../format';

// 10:00 sáng giờ Việt Nam ngày 25/08/2026 — giữa quý 3.
const now = new Date('2026-08-25T03:00:00Z');

describe('periodStartDate', () => {
  it('tháng này bắt đầu từ ngày 1 của tháng', () => {
    expect(periodStartDate('thang-nay', now)).toBe('2026-08-01');
  });

  it('quý này lùi về tháng đầu quý, không phải tháng hiện tại', () => {
    expect(periodStartDate('quy-nay', now)).toBe('2026-07-01');
    expect(periodStartDate('quy-nay', new Date('2026-02-10T03:00:00Z'))).toBe('2026-01-01');
    expect(periodStartDate('quy-nay', new Date('2026-12-31T03:00:00Z'))).toBe('2026-10-01');
  });

  it('năm nay bắt đầu từ 01/01', () => {
    expect(periodStartDate('nam-nay', now)).toBe('2026-01-01');
  });

  it('"Tất cả" không có mốc đầu kỳ', () => {
    expect(periodStartDate('tat-ca', now)).toBeNull();
  });

  // Mốc đầu kỳ tính theo giờ Việt Nam, không theo UTC: 00:30 ngày 01/09 giờ Việt Nam vẫn
  // còn là 17:30 ngày 31/08 theo UTC. Tính nhầm thì ngày đầu tháng cả hệ thống lệch một kỳ.
  it('đổi kỳ theo giờ Việt Nam, không theo UTC', () => {
    expect(periodStartDate('thang-nay', new Date('2026-08-31T17:30:00Z'))).toBe('2026-09-01');
  });
});

describe('isWithinPeriod', () => {
  it('nhận hồ sơ trong kỳ và loại hồ sơ trước kỳ', () => {
    expect(isWithinPeriod('2026-08-20', 'thang-nay', now)).toBe(true);
    expect(isWithinPeriod('2026-07-31', 'thang-nay', now)).toBe(false);
    expect(isWithinPeriod('2026-07-31', 'quy-nay', now)).toBe(true);
    expect(isWithinPeriod('2026-06-30', 'quy-nay', now)).toBe(false);
  });

  it('ngày đầu kỳ nằm TRONG kỳ', () => {
    expect(isWithinPeriod('2026-08-01', 'thang-nay', now)).toBe(true);
  });

  it('hồ sơ thiếu ngày không được đếm vào kỳ nào, trừ "Tất cả"', () => {
    expect(isWithinPeriod(null, 'thang-nay', now)).toBe(false);
    expect(isWithinPeriod('', 'nam-nay', now)).toBe(false);
    expect(isWithinPeriod(null, 'tat-ca', now)).toBe(true);
  });
});

describe('countByStatus', () => {
  it('đếm đủ 5 nhóm, nhóm rỗng vẫn có mặt với số 0', () => {
    const counts = countByStatus([
      { status: 'draft' },
      { status: 'overdue' },
      { status: 'overdue' },
    ]);
    expect(counts).toEqual({
      draft: 1,
      pending_approval: 0,
      in_progress: 0,
      completed: 0,
      overdue: 2,
    });
  });
});

describe('conversionRate', () => {
  it('tính đúng phần trăm', () => {
    expect(conversionRate(3, 12)).toBe(25);
  });

  // "Chưa có cơ hội nào" khác hẳn "có cơ hội nhưng không chốt được cái nào".
  it('không có cơ hội nào thì KHÔNG phải 0%', () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(0, 5)).toBe(0);
  });
});

describe('cộng tiền', () => {
  // Tiền từ PostgREST về dạng CHUỖI. Cộng chuỗi trong JavaScript ra chuỗi nối, không báo lỗi.
  it('cộng được giá trị đến từ chuỗi, số và bigint lẫn lộn', () => {
    expect(sumMoney(['1000000', 2_000_000, 3_000_000n])).toBe(6_000_000n);
  });

  it('bỏ qua ô trống thay vì hỏng cả tổng', () => {
    expect(sumMoney([null, undefined, '', '500000'])).toBe(500_000n);
  });

  it('giữ nguyên độ chính xác ở giá trị vượt ngưỡng an toàn của số JavaScript', () => {
    expect(toMoney('9007199254740993')).toBe(9_007_199_254_740_993n);
  });
});
