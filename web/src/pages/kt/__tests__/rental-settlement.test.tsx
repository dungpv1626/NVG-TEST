/**
 * Thuê giàn giáo — đối soát và tất toán (0145).
 *
 * Canh hai điều: chưa ký đủ biên bản thì không tất toán được (nói rõ vì sao, không để bấm rồi
 * mới báo lỗi), và hộp xác nhận nói trước tất toán sẽ ghi gì — cấn trừ bao nhiêu cọc, hoàn
 * khách bao nhiêu.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  settled: [] as string[],
}));

vi.mock('@/lib/auth', () => ({ useCan: () => true }));
vi.mock('@/hooks/use-rental-returns', () => ({
  useRentalSettlements: () => ({ data: state.rows, isLoading: false, error: null }),
  useSettleRentalAgreement: () => ({
    isPending: false,
    mutateAsync: async ({ rentalAgreementId }: { rentalAgreementId: string }) => {
      state.settled.push(rentalAgreementId);
    },
  }),
}));

const { RentalSettlementPage } = await import('../rental-settlement-page');

function agreement(overrides: Record<string, unknown>) {
  return {
    id: 'hdt-1',
    code: 'NVS-HDT-2026-0001',
    company_id: 'nvs',
    status: 'da_thu_hoi',
    start_date: '2026-09-01',
    actual_return_date: '2026-09-10',
    deposit_amount: '80000',
    total_revenue: '50000',
    total_compensation: '0',
    settled_at: null,
    settlement_deposit_offset: null,
    settlement_refund: null,
    customer: { code: 'KH-00001', name: 'Công ty Đông Đô' },
    returns: [
      {
        id: 'bb-1',
        code: 'NVS-BBTH-2026-0001',
        return_date: '2026-09-10',
        revenue: '50000',
        compensation: '0',
        signed_at: '2026-09-10T08:00:00Z',
      },
    ],
    receivables: [
      {
        id: 'cn-1',
        direction: 'phai_thu',
        amount: '50000',
        settled_amount: '0',
        due_date: null,
        reconciled_at: null,
        rental_return_id: 'bb-1',
        description: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.settled = [];
});

describe('Thuê giàn giáo — tất toán', () => {
  it('còn biên bản chưa ký thì nút tất toán bị khoá và nói rõ vì sao', () => {
    state.rows = [
      agreement({
        returns: [
          {
            id: 'bb-1',
            code: 'NVS-BBTH-2026-0001',
            return_date: '2026-09-10',
            revenue: '50000',
            compensation: '0',
            signed_at: null,
          },
        ],
        receivables: [],
      }),
    ];
    renderWithApp(<RentalSettlementPage />, { route: '/kt/thue-gian-giao' });
    expect(screen.getByRole('button', { name: 'Tất toán hợp đồng' })).toBeDisabled();
    expect(screen.getByText(/Còn 1 biên bản chưa ký hai bên/)).toBeInTheDocument();
  });

  it('hộp xác nhận nói trước số cọc cấn trừ và số hoàn khách, xác nhận thì gọi tất toán', async () => {
    const user = userEvent.setup();
    state.rows = [agreement({})];
    renderWithApp(<RentalSettlementPage />, { route: '/kt/thue-gian-giao' });

    await user.click(screen.getByRole('button', { name: 'Tất toán hợp đồng' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/cấn trừ 50\.000 đồng tiền cọc/)).toBeInTheDocument();
    expect(within(dialog).getByText(/hoàn cọc 30\.000 đồng/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Tất toán' }));
    expect(state.settled).toEqual(['hdt-1']);
  });

  it('tổng biên bản đã ký lệch tổng phải thu thì cảnh báo trên dòng', () => {
    state.rows = [agreement({ receivables: [] })];
    renderWithApp(<RentalSettlementPage />, { route: '/kt/thue-gian-giao' });
    expect(screen.getByRole('alert')).toHaveTextContent(/Lệch/);
  });
});
