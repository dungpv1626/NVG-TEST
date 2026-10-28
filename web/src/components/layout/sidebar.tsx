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
 * ── Thu gọn được, có chuyển động (28/10/2026) ─────────────────────────────────────────────
 * Hai bề rộng: mở (mặc định 248px) và dải biểu tượng **72px**. Bề rộng chuyển trong ~200 ms, cột
 * nội dung giãn theo cùng nhịp (anh Dũng 28/10: «thao tác ẩn nav không được mượt mà» — trước đây
 * thanh biến mất tức thì, nội dung nhảy, còn một nút tròn nổi đè lên ô tìm kiếm).
 * Để chuyển động không giật: biểu tượng của mọi mục đứng YÊN một chỗ ở cả hai dạng (tâm cách mép
 * trái 36px = nửa dải biểu tượng), chữ chỉ mờ dần rồi bị mép thanh che; không mục nào đổi bố cục
 * giữa hai dạng. Thu gọn thì rê chuột / focus vào mục hiện nhãn đầy đủ bên phải; tên đọc được của
 * liên kết vẫn là nhãn đầy đủ. Chuyển động tắt theo `prefers-reduced-motion` (index.css).
 *
 * ── Kéo đổi bề rộng (25/10/2026) ─────────────────────────────────────────────────────────
 * Mép phải của thanh kéo được: 208–360px khi mở; kéo hẹp quá thì thu thành dải biểu tượng. Nhấp
 * đúp mép = bề rộng mặc định. Ctrl + B thu gọn / mở như VS Code. Dạng «ẩn hẳn» đã bỏ (28/10).
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
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  SIDEBAR_RAIL_WIDTH,
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
  const { mode, width, dragTo, toggle } = useSidebarLayout();
  const collapsed = mode === 'rail';
  const asideRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  // Nhãn nổi của dải biểu tượng: chữ + tâm dọc của mục đang rê / focus.
  const [tip, setTip] = useState<{ text: string; y: number } | null>(null);

  // Ctrl + B: thu gọn / mở (như VS Code).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b')
        return;
      e.preventDefault();
      toggle();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  useEffect(() => {
    if (!collapsed) setTip(null);
  }, [collapsed]);

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

  // Rê chuột / focus một mục khi thu gọn thì hiện nhãn đầy đủ bên phải dải biểu tượng.
  function tipHandlers(text: string) {
    if (!collapsed) return {};
    const show = (e: React.SyntheticEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ text, y: r.top + r.height / 2 });
    };
    const hide = () => setTip(null);
    return { onMouseEnter: show, onFocus: show, onMouseLeave: hide, onBlur: hide };
  }

  // Kéo mép phải: bề rộng = vị trí con trỏ tính từ mép trái thanh.
  const edgeHandlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      if (!dragging) return;
      dragTo(e.clientX - (asideRef.current?.getBoundingClientRect().left ?? 0));
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      setDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
  };

  const currentWidth = collapsed ? SIDEBAR_RAIL_WIDTH : width;
  // Chữ mờ dần khi thu, hiện lại khi mở — bố cục không đổi, chỉ bị mép thanh che.
  const fade = cn(
    'transition-opacity duration-(--motion-base) ease-(--ease-out)',
    collapsed && 'pointer-events-none opacity-0',
  );

  return (
    <aside
      ref={asideRef}
      style={{ width: currentWidth }}
      className={cn(
        // px-3 ở cả hai dạng: dải biểu tượng 72px = 12 + 48 + 12, biểu tượng mỗi mục đứng ở tâm 36px.
        'relative hidden shrink-0 flex-col self-stretch overflow-hidden px-3 text-fg-inverse',
        'lg:flex lg:h-[calc(100dvh-1.75rem)]',
        !dragging && 'transition-[width] duration-200 ease-(--ease-out)',
      )}
    >
      {/* Mép kéo: đổi bề rộng; kéo hẹp hẳn thì thu thành dải biểu tượng. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Kéo để đổi bề rộng thanh điều hướng"
        aria-valuemin={SIDEBAR_RAIL_WIDTH}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={currentWidth}
        tabIndex={0}
        title="Kéo để đổi bề rộng · kéo hẹp hẳn để thu gọn · nhấp đúp để về mặc định"
        {...edgeHandlers}
        onDoubleClick={() => dragTo(SIDEBAR_WIDTH_DEFAULT)}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0;
          if (!step) return;
          e.preventDefault();
          dragTo(collapsed && step > 0 ? SIDEBAR_WIDTH_MIN : currentWidth + step);
        }}
        className="group absolute inset-y-0 right-0 z-10 flex w-2 cursor-col-resize touch-none justify-end"
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
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-shell-line"
      >
        <BrandLogo
          variant="mark"
          className={cn(
            'shrink-0 transition-[width] duration-200 ease-(--ease-out)',
            collapsed ? 'w-12' : 'w-16',
          )}
        />
        <span className={cn('text-md font-bold whitespace-nowrap', fade)} aria-hidden={collapsed}>
          Nhà Việt Group
        </span>
      </Link>

      {/* Thu gọn thì bộ chọn pháp nhân dùng lại dạng `compact` (chỉ còn mã pháp nhân, tên đầy đủ ở
          `title`) — không dựng dạng thứ ba. */}
      <div
        className={cn(
          'mt-3 min-w-0',
          collapsed &&
            '[&_button]:w-full [&_button]:justify-center [&_button]:px-1 [&_span]:justify-center [&_span]:px-0 [&_svg]:hidden',
        )}
      >
        <CompanySwitcher compact={collapsed} onDark />
      </div>

      <nav
        id="dieu-huong-chinh"
        className="mt-3 flex flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto"
        aria-label="Điều hướng chính"
      >
        {groups.map((group) => (
          <div key={group.title} role="group" aria-label={group.title}>
            {/* Nhãn nhóm giữ nguyên chiều cao ở cả hai dạng (mục không nhảy lên xuống); thu gọn
                thì thay bằng một gạch mảnh. */}
            <div className="relative h-5 px-1.5 text-group font-semibold whitespace-nowrap text-shell-fg-subtle">
              <span className={fade}>{group.title}</span>
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-2 top-1/2 h-px bg-shell-line',
                  'transition-opacity duration-(--motion-base)',
                  collapsed ? 'opacity-100' : 'opacity-0',
                )}
              />
            </div>
            <ul className="space-y-px">
              {group.items.map((item) => (
                <li key={item.key}>
                  <SidebarLink
                    item={item}
                    collapsed={collapsed}
                    fade={fade}
                    {...tipHandlers(item.label)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Nút thu gọn / mở nằm cuối thanh, biểu tượng thẳng cột với các mục — ở dạng dải biểu
          tượng nó vẫn đúng chỗ cũ, không phải tìm, và không nổi đè lên thanh trên. */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="dieu-huong-chinh"
        aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
        title={collapsed ? undefined : 'Thu gọn thanh điều hướng (Ctrl + B)'}
        {...tipHandlers('Mở rộng thanh điều hướng (Ctrl + B)')}
        className={cn(
          'mt-2 flex h-10 w-full shrink-0 items-center gap-2.5 overflow-hidden rounded-full pl-2.75',
          'text-shell-fg transition-colors duration-(--motion-fast) ease-(--ease-out)',
          'hover:bg-shell-line hover:text-fg-inverse',
          'focus-visible:ring-2 focus-visible:ring-meter focus-visible:outline-none',
        )}
      >
        <span className="grid size-6.5 shrink-0 place-items-center">
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
        </span>
        <span className={cn('whitespace-nowrap', fade)} aria-hidden>
          Thu gọn
        </span>
      </button>

      {/* Người đang đăng nhập — tên và chức danh. Menu tài khoản (đổi mật khẩu, đăng xuất) vẫn ở
          thanh trên, không chép thêm một bản. */}
      {profile && (
        <div
          className="mt-2 flex shrink-0 items-center gap-2.5 border-t border-shell-line py-2.5 pl-1.5"
          title={collapsed ? (profile.fullName ?? undefined) : undefined}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-meter font-bold text-shell">
            {profile.fullName?.trim().split(/\s+/).at(-1)?.[0] ?? '?'}
          </span>
          <div className={cn('min-w-0 whitespace-nowrap', fade)} aria-hidden={collapsed}>
            <div className="truncate font-semibold">{profile.fullName}</div>
            {profile.jobTitle && (
              <div className="truncate text-xs text-shell-fg-subtle">{profile.jobTitle}</div>
            )}
          </div>
        </div>
      )}

      {/* Nhãn nổi khi thu gọn — cổng ra `body` để không bị `overflow-hidden` của thanh cắt. */}
      {collapsed &&
        tip &&
        createPortal(
          <div
            aria-hidden
            style={{ top: tip.y, left: SIDEBAR_RAIL_WIDTH + 6 }}
            className={cn(
              'pointer-events-none fixed z-50 -translate-y-1/2 rounded-md px-2.5 py-1.5',
              'bg-shell-card text-sm font-medium whitespace-nowrap text-fg-inverse shadow-overlay',
            )}
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </aside>
  );
}

function SidebarLink({
  item,
  collapsed,
  fade,
  ...tipProps
}: {
  item: NavItem;
  collapsed: boolean;
  fade: string;
} & React.HTMLAttributes<HTMLAnchorElement>) {
  const { Icon } = item;
  return (
    <Link
      to={item.to}
      aria-current={item.active ? 'page' : undefined}
      // Tên đọc được luôn là nhãn ĐẦY ĐỦ, kể cả khi trên màn hình chỉ còn biểu tượng.
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? undefined : item.description}
      {...tipProps}
      className={cn(
        // Cao 40px (vùng bấm), biểu tượng cách mép trái 11px ở cả hai dạng — không nhảy khi thu / mở.
        'flex h-10 items-center gap-2.5 overflow-hidden rounded-full pr-2 pl-2.75',
        'transition-colors duration-(--motion-fast) ease-(--ease-out)',
        'focus-visible:ring-2 focus-visible:ring-meter focus-visible:outline-none',
        item.active ? 'bg-shell-active font-semibold' : 'text-shell-fg hover:bg-shell-line',
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
        {/* Huy hiệu số trên góc biểu tượng — chỉ hiện khi thu gọn (khi mở, số đứng cuối hàng). */}
        {item.badge ? (
          <span
            aria-hidden
            className={cn(
              'absolute -top-1 -right-1.5 min-w-4 rounded-full bg-brand-accent px-1 text-center',
              'text-2xs font-bold text-ink transition-opacity duration-(--motion-base)',
              collapsed ? 'opacity-100' : 'opacity-0',
            )}
          >
            {item.badge}
          </span>
        ) : null}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', fade)}>{item.label}</span>
      {item.badge ? (
        <span
          className={cn(
            'shrink-0 rounded-full bg-brand-accent px-1.5 text-xs font-bold text-ink',
            fade,
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}
