import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { toNvgDateInput } from '@nvg/shared';
import type { ExecCompanyTile } from '@/hooks/use-exec-overview';

const today = toNvgDateInput(new Date());
const navigate = vi.fn();
const setSelectedCompany = vi.fn();
const NVC = { company_id: 'c1', company_code: 'NVC', company_name: 'Nhà Việt Cons' };
const NVS = { company_id: 'c2', company_code: 'NVS', company_name: 'Nhà Việt Steel' };
const tile = (c: typeof NVC, t: Partial<ExecCompanyTile>): ExecCompanyTile =>
  ({
    ...c,
    area: 'Mảng',
    key: 'k',
    label: 'L',
    level: 'ok',
    total: 0,
    amount: null,
    link: '/ds',
    note: null,
    items: [],
    ...t,
  }) as ExecCompanyTile;

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/hooks/use-exec-overview', () => ({
  useExecOverviewByCompany: () => ({
    isLoading: false,
    error: null,
    data: [
      tile(NVC, {
        key: 'hr_documents',
        label: 'Giấy tờ nhân sự hết hạn',
        level: 'red',
        total: 2,
        link: '/ns/giay-to',
      }),
      tile(NVC, { key: 'rentals_overdue', label: 'Giàn giáo quá hạn trả', level: 'ok' }),
      tile(NVS, { key: 'rentals_overdue', label: 'Giàn giáo quá hạn trả', level: 'ok' }),
    ],
  }),
  useCompanyPulse: () => ({
    data: [
      {
        ...NVS,
        metric: 'rentals_active',
        label: 'Hợp đồng thuê giàn giáo đang chạy',
        total: 2,
        amount: null,
      },
    ],
  }),
  useAllCompanyFinanceDays: () => ({
    data: [
      {
        day: today,
        company_id: 'c1',
        revenue_accepted: '2200000000',
        rental_revenue: '0',
        contracts_signed: '0',
        collected: '800000000',
        paid_out: '420000000',
      },
    ],
  }),
}));
vi.mock('@/hooks/use-approvals', () => ({
  usePendingApprovals: () => ({ data: [{ company_code: 'NVC' }] }),
}));
vi.mock('@/lib/company-store', () => ({
  useCompanyStore: (pick: (s: { setSelectedCompany: typeof setSelectedCompany }) => unknown) =>
    pick({ setSelectedCompany }),
}));

const { CompanyBoards } = await import('../company-boards');

describe('Khung từng công ty — nhìn một khung nắm một công ty', () => {
  it('mỗi khung đủ tình trạng, chờ duyệt, tiền, đang chạy — đúng của công ty đó', () => {
    render(
      <MemoryRouter>
        <CompanyBoards period="thang-nay" showPending />
      </MemoryRouter>,
    );
    const nvc = screen.getByRole('article', { name: 'Nhà Việt Cons' });
    expect(within(nvc).getByText('1 việc cần xử lý')).toBeTruthy();
    expect(within(nvc).getByText('Giấy tờ nhân sự hết hạn')).toBeTruthy();
    expect(within(nvc).getByRole('link', { name: /Chờ duyệt\s*1/ })).toBeTruthy();
    expect(within(nvc).getByText('2,2 tỷ')).toBeTruthy();
    expect(within(nvc).getByText('380 triệu')).toBeTruthy();

    const nvs = screen.getByRole('article', { name: 'Nhà Việt Steel' });
    expect(within(nvs).getByText(/Ổn — không có việc quá hạn/)).toBeTruthy();
    expect(within(nvs).getByText('Cho thuê')).toBeTruthy();
    // Số của NVC không lọt sang khung NVS.
    expect(within(nvs).queryByText('2,2 tỷ')).toBeNull();

    fireEvent.click(within(nvc).getByRole('button', { name: /Giấy tờ nhân sự hết hạn/ }));
    expect(setSelectedCompany).toHaveBeenCalledWith('c1');
    expect(navigate).toHaveBeenCalledWith('/ns/giay-to');
  });

  it('Kiểm soát nội bộ không duyệt — không có dòng «Chờ duyệt»', () => {
    render(
      <MemoryRouter>
        <CompanyBoards period="thang-nay" showPending={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Chờ duyệt')).toBeNull();
  });
});
