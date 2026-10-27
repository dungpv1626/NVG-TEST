/**
 * «Các lần chuyển bước» — tab Lịch sử của hợp đồng / gói thầu / công trình (0225).
 *
 * Canh điều người dùng đọc: tên BƯỚC cả hai đầu (không phải nhãn trạng thái), ai đổi, lý do; dòng tạo hồ sơ; và hồ sơ cũ
 * chưa có dòng nào thì nói rõ vì sao thay vì một khối trống.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { CONTRACT_STAGE_META } from '@nvg/shared';
import { renderWithApp } from '@/test/render';
import { StageHistory } from '../stage-history';

const state: { rows: unknown[]; filters: [string, unknown][] } = { rows: [], filters: [] };

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'order']) builder[m] = () => builder;
  builder.eq = (col: string, value: unknown) => {
    state.filters.push([col, value]);
    return builder;
  };
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: state.rows, error: null }).then(resolve);
  return { supabase: { from: () => builder } };
});

describe('StageHistory', () => {
  it('hiện bước cũ → bước mới, người đổi, lý do; lọc đúng loại hồ sơ và mã', async () => {
    state.filters = [];
    state.rows = [
      {
        id: '2',
        from_stage: 'nhap',
        to_stage: 'huy',
        note: 'Khách đổi ý',
        changed_at: '2026-10-27T03:00:00Z',
        changed_by_user: { full_name: 'Nguyễn Văn A' },
      },
      {
        id: '1',
        from_stage: null,
        to_stage: 'nhap',
        note: null,
        changed_at: '2026-10-27T02:00:00Z',
        changed_by_user: null,
      },
    ];
    renderWithApp(
      <StageHistory
        entityType="contracts"
        entityId="hd-1"
        stage="huy"
        meta={CONTRACT_STAGE_META}
        negativeStages={['huy']}
      />,
    );
    expect(await screen.findByText('Khách đổi ý')).toBeInTheDocument();
    expect(screen.getByText(/Nguyễn Văn A/)).toBeInTheDocument();
    expect(screen.getByText(CONTRACT_STAGE_META.huy.label)).toBeInTheDocument();
    expect(screen.getByText('Tạo hồ sơ ở bước')).toBeInTheDocument();
    expect(screen.getByText(/Hệ thống/)).toBeInTheDocument();
    expect(state.filters).toEqual([
      ['entity_type', 'contracts'],
      ['entity_id', 'hd-1'],
    ]);
  });

  it('chưa có dòng nào thì nói rõ lịch sử ghi từ khi nào', async () => {
    state.rows = [];
    renderWithApp(
      <StageHistory
        entityType="contracts"
        entityId="hd-2"
        stage="nhap"
        meta={CONTRACT_STAGE_META}
      />,
    );
    expect(await screen.findByText(/Chưa có lần chuyển bước nào được ghi/)).toBeInTheDocument();
  });
});
