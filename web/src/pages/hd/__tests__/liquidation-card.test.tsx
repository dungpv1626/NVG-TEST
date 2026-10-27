/**
 * Khối «Biên bản thanh lý» (0229): ai soạn được, ai chỉ xem, và hợp đồng NVG đi thuê / mua thì không mời soạn từ mẫu
 * (mẫu NVG viết cho bên nhận thầu — in vào sẽ sai vai hai bên).
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '@/test/render';
import type { ContractDetailRecord } from '@/hooks/use-contracts';

let docs: unknown[] = [];
vi.mock('@/hooks/use-contract-annex', () => ({ useAnnexDocuments: () => ({ data: docs }) }));
vi.mock('../annex-composer', () => ({ AnnexComposer: () => null }));

const { LiquidationCard } = await import('../liquidation-card');

const contract = (type: string) => ({ id: 'hd-1', type }) as unknown as ContractDetailRecord;

describe('LiquidationCard', () => {
  it('người được soạn, hợp đồng NVG nhận việc, chưa có bản: mời soạn', () => {
    docs = [];
    renderWithApp(<LiquidationCard contract={contract('thi_cong')} canManage />);
    expect(screen.getByRole('button', { name: 'Soạn biên bản thanh lý' })).toBeInTheDocument();
  });

  it('hợp đồng NVG đi thuê / mua: không mời soạn từ mẫu, nói rõ soạn trong Word', () => {
    docs = [];
    renderWithApp(<LiquidationCard contract={contract('khoan_thau_phu')} canManage />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/soạn trong Word/)).toBeInTheDocument();
  });

  it('người không có quyền: chưa có bản thì ẩn, có bản thì chỉ xem', () => {
    docs = [];
    const { container, unmount } = renderWithApp(
      <LiquidationCard contract={contract('thi_cong')} canManage={false} />,
    );
    expect(container.querySelector('section')).toBeNull();
    unmount();
    docs = [{ kind: 'thanh_ly', version: 1, created_at: '2026-10-27T03:00:00Z', creator: null }];
    renderWithApp(<LiquidationCard contract={contract('thi_cong')} canManage={false} />);
    expect(screen.getByRole('button', { name: 'Xem biên bản thanh lý' })).toBeInTheDocument();
  });
});
