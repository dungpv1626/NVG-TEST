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
  { to: '/mh/gom-de-nghi', label: 'Gom đề nghị' },
  { to: '/mh/don-hang', label: 'Đơn đặt hàng' },
  { to: '/mh/nha-cung-cap', label: 'Nhà cung cấp' },
];

export function MhNav() {
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
