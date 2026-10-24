/**
 * Điều hướng phụ của Thi công — cùng vai trò với `KtNav`, `NsNav` (Webapp Flow 2.1).
 *
 * Phân công và Chấm công khối công trường là màn hình của phân hệ khác (Quản trị, Nhân sự) mà
 * Trưởng phòng Thi công được dùng một phần; chỉ hiện với người dùng được (cùng điều kiện với
 * guard của route), không hiện rồi chặn.
 */

import { NavLink } from 'react-router-dom';
import {
  useConfirmsSiteTimesheets,
  useManagesSiteAssignments,
} from '@/components/layout/module-nav';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function TcNav() {
  const managesSites = useManagesSiteAssignments();
  const canViewNen = useCan('NEN', 'view');
  const confirmsTimesheets = useConfirmsSiteTimesheets();

  const items = [
    { to: '/tc/cong-trinh', label: 'Công trình', show: true },
    { to: '/tc/bang-theo-doi', label: 'Bảng theo dõi', show: true },
    { to: '/tc/de-nghi', label: 'Theo dõi đề nghị', show: true },
    { to: '/nen/phan-cong', label: 'Phân công', show: managesSites || canViewNen },
    { to: '/ns/cham-cong', label: 'Chấm công công trường', show: confirmsTimesheets },
  ].filter((i) => i.show);

  return (
    <nav
      className="mb-4 flex gap-1.5 overflow-x-auto"
      aria-label="Màn hình trong phân hệ"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/tc/cong-trinh'}
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
