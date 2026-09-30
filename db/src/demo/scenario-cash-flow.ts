/**
 * Kế hoạch dòng tiền tháng 9 của NVC — để thẻ «Dòng tiền» trên Dashboard có một số dư thật.
 *
 * Số dư cuối kỳ chỉ có nghĩa khi Kế toán đã lập kế hoạch (số dư đầu kỳ, thu chi dự kiến); không
 * có kế hoạch thì Dashboard nói «Chưa đủ dữ liệu». Lập bằng tài khoản Kế toán, đúng quyền của
 * màn hình Dòng tiền. Kịch bản riêng (không nằm trong NVC) để nạp thêm được lên bản demo đã có
 * dữ liệu NVC.
 */

import { ACCOUNTS, check, companyId, signIn } from './client';
import { clean } from './names';

export const DEMO_CASH_FLOW_PERIOD = { start: '2026-09-01', end: '2026-09-30' } as const;

export async function loadCashFlow(): Promise<'created' | 'skipped'> {
  const ketoan = await signIn(ACCOUNTS.ketoan);
  const nvc = await companyId(ketoan, 'NVC');

  const existing = await ketoan
    .from('cash_flow_plans')
    .select('id')
    .eq('company_id', nvc)
    .eq('period_start', DEMO_CASH_FLOW_PERIOD.start)
    .is('construction_site_id', null)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.data) return 'skipped';

  check(
    'lập kế hoạch dòng tiền tháng 9',
    await ketoan.from('cash_flow_plans').insert({
      company_id: nvc,
      period_type: 'thang',
      period_start: DEMO_CASH_FLOW_PERIOD.start,
      period_end: DEMO_CASH_FLOW_PERIOD.end,
      opening_balance: 2_400_000_000,
      balance_note: clean('Số dư tài khoản công ty ngày 01/09/2026 theo sao kê ngân hàng'),
      planned_in: 800_000_000,
      planned_out: 600_000_000,
      notes: clean('Thu đợt 1 Nhà xưởng Hưng Thịnh; chi tổ đội và vật tư phần móng'),
    }),
  );
  return 'created';
}
