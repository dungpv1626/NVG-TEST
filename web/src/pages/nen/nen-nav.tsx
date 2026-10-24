/**
 * Điều hướng phụ trong phân hệ Quản trị hệ thống — cùng vai trò với `DaNav` (Webapp Flow 2.1).
 *
 * Thứ tự theo tần suất dùng thật: người dùng đổi nhiều nhất, nhật ký tra cứu ít nhất. Trang
 * trưng bày thành phần giao diện KHÔNG nằm ở đây — đó là công cụ của đội triển khai, không
 * phải việc quản trị của NVG.
 */

import { NavLink } from 'react-router-dom';
import { APPROVAL_RULE_PATHS, useCanViewModule } from '@/components/layout/module-nav';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/nen/quan-tri', label: 'Người dùng' },
  { to: '/nen/tham-so', label: 'Tham số hệ thống' },
  { to: '/nen/tro-ly-ai', label: 'Trợ lý AI' },
  { to: '/nen/han-muc', label: 'Hạn mức phê duyệt' },
  { to: '/nen/thoi-han', label: 'Thời hạn xử lý' },
  { to: '/nen/bieu-mau-dau-bai', label: 'Biểu mẫu đầu bài' },
  { to: '/nen/phan-cong', label: 'Phân công công trường' },
  { to: '/nen/nhat-ky', label: 'Nhật ký' },
];

export function NenNav() {
  // Tổng Giám đốc chỉ mở được Hạn mức và Thời hạn — ẩn các tab còn lại, không hiện rồi chặn.
  const canViewNen = useCanViewModule('NEN');
  const items = canViewNen
    ? ITEMS
    : ITEMS.filter((i) => (APPROVAL_RULE_PATHS as readonly string[]).includes(i.to));
  return (
    <nav
      className="mb-4 flex gap-1.5 overflow-x-auto"
      aria-label="Màn hình trong phân hệ"
    >
      {items.map((item) => (
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
