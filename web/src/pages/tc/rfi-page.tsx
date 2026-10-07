/**
 * Trang một yêu cầu làm rõ — `/lam-ro/:id`, nơi thông báo dẫn tới (TC-15, TK-08).
 *
 * Không bọc `ModuleGuard`: người trả lời có thể là Phòng Thiết kế hay Dự án, không xem được Module TC;
 * ai đọc được là do RLS của bảng `rfis` quyết (bên công trường theo Mẫu E, bên được hỏi theo tuyến).
 */

import { Link, useParams } from 'react-router-dom';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { RfiCard } from '@/components/rfi/rfi-ui';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useRfi } from '@/hooks/use-rfis';
import { useCan } from '@/lib/auth';

export function RfiPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useRfi(id);
  const canViewSite = useCan('TC', 'view');
  const canViewDesign = useCan('TK', 'view');

  if (isLoading) return <CardGridSkeleton count={1} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound entity="yêu cầu làm rõ" listPath="/dashboard" listLabel="Về Dashboard" />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <p className="text-sm text-fg-subtle">Yêu cầu làm rõ</p>
        <h1 className="text-page-title font-semibold">{data.title}</h1>
        <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {canViewSite && data.site && (
            <Link
              className="text-brand underline-offset-4 hover:underline"
              to={`/tc/cong-trinh/${data.construction_site_id}?tab=lam-ro`}
            >
              Công trình {data.site.code}
            </Link>
          )}
          {canViewDesign && data.design_project_id && (
            <Link
              className="text-brand underline-offset-4 hover:underline"
              to={`/tk/du-an/${data.design_project_id}?tab=lam-ro`}
            >
              Hồ sơ thiết kế
            </Link>
          )}
        </div>
      </div>
      <ul>
        <RfiCard rfi={data} showSite linkTitle={false} />
      </ul>
    </div>
  );
}
