/**
 * Điều hướng phụ trong Module TK — cùng vai trò với `CrmNav` và `DaNav` (Webapp Flow 2.1).
 */

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/tk/du-an', label: 'Dự án thiết kế' },
  { to: '/tk/ai-design', label: 'AI Design' },
  { to: '/tk/ho-so-cu', label: 'Hồ sơ cũ đã số hoá' },
  // Phòng Thiết kế đưa công trình đã làm vào thư viện chào khách (1H).
  { to: '/mau-cong-trinh', label: 'Mẫu công trình' },
];

export function TkNav() {
  return (
    <nav className="mb-4 flex gap-1.5 overflow-x-auto" aria-label="Màn hình trong phân hệ">
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
