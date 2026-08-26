/**
 * Danh sách Gói thầu / Dự án (DA-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * Cột "thời hạn" là HẠN NỘP THẦU: với gói thầu, đó là mốc duy nhất không lùi được.
 */

import {
  BUTTONS,
  BIDDING_STAGE_META,
  biddingDisplayStatus,
  formatCurrency,
  type MoneyValue,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { CreateButton, EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useBiddingProjects } from '@/hooks/use-bidding-projects';
import { useCan } from '@/lib/auth';
import { DaNav } from './da-nav';

interface BiddingRow extends EntityRow {
  stageLabel: string;
  customerName: string | null;
  estimatedValue: MoneyValue | null;
}

export function BiddingListPage() {
  const canCreate = useCan('DA', 'create');
  const { data, isLoading, error, refetch } = useBiddingProjects();

  const rows: BiddingRow[] = (data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    title: p.name,
    responsiblePerson: p.responsible?.full_name ?? null,
    status: biddingDisplayStatus(p.stage, p.submission_deadline),
    deadline: p.submission_deadline,
    companyId: p.company_id,
    stageLabel: BIDDING_STAGE_META[p.stage].label,
    customerName: p.customer?.name ?? null,
    estimatedValue: p.estimated_value,
  }));

  const createLabel = BUTTONS.create('gói thầu');
  const createButton = canCreate ? (
    <CreateButton label={createLabel} to="/da/goi-thau/tao-moi" />
  ) : undefined;
  const isEmpty = !isLoading && !error && rows.length === 0;

  return (
    <>
      <DaNav />
      <PageHeader
        title="Gói thầu"
        breadcrumbs={[{ label: 'Dự án – Đấu thầu' }, { label: 'Gói thầu' }]}
        actions={isEmpty ? undefined : createButton}
      />

      <EntityTable<BiddingRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/da/goi-thau/${row.id}`}
        searchPlaceholder="Tìm theo tên, mã hoặc người chịu trách nhiệm…"
        emptyMessage={
          canCreate
            ? 'Chưa có gói thầu nào. Tạo hồ sơ gói thầu khi nhận được thư mời thầu hoặc cơ hội đã chốt từ Kinh doanh.'
            : 'Chưa có gói thầu nào. Vai trò hiện tại không có quyền tạo hồ sơ gói thầu.'
        }
        emptyAction={
          canCreate ? (
            <CreateButton label={createLabel} to="/da/goi-thau/tao-moi" variant="secondary" />
          ) : undefined
        }
        columns={[
          { key: 'stage', header: 'Bước', render: (r) => r.stageLabel },
          {
            key: 'customer',
            header: 'Chủ đầu tư',
            render: (r) => r.customerName ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'value',
            header: 'Giá trị dự kiến',
            numeric: true,
            render: (r) =>
              r.estimatedValue ? (
                formatCurrency(r.estimatedValue)
              ) : (
                <span className="text-fg-subtle">—</span>
              ),
          },
        ]}
      />
    </>
  );
}
