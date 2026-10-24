/**
 * Điều hướng phụ trong Module NS — cùng vai trò với `KtNav`, `MhNav`, `KhoNav` (Webapp Flow 2.1).
 *
 * Thứ tự bám hành trình của Hành chính – Nhân sự trong AFD 3.8, không xếp theo bảng chữ cái:
 * mở máy xem việc cần xử lý → chấm công (việc định kỳ nặng nhất) → hồ sơ nhân sự → giấy tờ
 * phải nhắc hạn → tài sản cấp phát → nghỉ phép → tuyển dụng.
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/ns/viec-can-xu-ly', label: 'Việc cần xử lý' },
  { to: '/ns/cham-cong', label: 'Chấm công' },
  { to: '/ns/nhan-su', label: 'Hồ sơ nhân sự' },
  { to: '/ns/giay-to', label: 'Giấy tờ' },
  { to: '/ns/giay-to-phap-nhan', label: 'Giấy tờ pháp nhân' },
  { to: '/ns/tai-san', label: 'Tài sản' },
  { to: '/ns/nghi-phep', label: 'Nghỉ phép' },
  { to: '/ns/tuyen-dung', label: 'Tuyển dụng' },
];

export function NsNav() {
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
