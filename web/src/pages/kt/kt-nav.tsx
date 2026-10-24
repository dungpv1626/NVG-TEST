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
  { to: '/kt/dot-thu', label: 'Đợt thu' },
  { to: '/kt/de-nghi-thu', label: 'Đề nghị thu' },
  { to: '/kt/bien-ban-nghiem-thu', label: 'Biên bản nghiệm thu' },
  { to: '/kt/cong-no', label: 'Công nợ' },
  { to: '/kt/thue-gian-giao', label: 'Thuê giàn giáo' },
  { to: '/kt/dong-tien', label: 'Dòng tiền' },
  { to: '/kt/dong-tien-theo-tuan', label: 'Dòng tiền theo tuần' },
  { to: '/kt/ky-ke-toan', label: 'Kỳ kế toán' },
];

export function KtNav() {
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
