/**
 * Top bar — vùng 2 của App Shell (Webapp Flow Mục 2.1 và 2.4).
 *
 * Ba thành phần hoạt động XUYÊN SUỐT mọi module, KHÔNG đổi vị trí khi chuyển module —
 * để người dùng không bao giờ phải nhớ "phải vào module nào để tìm cái này":
 *  1. Tìm kiếm toàn hệ thống
 *  2. Trung tâm Thông báo (thông tin một chiều) và Việc cần làm (cần thao tác) — TÁCH RIÊNG
 *  3. Menu tài khoản
 */

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, CheckSquare, LogOut, Search, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CompanySwitcher } from './company-switcher';

function IconButton({
  label,
  count,
  to,
  children,
}: {
  label: string;
  count?: number;
  /** Có đích đến thì dựng thành liên kết, để mở tab mới và điều hướng bàn phím hoạt động đúng. */
  to?: string;
  children: React.ReactNode;
}) {
  // 40px trên màn hình cảm ứng (Content Guidelines 6.8), 32px trên máy tính có chuột —
  // chuột trỏ chính xác nên không cần vùng bấm lớn, còn ngón tay thì cần.
  const className = cn(
    'relative flex size-10 items-center justify-center rounded-md sm:size-8',
    'text-fg-subtle hover:bg-surface-muted hover:text-fg',
  );

  const badge = (
    <>
      {children}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center',
            'rounded-full bg-status-overdue px-1 text-[10px] font-semibold',
            'text-fg-inverse',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} aria-label={label} title={label} className={className}>
        {badge}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} title={label} className={className}>
      {badge}
    </button>
  );
}

export function TopBar() {
  const { profile, signOut } = useAuth();
  // Dùng CHUNG truy vấn với Hộp thư Phê duyệt: nếu đếm bằng một truy vấn riêng,
  // hai con số sẽ lệch nhau ngay khi điều kiện lọc đổi ở một bên.
  const { data: pending } = usePendingApprovals();
  const pendingCount = pending?.length ?? 0;

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4',
        // Panel nổi bo góc từ lg: trở lên (thay thanh full-bleed) — DESIGN_SYSTEM.md.
        // Dưới lg: giữ nguyên thanh full-bleed cũ, vì bản demo chỉ thiết kế cho desktop.
        'lg:rounded-lg lg:border',
      )}
    >
      {/* Pháp nhân đang chọn — trên máy tính nằm ở sidebar, ở điện thoại sidebar ẩn nên
          phải có mặt tại đây. Không nhìn thấy pháp nhân đang làm việc là nguồn gốc của
          việc nhập nhầm dữ liệu sang công ty khác (NEN-01). */}
      <div className="shrink-0 lg:hidden">
        <CompanySwitcher compact />
      </div>

      {/* Tìm kiếm toàn hệ thống — Webapp Flow 5.3.
          Tìm trên TẤT CẢ module người dùng có quyền xem, không phải tìm riêng từng module. */}
      <div className="relative min-w-0 max-w-md flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          placeholder="Tìm hồ sơ, khách hàng, vật tư…"
          className={cn(
            'h-10 w-full rounded-md border border-border sm:h-8',
            'bg-surface-muted pl-8 pr-3',
            'placeholder:text-fg-subtle',
          )}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Thông báo và Việc cần làm tách thành hai danh sách riêng (Webapp Flow 5.4),
            tránh nhầm giữa "biết để đó" và "phải xử lý". */}
        <IconButton
          label={pendingCount ? `Việc cần làm — ${pendingCount} hồ sơ chờ xử lý` : 'Việc cần làm'}
          count={pendingCount}
          to="/viec-can-lam"
        >
          <CheckSquare className="size-4" />
        </IconButton>
        <IconButton label="Thông báo">
          <Bell className="size-4" />
        </IconButton>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className={cn(
              'ml-1 flex items-center gap-2 rounded-sm px-2 py-1',
              'hover:bg-surface-hover',
            )}
            aria-label="Menu tài khoản"
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full',
                'bg-brand-forest text-xs font-semibold text-brand-mint',
              )}
            >
              {profile?.fullName?.trim().split(/\s+/).at(-1)?.[0] ?? '?'}
            </span>
            <span className="hidden max-w-40 truncate sm:inline">{profile?.fullName}</span>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className={cn(
                'z-50 min-w-56 rounded-md border border-border',
                'bg-surface p-1 shadow-overlay',
              )}
            >
              <div className="px-2 py-2">
                <div className="truncate font-semibold">{profile?.fullName}</div>
                <div className="truncate text-xs text-fg-subtle">
                  {profile?.jobTitle ?? profile?.email}
                </div>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2',
                  'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                  // Kiểu rê chuột khai TƯỜNG MINH, không dựa vào việc Radix có đặt
                  // `data-highlighted` khi con trỏ đi qua hay không — hành vi đó nằm trong thư
                  // viện và có thể đổi giữa hai phiên bản mà không ai để ý.
                  'hover:bg-surface-hover',
                  // Radix dời con trỏ bàn phím bằng `data-highlighted`, không phải `:focus-visible`,
                  // nên vòng focus chung ở index.css không bắt được. Trước đây chỉ đổi nền sang
                  // `surface-hover` — chênh lệch với nền trắng chỉ 1.09:1, tức là người dùng bàn
                  // phím không nhìn thấy mình đang ở mục nào (WCAG 2.4.11 cần ≥3:1).
                  'data-highlighted:bg-brand-subtle data-highlighted:text-brand',
                  'data-highlighted:outline data-highlighted:outline-2 data-highlighted:outline-brand',
                )}
              >
                <User className="size-4" />
                Hồ sơ cá nhân
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => void signOut()}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2',
                  'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                  // Kiểu rê chuột khai TƯỜNG MINH, không dựa vào việc Radix có đặt
                  // `data-highlighted` khi con trỏ đi qua hay không — hành vi đó nằm trong thư
                  // viện và có thể đổi giữa hai phiên bản mà không ai để ý.
                  'hover:bg-surface-hover',
                  // Radix dời con trỏ bàn phím bằng `data-highlighted`, không phải `:focus-visible`,
                  // nên vòng focus chung ở index.css không bắt được. Trước đây chỉ đổi nền sang
                  // `surface-hover` — chênh lệch với nền trắng chỉ 1.09:1, tức là người dùng bàn
                  // phím không nhìn thấy mình đang ở mục nào (WCAG 2.4.11 cần ≥3:1).
                  'data-highlighted:bg-brand-subtle data-highlighted:text-brand',
                  'data-highlighted:outline data-highlighted:outline-2 data-highlighted:outline-brand',
                )}
              >
                <LogOut className="size-4" />
                Đăng xuất
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
