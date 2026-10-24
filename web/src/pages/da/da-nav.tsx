/**
 * Điều hướng phụ trong Module DA — cùng vai trò với `CrmNav` (Webapp Flow 2.1).
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/da/goi-thau', label: 'Gói thầu' },
  { to: '/da/ho-so-nang-luc', label: 'Hồ sơ năng lực' },
  { to: '/da/don-gia', label: 'Đơn giá & định mức' },
];

export function DaNav() {
  return (
    <nav
      className="mb-4 flex gap-1.5 overflow-x-auto"
      aria-label="Màn hình trong phân hệ"
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex h-8 shrink-0 whitespace-nowrap items-center rounded-full px-3.5',
              isActive
                ? 'bg-shell font-semibold text-fg-inverse'
                : 'text-ink-subtle hover:bg-pill hover:text-ink',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
