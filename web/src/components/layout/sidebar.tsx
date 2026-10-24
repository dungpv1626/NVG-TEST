/**
 * Sidebar — vùng 1 của App Shell (Webapp Flow Mục 2.1), giao diện v2
 * (`design_handoff_nvg_v2/design/NvgSidebar.dc.html`, DESIGN_SYSTEM.md §8).
 *
 * CHỈ hiện từ khổ máy tính bảng ngang trở lên. Trên điện thoại, điều hướng chuyển sang
 * thanh dưới (`bottom-nav.tsx`) — Webapp Flow 4.8 cấm thu nhỏ bố cục máy tính rồi bắt
 * người dùng bấm vào các mục li ti.
 *
 * ── Nhóm theo nghiệp vụ (v2) ────────────────────────────────────────────────────────────
 * Bốn nhóm «Của tôi · Kinh doanh · Triển khai · Nội bộ» (`NAV_GROUPS`). Mục không có quyền
 * xem thì ẩn hẳn; nhóm không còn mục nào thì ẩn cả nhãn nhóm. Trang con của phân hệ KHÔNG nằm
 * ở đây mà ở thanh viên trên đầu nội dung.
 *
 * «Của tôi» = Tổng quan điều hành (lãnh đạo) · Việc hôm nay (`/viec-hom-nay`, số = khách cần liên hệ
 * hôm nay) · Phê duyệt (`/viec-can-lam`, số = hồ sơ chờ mình duyệt) — anh Dũng chọn tách 24/10/2026.
 *
 * ── Thu gọn được (06/09/2026) ────────────────────────────────────────────────────────────
 * Hai bề rộng: **248px** mở và **80px** thu. Thu gọn thì mỗi mục xếp DỌC (biểu tượng trên, nhãn
 * ngắn dưới), không bỏ hẳn chữ; tên đọc được của liên kết vẫn là nhãn đầy đủ (`aria-label`).
 * Mọi `shortLabel` là một phần của `label` (WCAG 2.5.3) — có test canh.
 *
 * ⚠️ Dùng `Link`, KHÔNG dùng `NavLink`: `NavLink` ghi đè `aria-current` ta truyền vào, để màu
 * thành cách duy nhất báo vị trí. Một nguồn sự thật: `useActiveModule()`.
 */

import {
  Gauge,
  Inbox,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { MODULES, type ModuleCode } from '@nvg/shared';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { useMyFollowups } from '@/hooks/use-leads';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { BrandLogo } from './brand-logo';
import { CompanySwitcher } from './company-switcher';
import {
  MODULE_ICONS,
  useActiveModule,
  useModuleRoutes,
  useShowExecOverview,
  useVisibleModules,
} from './module-nav';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

/** Ba nhóm phân hệ của bản v2, theo thứ tự nghiệp vụ. Nhóm «Của tôi» dựng riêng ở dưới. */
export const NAV_GROUPS: readonly { title: string; modules: readonly ModuleCode[] }[] = [
  { title: 'Kinh doanh', modules: ['CRM', 'DA', 'TK', 'HD'] },
  { title: 'Triển khai', modules: ['TC', 'MH', 'KHO', 'SX'] },
  { title: 'Nội bộ', modules: ['KT', 'NS', 'BC', 'NEN'] },
];

interface NavItem {
  key: string;
  to: string;
  label: string;
  shortLabel: string;
  description?: string;
  Icon: LucideIcon;
  active: boolean;
  badge?: number;
}

export function Sidebar() {
  const visible = useVisibleModules();
  const moduleRoutes = useModuleRoutes();
  const activeModule = useActiveModule();
  const { collapsed, toggle } = useSidebarCollapsed();
  const canSeeExec = useShowExecOverview();
  const { pathname } = useLocation();
  const { profile } = useAuth();
  // Cùng hai truy vấn với nút «Việc cần làm» trên thanh trên — hai con số không được lệch nhau.
  const { data: pending } = usePendingApprovals();
  const { data: followups } = useMyFollowups(0);

  const mine: NavItem[] = [
    // Tổng quan điều hành (0169) — chỉ lãnh đạo và Kiểm soát nội bộ (CLAUDE.md 5.4).
    ...(canSeeExec
      ? [
          {
            key: 'exec',
            to: '/tong-quan',
            label: 'Tổng quan điều hành',
            shortLabel: 'Điều hành',
            description: 'Cảnh báo toàn hệ thống cho lãnh đạo',
            Icon: Gauge,
            active: pathname === '/tong-quan' || pathname.startsWith('/tong-quan/'),
          },
        ]
      : []),
    {
      key: 'today',
      to: '/viec-hom-nay',
      label: 'Việc hôm nay',
      shortLabel: 'Hôm nay',
      description: 'Khách cần liên hệ, hồ sơ chờ mình duyệt, hồ sơ mình đã gửi',
      Icon: ListChecks,
      active: pathname === '/viec-hom-nay',
      badge: followups?.length || undefined,
    },
    {
      key: 'inbox',
      to: '/viec-can-lam',
      label: 'Phê duyệt',
      shortLabel: 'Duyệt',
      description: 'Hồ sơ chờ phê duyệt, hồ sơ đã gửi, hồ sơ đã xử lý',
      Icon: Inbox,
      active: pathname === '/viec-can-lam' || pathname.startsWith('/viec-can-lam/'),
      badge: pending?.length || undefined,
    },
  ];

  const groups = [
    { title: 'Của tôi', items: mine },
    ...NAV_GROUPS.map((g) => ({
      title: g.title,
      items: g.modules
        .filter((code) => visible.includes(code))
        .map<NavItem>((code) => ({
          key: code,
          to: moduleRoutes[code],
          label: MODULES[code].label,
          shortLabel: MODULES[code].shortLabel,
          description: MODULES[code].description,
          Icon: MODULE_ICONS[code],
          active: activeModule === code,
        })),
    })),
  ].filter((g) => g.items.length > 0);

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col self-stretch overflow-hidden text-fg-inverse',
        'lg:flex lg:h-[calc(100dvh-1.75rem)]',
        'transition-[width] duration-(--motion-base) ease-(--ease-out)',
        collapsed ? 'w-20 px-2' : 'w-62 pr-3 pl-4',
      )}
    >
      {/* Logo: trên nền tối chỉ dùng ba ô màu — bản có chữ đen nằm trên nền trắng. */}
      <Link
        to="/"
        aria-label="Nhà Việt Group — về trang đầu"
        className={cn(
          'flex h-14 shrink-0 items-center gap-2.5 border-b border-shell-line',
          collapsed && 'justify-center',
        )}
      >
        <BrandLogo variant="mark" className={collapsed ? 'w-12' : 'w-16'} />
        {!collapsed && <span className="text-md font-bold whitespace-nowrap">Nhà Việt Group</span>}
      </Link>

      <div className={cn('mt-3 flex items-center gap-1', collapsed && 'flex-col')}>
        {/* Thu gọn thì bộ chọn pháp nhân dùng lại dạng `compact` — không dựng dạng thứ ba. */}
        <div className={cn('min-w-0', collapsed ? 'w-full' : 'flex-1')}>
          <CompanySwitcher compact={collapsed} onDark />
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="dieu-huong-chinh"
          title={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full text-shell-fg',
            'transition-colors duration-(--motion-fast) ease-(--ease-out)',
            'hover:bg-shell-active hover:text-fg-inverse',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
        </button>
      </div>

      <nav
        id="dieu-huong-chinh"
        className="mt-3 flex flex-1 flex-col gap-3 overflow-y-auto"
        aria-label="Điều hướng chính"
      >
        {groups.map((group) => (
          <div key={group.title} role="group" aria-label={group.title}>
            {!collapsed && (
              <div className="px-1.5 pb-1 text-group font-semibold text-shell-fg-subtle">
                {group.title}
              </div>
            )}
            <ul className="space-y-px">
              {group.items.map((item) => (
                <li key={item.key}>
                  <SidebarLink item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Người đang đăng nhập — tên và chức danh. Menu tài khoản (đổi mật khẩu, đăng xuất) vẫn ở
          thanh trên, không chép thêm một bản. */}
      {!collapsed && profile && (
        <div className="flex shrink-0 items-center gap-2.5 border-t border-shell-line py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-meter font-bold text-shell">
            {profile.fullName?.trim().split(/\s+/).at(-1)?.[0] ?? '?'}
          </span>
          <div className="min-w-0">
            <div className="truncate font-semibold">{profile.fullName}</div>
            {profile.jobTitle && (
              <div className="truncate text-xs text-shell-fg-subtle">{profile.jobTitle}</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { Icon } = item;
  return (
    <Link
      to={item.to}
      aria-current={item.active ? 'page' : undefined}
      // Tên đọc được luôn là nhãn ĐẦY ĐỦ, kể cả khi trên màn hình chỉ thấy nhãn ngắn.
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : item.description}
      className={cn(
        'flex rounded-full',
        'transition-colors duration-(--motion-fast) ease-(--ease-out)',
        item.active ? 'bg-shell-active font-semibold' : 'text-shell-fg hover:bg-shell-line',
        collapsed
          ? 'flex-col items-center gap-1 rounded-card px-1 py-2 text-center'
          : 'h-9 items-center gap-2.5 px-1.5',
      )}
    >
      {/* Mục đang chọn: biểu tượng trên nền tròn trắng (v2). */}
      <span
        className={cn(
          'relative grid size-6.5 shrink-0 place-items-center rounded-full',
          item.active ? 'bg-surface text-shell' : 'bg-shell-line',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
        {collapsed && item.badge ? (
          <span className="absolute -top-1 -right-1.5 min-w-4 rounded-full bg-brand-accent px-1 text-2xs font-bold text-ink">
            {item.badge}
          </span>
        ) : null}
      </span>
      {/* Thu gọn thì CHO XUỐNG DÒNG, không cắt cụt. */}
      <span className={cn(collapsed ? 'w-full text-2xs' : 'min-w-0 flex-1 truncate')}>
        {collapsed ? item.shortLabel : item.label}
      </span>
      {!collapsed && item.badge ? (
        <span className="rounded-full bg-brand-accent px-1.5 text-xs font-bold text-ink">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
