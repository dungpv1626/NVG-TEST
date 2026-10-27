/**
 * Công nợ quá hạn ở cả ba công ty — để «Tổng quan điều hành» và khung từng công ty có vấn đề thật để xem (việc treo
 * «thêm dữ liệu demo quá hạn ở cả ba công ty», CLAUDE.md 9.3).
 *
 * Mỗi công ty một khoản phải thu và một khoản phải trả còn nguyên, hạn đã qua — đúng cảnh Kế toán chuyển công nợ cũ từ
 * Excel lên hệ thống. Ghi bằng tài khoản Kế toán qua đúng đường màn hình Công nợ (RLS `receivables_insert`). Hạn tính
 * lệch so với HÔM NAY lúc nạp, nên luôn quá hạn khi demo. Kịch bản riêng để nạp thêm lên bản demo đã có dữ liệu.
 */

import { ACCOUNTS, check, companyId, day, signIn } from './client';
import { clean } from './names';

interface OverdueDebt {
  company: 'NVC' | 'NVO' | 'NVS';
  direction: 'phai_thu' | 'phai_tra';
  partyName: string;
  description: string;
  amount: number;
  daysLate: number;
}

/** Diễn giải là dấu nhận ra của kịch bản (gỡ bằng `--remove`). */
export const OVERDUE_DEMO_DEBTS: readonly OverdueDebt[] = [
  {
    company: 'NVC',
    direction: 'phai_thu',
    partyName: clean('Công ty TNHH Cơ khí Minh Phát'),
    description: clean('Đợt 2 nhà xưởng Minh Phát — chuyển từ sổ công nợ Excel'),
    amount: 1_250_000_000,
    daysLate: 24,
  },
  {
    company: 'NVC',
    direction: 'phai_tra',
    partyName: clean('Công ty CP Thép Việt Hưng'),
    description: clean('Thép hình H300 tháng 8 — chuyển từ sổ công nợ Excel'),
    amount: 486_000_000,
    daysLate: 9,
  },
  {
    company: 'NVO',
    direction: 'phai_thu',
    partyName: clean('Anh Trần Quốc Bảo'),
    description: clean('Đợt hoàn thiện nhà phố Trần Quốc Bảo — chuyển từ sổ công nợ Excel'),
    amount: 320_000_000,
    daysLate: 15,
  },
  {
    company: 'NVO',
    direction: 'phai_tra',
    partyName: clean('Tổ đội nề anh Lâm'),
    description: clean('Nhân công phần thô nhà phố Đông Hòa — chuyển từ sổ công nợ Excel'),
    amount: 96_000_000,
    daysLate: 6,
  },
  {
    company: 'NVS',
    direction: 'phai_thu',
    partyName: clean('Công ty TNHH Xây dựng An Khang'),
    description: clean('Tiền thuê giàn giáo tháng 8 An Khang — chuyển từ sổ công nợ Excel'),
    amount: 74_500_000,
    daysLate: 31,
  },
  {
    company: 'NVS',
    direction: 'phai_tra',
    partyName: clean('Công ty CP Ống thép Phúc Thịnh'),
    description: clean('Ống thép phi 48 lô tháng 8 — chuyển từ sổ công nợ Excel'),
    amount: 212_000_000,
    daysLate: 12,
  },
];

export async function loadOverdue(): Promise<'created' | 'skipped'> {
  const ketoan = await signIn(ACCOUNTS.ketoan);
  const { data: existing } = await ketoan
    .from('receivables_payables')
    .select('description')
    .in(
      'description',
      OVERDUE_DEMO_DEBTS.map((d) => d.description),
    );
  const have = new Set(((existing ?? []) as { description: string }[]).map((r) => r.description));
  let wrote = 0;
  for (const d of OVERDUE_DEMO_DEBTS) {
    if (have.has(d.description)) continue;
    const company = await companyId(ketoan, d.company);
    check(
      `ghi công nợ quá hạn ${d.company} — ${d.partyName}`,
      await ketoan.from('receivables_payables').insert({
        company_id: company,
        direction: d.direction,
        party_type: d.direction === 'phai_thu' ? 'khach_hang' : 'nha_cung_cap',
        party_name: d.partyName,
        description: d.description,
        amount: d.amount,
        invoice_date: day(-d.daysLate - 30),
        due_date: day(-d.daysLate),
      }),
    );
    wrote++;
  }
  return wrote > 0 ? 'created' : 'skipped';
}
