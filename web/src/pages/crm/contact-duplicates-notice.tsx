/**
 * Báo «số này đã có trong hệ thống» — dùng chung cho biểu mẫu Đầu mối và Khách hàng (1A).
 *
 * Trước 20/10/2026 chỉ biểu mẫu Đầu mối kiểm trùng; tạo khách hàng ở màn hình Khách hàng với
 * đúng số của một đầu mối đang chăm sóc thì không báo gì (chủ dự án chạy thử thấy).
 */

import { Link } from 'react-router-dom';
import { LEAD_STATUS_META } from '@nvg/shared';
import type { DuplicateHit } from '@/hooks/use-leads';

export function ContactDuplicatesNotice({
  hits,
  footer,
}: {
  hits: readonly DuplicateHit[];
  footer?: string | null;
}) {
  if (hits.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-sm border border-status-pending bg-status-pending-bg px-3 py-2 sm:col-span-2"
    >
      <p className="font-medium text-status-pending">Số này đã có trong hệ thống</p>
      <ul className="mt-1 space-y-0.5">
        {hits.map((d) => (
          <li key={`${d.kind}-${d.id}`}>
            <Link
              to={d.kind === 'lead' ? `/crm/dau-moi/${d.id}` : `/crm/khach-hang/${d.id}`}
              className="text-brand hover:underline"
            >
              {d.kind === 'lead' ? 'Đầu mối' : 'Khách hàng'} {d.code} — {d.name}
            </Link>
            {d.company_code && <span className="text-fg-subtle"> · {d.company_code}</span>}
            {d.owner_name && <span className="text-fg-subtle"> · phụ trách: {d.owner_name}</span>}
            {d.status && (
              <span className="text-fg-subtle"> · {LEAD_STATUS_META[d.status].label}</span>
            )}
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1 text-fg-subtle">{footer}</p>}
    </div>
  );
}
