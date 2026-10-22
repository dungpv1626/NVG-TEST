import { describe, expect, it } from 'vitest';
import { quoteRental } from '../rental-quote';

describe('quoteRental — báo giá thuê giàn giáo (5D)', () => {
  it('tính thành tiền = số lượng × đơn giá × số ngày và cộng tổng', () => {
    const q = quoteRental(
      [
        { materialId: 'a', quantity: 100, available: 500, dailyRate: 1200 },
        { materialId: 'b', quantity: 20, available: 20, dailyRate: 3000 },
      ],
      30,
    );
    expect(q.lines.map((l) => l.amount)).toEqual([3_600_000, 1_800_000]);
    expect(q.total).toBe(5_400_000);
    expect(q.shortLines).toBe(0);
  });

  it('mã chưa cấu hình đơn giá: dòng không có thành tiền và KHÔNG có tổng (không cộng thiếu)', () => {
    const q = quoteRental(
      [
        { materialId: 'a', quantity: 100, available: 500, dailyRate: 1200 },
        { materialId: 'b', quantity: 10, available: 50, dailyRate: null },
      ],
      30,
    );
    expect(q.lines[1]!.amount).toBeNull();
    expect(q.total).toBeNull();
    expect(q.missingRates).toBe(1);
  });

  it('thiếu hàng: báo số thiếu, giữ nguyên số lượng khách hỏi', () => {
    const q = quoteRental([{ materialId: 'a', quantity: 120, available: 80, dailyRate: 1000 }], 10);
    expect(q.lines[0]!.quantity).toBe(120);
    expect(q.lines[0]!.shortage).toBe(40);
    expect(q.shortLines).toBe(1);
  });

  it('chưa nhập số ngày thì chưa có tổng; dòng số lượng 0 bị bỏ', () => {
    const q = quoteRental(
      [
        { materialId: 'a', quantity: 5, available: 5, dailyRate: 1000 },
        { materialId: 'b', quantity: 0, available: 5, dailyRate: 1000 },
      ],
      0,
    );
    expect(q.lines).toHaveLength(1);
    expect(q.total).toBeNull();
  });
});
