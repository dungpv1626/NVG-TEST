/**
 * Danh sách Công trình (TC-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * KHÔNG có nút "Tạo công trình": công trình luôn sinh ra từ một hợp đồng đã ký hoặc từ bước
 * bàn giao hồ sơ thiết kế (TK-08), vì đó là chỗ ngân sách đã duyệt đến từ. Tạo tay thì lập
 * tức có công trình không gắn ngân sách nào, và TC-05 không có gì để so.
 *
 * Cột "thời hạn" là NGÀY HOÀN THÀNH DỰ KIẾN — mốc mà chỉ huy trưởng và Ban Giám đốc phải
 * nhìn thấy trước khi nó tới.
 */

import { MODULE_EMPTY_STATES, SITE_STAGE_META, siteDisplayStatus } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useConstructionSites } from '@/hooks/use-construction-sites';

interface SiteRow extends EntityRow {
  stageLabel: string;
  siteAddress: string | null;
  progress: string | null;
}

export function SiteListPage() {
  const { data, isLoading, error, refetch } = useConstructionSites();

  const rows: SiteRow[] = (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    title: s.name,
    responsiblePerson: s.responsible?.full_name ?? null,
    status: siteDisplayStatus(s.stage, s.planned_end_date),
    deadline: s.planned_end_date,
    companyId: s.company_id,
    createdAt: s.created_at,
    stageLabel: SITE_STAGE_META[s.stage].label,
    siteAddress: s.site_address,
    progress: s.progress_percent,
  }));

  return (
    <>
      <PageHeader title="Công trình" breadcrumbs={[{ label: 'Công trình' }]} />

      <EntityTable<SiteRow>
        rows={rows}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        detailPath={(row) => `/tc/cong-trinh/${row.id}`}
        searchPlaceholder="Tìm theo mã, tên công trình hoặc chỉ huy trưởng…"
        emptyMessage={`${MODULE_EMPTY_STATES.TC} Công trình được mở từ hợp đồng đã ký, hoặc tự mở khi hồ sơ thiết kế được bàn giao cho Ban công trường.`}
        columns={[
          { key: 'stage', header: 'Bước', render: (r) => r.stageLabel },
          {
            key: 'address',
            header: 'Địa điểm',
            render: (r) => r.siteAddress ?? <span className="text-fg-subtle">—</span>,
          },
          {
            key: 'progress',
            header: 'Tiến độ',
            numeric: true,
            // Tiến độ do chỉ huy trưởng tự đánh giá, chưa có khảo sát về cách đo (TC-02) —
            // nên hiện đúng con số đã ghi, không tự suy ra từ nhật ký.
            render: (r) =>
              r.progress ? `${Number(r.progress)}%` : <span className="text-fg-subtle">—</span>,
          },
        ]}
      />
    </>
  );
}
