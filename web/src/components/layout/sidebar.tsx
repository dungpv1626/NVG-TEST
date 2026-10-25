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
 * ── Kéo đổi bề rộng, ẩn hẳn (25/10/2026) ─────────────────────────────────────────────────
 * Mép phải của thanh kéo được: 208–360px khi mở; kéo hẹp quá thì thu thành dải biểu tượng, kéo
 * tiếp thì ẩn hẳn (còn một dải mỏng ở mép trái — bấm hoặc kéo ra để hiện lại). Nhấp đúp mép = bề
 * rộng mặc định. Ctrl + B ẩn / hiện như VS Code.
 *
 * ⚠️ Dùng `Link`, KHÔNG dùng `NavLink`: `NavLink` ghi đè `aria-current` ta truyền vào, để màu
 * thành cách duy nhất báo vị trí. Một nguồn sự thật: `useActiveModule()`.
 */

import {
  ChevronsLeft,
  Gauge,
  Inbox,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  useSidebarLayout,
} from './use-sidebar-collapsed';

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
  const { mode, width, setMode, dragTo, toggle } = useSidebarLayout();
  const collapsed = mode === 'rail';
  const hidden = mode === 'hidden';
  const asideRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);

  // Ctrl + B: ẩn / hiện thanh (như VS Code). Ẩn thì nhớ dạng trước đó để hiện lại đúng dạng ấy.
  const beforeHide = useRef<'open' | 'rail'>('open');
  useEffect(() => {
    if (mode !== 'hidden') beforeHide.current = mode;
  }, [mode]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b')
        return;
      e.preventDefault();
      setMode(mode === 'hidden' ? beforeHide.current : 'hidden');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, setMode]);
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

  // Kéo mép phải: bề rộng = vị trí con trỏ tính từ mép trái thanh.
  function edgeHandlers(from: 'aside' | 'strip') {
    return {
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        if (!dragging) return;
        const left = from === 'aside' ? (asideRef.current?.getBoundingClientRect().left ?? 0) : 0;
        dragTo(e.clientX - left);
      },
      onPointerUp(e: React.PointerEvent<HTMLElement>) {
        setDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
    };
  }

  if (hidden) {
    return (
      <div className="group relative hidden w-3.5 shrink-0 lg:block">
        <div
          {...edgeHandlers('strip')}
          className="absolute inset-0 cursor-col-resize touch-none"
          title="Kéo sang phải để hiện thanh điều hướng"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => setMode(beforeHide.current)}
          aria-label="Hiện thanh điều hướng"
          title="Hiện thanh điều hướng (Ctrl + B)"
          aria-controls="dieu-huong-chinh"
          aria-expanded={false}
          className={cn(
            'absolute top-4 left-1 z-30 grid size-9 place-items-center rounded-full',
            'bg-shell text-fg-inverse shadow-md ring-2 ring-canvas hover:bg-shell-active',
          )}
        >
          <PanelLeftOpen className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <aside
      ref={asideRef}
      style={collapsed ? undefined : { width }}
      className={cn(
        'relative hidden shrink-0 flex-col self-stretch overflow-hidden text-fg-inverse',
        'lg:flex lg:h-[calc(100dvh-1.75rem)]',
        !dragging && 'transition-[width] duration-(--motion-base) ease-(--ease-out)',
        collapsed ? 'w-20 px-2' : 'pr-3 pl-4',
      )}
    >
      {/* Mép kéo: đổi bề rộng; kéo hẹp hẳn thì thu gọn / ẩn. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Kéo để đổi bề rộng thanh điều hướng"
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={collapsed ? 80 : width}
        tabIndex={0}
        title="Kéo để đổi bề rộng · kéo hẹp hẳn để ẩn · nhấp đúp để về mặc định"
        {...edgeHandlers('aside')}
        onDoubleClick={() => dragTo(SIDEBAR_WIDTH_DEFAULT)}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0;
          if (!step) return;
          e.preventDefault();
          dragTo((collapsed ? 80 : width) + step);
        }}
        className={cn(
          'group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize touch-none justify-end',
        )}
      >
        <span
          className={cn(
            'h-full w-0.5 rounded-full transition-colors',
            dragging
              ? 'bg-meter'
              : 'bg-transparent group-hover:bg-shell-line group-focus-visible:bg-meter',
          )}
        />
      </div>
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

      <div className={cn('mt-3 flex items-center gap-0.5', collapsed && 'flex-col')}>
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
            'grid size-8 shrink-0 place-items-center rounded-full text-shell-fg',
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
        <button
          type="button"
          onClick={() => setMode('hidden')}
          title="Ẩn thanh điều hướng (Ctrl + B)"
          aria-label="Ẩn thanh điều hướng"
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full text-shell-fg',
            'transition-colors duration-(--motion-fast) ease-(--ease-out)',
            'hover:bg-shell-active hover:text-fg-inverse',
          )}
        >
          <ChevronsLeft className="size-4" aria-hidden />
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
