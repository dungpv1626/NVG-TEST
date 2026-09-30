/**
 * Lập đề nghị thanh toán TỪ ĐƠN ĐẶT HÀNG (MH-08).
 *
 * Canh điều quan trọng nhất: hồ sơ lưu xuống phải mang mã đơn hàng. Chi phí của đơn đã vào ngân
 * sách công trình lúc nhận hàng; `post_payment_to_budget` chỉ bỏ qua bước cộng chi phí thực tế
 * khi đề nghị có `purchase_order_id` — thiếu mã là công trình bị ghi chi phí hai lần.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  order: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/auth', () => ({ useCan: () => true }));
vi.mock('@/lib/company-scope', () => ({
  // Đang xem gộp: biểu mẫu thường bị chặn, biểu mẫu từ đơn hàng lấy pháp nhân của đơn.
  useCompanyScope: () => ({ companyId: null, isAggregate: true, isReady: true }),
}));
vi.mock('@/hooks/use-active-users', () => ({ useActiveUsers: () => ({ data: [] }) }));
vi.mock('@/hooks/use-purchasing', () => ({
  useSuppliers: () => ({ data: [{ id: 'ncc-2', code: 'NCC-00002', name: 'Thép Đại Phát' }] }),
  usePurchaseOrder: (id?: string) => ({ data: id ? state.order : null, isLoading: false }),
}));
vi.mock('@/hooks/use-accounting', () => ({
  useCreatePaymentRequest: () => ({
    isPending: false,
    mutateAsync: async (input: Record<string, unknown>) => {
      state.created.push(input);
      return 'moi';
    },
  }),
}));

const { PaymentRequestCreatePage } = await import('../payment-create');

beforeEach(() => {
  state.created = [];
  state.order = {
    id: 'don-1',
    code: 'NVC-DH-2026-0001',
    company_id: 'nvc',
    supplier_id: 'ncc-2',
    total_value: '421740000',
    supplier: { name: 'Thép Đại Phát' },
    request: { title: 'Thép hình H200' },
  };
});

describe('Lập đề nghị thanh toán từ đơn đặt hàng', () => {
  it('điền sẵn nội dung, số tiền, nhà cung cấp và lưu kèm mã đơn hàng', async () => {
    const user = userEvent.setup();
    renderWithApp(<PaymentRequestCreatePage />, {
      route: '/kt/de-nghi-thanh-toan/tao-moi?don-hang=don-1',
    });

    expect(screen.getByText(/không cộng vào chi phí thực tế lần/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Thanh toán đơn hàng NVC-DH-2026-0001/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('421.740.000')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('dd/mm/yyyy'), '15102026');
    await user.click(screen.getByRole('button', { name: 'Lưu và phân bổ chi phí' }));

    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({
      purchaseOrderId: 'don-1',
      companyId: 'nvc',
      requestType: 'thanh_toan',
      supplierId: 'ncc-2',
      originModule: 'MH',
      amount: '421740000',
    });
  });

  it('lập tay khi đang xem gộp thì phải chọn pháp nhân trước', () => {
    renderWithApp(<PaymentRequestCreatePage />, { route: '/kt/de-nghi-thanh-toan/tao-moi' });
    expect(screen.getByText('Chọn pháp nhân trước khi lập đề nghị')).toBeInTheDocument();
  });
});
