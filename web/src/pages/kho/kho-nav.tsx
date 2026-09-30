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
