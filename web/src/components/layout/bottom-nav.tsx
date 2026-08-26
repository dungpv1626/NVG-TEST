/**
 * Thanh điều hướng dưới — bố cục di động (Webapp Flow Mục 4.7).
 *
 * "KHÔNG thu nhỏ bố cục máy tính": trên điện thoại, sidebar biến mất hẳn và điều hướng
 * chuyển xuống đây — ngón tay cầm máy một tay với tới được, không phải vươn lên góc trên.
 *
 * Tối đa 4 module + mục "Thêm" mở bảng đầy đủ. Người dùng có quyền xem 9 module vẫn chỉ
 * thấy 4 mục ở đây; nhồi hết vào thanh dưới là mỗi mục còn ~35px, dưới ngưỡng 40px bắt buộc
 * (Content Guidelines 6.8).
 */

import { LayoutGrid, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MODULES, type ModuleCode } from '@nvg/shared';
import { cn } from '@/lib/utils';
import {
  MODULE_ICONS,
  MODULE_ROUTES,
  splitBottomNav,
  useActiveModule,
  useVisibleModules,
} from './module-nav';

const ITEM_CLASS =
  'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px]';

export function BottomNav() {
  const visible = useVisibleModules();
  const activeModule = useActiveModule();
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();

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

  const { primary, rest } = splitBottomNav(visible);

  return (
    <>
      {sheetOpen && rest.length > 0 && (
        <MoreSheet rest={rest} activeModule={activeModule} onClose={() => setSheetOpen(false)} />
      )}

      <nav
        aria-label="Điều hướng chính"
        className={cn(
          'flex shrink-0 border-t border-border bg-surface lg:hidden',
          // Chừa chỗ cho vạch Home của iPhone — thiếu dòng này thì mục cuối bị vạch đè lên.
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        {primary.map((code) => {
          const Icon = MODULE_ICONS[code];
          const meta = MODULES[code];
          return (
            <NavLink
              key={code}
              to={MODULE_ROUTES[code]}
              aria-current={activeModule === code ? 'page' : undefined}
              className={cn(
                ITEM_CLASS,
                'text-fg-subtle',
                activeModule === code && 'font-semibold text-brand',
              )}
            >
              <Icon className="size-5 shrink-0" />
              {/* Icon LUÔN kèm chữ — icon một mình là câu đố (Content Guidelines 6.6). */}
              <span className="max-w-full truncate">{meta.shortLabel}</span>
            </NavLink>
          );
        })}

        {rest.length > 0 && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            className={cn(ITEM_CLASS, 'text-fg-subtle')}
          >
            <LayoutGrid className="size-5 shrink-0" />
            <span>Thêm</span>
          </button>
        )}
      </nav>
    </>
  );
}

/** Bảng đầy đủ: các module không đủ chỗ trên thanh dưới. */
function MoreSheet({
  rest,
  activeModule,
  onClose,
}: {
  rest: ModuleCode[];
  activeModule: ModuleCode | null;
  onClose: () => void;
}) {
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
          {rest.map((code) => {
            const Icon = MODULE_ICONS[code];
            const meta = MODULES[code];
            return (
              <li key={code}>
                <NavLink
                  to={MODULE_ROUTES[code]}
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
