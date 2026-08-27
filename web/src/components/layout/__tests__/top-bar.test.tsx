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
  notifications: [] as unknown[],
  unreadCount: 0,
}));

const markReadMock = vi.hoisted(() => vi.fn());
const markAllReadMock = vi.hoisted(() => vi.fn());

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
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ data: state.notifications }),
  useUnreadNotificationCount: () => ({ data: state.unreadCount }),
  useMarkNotificationRead: () => ({ mutate: markReadMock }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllReadMock }),
}));

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

describe('Top Bar — Trung tâm Thông báo', () => {
  it('không có thông báo nào thì nói rõ, không phải bảng trống im lặng', async () => {
    state.notifications = [];
    state.unreadCount = 0;
    renderWithApp(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: 'Thông báo' }));
    expect(screen.getByText('Chưa có thông báo nào.')).toBeInTheDocument();
  });

  it('huy hiệu đếm THEO TỔNG SỐ chưa đọc thật (`useUnreadNotificationCount`), không chỉ đếm trên 30 dòng đang hiện', async () => {
    // Cố ý đặt số chưa đọc THẬT lớn hơn số dòng nạp trong panel — mô phỏng đúng tình huống dữ
    // liệu thử đã gặp: một tài khoản có 2000+ thông báo chưa đọc nhưng panel chỉ nạp 30 dòng.
    state.notifications = [
      {
        id: 'n1',
        type: 'handed_over',
        message: 'Đã bàn giao hồ sơ A',
        actionUrl: '/a',
        readAt: null,
        createdAt: '2026-08-20T08:00:00Z',
      },
    ];
    state.unreadCount = 247;
    renderWithApp(<TopBar />);
    expect(screen.getByRole('button', { name: /Thông báo — 247 chưa đọc/ })).toBeInTheDocument();
  });

  it('bấm một thông báo CHƯA đọc thì đánh dấu đã đọc và điều hướng tới action_url', async () => {
    state.notifications = [
      {
        id: 'n1',
        type: 'handed_over',
        message: 'Đã bàn giao hồ sơ A',
        actionUrl: '/crm/co-hoi/a',
        readAt: null,
        createdAt: '2026-08-20T08:00:00Z',
      },
    ];
    state.unreadCount = 1;
    markReadMock.mockClear();
    const result = renderWithApp(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: /Thông báo/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Đã bàn giao hồ sơ A/ }));

    expect(markReadMock).toHaveBeenCalledWith('n1');
    expect(result.getByTestId('duong-dan-hien-tai').textContent).toBe('/crm/co-hoi/a');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('"Đánh dấu tất cả đã đọc" gọi mutation KHÔNG kèm tham số — đánh dấu TOÀN BỘ, không chỉ 30 dòng đang hiện', async () => {
    state.notifications = [
      {
        id: 'n1',
        type: 'handed_over',
        message: 'Đã bàn giao hồ sơ A',
        actionUrl: '/a',
        readAt: null,
        createdAt: '2026-08-20T08:00:00Z',
      },
    ];
    state.unreadCount = 247;
    markAllReadMock.mockClear();
    renderWithApp(<TopBar />);
    await userEvent.click(screen.getByRole('button', { name: /Thông báo/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));

    expect(markAllReadMock).toHaveBeenCalledWith();
  });
});
