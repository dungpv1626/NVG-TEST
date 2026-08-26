/**
 * `ModuleGuard` — chốt quyền xem ở tầng ĐƯỜNG DẪN, không phải ở tầng menu.
 *
 * Lỗi đã có thật: quyền xem phân hệ chỉ được dùng để dựng thanh bên. Kế toán không thấy mục
 * Kho trên menu, nhưng gõ thẳng `/kho/ton-kho` thì màn hình mở ra đầy đủ. Dữ liệu không rò rỉ
 * vì RLS chặn ở CSDL — nhưng danh sách trả về rỗng, và màn hình nói "chưa có dòng tồn nào".
 * Kho trống và kho không được xem trông giống hệt nhau mà dẫn tới hai quyết định trái ngược.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { ModuleGuard } from '../module-guard';
import { renderWithApp } from '@/test/render';

const auth = vi.hoisted(() => ({
  permissions: [] as { moduleCode: string; canView: boolean }[],
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ profile: { permissions: auth.permissions } }),
}));

function renderGuardedKho() {
  return renderWithApp(
    <Routes>
      <Route element={<ModuleGuard module="KHO" />}>
        <Route path="/kho/ton-kho" element={<p>Sổ kho chỉ đổi qua phiếu</p>} />
      </Route>
    </Routes>,
    { route: '/kho/ton-kho' },
  );
}

describe('ModuleGuard', () => {
  it('có quyền xem thì màn hình hiện bình thường', () => {
    auth.permissions = [{ moduleCode: 'KHO', canView: true }];
    renderGuardedKho();
    expect(screen.getByText('Sổ kho chỉ đổi qua phiếu')).toBeInTheDocument();
  });

  it('gõ thẳng đường dẫn của phân hệ không có quyền thì KHÔNG mở được màn hình', () => {
    auth.permissions = [{ moduleCode: 'KT', canView: true }];
    renderGuardedKho();
    expect(screen.queryByText('Sổ kho chỉ đổi qua phiếu')).not.toBeInTheDocument();
  });

  it('nói đúng lý do là thiếu quyền, KHÔNG để hiểu nhầm thành "chưa có dữ liệu"', () => {
    auth.permissions = [{ moduleCode: 'KT', canView: true }];
    renderGuardedKho();

    expect(screen.getByText(/chưa có quyền xem phân hệ Kho/i)).toBeInTheDocument();
    // Đây là chỗ dễ sai nhất: thông điệp tuyệt đối không được nói kiểu "chưa có dữ liệu".
    expect(screen.queryByText(/chưa có .*nào/i)).not.toBeInTheDocument();
  });

  it('luôn có lối ra, không để người dùng mắc kẹt ở màn hình bị chặn', () => {
    auth.permissions = [];
    renderGuardedKho();
    expect(screen.getByRole('button', { name: /quay lại/i })).toBeInTheDocument();
  });

  it('quyền của phân hệ khác không mở nhầm phân hệ này', () => {
    auth.permissions = [{ moduleCode: 'MH', canView: true }];
    renderGuardedKho();
    expect(screen.queryByText('Sổ kho chỉ đổi qua phiếu')).not.toBeInTheDocument();
  });

  it('có mặt trong danh sách quyền nhưng canView=false vẫn bị chặn', () => {
    auth.permissions = [{ moduleCode: 'KHO', canView: false }];
    renderGuardedKho();
    expect(screen.queryByText('Sổ kho chỉ đổi qua phiếu')).not.toBeInTheDocument();
  });
});
