/**
 * «Có thể đang tính trùng» (0227): khoản phải thu gắn hợp đồng mà chưa chọn đợt — liệt kê, và Kế toán gắn đợt ngay tại
 * chỗ (ghi đúng đợt vào đúng khoản). Không có khoản nào thì khối không hiện.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const calls: { update?: unknown; eq?: [string, unknown] } = {};
let rows: unknown[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: rows, error: null }),
    from: () => ({
      update: (values: unknown) => {
        calls.update = values;
        return {
          eq: (col: string, value: unknown) => {
            calls.eq = [col, value];
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
  },
}));
vi.mock('@/lib/company-scope', () => ({
  useCompanyScope: () => ({ companyId: 'nvs', isAggregate: false, isReady: true }),
}));
vi.mock('@/lib/auth', () => ({ useCan: () => true }));
vi.mock('@/hooks/use-contracts', () => ({
  useContractTerms: () => ({
    data: [
      {
        id: 't1',
        term_type: 'tien_do_thanh_toan',
        description: 'Đợt 1',
        due_date: null,
        completed_at: null,
      },
      {
        id: 't2',
        term_type: 'bao_hanh',
        description: 'Bảo hành',
        due_date: null,
        completed_at: null,
      },
      {
        id: 't3',
        term_type: 'tam_ung',
        description: 'Tạm ứng đã xong',
        due_date: null,
        completed_at: '2026-10-01',
      },
    ],
  }),
}));

const { UnlinkedReceivables } = await import('../unlinked-receivables');

describe('UnlinkedReceivables', () => {
  beforeEach(() => {
    delete calls.update;
    delete calls.eq;
  });

  it('không có khoản nào thì không hiện gì', async () => {
    rows = [];
    const { container } = renderWithApp(<UnlinkedReceivables />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('section')).toBeNull();
  });

  it('liệt kê khoản, chỉ cho chọn đợt thu còn mở, gắn đợt ghi đúng khoản', async () => {
    rows = [
      {
        receivable_id: 'rp-1',
        receivable_code: 'NVS-CN-0001',
        contract_id: 'hd-1',
        contract_code: 'NVS-HD-2026-0001',
        amount: 300000000,
      },
    ];
    renderWithApp(<UnlinkedReceivables />);
    expect(await screen.findByText(/1 khoản phải thu có thể đang tính trùng/)).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: /Đợt thu cho NVS-CN-0001/ });
    const options = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['Chọn đợt thu', 'Đợt 1']);

    const button = screen.getByRole('button', { name: 'Gắn đợt' });
    expect(button).toBeDisabled();
    await userEvent.selectOptions(select, 't1');
    await userEvent.click(button);
    expect(calls.update).toEqual({ contract_term_id: 't1' });
    expect(calls.eq).toEqual(['id', 'rp-1']);
  });
});
