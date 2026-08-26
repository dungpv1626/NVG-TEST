/**
 * Danh sách Đơn đặt hàng (MH-06) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * KHÔNG có nút "Tạo đơn hàng": đơn hàng luôn sinh ra từ một đề nghị đã duyệt và một báo giá
 * đã chọn (MH-02, MH-04). Tạo tay ở đây là mở đường đặt hàng trước rồi trình duyệt sau.
 *
 * Cột "thời hạn" là NGÀY GIAO CAM KẾT — MH-06 nói rõ phải "theo dõi tiến độ giao hàng theo
 * cam kết", và cột này là chỗ nhìn thấy đơn nào đang trễ.
 */

import type { StatusGroup } from '@nvg/shared';
import {
  MODULE_EMPTY_STATES,
  PURCHASE_ORDER_STAGE_META,
  formatCurrency,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { usePurchaseOrders } from '@/hooks/use-purchasing';
import { MhNav } from './mh-nav';

interface OrderRow extends EntityRow {
  stageLabel: string;
  supplierName: string | null;
  totalValue: string;
}

/**
 * Đơn hàng chưa nhận đủ mà đã quá ngày giao cam kết thì hiện Quá hạn — suy ra khi hiển thị,
 * không lưu thành cột (lưu thì phải có tác vụ nền quét lại mỗi ngày, và mỗi lần sót là một
 * dòng hiển thị sai).
 */
function orderStatus(
  stage: keyof typeof PURCHASE_ORDER_STAGE_META,
  promisedDate: string | null,
): StatusGroup {
  const base = PURCHASE_ORDER_STAGE_META[stage].statusGroup;
  if (stage === 'da_giao_du' || stage === 'huy' || stage === 'nhap') return base;
  if (!promisedDate) return base;
  const due = new Date(`${promisedDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return base;
  return due.getTime() < Date.now() ? 'overdue' : base;
}

export function PurchaseOrderListPage() {
  const { data, isLoading, error, refetch } = usePurchaseOrders();

  const rows: OrderRow[] = (data ?? []).map((o) => ({
    id: o.id,
    code: o.code ?? '—',
    title: o.request?.title ?? 'Đơn đặt hàng',
    responsiblePerson: o.supplier?.name ?? null,
    status: orderStatus(o.stage, o.promised_date),
    deadline: o.promised_date,
    companyId: o.company_id,
    createdAt: o.created_at,
    stageLabel: PURCHASE_ORDER_STAGE_META[o.stage].label,
    supplierName: o.supplier?.name ?? null,
    totalValue: o.total_value,
  }));

  return (
    <>
      <MhNav />
      <PageHeader
        title="Đơn đặt hàng"
        breadcrumbs={[{ label: 'Đơn đặt hàng' }]}
        description="Đơn hàng được lập từ đề nghị mua đã duyệt và báo giá đã chọn — không lập trực tiếp ở đây."
      />

      <EntityTable<OrderRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/mh/don-hang/${row.id}`}
        searchPlaceholder="Tìm theo mã đơn hàng, nội dung hoặc nhà cung cấp…"
        emptyMessage={`${MODULE_EMPTY_STATES.MH} Đơn đặt hàng xuất hiện ở đây sau khi chọn nhà cung cấp trong bảng so sánh báo giá của một đề nghị mua đã duyệt.`}
        columns={[
          { key: 'stage', header: 'Bước', render: (r) => r.stageLabel },
          {
            key: 'supplier',
            header: 'Nhà cung cấp',
            render: (r) => r.supplierName ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'value',
            header: 'Giá trị đơn hàng',
            numeric: true,
            render: (r) => formatCurrency(r.totalValue),
          },
        ]}
      />
    </>
  );
}
