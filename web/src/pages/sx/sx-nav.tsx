/**
 * Điều hướng phụ trong Module SX — cùng vai trò với `KhoNav`, `MhNav`.
 *
 * Cho thuê giàn giáo đứng trước vì đó là phần đã đủ thông tin để triển khai (SX-03); lệnh
 * sản xuất đứng sau vì PRD ghi thẳng "cần xác nhận thêm" (SX-01).
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/sx/tai-san-cho-thue', label: 'Cho thuê giàn giáo' },
  { to: '/sx/bao-gia-thue', label: 'Báo giá thuê' },
  { to: '/sx/lenh-san-xuat', label: 'Lệnh sản xuất' },
];

export function SxNav() {
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
