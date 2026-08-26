/**
 * Danh sách Dự án thiết kế (TK-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Cột "thời hạn" là HẠN BÀN GIAO HỒ SƠ THI CÔNG: với dự án thiết kế NVO, đó là mốc quyết
 * định công trường có khởi công đúng kế hoạch hay không.
 */

import {
  BUTTONS,
  DESIGN_STAGE_META,
  designDisplayStatus,
  formatDate,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { CreateButton, EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useDesignProjects } from '@/hooks/use-design-projects';
import { useCan } from '@/lib/auth';
import { TkNav } from './tk-nav';

interface DesignRow extends EntityRow {
  stageLabel: string;
  customerName: string | null;
  handedOverAt: string | null;
}

export function DesignListPage() {
  const canCreate = useCan('TK', 'create');
  const { data, isLoading, error, refetch } = useDesignProjects();

  const rows: DesignRow[] = (data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    title: p.name,
    responsiblePerson: p.responsible?.full_name ?? null,
    status: designDisplayStatus(p.stage, p.handover_deadline),
    deadline: p.handover_deadline,
    companyId: p.company_id,
    createdAt: p.created_at,
    stageLabel: DESIGN_STAGE_META[p.stage].label,
    customerName: p.customer?.name ?? null,
    handedOverAt: p.handed_over_at,
  }));

  const createLabel = BUTTONS.create('dự án thiết kế');
  const createButton = canCreate ? (
    <CreateButton label={createLabel} to="/tk/du-an/tao-moi" />
  ) : undefined;
  const isEmpty = !isLoading && !error && rows.length === 0;

  return (
    <>
      <TkNav />
      <PageHeader
        title="Dự án thiết kế"
        breadcrumbs={[{ label: 'Thiết kế' }, { label: 'Dự án thiết kế' }]}
        actions={isEmpty ? undefined : createButton}
      />

      <EntityTable<DesignRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/tk/du-an/${row.id}`}
        searchPlaceholder="Tìm theo tên, mã hoặc người chịu trách nhiệm…"
        emptyMessage={
          canCreate
            ? 'Chưa có dự án thiết kế nào. Tạo hồ sơ khi nhận đầu bài từ Kinh doanh hoặc trực tiếp từ khách hàng.'
            : 'Chưa có dự án thiết kế nào. Vai trò hiện tại không có quyền tạo hồ sơ thiết kế.'
        }
        emptyAction={
          canCreate ? (
            <CreateButton label={createLabel} to="/tk/du-an/tao-moi" variant="secondary" />
          ) : undefined
        }
        columns={[
          { key: 'stage', header: 'Bước', render: (r) => r.stageLabel },
          {
            key: 'customer',
            header: 'Khách hàng',
            render: (r) => r.customerName ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'handover',
            header: 'Bàn giao thi công',
            render: (r) =>
              r.handedOverAt ? (
                formatDate(r.handedOverAt)
              ) : (
                <span className="text-fg-subtle">Chưa bàn giao</span>
              ),
          },
        ]}
      />
    </>
  );
}
