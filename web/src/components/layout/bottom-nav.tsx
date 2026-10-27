/**
 * Thanh điều hướng dưới — bố cục di động (Webapp Flow Mục 4.8).
 *
 * ⚠️ Mục này đổi số từ 4.7 sang 4.8 ở Webapp Flow v1.1 (chèn thêm 4.7 Request Tracker), và mở
 * rộng từ HAI nhóm nghiệp vụ hiện trường lên BA: Kho, Công trường, và Xưởng sản xuất. Ba yêu
 * cầu mới của v1.1 chưa làm ở đây, xem `BUILD_PLAN.md`: nút chụp ảnh luôn trong tầm ngón cái và
 * không bao giờ ẩn sau menu; ưu tiên chọn từ danh sách gợi ý thay vì gõ tay; đồng hồ ngân sách
 * thao tác trên màn hình chốt ngày (ngưỡng nghiệm thu 10–20 phút, PRD v1.4 Mục 6).
 *
 * "KHÔNG thu nhỏ bố cục máy tính": trên điện thoại, sidebar biến mất hẳn và điều hướng
 * chuyển xuống đây — ngón tay cầm máy một tay với tới được, không phải vươn lên góc trên.
 *
 * Tối đa 4 module + mục "Thêm" mở bảng đầy đủ. Người dùng có quyền xem 9 module vẫn chỉ
 * thấy 4 mục ở đây; nhồi hết vào thanh dưới là mỗi mục còn ~35px, dưới ngưỡng 40px bắt buộc
 * (Content Guidelines 6.8).
 */

import { Gauge, Inbox, LayoutGrid, ListChecks, Menu, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { MODULES, type ModuleCode } from '@nvg/shared';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { useMyFollowups } from '@/hooks/use-leads';
import { cn } from '@/lib/utils';
import { useBottomBarSlot } from './bottom-bar-slot';
import {
  MODULE_ICONS,
  useActiveModule,
  useModuleRoutes,
  useShowExecOverview,
  useVisibleModules,
} from './module-nav';

/** Thứ tự nhóm nghiệp vụ của sidebar v2 (Kinh doanh → Triển khai → Nội bộ). */
const NAV_ORDER: readonly ModuleCode[] = [
  'CRM',
  'DA',
  'TK',
  'HD',
  'TC',
  'MH',
  'KHO',
  'SX',
  'KT',
  'NS',
  'BC',
  'NEN',
];

const ITEM_CLASS =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px]';

/**
 * Thanh tab v2 (`NvgTabbar`): đúng 4 ô — Hôm nay (`/viec-hom-nay`) · phân hệ đang mở · Phê duyệt · Thêm. Ô thứ
 * hai đổi theo phân hệ người dùng đang ở (chưa ở phân hệ nào thì là phân hệ đầu tiên được xem),
 * mọi phân hệ khác nằm trong bảng «Thêm». Ô đang chọn: viên nền nhạt quanh biểu tượng.
 */
export function BottomNav() {
  const visible = useVisibleModules();
  const moduleRoutes = useModuleRoutes();
  const activeModule = useActiveModule();
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  // Tổng quan điều hành (0169) — trang đầu của lãnh đạo / Kiểm soát nội bộ; ẩn với vai khác (CLAUDE.md 5.4).
  const canSeeExec = useShowExecOverview();
  // Cùng hai truy vấn với thanh trên / sidebar — một con số ở mọi nơi.
  const { data: pending } = usePendingApprovals();
  const { data: followups } = useMyFollowups(0);

  // Chuyển trang thì đóng bảng — nếu không, bảng che mất chính màn hình vừa mở.
  useEffect(() => setSheetOpen(false), [location.pathname]);

  // Đóng bằng phím Esc: bàn phím ngoài cắm vào máy tính bảng vẫn phải dùng được.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  // Màn hình đang khai thao tác riêng (trang công trường) thì thanh này nhường chỗ: vẽ thao tác
  // của màn hình + MỘT nút «Phân hệ» mở bảng đầy đủ — một thanh, không hai (bottom-bar-slot.ts).
  const screenActions = useBottomBarSlot((s) => s.actions);

  if (screenActions) {
    return (
      <>
        {sheetOpen && (
          <MoreSheet
            rest={visible}
            activeModule={activeModule}
            showExec={canSeeExec}
            onClose={() => setSheetOpen(false)}
          />
        )}
        <nav
          aria-label="Thao tác của màn hình"
          className={cn(
            'flex shrink-0 gap-1 border-t border-border bg-surface p-1 lg:hidden',
            'pb-[calc(0.25rem+env(safe-area-inset-bottom))]',
          )}
        >
          {screenActions}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            className={cn(ITEM_CLASS, 'rounded-md text-ink-subtle hover:bg-surface-hover')}
          >
            <LayoutGrid className="size-5 shrink-0" />
            <span>Phân hệ</span>
          </button>
        </nav>
      </>
    );
  }

  // Chưa ở phân hệ nào (Việc hôm nay, Phê duyệt…) thì ô thứ hai là phân hệ nghiệp vụ đầu tiên theo thứ
  // tự nhóm của sidebar — Kinh doanh thấy «Khách hàng», không phải «Báo cáo» đứng đầu `MODULE_CODES`.
  const current: ModuleCode | undefined =
    activeModule && visible.includes(activeModule)
      ? activeModule
      : (NAV_ORDER.find((code) => visible.includes(code)) ?? visible[0]);
  const onHome = location.pathname === '/viec-hom-nay';
  const onExec = location.pathname === '/tong-quan' || location.pathname.startsWith('/tong-quan/');
  // Lãnh đạo chưa ở phân hệ nào thì ô thứ hai là «Điều hành» — trước đây trên điện thoại không có lối về trang này.
  const execSlot = canSeeExec && !(activeModule && visible.includes(activeModule));
  const onTodo = location.pathname.startsWith('/viec-can-lam');

  return (
    <>
      {sheetOpen && (
        <MoreSheet
          rest={visible}
          activeModule={activeModule}
          showExec={canSeeExec}
          onClose={() => setSheetOpen(false)}
        />
      )}

      <nav
        aria-label="Điều hướng chính"
        className={cn(
          'grid shrink-0 grid-cols-4 border-t border-line-soft bg-surface lg:hidden',
          // Chừa chỗ cho vạch Home của iPhone — thiếu dòng này thì mục cuối bị vạch đè lên.
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <TabLink
          to="/viec-hom-nay"
          label="Hôm nay"
          Icon={ListChecks}
          active={onHome}
          badge={followups?.length || undefined}
        />
        {execSlot ? (
          <TabLink to="/tong-quan" label="Điều hành" Icon={Gauge} active={onExec} />
        ) : current ? (
          <TabLink
            to={moduleRoutes[current]}
            label={MODULES[current].shortLabel}
            Icon={MODULE_ICONS[current]}
            active={activeModule === current}
          />
        ) : null}
        <TabLink
          to="/viec-can-lam"
          label="Phê duyệt"
          Icon={Inbox}
          active={onTodo}
          badge={pending?.length || undefined}
        />
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          className={cn(ITEM_CLASS, 'text-ink-subtle')}
        >
          <TabIcon Icon={Menu} active={false} />
          <span>Thêm</span>
        </button>
      </nav>
    </>
  );
}

function TabIcon({ Icon, active, badge }: { Icon: LucideIcon; active: boolean; badge?: number }) {
  return (
    <span
      className={cn(
        'relative grid h-6.5 w-11 place-items-center rounded-full',
        active && 'bg-pill',
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {badge ? (
        <span className="absolute -top-1 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-accent px-1 text-2xs font-bold text-ink">
          {badge}
        </span>
      ) : null}
    </span>
  );
}

function TabLink({
  to,
  label,
  Icon,
  active,
  badge,
}: {
  to: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  badge?: number;
}) {
  return (
    // `Link`, không `NavLink`: NavLink tự đặt `aria-current` theo đường dẫn của chính nó (xem sidebar.tsx).
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={cn(ITEM_CLASS, active ? 'font-bold text-shell' : 'text-ink-subtle')}
    >
      <TabIcon Icon={Icon} active={active} badge={badge} />
      {/* Icon LUÔN kèm chữ — icon một mình là câu đố (Content Guidelines 6.6). */}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

/** Bảng «Thêm»: mọi phân hệ người dùng được xem. */
function MoreSheet({
  rest,
  activeModule,
  showExec,
  onClose,
}: {
  rest: ModuleCode[];
  activeModule: ModuleCode | null;
  showExec: boolean;
  onClose: () => void;
}) {
  const moduleRoutes = useModuleRoutes();
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-fg/30 lg:hidden"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tất cả module"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'max-h-[80vh] overflow-y-auto rounded-t-lg border-t border-border bg-surface',
          'p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-overlay',
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-semibold">Tất cả module</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng module"
            className="flex size-10 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-hover"
          >
            <X className="size-5" />
          </button>
        </div>

        <ul className="grid grid-cols-3 gap-2">
          {showExec && (
            <li>
              <NavLink
                to="/tong-quan"
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border border-border p-2 text-center"
              >
                <Gauge className="size-5 shrink-0" />
                <span className="text-xs leading-tight">Tổng quan điều hành</span>
              </NavLink>
            </li>
          )}
          {rest.map((code) => {
            const Icon = MODULE_ICONS[code];
            const meta = MODULES[code];
            return (
              <li key={code}>
                <NavLink
                  to={moduleRoutes[code]}
                  aria-current={activeModule === code ? 'page' : undefined}
                  className={cn(
                    'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md',
                    'border border-border p-2 text-center',
                    activeModule === code &&
                      'border-brand bg-brand-subtle font-semibold text-brand',
                  )}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="text-xs leading-tight">{meta.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
