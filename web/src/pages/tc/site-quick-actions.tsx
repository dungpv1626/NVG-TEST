/**
 * Thanh thao tác nhanh ở công trường — mẫu bố cục 8 (AFD 4.8), chỉ trên điện thoại.
 *
 * Ngân sách thao tác hiện trường là TIÊU CHÍ NGHIỆM THU (PRD v1.4 Mục 6): cập nhật hằng ngày
 * của chỉ huy trưởng dưới 10–20 phút. Ba việc làm nhiều nhất nằm sẵn dưới ngón tay cái, không
 * phải cuộn qua tám tab để tìm.
 *
 * Dính đáy vùng nội dung, ngay trên thanh điều hướng phân hệ. Máy tính không cần: thanh tab đã
 * hiện đủ.
 */

import { Link } from 'react-router-dom';
import { ClipboardList, NotebookPen, PackagePlus } from 'lucide-react';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';

const ITEM =
  'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 ' +
  'text-xs font-medium text-fg hover:bg-surface-hover';

export function SiteQuickActions({ siteId, readOnly }: { siteId: string; readOnly: boolean }) {
  const canRequest = useCan('MH', 'create');

  return (
    <nav
      aria-label="Thao tác nhanh tại công trường"
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-4 flex gap-1 border-t border-border bg-surface p-1',
        'lg:hidden',
      )}
    >
      {!readOnly && (
        <Link to="?tab=nhat-ky" className={ITEM}>
          <NotebookPen className="size-5" aria-hidden />
          Ghi nhật ký
        </Link>
      )}
      {!readOnly && canRequest && (
        <Link to={`/mh/de-nghi-mua/tao-moi?cong-trinh=${siteId}`} className={ITEM}>
          <PackagePlus className="size-5" aria-hidden />
          Đề nghị vật tư
        </Link>
      )}
      <Link to="?tab=de-nghi" className={ITEM}>
        <ClipboardList className="size-5" aria-hidden />
        Theo dõi đề nghị
      </Link>
    </nav>
  );
}
