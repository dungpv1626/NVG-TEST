/**
 * Vỏ riêng của Module Thiết kế — thanh trái tối, thanh trên 60px, nền tối.
 *
 * Haan chốt 06/09/2026: vỏ này **chỉ hiện trong `/tk/*`**, ra module khác trở lại vỏ sáng dùng
 * chung. Đó là một quyết định về phạm vi, và phạm vi thì hỏng lặng lẽ: rò ra ngoài thì 11
 * module còn lại đổi màu mà không ai đụng vào chúng; co lại thì Module Thiết kế mất vỏ mà
 * trang vẫn chạy bình thường. Cả hai đều không có lỗi nào để đọc.
 *
 * Khẳng định trên `data-tk-theme` chứ không trên tên lớp: đó là thứ DUY NHẤT quyết định bảng
 * màu (`tk-theme.css` đè token theo đúng thuộc tính này). Nút đổi nhãn mà thuộc tính không đổi
 * thì màn hình giữ nguyên màu và không có gì báo.
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

function scope(container: HTMLElement) {
  return container.querySelector('[data-tk-theme]');
}

describe('Vỏ riêng của Module Thiết kế', () => {
  beforeEach(() => window.localStorage.clear());

  it('trong /tk/* thì bật bảng màu riêng, mặc định là chế độ tối', () => {
    const { container } = shell('/tk/du-an/p1');
    expect(scope(container)).toHaveAttribute('data-tk-theme', 'toi');
  });

  it('ngoài /tk/* thì KHÔNG có bảng màu riêng và cũng không có nút chuyển', () => {
    const { container } = shell('/crm/khach-hang');
    expect(scope(container)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tối' })).not.toBeInTheDocument();
  });

  it('nút chuyển đổi THẬT thuộc tính điều khiển bảng màu', async () => {
    const { container } = shell('/tk/du-an/p1');
    await userEvent.click(screen.getByRole('button', { name: 'Tối' }));
    expect(scope(container)).toHaveAttribute('data-tk-theme', 'sang');
    expect(screen.getByRole('button', { name: 'Sáng' })).toBeInTheDocument();
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
