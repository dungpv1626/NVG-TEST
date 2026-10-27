/**
 * Nhập đầu mối từ Excel / CSV: tải tệp → kiểm từng dòng → nhập đúng các dòng đã chọn.
 *
 * Canh: số đã có ở đầu mối / khách hàng bị BỎ CHỌN sẵn (không gọi trùng khách đồng nghiệp); dòng thiếu thông tin không
 * chọn được; bấm nhập chỉ ghi các dòng đang chọn, mỗi dòng một lần, kèm kết quả từng dòng.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const inserted: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (_fn: string, args: { p_phone: string }) =>
      Promise.resolve({
        data:
          args.p_phone === '0987654321'
            ? [
                {
                  kind: 'lead',
                  code: 'NVO-DM-2026-0001',
                  name: 'Bà Lan',
                  company_code: 'NVO',
                  owner_name: 'Chị Hoa',
                },
              ]
            : [],
        error: null,
      }),
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: () =>
              Promise.resolve({ data: { code: `NVO-DM-2026-01${inserted.length}` }, error: null }),
          }),
        };
      },
    }),
  },
}));
vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => ({ companyId: 'nvo', isAggregate: false, isReady: true }),
}));
vi.mock('@/lib/auth', () => ({ useCan: () => true, useIsOrgManager: () => false }));
vi.mock('../crm-nav', () => ({ CrmNav: () => null }));

const { LeadImportPage } = await import('../lead-import');

const CSV =
  'Họ tên;Điện thoại;Nguồn\n' +
  'Nguyễn Văn An;0912345678;Facebook\n' +
  'Bà Lan;0987654321;Zalo\n' +
  ';0911111111;Zalo\n';

describe('Nhập đầu mối từ Excel', () => {
  it('bỏ chọn sẵn số đã có, dòng thiếu tên không chọn được, chỉ nhập dòng đang chọn', async () => {
    const { container } = renderWithApp(<LeadImportPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File([CSV], 'dau-moi.csv', { type: 'text/csv' }));

    expect(await screen.findByText(/Đã có: đầu mối NVO-DM-2026-0001/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Nhập dòng 2' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Nhập dòng 3' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Nhập dòng 4' })).toBeDisabled();
    expect(screen.getByText('Thiếu tên người liên hệ.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nhập 1 đầu mối' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã nhập 1 đầu mối');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      company_id: 'nvo',
      full_name: 'Nguyễn Văn An',
      phone: '0912345678',
      source: 'Facebook',
    });
    const row = screen.getByRole('checkbox', { name: 'Nhập dòng 2' }).closest('tr')!;
    expect(within(row).getByText(/Đã nhập — NVO-DM-2026-01/)).toBeInTheDocument();
  });
});
