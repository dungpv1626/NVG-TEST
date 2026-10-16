import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExecTile } from '@/hooks/use-exec-overview';

const tile = (t: Partial<ExecTile> & Pick<ExecTile, 'key' | 'level' | 'label'>): ExecTile => ({
  area: 'Mảng',
  total: 0,
  amount: null,
  link: null,
  note: null,
  items: [],
  ...t,
});

vi.mock('@/hooks/use-exec-overview', () => ({
  useExecOverview: () => ({
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    data: [
      tile({ key: 'ok1', level: 'ok', label: 'Giàn giáo quá hạn trả' }),
      tile({ key: 'amber1', level: 'amber', label: 'Phê duyệt đang chờ', total: 2 }),
      tile({
        key: 'red1',
        level: 'red',
        label: 'Công trình trễ tiến độ',
        total: 1,
        link: '/tc/cong-trinh?trang-thai=overdue',
        items: [
          {
            code: 'CT-01',
            title: 'Nhà xưởng A',
            detail: 'Kế hoạch xong 01/10/2026',
            link: '/tc/cong-trinh/1',
          },
        ],
      }),
      tile({ key: 'nodata', level: 'no_data', label: 'Giấy tờ nhân sự', total: null }),
    ],
  }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { fullName: 'Bùi Văn Thi' } }) }));
vi.mock('@/pages/bc/finance-overview', () => ({ FinanceOverviewSection: () => null }));

const { ExecOverviewPage } = await import('../tong-quan');

describe('Tổng quan điều hành', () => {
  it('việc có vấn đề lên trước, mức nói bằng chữ, việc ổn gom xuống cuối', () => {
    render(
      <MemoryRouter>
        <ExecOverviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/có 1 mảng cần xử lý ngay/)).toBeTruthy();

    const urgent = screen.getByRole('region', { name: 'Cần xử lý' });
    const titles = within(urgent)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['Công trình trễ tiến độ', 'Phê duyệt đang chờ']);
    expect(within(urgent).getByText('Có vấn đề')).toBeTruthy();
    expect(within(urgent).getByText('Cần chú ý')).toBeTruthy();
    expect(
      within(urgent)
        .getByRole('link', { name: /Nhà xưởng A/ })
        .getAttribute('href'),
    ).toBe('/tc/cong-trinh/1');

    const calm = screen.getByRole('region', { name: 'Đang ổn' });
    expect(within(calm).getByText('Giàn giáo quá hạn trả')).toBeTruthy();
    expect(within(calm).getByText('Chưa đủ dữ liệu')).toBeTruthy();
  });
});
