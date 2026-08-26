/**
 * Điều hướng phụ trong Module DA — cùng vai trò với `CrmNav` (Webapp Flow 2.1).
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/da/goi-thau', label: 'Gói thầu' },
  { to: '/da/don-gia', label: 'Đơn giá & định mức' },
];

export function DaNav() {
  return (
    <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Màn hình trong phân hệ">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2',
              isActive
                ? 'border-brand font-semibold text-brand'
                : 'border-transparent text-fg-subtle hover:text-fg',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
