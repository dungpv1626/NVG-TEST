/**
 * Điều hướng phụ trong Module BC.
 *
 * BC không có mục riêng trên Sidebar (Webapp Flow 2.1 gộp BC vào Dashboard) — người dùng vào
 * từng báo cáo qua thẻ chỉ số trên Dashboard, rồi đi lại giữa các báo cáo qua thanh này, cùng
 * quy tắc "không quá 3 cú nhấp" đã áp dụng cho CRM (`crm-nav.tsx`).
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/bc/lai-lo', label: 'Lãi/lỗ theo công trình' },
  { to: '/bc/hieu-qua-kinh-doanh', label: 'Hiệu quả kinh doanh' },
];

export function BcNav() {
  return (
    <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Màn hình trong phân hệ">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3 py-2',
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
