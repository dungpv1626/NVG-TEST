/**
 * Thanh tab điện thoại v2 — đúng 4 ô, một ô đang chọn.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithApp } from '@/test/render';

let active: string | null = 'CRM';
vi.mock('@/components/layout/module-nav', async (original) => {
  const actual = await original<typeof import('@/components/layout/module-nav')>();
  return {
    ...actual,
    useVisibleModules: () => ['CRM', 'HD', 'TC'],
    useModuleRoutes: () => actual.MODULE_ROUTES,
    useActiveModule: () => active,
  };
});
vi.mock('@/lib/auth', () => ({ useDefaultRoute: () => '/crm/co-hoi' }));
vi.mock('@/hooks/use-approvals', () => ({ usePendingApprovals: () => ({ data: [{}] }) }));
vi.mock('@/hooks/use-leads', () => ({ useMyFollowups: () => ({ data: [{}, {}] }) }));

const { BottomNav } = await import('../bottom-nav');

describe('Thanh tab điện thoại', () => {
  it('bốn ô: Hôm nay · phân hệ đang mở · Việc cần làm · Thêm', () => {
    renderWithApp(<BottomNav />, { route: '/crm/co-hoi' });
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.querySelectorAll('a, button')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Hôm nay' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Khách hàng' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Việc cần làm/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeInTheDocument();
  });

  it('trang đầu nằm trong phân hệ thì ô phân hệ sáng, không phải «Hôm nay»', () => {
    active = 'CRM';
    renderWithApp(<BottomNav />, { route: '/crm/co-hoi' });
    expect(screen.getByRole('link', { name: 'Khách hàng' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Hôm nay' })).not.toHaveAttribute('aria-current');
  });
});
