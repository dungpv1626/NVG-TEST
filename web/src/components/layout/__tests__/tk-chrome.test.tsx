/**
 * Vỏ riêng của Module Thiết kế — thanh trái tối, thanh trên 60px.
 *
 * Haan chốt 06/09/2026: vỏ này (thanh 60px, không khe hở) **chỉ hiện trong `/tk/*`**. Chế độ
 * sáng/tối đã gỡ khỏi toàn ứng dụng (doc/MOC_CAI_TIEN_UX.md, vấn đề 2) — chỉ còn một bảng màu.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithApp } from '@/test/render';

vi.mock('@/components/layout/company-switcher', () => ({
  CompanySwitcher: () => <div>Bộ chọn pháp nhân</div>,
}));
vi.mock('@/components/layout/module-nav', async (original) => {
  const actual = await original<typeof import('@/components/layout/module-nav')>();
  const MODULE_ROUTES_FOR_TEST = actual.MODULE_ROUTES;
  return {
    ...actual,
    useVisibleModules: () => ['BC', 'TK'],
    useModuleRoutes: () => MODULE_ROUTES_FOR_TEST,
    useActiveModule: () => 'TK',
    useShowExecOverview: () => false,
  };
});
// Thanh trạng thái kết nối gọi `virtual:pwa-register/react` — module ảo của Vite, không có
// trong môi trường kiểm thử và cũng không liên quan gì tới phạm vi vỏ.
vi.mock('@/components/layout/pwa-status', () => ({
  OfflineBar: () => null,
  PwaPrompts: () => null,
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { fullName: 'Đỗ Văn K', jobTitle: 'Kiến trúc sư', assignments: [] },
    signOut: vi.fn(),
  }),
  useDefaultRoute: () => '/dashboard',
}));
vi.mock('@/hooks/use-approvals', () => ({ usePendingApprovals: () => ({ data: [] }) }));
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({ data: [] }),
  useUnreadNotificationCount: () => ({ data: 0 }),
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn() }),
}));

const { AppShell } = await import('../app-shell');

function shell(route: string) {
  return renderWithApp(<AppShell />, { route });
}

describe('Vỏ riêng của Module Thiết kế', () => {
  beforeEach(() => window.localStorage.clear());

  it('không còn nút sáng/tối, kể cả khi máy còn lưu lựa chọn tối cũ', () => {
    window.localStorage.setItem('nvg.tk.theme', 'toi');
    const { container } = shell('/tk/du-an/p1');
    expect(screen.queryByRole('radiogroup', { name: 'Chế độ hiển thị' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-tk-theme]')).toBeNull();
    expect(document.documentElement).not.toHaveAttribute('data-tk-theme');
  });

  it('chip nhắc phím tắt chỉ hiện trong Thiết kế, nhưng Ctrl+K chạy ở mọi nơi', async () => {
    const outside = shell('/crm/khach-hang');
    expect(screen.queryByText('Ctrl K')).not.toBeInTheDocument();
    // Phím tắt là hành vi, không phải màu sắc — một phím chỉ chạy ở một module là thứ người
    // dùng không đoán được, nên nó gắn cho mọi module.
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByPlaceholderText('Tìm hồ sơ, khách hàng, vật tư…')).toHaveFocus();
    outside.unmount();

    shell('/tk/du-an/p1');
    expect(screen.getByText('Ctrl K')).toBeInTheDocument();
  });
});
