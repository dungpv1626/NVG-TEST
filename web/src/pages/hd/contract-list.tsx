/**
 * Danh sách Hợp đồng (HD-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * KHÔNG có nút "Tạo hợp đồng" ở đây, và đó là chủ ý: HD-01 nói hợp đồng soạn TỪ dữ liệu cơ
 * hội / gói thầu / dự án thiết kế có sẵn. Nút soạn nằm trên chính màn hình Chi tiết của hồ
 * sơ nguồn, nơi người dùng đang đứng khi khách đồng ý ký (Webapp Flow 3.1 bước 5).
 *
 * Cột "thời hạn" là NGÀY KẾT THÚC hợp đồng — mốc mà Kinh doanh và Kế toán phải nhìn thấy
 * trước khi nó tới.
 */

import {
  CONTRACT_STAGE_META,
  CONTRACT_TYPE_LABELS,
  contractDisplayStatus,
  formatCurrency,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useContracts } from '@/hooks/use-contracts';
import type { MoneyValue } from '@nvg/shared';
import { APP_HELP } from '@/lib/help-texts';

interface ContractRow extends EntityRow {
  stageLabel: string;
  typeLabel: string;
  partnerName: string | null;
  value: MoneyValue | null;
}

export function ContractListPage() {
  const { data, isLoading, error, refetch } = useContracts();

  const rows: ContractRow[] = (data ?? []).map((c) => ({
    id: c.id,
    // Số hợp đồng theo văn bản giấy là thứ mọi người tra cứu; chưa ký thì hiện mã nội bộ.
    code: c.contract_number ?? c.code,
    title: c.title,
    responsiblePerson: c.responsible?.full_name ?? null,
    status: contractDisplayStatus(c.stage, c.end_date),
    deadline: c.end_date,
    companyId: c.company_id,
    createdAt: c.created_at,
    stageLabel: CONTRACT_STAGE_META[c.stage].label,
    typeLabel: CONTRACT_TYPE_LABELS[c.type],
    partnerName: c.customer?.name ?? null,
    value: c.value,
  }));

  return (
    <>
      <PageHeader
        help={APP_HELP.contracts}
        title="Hợp đồng"
        breadcrumbs={[{ label: 'Hợp đồng' }]}
      />

      <EntityTable<ContractRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/hd/hop-dong/${row.id}`}
        searchPlaceholder="Tìm theo số hợp đồng, tên hoặc người chịu trách nhiệm…"
        emptyMessage="Chưa có hợp đồng nào. Hợp đồng được soạn từ màn hình Chi tiết của cơ hội, gói thầu hoặc dự án thiết kế tương ứng — không nhập lại dữ liệu đã có."
        columns={[
          { key: 'stage', header: 'Trạng thái', render: (r) => r.stageLabel },
          { key: 'type', header: 'Loại', render: (r) => r.typeLabel },
          {
            key: 'partner',
            header: 'Đối tác',
            render: (r) => r.partnerName ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'value',
            header: 'Giá trị',
            numeric: true,
            render: (r) =>
              r.value ? formatCurrency(r.value) : <span className="text-fg-subtle">—</span>,
          },
        ]}
      />
    </>
  );
}
