/**
 * Tab «Tổng quan tài chính» (BC-01) — dựng thật trong bộ nhớ, không gọi mạng.
 *
 * Canh: vai trò không xem được tài chính thấy câu chặn nói rõ ai xem được và KHÔNG thấy mục trên
 * thanh điều hướng (ẩn, không hiện rồi chặn — CLAUDE.md 5.4); vai trò được xem thấy bảng số theo
 * kỳ dưới biểu đồ (đọc được khi không phân biệt được màu).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { toNvgDateInput } from '@nvg/shared';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  access: { profit: true, finance: true },
  days: [] as unknown[],
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { id: 'u1', fullName: 'Bùi Văn Thi', assignments: [], scopeCompanies: [] },
  }),
  useCan: () => true,
}));
vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => ({ companyId: 'nvc', isAggregate: false, isReady: true }),
}));
vi.mock('@/hooks/use-sensitive-access', () => ({
  useSensitiveAccess: () => ({ data: state.access, isLoading: false }),
}));
vi.mock('@/hooks/use-reports', () => ({
  useFinanceDaily: () => ({ data: state.days, isLoading: false, dataUpdatedAt: Date.now() }),
  useProfitLossReport: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-accounting', () => ({
  useReceivables: () => ({ data: [], isLoading: false }),
  useAgingBuckets: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-companies', () => ({
  useCompanyLookup: () => () => ({ id: 'nvc', code: 'NVC', short_name: 'Nhà Việt Cons' }),
}));

const { FinanceOverviewPage } = await import('../finance-overview-page');

beforeEach(() => {
  state.access = { profit: true, finance: true };
  state.days = [];
});

describe('Tổng quan tài chính', () => {
  it('không xem được tài chính: câu chặn nói rõ ai xem được, không có mục trên thanh điều hướng', () => {
    state.access = { profit: false, finance: false };
    renderWithApp(<FinanceOverviewPage />, { route: '/bc/tong-quan' });
    expect(screen.getByText('Không xem được số liệu tài chính.')).toBeInTheDocument();
    expect(screen.getByText(/Ban Giám đốc, Giám đốc Tài chính và Kế toán/)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Màn hình trong phân hệ' });
    expect(nav).not.toHaveTextContent('Tổng quan tài chính');
  });

  it('chưa có phát sinh: biểu đồ nói «Chưa đủ dữ liệu», không vẽ cột 0', () => {
    renderWithApp(<FinanceOverviewPage />, { route: '/bc/tong-quan' });
    expect(screen.getAllByText(/Chưa đủ dữ liệu/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole('button', { name: /Xuất Excel/ })).toBeNull();
  });

  it('có phát sinh: bảng số theo kỳ dưới biểu đồ và nút xuất', () => {
    const today = toNvgDateInput(new Date());
    state.days = [
      {
        day: today,
        company_id: 'nvc',
        revenue_accepted: '1300000000',
        rental_revenue: '0',
        contracts_signed: '6500000000',
        collected: '800000000',
        paid_out: '420000000',
      },
    ];
    renderWithApp(<FinanceOverviewPage />, { route: '/bc/tong-quan' });
    expect(screen.getAllByText('6.500.000.000 đồng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('380.000.000 đồng').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Xuất Excel/ })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Màn hình trong phân hệ' });
    expect(nav).toHaveTextContent('Tổng quan tài chính');
  });
});
