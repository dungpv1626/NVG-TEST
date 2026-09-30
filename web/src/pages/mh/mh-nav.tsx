/**
 * Điều hướng phụ trong Module MH — cùng vai trò với `CrmNav` và `DaNav` (Webapp Flow 2.1).
 *
 * Ba màn hình gốc của phân hệ theo bản đồ màn hình Webapp Flow 7: Đề nghị mua → Đơn đặt hàng
 * → Nhà cung cấp. Thứ tự bám đúng hành trình 3.5, không xếp theo bảng chữ cái.
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/mh/de-nghi-mua', label: 'Đề nghị mua' },
  { to: '/mh/don-hang', label: 'Đơn đặt hàng' },
  { to: '/mh/nha-cung-cap', label: 'Nhà cung cấp' },
];

export function MhNav() {
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
