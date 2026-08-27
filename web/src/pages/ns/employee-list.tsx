/**
 * Danh sách Hồ sơ nhân sự (NS-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Ba cột riêng của phân hệ này là ba thứ Hành chính – Nhân sự tra nhiều nhất: KHỐI (quyết
 * định cách chấm công — NS-04), CHỨC DANH, và NƠI LÀM VIỆC (công trường nào, hay văn phòng).
 *
 * ⚠️ KHÔNG có cột lương. Lương là dữ liệu hạn chế và mỗi lượt xem đều ghi nhật ký (NEN-07) —
 * đưa lên màn hình danh sách là biến nó thành thứ ai đi ngang cũng đọc được.
 */

import { EMPLOYEE_STATUS_META, MODULE_EMPTY_STATES, WORK_BLOCK_LABELS } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, useCreateActions, type EntityRow } from '@/components/entity/entity-table';
import { useEmployees } from '@/hooks/use-hr';
import { useCan } from '@/lib/auth';
import { NsNav } from './ns-nav';

interface EmployeeRow extends EntityRow {
  blockLabel: string;
  position: string;
  workplace: string;
  statusLabel: string;
}

export function EmployeeListPage() {
  const canCreate = useCan('NS', 'create');
  const { data, isLoading, error, refetch } = useEmployees();

  const rows: EmployeeRow[] = (data ?? []).map((e) => ({
    id: e.id,
    code: e.code ?? '—',
    title: e.full_name,
    responsiblePerson: e.manager?.full_name ?? null,
    status: EMPLOYEE_STATUS_META[e.status].group,
    // "Thời hạn" của một hồ sơ nhân sự là hạn đánh giá thử việc (NS-03) — thứ duy nhất trên
    // hồ sơ có ngày phải hành động trước.
    deadline: e.status === 'thu_viec' ? e.probation_end_date : null,
    companyId: e.company_id,
    createdAt: e.created_at,
    blockLabel: WORK_BLOCK_LABELS[e.block],
    position: e.position,
    workplace: e.site?.name ?? e.department ?? '—',
    statusLabel: EMPLOYEE_STATUS_META[e.status].label,
  }));

  const { headerAction, emptyAction } = useCreateActions({
    canCreate,
    label: 'Thêm nhân sự',
    to: '/ns/nhan-su/tao-moi',
    isEmpty: !isLoading && !error && rows.length === 0,
  });

  return (
    <>
      <NsNav />
      <PageHeader
        title="Hồ sơ nhân sự"
        description="Một hồ sơ duy nhất cho mỗi người, từ lúc nhận việc tới lúc bàn giao."
        breadcrumbs={[{ label: 'Hành chính – Nhân sự' }, { label: 'Hồ sơ nhân sự' }]}
        actions={headerAction}
      />

      <EntityTable<EmployeeRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/ns/nhan-su/${row.id}`}
        searchPlaceholder="Tìm theo tên, mã nhân sự hoặc chức danh…"
        emptyMessage={MODULE_EMPTY_STATES.NS ?? 'Chưa có hồ sơ nhân sự nào.'}
        emptyAction={emptyAction}
        columns={[
          { key: 'block', header: 'Khối', render: (r) => r.blockLabel },
          { key: 'position', header: 'Chức danh', render: (r) => r.position },
          {
            key: 'workplace',
            header: 'Nơi làm việc',
            render: (r) => <span className="text-fg-subtle">{r.workplace}</span>,
          },
          {
            key: 'statusLabel',
            header: 'Tình trạng',
            render: (r) => r.statusLabel,
          },
        ]}
      />
    </>
  );
}
