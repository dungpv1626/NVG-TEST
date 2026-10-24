/**
 * Điều hướng phụ trong Module KHO — cùng vai trò với `CrmNav`, `DaNav`, `MhNav`.
 *
 * Thứ tự bám hành trình của nhân viên Kho ở Webapp Flow 3.6: quét mã → nhập/xuất → điều
 * chuyển → kiểm kê. "Quét mã" đứng đầu vì đó là trang mặc định khi vai trò Kho đăng nhập, và
 * là thao tác họ làm nhiều nhất trong ngày.
 *
 * Cuộn ngang được trên điện thoại: bảy mục không vừa một hàng ở màn hình 360px, mà xuống
 * dòng thì thanh điều hướng chiếm mất hai hàng của vùng nội dung.
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/kho/quet-ma', label: 'Quét mã' },
  { to: '/kho/ton-kho', label: 'Tồn kho' },
  { to: '/kho/phieu', label: 'Phiếu kho' },
  { to: '/kho/kiem-ke', label: 'Kiểm kê' },
  { to: '/kho/gian-giao', label: 'Giàn giáo' },
  { to: '/kho/vat-tu', label: 'Danh mục vật tư' },
  { to: '/kho/danh-muc-kho', label: 'Danh mục kho' },
];

export function KhoNav() {
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
