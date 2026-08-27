/**
 * Điều hướng phụ trong Module KT — cùng vai trò với `MhNav` và `KhoNav` (Webapp Flow 2.1).
 *
 * Thứ tự bám hành trình tiền đi trong công ty, không xếp theo bảng chữ cái: khoản chi được
 * đề nghị và duyệt → tiền đã ứng ra còn phải thu về → công nợ với bên ngoài → bức tranh dòng
 * tiền → chốt sổ cuối kỳ.
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/kt/de-nghi-thanh-toan', label: 'Đề nghị chi' },
  { to: '/kt/tam-ung', label: 'Tạm ứng' },
  { to: '/kt/cong-no', label: 'Công nợ' },
  { to: '/kt/dong-tien', label: 'Dòng tiền' },
  { to: '/kt/ky-ke-toan', label: 'Kỳ kế toán' },
];

export function KtNav() {
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
