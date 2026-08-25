/**
 * App Shell — khung giao diện DUY NHẤT cho cả 12 module (Webapp Flow Mục 2.1).
 *
 * "Người dùng không bao giờ thấy một kiểu giao diện khác khi chuyển module, chỉ có vùng
 * nội dung ở giữa thay đổi."
 *
 * 5 vùng cố định:
 *   1. Sidebar (menu chính, trái)
 *   2. Top bar (tìm kiếm, thông báo, việc cần làm, tài khoản)
 *   3. Breadcrumb (đường dẫn phân cấp)
 *   4. Content area (vùng nội dung chính)
 *   5. Panel ngữ cảnh (phải, chỉ ở màn hình Chi tiết) — bổ sung ở Phase 2/4A
 */

import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Breadcrumb, type Crumb } from './breadcrumb';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
}

/**
 * Tiêu đề trang — lớp định vị thứ ba cùng với menu tô đậm và breadcrumb (Webapp Flow 6.2).
 * Quy tắc đặt tiêu đề: Content Guidelines 4.8.
 */
export function PageHeader({ title, description, breadcrumbs = [], actions }: PageHeaderProps) {
  return (
    <div className="mb-6 space-y-2">
      {breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-fg-subtle">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-sunken">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
