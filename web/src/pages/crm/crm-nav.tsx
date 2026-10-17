/**
 * Điều hướng phụ trong Module CRM.
 *
 * Sidebar chỉ liệt kê 12 module (Webapp Flow 2.1); các màn hình bên trong một module đi lại
 * qua thanh này. Giữ nguyên tắc "không quá 3 cú nhấp để đến một hồ sơ" (Webapp Flow 1.3):
 * Sidebar → thanh này → Chi tiết.
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  // Đầu mối đứng trước Cơ hội: đúng thứ tự một khách đi qua (Đợt 1 — 1A).
  { to: '/crm/dau-moi', label: 'Đầu mối' },
  { to: '/crm/co-hoi', label: 'Cơ hội kinh doanh' },
  { to: '/crm/khach-hang', label: 'Khách hàng' },
  { to: '/crm/khach-cu', label: 'Khách cũ' },
  { to: '/crm/khieu-nai', label: 'Khiếu nại' },
  // Thư viện dùng chung cả công ty (1H) — Kinh doanh chào khách từ đây.
  { to: '/mau-cong-trinh', label: 'Mẫu công trình' },
];

export function CrmNav() {
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
