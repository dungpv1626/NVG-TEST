/**
 * Thanh điều hướng thu gọn được.
 *
 * Canh phần dễ hỏng lặng lẽ: ở trạng thái thu, chữ trên màn hình đổi sang nhãn ngắn nhưng
 * **tên đọc được phải giữ nguyên nhãn đầy đủ** — nếu không, người dùng trình đọc màn hình mất
 * hẳn nghĩa của mục mà không có cách nào biết. Và lựa chọn phải sống qua lần tải trang sau,
 * nếu không thì mỗi lần mở lại phần mềm là một lần phải thu tay.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MODULES } from '@nvg/shared';
import { renderWithApp } from '@/test/render';

vi.mock('@/components/layout/company-switcher', () => ({
  CompanySwitcher: ({ compact }: { compact?: boolean }) => (
    <div>{compact ? 'Bộ chọn gọn' : 'Bộ chọn đầy đủ'}</div>
  ),
}));
vi.mock('@/components/layout/module-nav', async (original) => {
  const actual = await original<typeof import('@/components/layout/module-nav')>();
  const MODULE_ROUTES_FOR_TEST = actual.MODULE_ROUTES;
  return {
    ...actual,
    useVisibleModules: () => ['BC', 'CRM', 'TK'],
    useModuleRoutes: () => MODULE_ROUTES_FOR_TEST,
    useActiveModule: () => 'TK',
  };
});

const { Sidebar } = await import('../sidebar');

describe('Thanh điều hướng trái', () => {
  beforeEach(() => window.localStorage.clear());

  it('mặc định mở, hiện nhãn đầy đủ', () => {
    renderWithApp(<Sidebar />);
    expect(screen.getByRole('link', { name: MODULES.CRM.label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('thu gọn thì chữ đổi sang nhãn ngắn nhưng TÊN ĐỌC ĐƯỢC vẫn là nhãn đầy đủ', async () => {
    renderWithApp(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' }));

    // Nhìn thấy: nhãn ngắn.
    expect(screen.getByText(MODULES.CRM.shortLabel)).toBeInTheDocument();
    // Đọc được: vẫn nhãn đầy đủ — đây mới là thứ trình đọc màn hình đọc ra.
    expect(screen.getByRole('link', { name: MODULES.CRM.label })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở rộng thanh điều hướng' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('thu gọn thì bộ chọn pháp nhân chuyển sang dạng gọn, không dựng dạng thứ ba', async () => {
    renderWithApp(<Sidebar />);
    expect(screen.getByText('Bộ chọn đầy đủ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' }));
    expect(screen.getByText('Bộ chọn gọn')).toBeInTheDocument();
  });

  it('lựa chọn sống qua lần tải trang sau', async () => {
    const first = renderWithApp(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' }));
    first.unmount();

    renderWithApp(<Sidebar />);
    expect(screen.getByRole('button', { name: 'Mở rộng thanh điều hướng' })).toBeInTheDocument();
  });

  it('mục đang mở vẫn nhận ra được khi đã thu gọn', async () => {
    renderWithApp(<Sidebar />);
    await userEvent.click(screen.getByRole('button', { name: 'Thu gọn thanh điều hướng' }));
    // `aria-current` là cách DUY NHẤT người dùng bàn phím biết mình đang ở đâu — pill nền mint
    // chỉ nói được điều đó cho người nhìn thấy.
    expect(screen.getByRole('link', { name: MODULES.TK.label })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
