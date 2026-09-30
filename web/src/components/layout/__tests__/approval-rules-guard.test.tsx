/**
 * Tổng Giám đốc tự sửa hạn mức và thời hạn (0141, Haan 30/09/2026: «chỉ TGĐ»).
 *
 * Canh phía giao diện: TGĐ vào được đúng hai màn hình và thanh Quản trị chỉ hiện hai tab đó;
 * vai trò khác (Giám đốc Tài chính) bị chặn với câu nói rõ; Quản trị viên thấy đủ các tab.
 * Chính sách CSDL canh ở `db/src/__tests__/nen-quyen-tgd.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithApp } from '@/test/render';

const state = vi.hoisted(() => ({
  roleCode: 'TGD',
  permissions: [] as { moduleCode: string; canView: boolean }[],
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: {
      id: 'u1',
      fullName: 'Người dùng',
      assignments: [{ roleCode: state.roleCode, companyId: 'nvc', companyCode: 'NVC' }],
      permissions: state.permissions,
    },
  }),
  useCan: () => false,
}));

const { ApprovalRulesGuard } = await import('../module-guard');
const { NenNav } = await import('@/pages/nen/nen-nav');
const { useVisibleModules, useModuleRoutes } = await import('../module-nav');

function Probe() {
  const visible = useVisibleModules();
  const routes = useModuleRoutes();
  return <p>{visible.includes('NEN') ? `NEN → ${routes.NEN}` : 'không có NEN'}</p>;
}

function renderAt(route: string) {
  return renderWithApp(
    <Routes>
      <Route element={<ApprovalRulesGuard />}>
        <Route path="/nen/han-muc" element={<NenNav />} />
      </Route>
      <Route path="/probe" element={<Probe />} />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  state.roleCode = 'TGD';
  state.permissions = [];
});

describe('Hạn mức và thời hạn cho Tổng Giám đốc', () => {
  it('TGĐ vào được, thanh Quản trị chỉ có Hạn mức và Thời hạn', () => {
    renderAt('/nen/han-muc');
    const nav = screen.getByRole('navigation', { name: 'Màn hình trong phân hệ' });
    expect(nav).toHaveTextContent('Hạn mức phê duyệt');
    expect(nav).toHaveTextContent('Thời hạn xử lý');
    expect(nav).not.toHaveTextContent('Người dùng');
    expect(nav).not.toHaveTextContent('Tham số hệ thống');
  });

  it('TGĐ thấy mục Quản trị trên thanh bên, dẫn thẳng vào Hạn mức', () => {
    renderAt('/probe');
    expect(screen.getByText('NEN → /nen/han-muc')).toBeInTheDocument();
  });

  it('Giám đốc Tài chính bị chặn và không thấy mục Quản trị', () => {
    state.roleCode = 'CFO';
    renderAt('/nen/han-muc');
    expect(screen.getByText(/Không mở được phân hệ/)).toBeInTheDocument();
    renderAt('/probe');
    expect(screen.getByText('không có NEN')).toBeInTheDocument();
  });

  it('Quản trị viên thấy đủ các tab và vào trang đầu mặc định', () => {
    state.roleCode = 'ADMIN';
    state.permissions = [{ moduleCode: 'NEN', canView: true }];
    renderAt('/nen/han-muc');
    expect(screen.getByRole('navigation', { name: 'Màn hình trong phân hệ' })).toHaveTextContent(
      'Người dùng',
    );
  });
});
