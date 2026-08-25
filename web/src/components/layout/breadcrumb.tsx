/**
 * Breadcrumb — vùng 3 của App Shell (Webapp Flow Mục 2.1 và 5.2).
 *
 * Hiển thị vị trí hiện tại dạng `Module › Hồ sơ cha › Hồ sơ hiện tại`; mỗi mắt xích bấm
 * được để quay lại đúng cấp đó, thay vì phải bấm nút Back của trình duyệt.
 *
 * ⚠️ Webapp Flow 5.2: breadcrumb phải phản ánh ĐƯỜNG ĐI THỰC TẾ của người dùng, không phải
 * cấu trúc menu cố định — đến một Hợp đồng từ Dự án thì hiện `Dự án › Hợp đồng`; đến từ
 * danh sách Hợp đồng thì hiện `Hợp đồng › (tên hợp đồng)`.
 * Phần theo dõi đường đi thực tế sẽ bổ sung ở Phase 4A cùng panel Hồ sơ 360°.
 */

import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Đường dẫn phân cấp" className="flex items-center gap-1 text-xs">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {item.to && !isLast ? (
              <Link to={item.to} className="text-fg-subtle hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-fg' : 'text-fg-subtle'}>
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="size-3 text-fg-subtle" />}
          </span>
        );
      })}
    </nav>
  );
}
