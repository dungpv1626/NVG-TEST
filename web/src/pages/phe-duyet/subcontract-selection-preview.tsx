/**
 * Chọn thầu phụ trong Hộp thư Phê duyệt (G2, 0246): người duyệt đọc đúng bảng so báo giá Ban công
 * trường dùng để chọn — giá, cách khoán, giữ lại bảo hành, đánh giá các đợt trước, ngân sách còn lại,
 * lý do chọn. Chỉ xem; sửa ở trang gói việc.
 */

import { formatCurrency } from '@nvg/shared';
import { Skeleton } from '@/components/ui/states';
import { useSelectionBoard } from '@/hooks/use-subcontracts';
import { SelectionBoardView } from '@/pages/tc/subcontract-selection-page';

export function SubcontractSelectionPreview({ selectionId }: { selectionId: string }) {
  const { data, isLoading, error } = useSelectionBoard(selectionId);
  return (
    <div className="space-y-2">
      <dt className="text-xs text-fg-subtle">Bảng so báo giá thầu phụ</dt>
      <dd className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : error || !data ? (
          <p className="text-fg-subtle">Không đọc được bảng so báo giá của gói việc này.</p>
        ) : (
          <>
            <p>
              {data.site.code} — {data.site.name} · gói việc {data.work_package}
              {data.budget &&
                ` · ngân sách «${data.budget.name}» còn ${formatCurrency(
                  data.budget_remaining_at_submit ?? data.budget.remaining,
                )} lúc gửi`}
            </p>
            <SelectionBoardView board={data} />
          </>
        )}
      </dd>
    </div>
  );
}
