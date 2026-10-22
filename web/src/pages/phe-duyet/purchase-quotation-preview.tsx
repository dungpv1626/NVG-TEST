/**
 * Bảng so giá trong Hộp thư Phê duyệt — Đợt 4, 4B.
 *
 * Người duyệt đề nghị mua đọc đúng bảng Mua hàng dùng để chọn nhà cung cấp, ngay trong hộp duyệt
 * (cùng cách 1E hiện văn bản hợp đồng): tổng chi phí, giao, VAT, đơn giá từng mặt hàng, giá lần
 * mua trước, nhà cung cấp đã chọn và căn cứ chọn. Chỉ xem — chọn / sửa ở trang đề nghị.
 */

import { useQuotationBoard } from '@/hooks/use-purchase-pool';
import { Skeleton } from '@/components/ui/states';
import { QuotationBoardTable } from '@/pages/mh/quotation-board';

export function PurchaseQuotationPreview({ requestId }: { requestId: string }) {
  const { data, isLoading, error } = useQuotationBoard(requestId);

  return (
    <div className="space-y-2">
      <dt className="text-xs text-fg-subtle">Bảng so giá nhà cung cấp</dt>
      <dd>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <p className="text-fg-subtle">
            Bảng so giá chỉ mở cho Ban Giám đốc, Tài chính, Dự án – Đấu thầu, Thiết kế và Mua hàng.
          </p>
        ) : !data || data.quotations.length === 0 ? (
          <p className="text-fg-subtle">
            Mua hàng chưa nhập báo giá nào. Đề nghị được duyệt theo giá ước tính; nhà cung cấp chọn
            sau.
          </p>
        ) : (
          <QuotationBoardTable board={data} />
        )}
      </dd>
    </div>
  );
}
