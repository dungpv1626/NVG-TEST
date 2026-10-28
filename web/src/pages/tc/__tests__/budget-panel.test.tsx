/**
 * Tab Ngân sách — công trình chưa có ngân sách (0235). Dựng trong bộ nhớ, không gọi mạng.
 *
 * Canh: người lập được (Trưởng phòng Thi công / Ban Giám đốc) thấy nút «Lập ngân sách từ báo giá»
 * kèm căn cứ là giá BÁN; người khác không thấy nút (CLAUDE.md 5.4); đã có ngân sách gắn thẳng
 * công trình thì hiện khối sửa dòng, dòng 0 đồng ghi «Chưa nhập số dự trù».
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';
import { BudgetPanel } from '../budget-panel';

const build = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  status: [] as unknown[],
  source: null as unknown,
  lines: [] as unknown[],
}));

vi.mock('@/hooks/use-construction-sites', () => ({
  useSiteBudgetStatus: () => ({ data: state.status, isLoading: false }),
  useSiteBudgetSource: () => ({ data: state.source, isLoading: false }),
  useSiteBudgetLines: () => ({ data: state.lines, isLoading: false }),
  useBuildSiteBudget: () => ({ mutateAsync: build, isPending: false }),
  useSaveSiteBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSiteBudgetLine: () => ({ mutate: vi.fn(), isPending: false }),
}));

const MANAGER = {
  can_manage: true,
  has_budget: false,
  site_only: true,
  quote_code: 'NVC-BG-2026-1088-V2',
  quote_value: 2920000000,
  contract_code: 'NVC-HD-2026-0501',
  blocked_reason: null,
};

describe('BudgetPanel — công trình chưa có ngân sách', () => {
  beforeEach(() => {
    build.mockReset();
    state.status = [];
    state.lines = [];
  });

  it('người lập được thấy căn cứ báo giá và lập được', async () => {
    state.source = MANAGER;
    renderWithApp(<BudgetPanel siteId="s1" />);

    expect(screen.getByText(/NVC-BG-2026-1088-V2/)).toBeInTheDocument();
    expect(screen.getByText(/giá bán, chưa phải chi phí/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lập ngân sách từ báo giá' }));
    expect(build).toHaveBeenCalledWith({ siteId: 's1' });
  });

  it('người không có quyền lập không thấy nút', () => {
    state.source = { ...MANAGER, can_manage: false, quote_code: null, quote_value: null };
    renderWithApp(<BudgetPanel siteId="s1" />);

    expect(screen.queryByRole('button', { name: 'Lập ngân sách từ báo giá' })).toBeNull();
    expect(screen.getByText(/Chưa có ngân sách thi công/)).toBeInTheDocument();
  });

  it('không có báo giá đã duyệt thì nói lý do, không có nút', () => {
    state.source = { ...MANAGER, quote_code: null, blocked_reason: 'Hợp đồng không đi từ cơ hội.' };
    renderWithApp(<BudgetPanel siteId="s1" />);

    expect(screen.getByText('Hợp đồng không đi từ cơ hội.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lập ngân sách từ báo giá' })).toBeNull();
  });

  it('đã có ngân sách gắn thẳng công trình thì hiện khối sửa dòng', () => {
    state.source = { ...MANAGER, has_budget: true };
    state.status = [
      {
        cost_group: 'vat_tu',
        cost_code: 'TONG',
        name: 'Chi phí thi công (chưa chia nhóm)',
        budgeted_amount: 0,
        actual_amount: 0,
        committed_amount: 0,
        engaged_amount: 0,
        remaining_amount: 0,
      },
    ];
    state.lines = [
      {
        id: 'l1',
        cost_group: 'vat_tu',
        cost_code: 'TONG',
        name: 'Chi phí thi công (chưa chia nhóm)',
        budgeted_amount: 0,
        notes: 'Lập từ báo giá NVC-BG-2026-1088-V2',
      },
    ];
    renderWithApp(<BudgetPanel siteId="s1" />);

    expect(screen.getByRole('region', { name: 'Sửa ngân sách công trình' })).toBeInTheDocument();
    expect(screen.getByText('Chưa nhập số dự trù')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sửa dòng Chi phí thi công (chưa chia nhóm)' }),
    ).toBeInTheDocument();
  });
});
