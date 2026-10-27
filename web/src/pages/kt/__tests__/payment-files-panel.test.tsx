/**
 * «Chứng từ đính kèm» của đề nghị thanh toán (0228): ba chế độ theo bước — Nháp thêm / gỡ mọi loại, đã duyệt chỉ thêm
 * chứng từ chi, còn lại chỉ xem (không hiện nút rồi báo lỗi — CLAUDE.md 5.4).
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '@/test/render';

vi.mock('@/hooks/use-payment-files', async (original) => {
  const actual = await original<typeof import('@/hooks/use-payment-files')>();
  return {
    ...actual,
    usePaymentFiles: () => ({
      isLoading: false,
      data: [
        {
          id: 'f1',
          storage_path: 'dn/1-hoa-don.pdf',
          kind: 'hoa_don',
          file_name: 'hoa-don-VAT.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1000,
          created_at: '2026-10-27T03:00:00Z',
          creator: { full_name: 'Kế toán A' },
        },
      ],
    }),
    useUploadPaymentFiles: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useDeletePaymentFile: () => ({ isPending: false, mutate: vi.fn() }),
  };
});

const { PaymentFilesPanel } = await import('../payment-files-panel');

describe('PaymentFilesPanel', () => {
  it('Nháp: chọn loại, quét, tải tệp, gỡ được', () => {
    renderWithApp(<PaymentFilesPanel requestId="dn" requestCode="NVC-DNTT-1" mode="draft" />);
    expect(screen.getByRole('combobox', { name: 'Loại chứng từ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quét chứng từ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gỡ hoa-don-VAT.pdf' })).toBeInTheDocument();
    expect(screen.getByText(/Hóa đơn · Kế toán A/)).toBeInTheDocument();
  });

  it('đã duyệt: chỉ thêm chứng từ chi, không gỡ, không chọn loại khác', () => {
    renderWithApp(<PaymentFilesPanel requestId="dn" requestCode="NVC-DNTT-1" mode="paid" />);
    expect(screen.getByRole('button', { name: /Quét chứng từ chi/ })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Loại chứng từ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gỡ / })).not.toBeInTheDocument();
  });

  it('chỉ xem: không có nút thêm / gỡ, vẫn mở được tệp', () => {
    renderWithApp(<PaymentFilesPanel requestId="dn" requestCode="NVC-DNTT-1" mode="view" />);
    expect(screen.queryByRole('button', { name: /Quét/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tải tệp lên/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hoa-don-VAT.pdf' })).toBeInTheDocument();
  });
});
