/**
 * Theo dõi đề nghị — mọi công trình người dùng được xem (TC-10, mẫu bố cục 7).
 *
 * Chỉ huy trưởng phụ trách nhiều công trình, hoặc văn phòng thi công, cần một chỗ trả lời
 * «đề nghị nào của tôi đang kẹt ở đâu» mà không phải mở từng công trình. Phạm vi công trình do
 * CSDL quyết (Mẫu E) — ở đây không lọc lại.
 */

import { useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { RequestTrackerList } from './request-tracker';

type Scope = 'cua-toi' | 'tat-ca';

const SCOPE_LABELS: Record<Scope, string> = {
  'cua-toi': 'Tôi đã gửi',
  'tat-ca': 'Tất cả công trình',
};

export function SiteRequestsPage() {
  const [scope, setScope] = useState<Scope>('cua-toi');

  return (
    <>
      <PageHeader
        title="Theo dõi đề nghị"
        breadcrumbs={[
          { label: 'Thi công & Ngân sách' },
          { label: 'Công trình', to: '/tc/cong-trinh' },
          { label: 'Theo dõi đề nghị' },
        ]}
        description="Đề nghị từ công trường đang ở bước nào, ai đang giữ, đã chờ bao lâu — và nhắc người đang giữ khi cần."
      />
      <SegmentedControl
        options={['cua-toi', 'tat-ca'] as const}
        value={scope}
        onChange={setScope}
        getLabel={(s) => SCOPE_LABELS[s]}
        className="mb-4"
      />
      <RequestTrackerList
        mineOnly={scope === 'cua-toi'}
        emptyMessage={
          scope === 'cua-toi'
            ? 'Chưa gửi đề nghị nào từ công trường. Mở một công trình và chọn «Gửi đề nghị vật tư».'
            : 'Chưa có đề nghị nào từ các công trình đang được xem.'
        }
      />
    </>
  );
}
