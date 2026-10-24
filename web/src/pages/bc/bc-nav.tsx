/**
 * Điều hướng phụ trong Module BC.
 *
 * BC không có mục riêng trên Sidebar (Webapp Flow 2.1 gộp BC vào Dashboard) — người dùng vào
 * từng báo cáo qua thẻ chỉ số trên Dashboard, rồi đi lại giữa các báo cáo qua thanh này, cùng
 * quy tắc "không quá 3 cú nhấp" đã áp dụng cho CRM (`crm-nav.tsx`).
 */

import { NavLink } from 'react-router-dom';
import { useSensitiveAccess } from '@/hooks/use-sensitive-access';
import { cn } from '@/lib/utils';

const FINANCE_ITEM = { to: '/bc/tong-quan', label: 'Tổng quan tài chính' };

const PROFIT_ITEM = { to: '/bc/lai-lo', label: 'Lãi/lỗ theo công trình' };
const SITE_PROFIT_ITEM = { to: '/bc/lai-lo-quan-tri', label: 'Lãi/lỗ quản trị' };
const SALES_ITEM = { to: '/bc/hieu-qua-kinh-doanh', label: 'Hiệu quả kinh doanh' };

export function BcNav() {
  // Ẩn mục khi không có quyền xem tài chính / lợi nhuận — không hiện rồi báo chặn (CLAUDE.md 5.4).
  const access = useSensitiveAccess();
  const items = [
    ...(access.data?.finance ? [FINANCE_ITEM] : []),
    ...(access.data?.profit ? [PROFIT_ITEM, SITE_PROFIT_ITEM] : []),
    SALES_ITEM,
  ];
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
