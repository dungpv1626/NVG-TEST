import { describe, expect, it } from 'vitest';
import {
  bucketFinance,
  bucketLabel,
  bucketStart,
  comparisonRanges,
  formatMoneyCompact,
  niceMoneyTicks,
  percentChange,
  seriesFrom,
  sumFinance,
  type FinanceDay,
} from '../bc-series';

function day(d: string, over: Partial<FinanceDay> = {}): FinanceDay {
  return {
    day: d,
    company_id: 'nvc',
    revenue_accepted: '0',
    rental_revenue: '0',
    contracts_signed: '0',
    collected: '0',
    paid_out: '0',
    ...over,
  };
}

describe('chia kỳ', () => {
  it('đầu kỳ và nhãn tháng / quý / năm', () => {
    expect(bucketStart('2026-09-30', 'thang')).toBe('2026-09-01');
    expect(bucketStart('2026-09-30', 'quy')).toBe('2026-07-01');
    expect(bucketStart('2026-09-30', 'nam')).toBe('2026-01-01');
    expect(bucketLabel('2026-09-01', 'thang')).toBe('T9/2026');
    expect(bucketLabel('2026-07-01', 'quy')).toBe('Q3/2026');
    expect(bucketLabel('2026-01-01', 'nam')).toBe('2026');
  });

  it('kỳ xa nhất cần tải: 12 tháng, 8 quý, 5 năm tính cả kỳ hiện tại', () => {
    expect(seriesFrom('2026-09-30', 'thang')).toBe('2025-10-01');
    expect(seriesFrom('2026-09-30', 'quy')).toBe('2024-10-01');
    expect(seriesFrom('2026-09-30', 'nam')).toBe('2022-01-01');
  });
});

describe('gom theo kỳ', () => {
  const days = [
    day('2026-08-20', { collected: '800000000' }),
    day('2026-09-15', { revenue_accepted: '1300000000', rental_revenue: '20000000' }),
    day('2026-09-29', { paid_out: '420000000' }),
  ];

  it('bỏ các tháng trước kỳ có phát sinh đầu tiên — không vẽ cột 0 trước khi dùng hệ thống', () => {
    const rows = bucketFinance(days, 'thang', '2026-09-30');
    expect(rows.map((r) => r.label)).toEqual(['T8/2026', 'T9/2026']);
    expect(rows[1]!.revenue).toBe(1_320_000_000n);
    expect(rows[1]!.netCash).toBe(-420_000_000n);
  });

  it('tháng trống nằm giữa hai tháng có số thì giữ lại (số 0 thật)', () => {
    const rows = bucketFinance(
      [day('2026-06-02', { collected: '1' }), day('2026-08-02', { collected: '1' })],
      'thang',
      '2026-09-30',
    );
    expect(rows.map((r) => [r.label, r.activeDays])).toEqual([
      ['T6/2026', 1],
      ['T7/2026', 0],
      ['T8/2026', 1],
      ['T9/2026', 0],
    ]);
  });

  it('chưa có ngày nào thì không có kỳ nào', () => {
    expect(bucketFinance([], 'quy', '2026-09-30')).toEqual([]);
  });

  it('cộng trong khoảng, đếm ngày có phát sinh', () => {
    const t = sumFinance(days, '2026-09-01', '2026-09-30');
    expect(t.revenue).toBe(1_320_000_000n);
    expect(t.activeDays).toBe(2);
    expect(sumFinance(days, '2026-07-01', '2026-07-31').activeDays).toBe(0);
  });
});

describe('so với kỳ trước', () => {
  it('tháng này so với cùng số ngày đầu tháng trước', () => {
    expect(comparisonRanges('thang-nay', '2026-09-09')).toEqual({
      current: { from: '2026-09-01', to: '2026-09-09' },
      previous: { from: '2026-08-01', to: '2026-08-09' },
    });
  });

  it('kỳ trước ngắn hơn thì dừng ở cuối kỳ trước, không tràn sang kỳ này', () => {
    expect(comparisonRanges('thang-nay', '2026-03-31').previous).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
  });

  it('quý và năm', () => {
    expect(comparisonRanges('quy-nay', '2026-09-30').previous).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
    expect(comparisonRanges('nam-nay', '2026-09-30').previous!.from).toBe('2025-01-01');
  });

  it('«Tất cả» không có kỳ trước', () => {
    expect(comparisonRanges('tat-ca', '2026-09-30').previous).toBeNull();
  });

  it('kỳ trước chưa có dữ liệu hoặc bằng 0 thì không tính phần trăm', () => {
    expect(percentChange(100n, 0n, false)).toBeNull();
    expect(percentChange(100n, 0n, true)).toBeNull();
    expect(percentChange(123n, 100n, true)).toBeCloseTo(23);
    expect(percentChange(-50n, -100n, true)).toBeCloseTo(50);
  });
});

describe('tiền rút gọn', () => {
  it('tỷ, triệu, nghìn, đồng', () => {
    expect(formatMoneyCompact('2600000000')).toBe('2,6 tỷ');
    expect(formatMoneyCompact(1_000_000_000n)).toBe('1 tỷ');
    expect(formatMoneyCompact('850000000')).toBe('850 triệu');
    expect(formatMoneyCompact('-420000000')).toBe('-420 triệu');
    expect(formatMoneyCompact(12_500)).toBe('12,5 nghìn');
    expect(formatMoneyCompact(950)).toBe('950 đồng');
    expect(formatMoneyCompact(null)).toBe('0 đồng');
  });
});

describe('vạch trục tròn', () => {
  it('bước 1–2–5, bắt đầu từ 0', () => {
    expect(niceMoneyTicks([1_300_000_000, 800_000_000])).toEqual([
      0, 500_000_000, 1_000_000_000, 1_500_000_000,
    ]);
    expect(niceMoneyTicks([800_000_000, 420_000_000])).toEqual([
      0, 200_000_000, 400_000_000, 600_000_000, 800_000_000,
    ]);
  });

  it('có giá trị âm thì trục kéo xuống dưới 0', () => {
    expect(niceMoneyTicks([300, -250])).toEqual([-400, -200, 0, 200, 400]);
  });

  it('toàn số 0 thì chỉ một vạch', () => {
    expect(niceMoneyTicks([0, 0])).toEqual([0]);
  });
});
