import { describe, expect, it } from 'vitest';
import { addDaysIso, monthStartOf, planProgressPercent } from '../tc-site-report';
import { weekStartOf } from '../kt-cash-forecast';

describe('kế hoạch tuần / báo cáo tuần (T3, T4)', () => {
  it('kỳ báo cáo: thứ Hai của tuần, đầu tháng, cộng ngày qua tháng', () => {
    expect(weekStartOf('2026-10-29')).toBe('2026-10-26');
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26');
    expect(monthStartOf('2026-10-29')).toBe('2026-10-01');
    expect(addDaysIso('2026-10-26', 6)).toBe('2026-11-01');
  });

  it('tỷ lệ đã làm chỉ khi có cả mục tiêu lẫn số đã ghi — không đoán, không 0', () => {
    expect(planProgressPercent({ target_quantity: 12, done_quantity: 3 })).toBe(25);
    expect(planProgressPercent({ target_quantity: null, done_quantity: 3 })).toBeNull();
    expect(planProgressPercent({ target_quantity: 12, done_quantity: null })).toBeNull();
    expect(planProgressPercent({ target_quantity: 0, done_quantity: 3 })).toBeNull();
  });
});
