/**
 * Trang bàn giao sang Thi công của một công trình (G4, 0249) — `/ban-giao-thi-cong/:siteId`.
 *
 * KHÔNG bọc ModuleGuard: bộ phận giao (Dự án, Thiết kế, Kinh doanh) không xem được phân hệ Thi
 * công. CSDL (`site_handover_header`, `site_checklist`) quyết ai đọc; trang chỉ có tên công trình
 * và danh mục bàn giao — không giá trị hợp đồng, không dự toán.
 */

import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/app-shell';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useHandoverHeader } from '@/hooks/use-site-handover';
import { HandoverChecklist } from './site-checklist';

export function HandoverPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { data, isLoading, error } = useHandoverHeader(siteId);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data || !siteId) {
    return (
      <EmptyState message="Không tìm thấy gói bàn giao này, hoặc tài khoản không thuộc bộ phận giao / nhận của công trình." />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Bàn giao sang Thi công — ${data.site_code}`}
        description={data.site_name}
        breadcrumbs={
          data.can_open_site
            ? [
                { label: 'Công trình', to: '/tc/cong-trinh' },
                { label: data.site_code, to: `/tc/cong-trinh/${data.site_id}` },
              ]
            : []
        }
      />
      <HandoverChecklist siteId={siteId} />
    </div>
  );
}
