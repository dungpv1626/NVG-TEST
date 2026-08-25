/**
 * Trang tạm cho các module chưa xây (Phase 2 trở đi).
 *
 * Có mặt trong điều hướng ngay từ Phase 0 để kiểm chứng menu theo vai trò hoạt động đúng,
 * nhưng nói thẳng module chưa sẵn sàng thay vì để màn hình trắng (Webapp Flow 6.7).
 */

import { MODULES, type ModuleCode } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { cn } from '@/lib/utils';

export function PlaceholderPage({ moduleCode }: { moduleCode: ModuleCode }) {
  const meta = MODULES[moduleCode];

  return (
    <>
      <PageHeader
        title={meta.label}
        description={meta.description}
        breadcrumbs={[{ label: meta.label }]}
      />
      <div
        className={cn(
          'rounded-lg border border-dashed border-border',
          'bg-surface p-8 text-center',
        )}
      >
        <p className="font-medium">Phân hệ này đang được xây dựng.</p>
        <p className="mt-1 text-fg-subtle">
          Dự kiến hoàn thành ở Giai đoạn {meta.phase}.
          {meta.directionalOnly &&
            ' Yêu cầu hiện ở mức định hướng, chờ bổ sung dữ liệu khảo sát trực tiếp.'}
        </p>
      </div>
    </>
  );
}
