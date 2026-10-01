/**
 * Lãi/lỗ với vai trò không xem được lợi nhuận (Thi công, Mua hàng…): báo chặn NGAY, không gọi
 * báo cáo, và mục «Lãi/lỗ theo công trình» không hiện trên thanh điều hướng Báo cáo.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({ calledWith: [] as boolean[] }));

vi.mock('@/hooks/use-sensitive-access', () => ({
  useSensitiveAccess: () => ({
    data: { profit: false, finance: false, salary: false },
    isLoading: false,
  }),
}));
vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => ({ companyId: 'nvc', isAggregate: false, isReady: true }),
}));
vi.mock('@/hooks/use-companies', () => ({ useCompanyLookup: () => () => null }));
vi.mock('@/hooks/use-reports', () => ({
  useProfitLossReport: (enabled: boolean) => {
    state.calledWith.push(enabled);
    return { data: undefined, isLoading: enabled, error: null, dataUpdatedAt: 0 };
  },
}));

const { ProfitLossReportPage } = await import('../profit-loss');

describe('Lãi/lỗ — vai trò không xem được lợi nhuận', () => {
  it('báo chặn ngay, không gọi báo cáo, không có mục Lãi/lỗ trên thanh điều hướng', () => {
    renderWithApp(<ProfitLossReportPage />, { route: '/bc/lai-lo' });
    expect(screen.getByText('Không xem được báo cáo này')).toBeInTheDocument();
    expect(state.calledWith.every((e) => e === false)).toBe(true);
    expect(screen.queryByRole('link', { name: 'Lãi/lỗ theo công trình' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Hiệu quả kinh doanh' })).toBeInTheDocument();
  });
});
