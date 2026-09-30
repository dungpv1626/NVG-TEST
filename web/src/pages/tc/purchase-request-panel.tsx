/**
 * Tab Đề nghị của Chi tiết Công trình — TC-03 + TC-10.
 *
 * Webapp Flow 3.4 bước 3: "Gửi đề nghị mua vật tư phát sinh — chuyển sang Module MH, quay
 * lại khi có hàng". Đây là chỗ chuyển đi và chỗ quay về: Ban công trường bấm một nút, biểu
 * mẫu mở ra đã gắn sẵn công trình, và từng đề nghị hiện ngay tại đây theo mẫu Request
 * Tracker — bước hiện tại, ai đang giữ, chờ bao lâu, nút «Thúc» (TC-10).
 *
 * Không dựng lại biểu mẫu ở đây: nó là biểu mẫu của Module MH, mở kèm tham số công trình.
 * Dựng bản thứ hai là có hai chỗ để lệch nhau về ràng buộc mã chi phí.
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCan } from '@/lib/auth';
import { RequestTrackerList } from './request-tracker';

export function SitePurchaseRequestPanel({
  siteId,
  readOnly,
}: {
  siteId: string;
  readOnly: boolean;
}) {
  const canCreate = useCan('MH', 'create');

  return (
    <div className="space-y-4">
      {canCreate && !readOnly && (
        <Button variant="secondary" size="lg" asChild>
          <Link to={`/mh/de-nghi-mua/tao-moi?cong-trinh=${siteId}`}>Gửi đề nghị vật tư</Link>
        </Button>
      )}
      <RequestTrackerList
        siteId={siteId}
        emptyMessage="Chưa có đề nghị nào từ công trình này. Vật tư phát sinh tại công trường được đề nghị ở đây; sau khi gửi, theo dõi được ai đang giữ và đã chờ bao lâu, và chi phí tự gắn vào đúng mã chi phí trong ngân sách."
      />
    </div>
  );
}
