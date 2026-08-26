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
 *
 * Trên điện thoại (Webapp Flow 4.7): sidebar ẩn hẳn, điều hướng chuyển xuống thanh dưới —
 * KHÔNG thu nhỏ bố cục máy tính. Trạng thái kết nối và lời mời cài đặt ứng dụng luôn hiển
 * thị ở khung này, không nằm trong từng màn hình.
 */

import { Suspense, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { CardGridSkeleton } from '@/components/ui/states';
import { Breadcrumb, type Crumb } from './breadcrumb';
import { BottomNav } from './bottom-nav';
import { OfflineBar, PwaPrompts } from './pwa-status';
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
    <div className="mb-4 space-y-2 lg:mb-6">
      {breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      {/* Trên điện thoại nút hành động xuống hàng dưới tiêu đề thay vì chen cạnh nó —
          chen ngang thì tiêu đề bị bóp còn hai chữ. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-fg-subtle">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    // `100dvh` chứ không `100vh`: trên trình duyệt di động, `100vh` tính cả phần thanh địa
    // chỉ tự ẩn/hiện, nên đáy màn hình bị đẩy xuống dưới vùng nhìn thấy và thanh điều hướng
    // dưới nằm ngoài màn hình.
    <div className="flex h-[100dvh] overflow-hidden bg-surface-sunken">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <OfflineBar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {/* Màn hình tải theo nhu cầu — trong lúc tải gói, hiện khung xám đúng hình dạng
              nội dung chứ không phải vòng xoay toàn màn hình (Webapp Flow 6.7). Khung
              ứng dụng và thanh điều hướng vẫn đứng yên. */}
          <Suspense fallback={<CardGridSkeleton count={3} />}>
            <Outlet />
          </Suspense>
        </main>
        <BottomNav />
      </div>
      <PwaPrompts />
    </div>
  );
}
