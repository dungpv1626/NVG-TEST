/**
 * Danh sách Đề nghị mua (MH-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Cột "thời hạn" là THỜI ĐIỂM CẦN HÀNG, không phải ngày lập: đó là mốc quyết định đề nghị
 * này có kịp phục vụ thi công hay không (MH-01), và cũng là hạn xử lý mà Hộp thư Phê duyệt
 * dùng. Quá ngày cần hàng mà hồ sơ còn đang mở thì hiện Quá hạn — trạng thái suy ra, không
 * lưu trong CSDL.
 */

import {
  MODULE_EMPTY_STATES,
  PURCHASE_REQUEST_STAGE_META,
  PURCHASE_URGENCY_LABELS,
  formatCurrency,
  purchaseRequestDisplayStatus,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, useCreateActions, type EntityRow } from '@/components/entity/entity-table';
import { usePurchaseRequests } from '@/hooks/use-purchasing';
import { useCan } from '@/lib/auth';
import { MhNav } from './mh-nav';

interface RequestRow extends EntityRow {
  stageLabel: string;
  urgencyLabel: string;
  isUrgent: boolean;
  estimatedValue: string;
}

export function PurchaseRequestListPage() {
  const canCreate = useCan('MH', 'create');
  const { data, isLoading, error, refetch } = usePurchaseRequests();

  const rows: RequestRow[] = (data ?? []).map((r) => ({
    id: r.id,
    code: r.code ?? '—',
    title: r.title,
    responsiblePerson: r.requester?.full_name ?? null,
    status: purchaseRequestDisplayStatus(r.stage, r.needed_date),
    deadline: r.needed_date,
    companyId: r.company_id,
    createdAt: r.created_at,
    stageLabel: PURCHASE_REQUEST_STAGE_META[r.stage].label,
    urgencyLabel: PURCHASE_URGENCY_LABELS[r.urgency],
    isUrgent: r.urgency === 'gap',
    estimatedValue: r.estimated_value,
  }));

  const { headerAction, emptyAction } = useCreateActions({
    canCreate,
    label: 'Lập đề nghị mua',
    to: '/mh/de-nghi-mua/tao-moi',
    isEmpty: !isLoading && !error && rows.length === 0,
  });

  return (
    <>
      <MhNav />
      <PageHeader
        title="Đề nghị mua"
        breadcrumbs={[{ label: 'Mua hàng – Vật tư' }, { label: 'Đề nghị mua' }]}
        actions={headerAction}
      />

      <EntityTable<RequestRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/mh/de-nghi-mua/${row.id}`}
        searchPlaceholder="Tìm theo mã, tên hàng hoặc người đề nghị…"
        emptyMessage={`${MODULE_EMPTY_STATES.MH} Đề nghị mua được lập từ công trường, từ gói thầu đang chuẩn bị, hoặc cho nhu cầu văn phòng.`}
        emptyAction={emptyAction}
        columns={[
          { key: 'stage', header: 'Bước', render: (r) => r.stageLabel },
          {
            key: 'urgency',
            header: 'Mức cần',
            // Cần gấp in đậm chứ không tô màu: năm màu trạng thái đã dành cho vòng đời hồ sơ,
            // thêm một màu nữa ở cột này là phá hệ thống (Content Guidelines 6.8).
            render: (r) =>
              r.isUrgent ? (
                <span className="font-semibold">{r.urgencyLabel}</span>
              ) : (
                <span className="text-fg-subtle">{r.urgencyLabel}</span>
              ),
          },
          {
            key: 'value',
            header: 'Giá trị ước tính',
            numeric: true,
            render: (r) =>
              r.estimatedValue && r.estimatedValue !== '0' ? (
                formatCurrency(r.estimatedValue)
              ) : (
                <span className="text-fg-subtle">Chưa chốt</span>
              ),
          },
        ]}
      />
    </>
  );
}
