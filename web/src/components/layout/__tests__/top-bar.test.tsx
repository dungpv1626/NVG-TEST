/**
 * Ô tìm kiếm toàn hệ thống trên Top Bar (AFD 5.3).
 *
 * Đây từng là một ô trang trí — không có `onChange`, không gọi CSDL, gõ gì cũng không ra kết
 * quả. Test này khẳng định nó THẬT SỰ tìm và điều hướng, không chỉ đứng đó cho đẹp.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';
import { TopBar } from '../top-bar';

const state = vi.hoisted(() => ({
  results: [] as unknown[],
  isFetching: false,
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { fullName: 'Bùi Văn Thi', jobTitle: 'Tổng Giám đốc', assignments: [] },
    signOut: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-approvals', () => ({
  usePendingApprovals: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-search', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-search')>('@/hooks/use-search');
  return {
    ...actual,
    useGlobalSearch: () => ({ data: state.results, isFetching: state.isFetching }),
  };
});

async function typeQuery(text: string) {
  const input = screen.getByPlaceholderText('Tìm hồ sơ, khách hàng, vật tư…');
  await userEvent.type(input, text);
  return input;
}

describe('Top Bar — tìm kiếm toàn hệ thống', () => {
  it('gõ dưới ngưỡng ký tự thì KHÔNG hiện bảng kết quả', async () => {
    state.results = [];
    renderWithApp(<TopBar />);
    await typeQuery('a');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('có kết quả thì gộp theo module, hiện mã và tên đúng', async () => {
    state.results = [
      {
        module_code: 'CRM',
        entity_type: 'opportunity',
        entity_id: 'o1',
        code: 'NVC-CH-001',
        title: 'Nhà xưởng Long An',
        subtitle: 'Khách hàng ABC',
        path: '/crm/co-hoi/o1',
      },
    ];
    renderWithApp(<TopBar />);
    await typeQuery('long an');

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    expect(screen.getByText('Khách hàng & Cơ hội')).toBeInTheDocument();
    expect(screen.getByText('Nhà xưởng Long An')).toBeInTheDocument();
    expect(screen.getByText('NVC-CH-001')).toBeInTheDocument();
  });

  it('không có kết quả thì nói rõ, không phải bảng trống im lặng', async () => {
    state.results = [];
    renderWithApp(<TopBar />);
    await typeQuery('khongtontai');

    await waitFor(() =>
      expect(screen.getByText(/Không tìm thấy hồ sơ nào khớp với/)).toBeInTheDocument(),
    );
  });

  it('bấm một kết quả thì điều hướng tới đúng hồ sơ và đóng bảng', async () => {
    state.results = [
      {
        module_code: 'HD',
        entity_type: 'contract',
        entity_id: 'c1',
        code: 'NVC-HD-009',
        title: 'Hợp đồng thi công nhà xưởng',
        subtitle: null,
        path: '/hd/hop-dong/c1',
      },
    ];
    const result = renderWithApp(<TopBar />);
    await typeQuery('nha xuong');

    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('option', { name: /Hợp đồng thi công nhà xưởng/ }));

    expect(result.getByTestId('duong-dan-hien-tai').textContent).toBe('/hd/hop-dong/c1');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
