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
  { to: '/sx/lenh-san-xuat', label: 'Lệnh sản xuất' },
];

export function SxNav() {
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
