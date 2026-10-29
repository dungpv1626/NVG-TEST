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
  // Lời nhắn Zalo / email gửi khách kèm báo giá (0239).
  { to: '/hd/mau-loi-nhan', label: 'Mẫu lời nhắn' },
];

export function HdNav() {
  return (
    <nav className="mb-4 flex gap-1.5 overflow-x-auto" aria-label="Màn hình trong phân hệ">
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
