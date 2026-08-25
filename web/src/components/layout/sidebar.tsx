/**
 * Sidebar — vùng 1 của App Shell (Webapp Flow Mục 2.1).
 *
 * Danh sách module theo THỨ TỰ ƯU TIÊN NGHIỆP VỤ, không xếp theo alphabet
 * (thứ tự lấy từ `MODULE_CODES` trong `@nvg/shared`).
 *
 * Menu lọc theo vai trò (Webapp Flow 2.3) — module không có quyền xem thì KHÔNG hiển thị,
 * không phải hiện rồi báo lỗi khi bấm (Webapp Flow 6.5).
 */

import {
  BarChart3, Boxes, Building, ClipboardList, FileSignature, HardHat,
  LayoutDashboard, PencilRuler, Settings, ShoppingCart, Users, Wallet, Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { MODULE_CODES, MODULES, type ModuleCode } from '@nvg/shared';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CompanySwitcher } from './company-switcher';

/** Một khái niệm luôn dùng đúng một icon xuyên suốt hệ thống (Content Guidelines 6.6). */
const MODULE_ICONS: Record<ModuleCode, LucideIcon> = {
  BC: LayoutDashboard,
  CRM: Users,
  DA: ClipboardList,
  TK: PencilRuler,
  HD: FileSignature,
  TC: HardHat,
  MH: ShoppingCart,
  KHO: Warehouse,
  KT: Wallet,
  NS: Building,
  SX: Boxes,
  NEN: Settings,
};

const MODULE_ROUTES: Record<ModuleCode, string> = {
  BC: '/dashboard',
  CRM: '/crm/co-hoi',
  DA: '/da/goi-thau',
  TK: '/tk/du-an',
  HD: '/hd/hop-dong',
  TC: '/tc/cong-trinh',
  MH: '/mh/de-nghi-mua',
  KHO: '/kho/ton-kho',
  KT: '/kt/de-nghi-thanh-toan',
  NS: '/ns/nhan-su',
  SX: '/sx/tai-san-cho-thue',
  NEN: '/nen/quan-tri',
};

export function Sidebar() {
  const { profile } = useAuth();

  const visible = MODULE_CODES.filter((code) =>
    profile?.permissions.some((p) => p.moduleCode === code && p.canView),
  );

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
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
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-sm px-2 py-2',
                      'hover:bg-surface-hover',
                      // Mục đang hoạt động tô đậm (Webapp Flow 2.1) — một trong ba lớp
                      // định vị "luôn biết mình đang ở đâu" (Webapp Flow 6.2).
                      isActive &&
                        'bg-brand-subtle font-semibold text-brand hover:bg-brand-subtle',
                    )
                  }
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
