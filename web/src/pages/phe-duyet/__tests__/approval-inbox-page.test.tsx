/**
 * Trang Phê duyệt v2 — ba ô «Chờ tôi duyệt · Tôi đã gửi · Đã xử lý» (0221) và đường dẫn tới
 * đúng một hồ sơ (`/viec-can-lam/:id`).
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithApp } from '@/test/render';

const pendingRow = {
  id: 'a1',
  subject: 'quote_price',
  entity_type: 'quotes',
  entity_id: 'q1',
  entity_code: 'BG-1',
  title: 'Báo giá nhà xưởng A',
  amount: '100000000',
  reason: null,
  requested_at: '2026-10-20T02:00:00Z',
  requested_by_name: 'Nguyễn Văn A',
  company_code: 'NVC',
  company_name: 'Nhà Việt Cons',
  parent_id: 'o1',
  parent_module: null,
  due_at: null,
};

vi.mock('@/hooks/use-approvals', () => ({
  usePendingApprovals: () => ({ data: [pendingRow], isLoading: false }),
  useDecideApproval: () => ({ mutateAsync: vi.fn() }),
  useApprovalWaitingOn: () => ({ data: null }),
  useNudgeApproval: () => ({ mutate: vi.fn(), isPending: false }),
  useApprovalBox: (box: string) => ({
    data:
      box === 'sent'
        ? [
            {
              ...pendingRow,
              id: 's1',
              title: 'Hợp đồng tôi gửi',
              status: 'completed',
              final_decision: 'approved',
              my_decision: null,
              decided_at: null,
            },
          ]
        : [],
    isLoading: false,
  }),
}));
vi.mock('@/lib/auth', () => ({ useCan: () => true }));

const { ApprovalInboxPage } = await import('../approval-inbox-page');

function page(route: string) {
  return renderWithApp(
    <Routes>
      <Route path="/viec-can-lam" element={<ApprovalInboxPage />} />
      <Route path="/viec-can-lam/:id" element={<ApprovalInboxPage />} />
    </Routes>,
    { route },
  );
}

describe('Trang Phê duyệt v2', () => {
  it('ba ô, ô mặc định là Chờ tôi duyệt kèm số hồ sơ', () => {
    page('/viec-can-lam');
    expect(screen.getByRole('tab', { name: /Chờ tôi duyệt/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Chờ tôi duyệt/ })).toHaveTextContent('1');
    expect(screen.getByRole('tab', { name: 'Tôi đã gửi' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Đã xử lý' })).toBeInTheDocument();
  });

  it('ô Tôi đã gửi liệt kê hồ sơ mình gửi kèm kết quả bằng chữ', () => {
    page('/viec-can-lam?o=toi-da-gui');
    expect(screen.getByRole('list', { name: 'Hồ sơ tôi đã gửi' })).toHaveTextContent(
      'Hợp đồng tôi gửi',
    );
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
  });

  it('ô Đã xử lý trống thì nói rõ, không để trang trắng', () => {
    page('/viec-can-lam?o=da-xu-ly');
    expect(screen.getByText('Chưa ra quyết định nào trong 90 ngày qua.')).toBeInTheDocument();
  });
});
