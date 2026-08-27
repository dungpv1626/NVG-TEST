/**
 * Sidebar — vùng 1 của App Shell (Webapp Flow Mục 2.1).
 *
 * CHỈ hiện từ khổ máy tính bảng ngang trở lên. Trên điện thoại, điều hướng chuyển sang
 * thanh dưới (`bottom-nav.tsx`) — Webapp Flow 4.7 cấm thu nhỏ bố cục máy tính rồi bắt
 * người dùng bấm vào các mục li ti.
 *
 * Danh sách module và thứ tự lấy từ `module-nav.ts`, dùng chung với thanh dưới.
 */

import { NavLink } from 'react-router-dom';
import { MODULES } from '@nvg/shared';
import { cn } from '@/lib/utils';
import { CompanySwitcher } from './company-switcher';
import { MODULE_ICONS, MODULE_ROUTES, useActiveModule, useVisibleModules } from './module-nav';

export function Sidebar() {
  const visible = useVisibleModules();
  const activeModule = useActiveModule();

  return (
    <aside
      className={cn(
        'hidden w-60 shrink-0 flex-col self-stretch overflow-hidden rounded-xl border border-border bg-surface',
        // Panel nổi trên nền trũng (thay thanh full-bleed cũ) — DESIGN_SYSTEM.md.
        'lg:sticky lg:top-3 lg:flex lg:h-[calc(100dvh-1.5rem)]',
      )}
    >
      <div className="border-b border-border p-2">
        <CompanySwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Điều hướng chính">
        <ul className="space-y-0.5">
          {visible.map((code) => {
            const Icon = MODULE_ICONS[code];
            const meta = MODULES[code];
            return (
              <li key={code}>
                <NavLink
                  to={MODULE_ROUTES[code]}
                  aria-current={activeModule === code ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md py-2 pl-3 pr-2 text-fg-subtle',
                    'transition-colors duration-(--motion-fast) ease-(--ease-out)',
                    'hover:bg-surface-hover hover:text-brand-forest',
                    // Mục đang hoạt động tô đậm (Webapp Flow 2.1) — một trong ba lớp
                    // định vị "luôn biết mình đang ở đâu" (Webapp Flow 6.2). Sáng theo
                    // MODULE, không theo đúng một đường dẫn: mọi màn hình trong CRM đều
                    // phải làm mục "Khách hàng & Cơ hội" sáng lên.
                    //
                    // Pill nền mint khi active (thay thanh chỉ mục cam an toàn cũ) — theo
                    // bản demo "dashboard soft light style" (DESIGN_SYSTEM.md).
                    activeModule === code &&
                      'bg-brand-subtle font-bold text-brand-forest hover:bg-brand-subtle',
                  )}
                  title={meta.description}
                >
                  <Icon className="shrink-0" />
                  <span className="truncate">{meta.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-3 py-2.5 text-xs text-fg-subtle">
        Hệ thống Quản trị NVG
      </div>
    </aside>
  );
}
