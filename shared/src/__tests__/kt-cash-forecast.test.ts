import { describe, expect, it } from 'vitest';
import { buildCashForecast, weekStartOf, type CashForecastItem } from '../kt-cash-forecast';

const A = 'company-a';
const B = 'company-b';

function item(
  kind: CashForecastItem['kind'],
  date: string | null,
  amount: number,
  company = A,
): CashForecastItem {
  return { kind, company_id: company, item_date: date, label: kind, amount };
}

describe('dòng tiền theo tuần (3C)', () => {
  it('tuần bắt đầu thứ Hai', () => {
    expect(weekStartOf('2026-10-22')).toBe('2026-10-19'); // thứ Năm
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // Chủ nhật
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
  });

  it('số dư hôm nay = đầu kỳ + đã thu − đã chi; tuần âm báo thiếu tiền', () => {
    const f = buildCashForecast(
      [
        item('opening', '2026-10-01', 100),
        item('da_thu', '2026-10-10', 50),
        item('da_chi', '2026-10-12', 30),
        item('thu_dot', '2026-10-28', 40),
        item('chi_de_nghi', '2026-11-03', 300),
      ],
      { today: '2026-10-22', weeks: 4 },
    );
    expect(f.openingToday).toBe(120n);
    expect(f.weeks.map((w) => w.closing)).toEqual([120n, 160n, -140n, -140n]);
    expect(f.weeks.map((w) => w.shortage)).toEqual([false, false, true, true]);
  });

  it('khoản quá hạn dồn vào tuần này; khoản chưa có ngày đếm riêng; quá tầm nhìn bỏ qua', () => {
    const f = buildCashForecast(
      [
        item('opening', '2026-10-01', 0),
        item('thu_cong_no', '2026-09-01', 70),
        item('chi_cong_no', null, 20),
        item('thu_dot', '2027-03-01', 999),
      ],
      { today: '2026-10-22', weeks: 2 },
    );
    expect(f.weeks[0]!.inflow).toBe(70n);
    expect(f.undatedOutflow).toBe(20n);
    expect(f.undatedCount).toBe(1);
    expect(f.weeks[1]!.inflow).toBe(0n);
  });

  it('thiếu số dư đầu kỳ của một pháp nhân thì không tính số dư — không bịa', () => {
    const f = buildCashForecast(
      [item('opening', '2026-10-01', 500, A), item('chi_de_nghi', '2026-10-23', 100, B)],
      { today: '2026-10-22', weeks: 2 },
    );
    expect(f.openingToday).toBeNull();
    expect(f.companiesWithoutOpening).toEqual([B]);
    expect(f.weeks[0]!.closing).toBeNull();
    expect(f.weeks[0]!.shortage).toBe(true); // chi vượt thu
  });

  it('không có số dư nào thì cũng không có số dư', () => {
    const f = buildCashForecast([item('thu_dot', '2026-10-23', 10)], {
      today: '2026-10-22',
      weeks: 1,
    });
    expect(f.openingToday).toBeNull();
    expect(f.weeks[0]!.closing).toBeNull();
    expect(f.weeks[0]!.shortage).toBe(false);
  });
});
