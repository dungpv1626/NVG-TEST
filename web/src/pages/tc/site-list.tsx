/**
 * Danh sách Công trình (TC-01) — mẫu bố cục Danh sách (Webapp Flow 4.2).
 *
 * KHÔNG có nút "Tạo công trình": công trình luôn sinh ra từ một hợp đồng đã ký hoặc từ bước
 * bàn giao hồ sơ thiết kế (TK-08), vì đó là chỗ ngân sách đã duyệt đến từ. Tạo tay thì lập
 * tức có công trình không gắn ngân sách nào, và TC-05 không có gì để so.
 *
 * Cột "thời hạn" là NGÀY HOÀN THÀNH DỰ KIẾN — mốc mà chỉ huy trưởng và Ban Giám đốc phải
 * nhìn thấy trước khi nó tới.
 *
 * Cột + bộ lọc "Ngân sách" (BC-05) dùng `useSitesBudgetStatus` — một lượt gọi tổng hợp CẢ
 * danh sách (0058_bc_over_budget.sql), không phải `useSiteBudgetStatus` lặp theo từng dòng
 * (N+1). Đây cũng chính là đích đến của thẻ "Công trình vượt ngân sách" trên Dashboard
 * (`?ngan-sach=vuot`) — cùng một nguồn dữ liệu nên hai con số không thể lệch nhau. Chỉ hiện
 * cột này với vai trò có quyền xem BC (hàm CSDL cũng chặn ở đúng điều kiện đó).
 */

import { Link, useSearchParams } from 'react-router-dom';
import {
  BUDGET_HEALTH_META,
  MODULE_EMPTY_STATES,
  SITE_STAGE_META,
  siteDisplayStatus,
  type BudgetHealth,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EntityTable, type EntityRow } from '@/components/entity/entity-table';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import { useSitesBudgetStatus } from '@/hooks/use-reports';
import { useCan } from '@/lib/auth';

const BUDGET_FILTER_PARAM = 'ngan-sach';

const HEALTH_STYLES: Record<BudgetHealth, string> = {
  trong_ngan_sach: 'text-status-completed',
  sap_vuot: 'text-status-pending',
  vuot_ngan_sach: 'text-status-overdue',
};

interface SiteRow extends EntityRow {
  stageLabel: string;
  siteAddress: string | null;
  progress: string | null;
  budgetHealth: BudgetHealth | null;
}

export function SiteListPage() {
  const { data, isLoading, error, refetch } = useConstructionSites();
  const canViewBc = useCan('BC');
  const [searchParams, setSearchParams] = useSearchParams();
  const overBudgetOnly = searchParams.get(BUDGET_FILTER_PARAM) === 'vuot';

  // `health` đã tính sẵn ở CSDL (0071) — KHÔNG tự tính lại từ ba cột tiền: với vai trò không
  // xem được giá vốn, ba cột đó là null (Mẫu D) nên tự tính sẽ luôn ra "trong ngân sách".
  const budgetStatus = useSitesBudgetStatus(canViewBc);
  const healthBySiteId = new Map(
    (budgetStatus.data ?? []).map((s) => [s.construction_site_id, s.health]),
  );

  const rows: SiteRow[] = (data ?? [])
    .filter((s) => !overBudgetOnly || healthBySiteId.get(s.id) === 'vuot_ngan_sach')
    .map((s) => ({
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
      budgetHealth: healthBySiteId.get(s.id) ?? null,
    }));

  return (
    <>
      <PageHeader
        title="Công trình"
        breadcrumbs={[{ label: 'Thi công & Ngân sách' }, { label: 'Công trình' }]}
        actions={
          <Button variant="secondary" asChild>
            <Link to="/tc/de-nghi">Theo dõi đề nghị</Link>
          </Button>
        }
      />

      <EntityTable<SiteRow>
        rows={rows}
        isLoading={isLoading || (canViewBc && overBudgetOnly && budgetStatus.isLoading)}
        error={error ?? (canViewBc && overBudgetOnly ? budgetStatus.error : undefined)}
        onRetry={() => void refetch()}
        detailPath={(row) => `/tc/cong-trinh/${row.id}`}
        searchPlaceholder="Tìm theo mã, tên công trình hoặc chỉ huy trưởng…"
        emptyMessage={
          overBudgetOnly
            ? 'Không có công trình nào đang vượt ngân sách.'
            : `${MODULE_EMPTY_STATES.TC} Công trình được mở từ hợp đồng đã ký, hoặc tự mở khi hồ sơ thiết kế được bàn giao cho Ban công trường.`
        }
        filters={
          canViewBc && (
            <label className="flex items-center gap-2">
              <span className="text-fg-subtle">Ngân sách</span>
              <select
                value={overBudgetOnly ? 'vuot' : ''}
                onChange={(e) => {
                  const next = new URLSearchParams(searchParams);
                  if (e.target.value) next.set(BUDGET_FILTER_PARAM, e.target.value);
                  else next.delete(BUDGET_FILTER_PARAM);
                  setSearchParams(next);
                }}
                className="h-9 rounded-sm border border-border bg-surface px-2"
              >
                <option value="">Tất cả</option>
                <option value="vuot">Vượt ngân sách</option>
              </select>
            </label>
          )
        }
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
            // Tiến độ do chỉ huy trưởng tự đánh giá: khảo sát đã cho biết đo theo hạng mục
            // và khối lượng đã nghiệm thu, nhưng chưa chốt ai cập nhật % (câu hỏi #10) —
            // nên hiện đúng con số đã ghi, không tự suy ra từ nhật ký.
            render: (r) =>
              r.progress ? `${Number(r.progress)}%` : <span className="text-fg-subtle">—</span>,
          },
          ...(canViewBc
            ? [
                {
                  key: 'budget',
                  header: 'Ngân sách',
                  render: (r: SiteRow) =>
                    r.budgetHealth === null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <span className={`font-medium ${HEALTH_STYLES[r.budgetHealth]}`}>
                        {BUDGET_HEALTH_META[r.budgetHealth].label}
                      </span>
                    ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
