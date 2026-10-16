/**
 * Điều hướng phụ trong Module HD.
 *
 * Sidebar chỉ liệt kê 12 module (Webapp Flow 2.1); các màn hình bên trong một module đi lại
 * qua thanh này. Giữ nguyên tắc "không quá 3 cú nhấp để đến một hồ sơ" (Webapp Flow 1.3):
 * Sidebar → thanh này → Chi tiết.
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/hd/hop-dong', label: 'Hợp đồng' },
  { to: '/hd/mau-hop-dong', label: 'Mẫu hợp đồng' },
];

export function HdNav() {
  return (
    <nav
      className="mb-4 flex gap-1 overflow-x-auto border-b border-border"
      aria-label="Màn hình trong phân hệ"
    >
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2',
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
