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
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
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
                    'flex items-center gap-2 rounded-sm px-2 py-2',
                    'hover:bg-surface-hover',
                    // Mục đang hoạt động tô đậm (Webapp Flow 2.1) — một trong ba lớp
                    // định vị "luôn biết mình đang ở đâu" (Webapp Flow 6.2). Sáng theo
                    // MODULE, không theo đúng một đường dẫn: mọi màn hình trong CRM đều
                    // phải làm mục "Khách hàng & Cơ hội" sáng lên.
                    activeModule === code &&
                      'bg-brand-subtle font-semibold text-brand hover:bg-brand-subtle',
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

      <div className="border-t border-border px-3 py-2 text-xs text-fg-subtle">
        Hệ thống Quản trị NVG
      </div>
    </aside>
  );
}
