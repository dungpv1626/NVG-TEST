/**
 * Vỏ riêng của Module Thiết kế — thanh trái tối, thanh trên 60px, nền tối.
 *
 * Haan chốt 06/09/2026: vỏ này (thanh 60px, không khe hở) **chỉ hiện trong `/tk/*`**. Riêng
 * chế độ sáng/tối thì 07/10/2026 mở ra TOÀN ứng dụng, ba lựa chọn Sáng · Tối · Theo hệ thống,
 * mặc định theo hệ thống (`lib/theme.tsx`).
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

  it('mặc định theo hệ thống: hệ điều hành sáng thì bảng màu sáng, ở mọi module', () => {
    const { container } = shell('/crm/khach-hang');
    expect(scope(container)).toHaveAttribute('data-tk-theme', 'sang');
    expect(screen.getByRole('radio', { name: 'Theo hệ thống' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('nút ba ô đổi THẬT thuộc tính điều khiển bảng màu, cả trên <html>', async () => {
    const { container } = shell('/tk/du-an/p1');
    await userEvent.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(scope(container)).toHaveAttribute('data-tk-theme', 'toi');
    // Hộp thoại và menu thả xuống dựng ở `document.body`, ngoài khung — chúng đọc từ `<html>`.
    expect(document.documentElement).toHaveAttribute('data-tk-theme', 'toi');
    await userEvent.click(screen.getByRole('radio', { name: 'Sáng' }));
    expect(scope(container)).toHaveAttribute('data-tk-theme', 'sang');
    expect(window.localStorage.getItem('nvg.tk.theme')).toBe('sang');
  });

  it('lựa chọn cũ hai trạng thái vẫn đọc được', () => {
    window.localStorage.setItem('nvg.tk.theme', 'toi');
    const { container } = shell('/crm/khach-hang');
    expect(scope(container)).toHaveAttribute('data-tk-theme', 'toi');
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
