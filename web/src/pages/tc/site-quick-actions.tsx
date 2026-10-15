/**
 * Thanh thao tác nhanh ở công trường — mẫu bố cục 8 (AFD 4.8), chỉ trên điện thoại.
 *
 * Ngân sách thao tác hiện trường là TIÊU CHÍ NGHIỆM THU (PRD v1.4 Mục 6): cập nhật hằng ngày
 * của chỉ huy trưởng dưới 10–20 phút. Bốn việc làm nhiều nhất nằm sẵn dưới ngón tay cái, không
 * phải cuộn qua tám tab để tìm.
 *
 * Trên điện thoại, bốn nút này THAY thanh điều hướng phân hệ (kèm nút «Phân hệ» mở bảng đầy đủ)
 * thay vì dính chồng lên nó — trước đây hai thanh chiếm ~150px và che ô nhập nhật ký (review UX,
 * doc/MOC_CAI_TIEN_UX.md vấn đề 2). Nút Điểm danh (chụp ảnh) luôn nằm trên thanh (AFD 4.8). Máy
 * tính không cần: thanh tab đã hiện đủ.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ClipboardList, NotebookPen, PackagePlus } from 'lucide-react';
import { useCan } from '@/lib/auth';
import { useBottomBarActions } from '@/components/layout/bottom-bar-slot';

const ITEM =
  'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 ' +
  'text-center text-xs leading-tight font-medium text-fg hover:bg-surface-hover';

export function SiteQuickActions({ siteId, readOnly }: { siteId: string; readOnly: boolean }) {
  const canRequest = useCan('MH', 'create');

  const actions = useMemo(
    () => <QuickActionItems siteId={siteId} readOnly={readOnly} canRequest={canRequest} />,
    [siteId, readOnly, canRequest],
  );
  useBottomBarActions(actions);
  return null;
}

function QuickActionItems({
  siteId,
  readOnly,
  canRequest,
}: {
  siteId: string;
  readOnly: boolean;
  canRequest: boolean;
}) {
  return (
    <>
      {!readOnly && (
        <Link to="?tab=diem-danh" className={ITEM}>
          <Camera className="size-5" aria-hidden />
          Điểm danh
        </Link>
      )}
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
    </>
  );
}
