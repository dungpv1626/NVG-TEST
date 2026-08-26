/**
 * Tab Đề nghị mua của Chi tiết Công trình (TC-03).
 *
 * Webapp Flow 3.4 bước 3: "Gửi đề nghị mua vật tư phát sinh — chuyển sang Module MH, quay
 * lại khi có hàng". Đây là chỗ chuyển đi và chỗ quay về: Ban công trường bấm một nút, biểu
 * mẫu mở ra đã gắn sẵn công trình, và trạng thái từng đề nghị hiện ngay tại đây.
 *
 * Không dựng lại biểu mẫu ở đây: nó là biểu mẫu của Module MH, mở kèm tham số công trình.
 * Dựng bản thứ hai là có hai chỗ để lệch nhau về ràng buộc mã chi phí.
 */

import { Link } from 'react-router-dom';
import {
  PURCHASE_REQUEST_STAGE_META,
  formatCurrency,
  formatDate,
  purchaseRequestDisplayStatus,
} from '@nvg/shared';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useRequestsOfSite } from '@/hooks/use-purchasing';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';

const EM_DASH = '—';

export function SitePurchaseRequestPanel({
  siteId,
  readOnly,
}: {
  siteId: string;
  readOnly: boolean;
}) {
  const canCreate = useCan('MH', 'create');
  const { data, isLoading, error } = useRequestsOfSite(siteId);

  if (isLoading) return <TableSkeleton rows={3} columns={5} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;

  const rows = data ?? [];
  const createButton = canCreate && !readOnly && (
    <Button variant="secondary" asChild>
      <Link to={`/mh/de-nghi-mua/tao-moi?cong-trinh=${siteId}`}>Gửi đề nghị mua vật tư</Link>
    </Button>
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState message="Chưa có đề nghị mua nào từ công trình này. Vật tư phát sinh tại công trường được đề nghị ở đây, và chi phí sẽ tự gắn vào đúng mã chi phí trong ngân sách." />
        {createButton}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left">
          <thead className="border-b border-border text-fg-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Mã</th>
              <th scope="col" className="py-2 pr-4 font-medium">Nội dung</th>
              <th scope="col" className="py-2 pr-4 font-medium">Mã chi phí</th>
              <th scope="col" className="py-2 pr-4 font-medium">Cần trước ngày</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Giá trị ước tính</th>
              <th scope="col" className="py-2 pr-4 font-medium">Bước</th>
              <th scope="col" className="py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((request) => (
              <tr key={request.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-4">
                  <Link
                    to={`/mh/de-nghi-mua/${request.id}`}
                    className="text-brand underline-offset-4 hover:underline"
                  >
                    {request.code ?? 'Mở hồ sơ'}
                  </Link>
                </td>
                <td className="py-2 pr-4">{request.title}</td>
                <td className="py-2 pr-4">{request.cost_code ?? EM_DASH}</td>
                <td className="py-2 pr-4">
                  {request.needed_date ? formatDate(request.needed_date) : EM_DASH}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {request.estimated_value && request.estimated_value !== '0'
                    ? formatCurrency(request.estimated_value)
                    : EM_DASH}
                </td>
                <td className="py-2 pr-4">{PURCHASE_REQUEST_STAGE_META[request.stage].label}</td>
                <td className="py-2">
                  <StatusLozenge
                    status={purchaseRequestDisplayStatus(request.stage, request.needed_date)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {createButton}
    </div>
  );
}
