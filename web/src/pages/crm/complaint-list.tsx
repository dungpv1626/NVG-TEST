/**
 * Danh sách Khiếu nại (PRD CRM-08) — mẫu bố cục 2 "Danh sách" (Webapp Flow 4.2).
 *
 * Trạng thái hiển thị KHÔNG lấy thẳng cột `status`: khiếu nại quá hạn phản hồi phải hiện
 * màu "Quá hạn" dù cột trong CSDL vẫn là "Đang xử lý" (xem `complaintDisplayStatus`).
 * Đây là lý do màn hình này không dùng thẳng dữ liệu thô.
 */

import { useState } from 'react';
import {
  BUTTONS,
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  SCREEN_EMPTY_STATES,
  complaintDisplayStatus,
  type ComplaintSeverity,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { CreateButton, EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useComplaints } from '@/hooks/use-complaints';
import { useCan } from '@/lib/auth';
import { CrmNav } from './crm-nav';

interface ComplaintRow extends EntityRow {
  severity: ComplaintSeverity;
  customerName: string;
}

/** Mức độ nghiêm trọng KHÔNG dùng màu trạng thái — đó là hai chiều thông tin khác nhau. */
const SEVERITY_STYLE: Record<ComplaintSeverity, string> = {
  cao: 'font-semibold text-fg',
  trung_binh: 'text-fg',
  thap: 'text-fg-subtle',
};

export function ComplaintListPage() {
  const canCreate = useCan('CRM', 'create');
  const [severity, setSeverity] = useState<'' | ComplaintSeverity>('');

  const { data, isLoading, error, refetch } = useComplaints();

  const rows: ComplaintRow[] = (data ?? [])
    .filter((c) => !severity || c.severity === severity)
    .map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      responsiblePerson: c.assignee?.full_name ?? null,
      status: complaintDisplayStatus(c.status, c.response_due_date),
      // Đã xử lý xong thì thôi đếm ngược: cột Thời hạn ghi "Quá hạn 1 ngày" cạnh nhãn
      // "Hoàn thành" đọc ra như hồ sơ vẫn đang trễ hạn.
      deadline: c.status === 'completed' ? null : c.response_due_date,
      severity: c.severity,
      customerName: c.customer?.name ?? '—',
    }));

  const createLabel = BUTTONS.create('khiếu nại');
  const createButton = canCreate ? (
    <CreateButton to="/crm/khieu-nai/tao-moi" label={createLabel} />
  ) : undefined;
  // Trạng thái rỗng dùng bản `secondary` — nút ở header đã là hành động chính (CGD 6.3).
  const emptyStateButton = canCreate ? (
    <CreateButton to="/crm/khieu-nai/tao-moi" label={createLabel} variant="secondary" />
  ) : undefined;

  return (
    <>
      <PageHeader
        title="Khiếu nại khách hàng"
        breadcrumbs={[{ label: 'Khách hàng & Cơ hội' }, { label: 'Khiếu nại' }]}
        actions={createButton}
      />
      <CrmNav />

      <EntityTable
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/crm/khieu-nai/${row.id}`}
        searchPlaceholder="Tìm theo mã, tiêu đề hoặc người chủ trì…"
        emptyMessage={SCREEN_EMPTY_STATES.complaints}
        emptyAction={emptyStateButton}
        filters={
          <label className="flex items-center gap-2">
            <span className="text-fg-subtle">Mức độ</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as '' | ComplaintSeverity)}
              className="h-9 rounded-sm border border-border bg-surface px-2"
            >
              <option value="">Tất cả</option>
              {COMPLAINT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {COMPLAINT_SEVERITY_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        }
        columns={[
          {
            key: 'customer',
            header: 'Khách hàng',
            render: (row) => row.customerName,
          },
          {
            key: 'severity',
            header: 'Mức độ',
            render: (row) => (
              <span className={SEVERITY_STYLE[row.severity]}>
                {COMPLAINT_SEVERITY_LABELS[row.severity]}
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
