import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { toNvgDateInput } from '@nvg/shared';

const today = toNvgDateInput(new Date());
const day = (company_id: string, revenue: number, collected = 0, paid = 0) => ({
  day: today,
  company_id,
  revenue_accepted: String(revenue),
  rental_revenue: '0',
  contracts_signed: '0',
  collected: String(collected),
  paid_out: String(paid),
});

vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    isLoading: false,
    error: null,
    data: [
      day('c1', 2_000_000_000, 800_000_000, 400_000_000),
      day('c2', 300_000_000),
      day('c3', 0),
    ],
  }),
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: {
      scopeCompanies: [
        { companyId: 'g', companyCode: 'NVG', companyShortName: 'NVG Group' },
        { companyId: 'c1', companyCode: 'NVC', companyShortName: 'Nhà Việt Cons' },
        { companyId: 'c2', companyCode: 'NVS', companyShortName: 'Nhà Việt Steel' },
        { companyId: 'c3', companyCode: 'NVO', companyShortName: 'Nhà Việt One' },
      ],
    },
  }),
}));
vi.mock('@/components/charts/money-chart', () => ({
  MoneyChart: ({ summary }: { summary: string }) => <div role="img" aria-label={summary} />,
}));

const { FinanceByCompanySection } = await import('../finance-by-company');

describe('Tài chính theo kỳ — ba công ty cạnh nhau', () => {
  it('mỗi chỉ số có số tập đoàn và số TỪNG công ty, không có mã tổng hợp NVG', () => {
    render(
      <MemoryRouter>
        <FinanceByCompanySection period="thang-nay" />
      </MemoryRouter>,
    );
    const revenue = screen.getByRole('list', { name: 'Doanh thu theo công ty' });
    const rows = within(revenue)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(rows).toEqual(['NVC2 tỷ', 'NVS300 triệu', 'NVO0 đồng']);
    expect(screen.getByText('2,3 tỷ')).toBeTruthy();
    expect(screen.queryByText('NVG')).toBeNull();
  });
});
