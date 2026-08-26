/**
 * Chi tiết Công trình — "Hồ sơ 360°" (Webapp Flow 4.3 và 3.4).
 *
 * Thứ tự tab bám đúng hành trình của chỉ huy trưởng ở Webapp Flow 3.4: nhận bàn giao → ghi
 * nhật ký hằng ngày → theo ngân sách → nghiệm thu → bảo hành. Tab mở mặc định là Nhật ký,
 * không phải Tổng quan: người mở màn hình này mỗi ngày là để ghi việc hôm nay, không phải để
 * đọc lại địa chỉ công trình.
 *
 * Nút hành động chính đổi theo bước, mỗi lúc chỉ MỘT nút chính (Content Guidelines 6.3).
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  SITE_STAGE_META,
  SITE_STAGE_TRANSITIONS,
  formatDate,
  formatDateTime,
  siteDisplayStatus,
  type SiteStage,
} from '@nvg/shared';
import { DetailFields, EntityDetail } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useAcceptanceRecords,
  useConstructionSite,
  useMoveSiteStage,
  useSiteLogs,
  useUpdateConstructionSite,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { AcceptancePanel } from './acceptance-panel';
import { BudgetPanel } from './budget-panel';
import { SiteLogPanel } from './site-log-panel';
import { SubcontractorPanel } from './subcontractor-panel';
import { WarrantyPanel } from './warranty-panel';

const EM_DASH = '—';

/** Bước tiếp theo "thuận" của mỗi bước — nút chính. Tạm dừng luôn là nút phụ. */
const NEXT_STAGE: Partial<Record<SiteStage, { stage: SiteStage; label: string }>> = {
  chuan_bi: { stage: 'dang_thi_cong', label: 'Bắt đầu thi công' },
  dang_thi_cong: { stage: 'nghiem_thu', label: 'Chuyển sang nghiệm thu bàn giao' },
  nghiem_thu: { stage: 'bao_hanh', label: 'Bàn giao chủ đầu tư' },
  bao_hanh: { stage: 'hoan_thanh', label: 'Kết thúc công trình' },
};

export function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('TC', 'edit');

  const { data, isLoading, error } = useConstructionSite(id);
  const { data: logs } = useSiteLogs(id);
  const { data: acceptances } = useAcceptanceRecords(id);
  const moveStage = useMoveSiteStage();
  const updateSite = useUpdateConstructionSite();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <EmptyState message="Không tìm thấy công trình này. Có thể hồ sơ đã được xóa hoặc vai trò hiện tại chưa được cấp quyền xem." />
    );
  }

  const site = data;
  const isClosed = site.stage === 'hoan_thanh';
  const readOnly = !canEdit || isClosed;
  const next = NEXT_STAGE[site.stage];
  const canPause = SITE_STAGE_TRANSITIONS[site.stage].includes('tam_dung');

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  function pause() {
    const reason = window.prompt('Nguyên nhân tạm dừng thi công:');
    if (reason === null) return;
    void run(() =>
      moveStage.mutateAsync({ siteId: site.id, stage: 'tam_dung', reason: reason.trim() }),
    );
  }

  const actions = readOnly ? undefined : (
    <>
      {next && (
        <Button
          variant="primary"
          disabled={moveStage.isPending}
          onClick={() => void run(() => moveStage.mutateAsync({ siteId: site.id, stage: next.stage }))}
        >
          {next.label}
        </Button>
      )}
      {site.stage === 'tam_dung' && (
        <Button
          variant="primary"
          disabled={moveStage.isPending}
          onClick={() =>
            void run(() => moveStage.mutateAsync({ siteId: site.id, stage: 'dang_thi_cong' }))
          }
        >
          Thi công trở lại
        </Button>
      )}
      {canPause && (
        <Button variant="secondary" onClick={pause}>
          Tạm dừng thi công
        </Button>
      )}
    </>
  );

  return (
    <>
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[{ label: 'Công trình', to: '/tc/cong-trinh' }, { label: site.name }]}
        title={site.name}
        code={site.code}
        status={siteDisplayStatus(site.stage, site.planned_end_date)}
        responsiblePerson={site.responsible?.full_name ?? null}
        deadline={site.planned_end_date}
        actions={actions}
        tabs={[
          {
            id: 'nhat-ky',
            label: 'Nhật ký',
            badge: logs?.length || undefined,
            content: (
              <SiteLogPanel
                siteId={site.id}
                companyId={site.company_id}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'ngan-sach',
            label: 'Ngân sách',
            content: <BudgetPanel siteId={site.id} />,
          },
          {
            id: 'nghiem-thu',
            label: 'Nghiệm thu',
            badge: acceptances?.length || undefined,
            content: <AcceptancePanel siteId={site.id} readOnly={readOnly} />,
          },
          {
            id: 'to-doi',
            label: 'Tổ đội',
            content: (
              <SubcontractorPanel
                siteId={site.id}
                companyId={site.company_id}
                siteResponsibleName={site.responsible?.full_name ?? null}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'bao-hanh',
            label: 'Bảo hành',
            content: (
              <WarrantyPanel
                siteId={site.id}
                companyId={site.company_id}
                handedOverAt={site.handed_over_at}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <>
                <DetailFields
                  fields={[
                    { label: 'Bước hiện tại', value: SITE_STAGE_META[site.stage].label },
                    { label: 'Địa điểm', value: site.site_address ?? EM_DASH },
                    {
                      label: 'Kế hoạch',
                      value:
                        site.planned_start_date || site.planned_end_date
                          ? `${site.planned_start_date ? formatDate(site.planned_start_date) : '?'} — ${
                              site.planned_end_date ? formatDate(site.planned_end_date) : '?'
                            }`
                          : EM_DASH,
                    },
                    {
                      label: 'Thực tế',
                      value:
                        site.actual_start_date || site.actual_end_date
                          ? `${site.actual_start_date ? formatDate(site.actual_start_date) : '?'} — ${
                              site.actual_end_date ? formatDate(site.actual_end_date) : '?'
                            }`
                          : 'Chưa khởi công',
                    },
                    {
                      label: 'Tiến độ tổng',
                      value:
                        site.progress_percent != null
                          ? `${Number(site.progress_percent)}%`
                          : EM_DASH,
                    },
                    { label: 'Nguyên nhân tạm dừng', value: site.pause_reason ?? EM_DASH },
                  ]}
                />

                {!readOnly && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="block font-medium">Tiến độ tổng (%)</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={site.progress_percent ?? ''}
                        className="mt-1 h-10 w-full rounded-sm border border-border bg-surface px-3"
                        onBlur={(e) =>
                          void run(() =>
                            updateSite.mutateAsync({
                              id: site.id,
                              changes: { progress_percent: e.target.value.trim() || null },
                            }),
                          )
                        }
                      />
                      <span className="mt-1 block text-xs text-fg-subtle">
                        Do chỉ huy trưởng tự đánh giá và ghi lại — hệ thống không tự suy ra từ
                        nhật ký khi chưa có quy ước đo tiến độ của công trường.
                      </span>
                    </label>

                    <label className="block">
                      <span className="block font-medium">Ghi chú</span>
                      <textarea
                        defaultValue={site.notes ?? ''}
                        rows={3}
                        className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2"
                        onBlur={(e) =>
                          void run(() =>
                            updateSite.mutateAsync({
                              id: site.id,
                              changes: { notes: e.target.value.trim() || null },
                            }),
                          )
                        }
                      />
                    </label>
                  </div>
                )}
              </>
            ),
          },
        ]}
        historyContent={
          <DetailFields
            fields={[
              { label: 'Mở công trình', value: formatDateTime(site.created_at) },
              { label: 'Cập nhật gần nhất', value: formatDateTime(site.updated_at) },
              {
                label: 'Bàn giao chủ đầu tư',
                value: site.handed_over_at ? formatDateTime(site.handed_over_at) : EM_DASH,
              },
            ]}
          />
        }
        related={[
          {
            title: 'Hồ sơ nguồn',
            records: [
              ...(site.contract
                ? [
                    {
                      label: 'Hợp đồng',
                      value: site.contract.contract_number ?? site.contract.code,
                      to: `/hd/hop-dong/${site.contract.id}`,
                    },
                  ]
                : []),
              ...(site.bidding_project_id
                ? [
                    {
                      label: 'Gói thầu',
                      value: 'Mở gói thầu nguồn',
                      to: `/da/goi-thau/${site.bidding_project_id}`,
                    },
                  ]
                : []),
              ...(site.design_project_id
                ? [
                    {
                      label: 'Dự án thiết kế',
                      value: 'Mở hồ sơ thiết kế',
                      to: `/tk/du-an/${site.design_project_id}`,
                    },
                  ]
                : []),
            ],
          },
        ]}
      />
    </>
  );
}
