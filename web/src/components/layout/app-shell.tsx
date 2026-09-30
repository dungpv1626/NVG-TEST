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
 * Trên điện thoại (Webapp Flow 4.8): sidebar ẩn hẳn, điều hướng chuyển xuống thanh dưới —
 * KHÔNG thu nhỏ bố cục máy tính. Trạng thái kết nối và lời mời cài đặt ứng dụng luôn hiển
 * thị ở khung này, không nằm trong từng màn hình.
 */

import { Suspense, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { CardGridSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { TkThemeProvider, useTkTheme } from '@/pages/tk/tk-theme';
import { Breadcrumb, type Crumb } from './breadcrumb';
import { SectionHelp } from '@/components/ui/section-help';
import type { SectionGuide } from '@/lib/help-texts';
import { BottomNav } from './bottom-nav';
import { OfflineBar, PwaPrompts } from './pwa-status';
import { Sidebar } from './sidebar';
import { useTkScope } from './tk-chrome';
import { TopBar } from './top-bar';

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  /**
   * `'hero'` dùng cỡ chữ lớn hơn của bản demo "dashboard soft light style" (26px/800) — CHỈ
   * Dashboard dùng, mọi trang khác giữ nguyên `'default'` (20px/600) để không đổi bố cục hàng
   * loạt trang chưa nằm trong phạm vi restyle đợt này.
   */
  size?: 'default' | 'hero';
  /**
   * Hướng dẫn ngắn cho CẢ màn hình — nút «Hướng dẫn» cạnh hàng nút hành động, tự mở một lần ở
   * lần đầu vào (xem `SectionHelp`). Nội dung gom ở `@/lib/help-texts`.
   */
  help?: SectionGuide & { autoOpenKey?: string };
}

/**
 * Tiêu đề trang — lớp định vị thứ ba cùng với menu tô đậm và breadcrumb (Webapp Flow 6.2).
 * Quy tắc đặt tiêu đề: Content Guidelines 4.8.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
  size = 'default',
  help,
}: PageHeaderProps) {
  return (
    <div className="mb-4 space-y-2 lg:mb-6">
      {breadcrumbs.length > 0 && <Breadcrumb items={breadcrumbs} />}
      {/* Trên điện thoại nút hành động xuống hàng dưới tiêu đề thay vì chen cạnh nó —
          chen ngang thì tiêu đề bị bóp còn hai chữ. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1
            className={cn(
              'text-pretty',
              size === 'hero'
                ? 'text-(length:--text-page-title) leading-(--text-page-title--line-height) font-extrabold tracking-tight'
                : 'text-xl font-semibold',
            )}
          >
            {title}
          </h1>
          {description && <p className="mt-1 text-fg-subtle">{description}</p>}
        </div>
        {(actions || help) && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {help && <SectionHelp {...help} triggerLabel="Hướng dẫn" />}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  // Trạng thái sáng/tối của Module Thiết kế sống ở KHUNG chứ không trong trang, vì thanh
  // trái và thanh trên cũng đổi màu theo nó — để trong trang thì nút bấm ở một cây React
  // còn thứ phải đổi màu lại ở cây khác.
  return (
    <TkThemeProvider>
      <ShellBody />
    </TkThemeProvider>
  );
}

function ShellBody() {
  const tk = useTkScope();
  const { theme } = useTkTheme();

  return (
    // `100dvh` chứ không `100vh`: trên trình duyệt di động, `100vh` tính cả phần thanh địa
    // chỉ tự ẩn/hiện, nên đáy màn hình bị đẩy xuống dưới vùng nhìn thấy và thanh điều hướng
    // dưới nằm ngoài màn hình.
    //
    // `data-tk-theme` chỉ có mặt trong `/tk/*`. Nó đè bộ token chung (`--color-surface`,
    // `--color-fg`, `--color-border`…) nên cả khung đổi theo mà không phải viết class có điều
    // kiện ở từng thành phần — ra module khác thuộc tính biến mất và mọi thứ trở lại như cũ.
    //
    // Trong phạm vi Thiết kế thì bỏ khe hở và bo góc của bố cục "panel nổi": bản mẫu §5.1 xếp
    // ba vùng sát nhau, phân cách bằng đúng một đường viền.
    <div
      data-tk-theme={tk ? theme : undefined}
      className={cn(
        // `text-fg` phải khai Ở ĐÂY, không thể dựa vào `body`. `body` nằm NGOÀI phạm vi
        // `data-tk-theme`, nên `color: var(--color-fg)` của nó đã tính ra màu chữ của chế độ
        // SÁNG trước khi vào tới đây; mọi thành phần không tự đặt màu sẽ kế thừa màu đó và
        // biến mất trên nền tối (thấy tận mắt: tên người dùng ở thanh trên, 06/09/2026).
        'flex h-[100dvh] overflow-hidden bg-surface-sunken text-fg',
        !tk && 'lg:gap-3 lg:p-3',
      )}
    >
      <Sidebar />
      <div className={cn('flex min-w-0 flex-1 flex-col overflow-hidden', !tk && 'lg:gap-3')}>
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
