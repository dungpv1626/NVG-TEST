/**
 * Danh sách AI Design dạng thẻ (07/10/2026). Canh: thẻ trỏ đúng trang AI Design, trạng thái bốn
 * bước nói bằng CHỮ, ô tìm lọc được, và rỗng thì nói ra chứ không để trắng.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

const REF = `sha256:${'a'.repeat(64)}`;

vi.mock('@/hooks/use-ai-design', () => ({
  useAiDesignState: (id: string) => ({
    isLoading: false,
    data:
      id === 'p1'
        ? {
            briefArtifactId: REF,
            plans: [{ artifactId: REF, createdAt: '2026-10-01T00:00:00Z' }],
            planHeadArtifactId: REF,
            facadeArtifactId: null,
            imageSetArtifactId: null,
          }
        : undefined,
  }),
  useAiPlanSheet: (_p: string, artifactId: string | null) => ({
    url: artifactId ? 'blob:sheet' : null,
    loading: false,
  }),
}));
vi.mock('@/hooks/use-companies', () => ({ useCompanyLookup: () => () => null }));
vi.mock('@/lib/company-scope', () => ({ useCompanyScope: () => ({ isAggregate: false }) }));

const { AiDesignCards } = await import('../ai-design-cards');

const ROWS = [
  {
    id: 'p1',
    code: 'NVO-TK-2026-0001',
    title: 'Nhà ống Hoàng Mai',
    responsiblePerson: 'Phạm Thị D',
    status: 'in_progress' as const,
    deadline: null,
    companyId: 'c1',
    customerName: null,
  },
  {
    id: 'p2',
    code: 'NVO-TK-2026-0002',
    title: 'Biệt thự nhà vườn',
    responsiblePerson: null,
    status: 'draft' as const,
    deadline: null,
    companyId: 'c1',
    customerName: 'Anh Bình',
  },
];

function show(rows = ROWS) {
  renderWithApp(<AiDesignCards rows={rows} isLoading={false} error={null} onRetry={vi.fn()} />);
}

describe('Danh sách AI Design dạng thẻ', () => {
  it('mỗi thẻ mở trang AI Design của hồ sơ, có ảnh mặt bằng hiệu lực', () => {
    show();
    const card = screen.getByRole('link', { name: /Nhà ống Hoàng Mai/ });
    expect(card).toHaveAttribute('href', '/tk/ai-design/p1');
    expect(
      screen.getByRole('img', { name: /Mặt bằng tầng 1 của Nhà ống Hoàng Mai/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chưa có mặt bằng')).toBeInTheDocument();
  });

  it('trạng thái bước bằng chữ, kể cả số phương án', () => {
    show();
    expect(screen.getByText('Mặt bằng (1)')).toBeInTheDocument();
    expect(screen.getAllByText(/— chưa có/).length).toBeGreaterThan(0);
  });

  it('ô tìm lọc theo tên, mã, khách hàng; không khớp thì nói ra', async () => {
    show();
    await userEvent.type(screen.getByRole('searchbox'), 'Anh Bình');
    expect(screen.queryByText('Nhà ống Hoàng Mai')).toBeNull();
    expect(screen.getByText('Biệt thự nhà vườn')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'không có');
    expect(screen.getByText(/Không có hồ sơ nào khớp từ khoá/)).toBeInTheDocument();
  });
});
