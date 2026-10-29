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
import { useParams, useSearchParams } from 'react-router-dom';
import {
  SITE_STAGE_META,
  SITE_FLOW,
  SITE_STAGE_TRANSITIONS,
  formatDate,
  formatDateTime,
  siteDisplayStatus,
  type SiteStage,
} from '@nvg/shared';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { StageHistory } from '@/components/entity/stage-history';
import { Button } from '@/components/ui/button';
import { usePromptDialog } from '@/components/ui/prompt-dialog';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
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
import { MilestonePanel } from './milestone-panel';
import { SiteDocumentPanel } from './document-panel';
import { SiteDesignDrawings } from './design-drawings';
import { SiteRfiPanel } from './rfi-panel';
import { SiteLogPanel } from './site-log-panel';
import { SitePurchaseRequestPanel } from './purchase-request-panel';
import { SiteCheckInPanel } from './site-check-in-panel';
import { SiteQuickActions } from './site-quick-actions';
import { RecordChain } from '@/components/entity/record-chain';
import { StepTrack } from '@/components/entity/step-track';
import { useStageReadiness } from '@/hooks/use-stage-readiness';
import { useSiteMilestones } from '@/hooks/use-site-milestones';
import { SITE_PREP_ANCHOR, SitePrepCard } from './site-prep-card';
import { SubcontractorPanel } from './subcontractor-panel';
import { CrewAttendancePanel } from './crew-attendance-panel';
import { WarrantyPanel } from './warranty-panel';
import { SiteChangePanel } from './site-change-panel';
import { SiteIssuePanel } from './site-issue-panel';
import { useSiteIssues } from '@/hooks/use-site-changes';
import { SiteWeekPlanPanel } from './site-week-plan-panel';
import { SiteReportPanel } from './site-report-panel';

const EM_DASH = '—';

/** Bước tiếp theo "thuận" của mỗi bước — nút chính. Tạm dừng luôn là nút phụ. */
const NEXT_STAGE: Partial<Record<SiteStage, { stage: SiteStage; label: string }>> = {
  chuan_bi: { stage: 'dang_thi_cong', label: 'Bắt đầu thi công' },
  dang_thi_cong: { stage: 'nghiem_thu', label: 'Chuyển sang nghiệm thu bàn giao' },
  nghiem_thu: { stage: 'bao_hanh', label: 'Bàn giao chủ đầu tư' },
  bao_hanh: { stage: 'hoan_thanh', label: 'Kết thúc công trình' },
};

export function SiteDetailPage() {
  const promptDialog = usePromptDialog();
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('TC', 'edit');

  const { data, isLoading, error } = useConstructionSite(id);
  const { data: logs } = useSiteLogs(id);
  const { data: acceptances } = useAcceptanceRecords(id);
  const moveStage = useMoveSiteStage();
  const updateSite = useUpdateConstructionSite();
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: readiness = [] } = useStageReadiness('site', id);
  const { data: milestones } = useSiteMilestones(id);
  const { data: issues } = useSiteIssues(id);
  const [searchParams, setSearchParams] = useSearchParams();

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="công trình"
        listPath="/tc/cong-trinh"
        listLabel="Quay lại danh sách công trình"
      />
    );
  }

  const site = data;
  const isClosed = site.stage === 'hoan_thanh';
  const readOnly = !canEdit || isClosed;
  const next = NEXT_STAGE[site.stage];
  const canPause = SITE_STAGE_TRANSITIONS[site.stage].includes('tam_dung');

  // Tab nơi làm việc của từng bước — mở công trình là tới đúng chỗ (phản hồi chủ dự án).
  const STAGE_TAB: Record<SiteStage, string> = {
    chuan_bi: 'tong-quan',
    dang_thi_cong: 'nhat-ky',
    nghiem_thu: 'nghiem-thu',
    bao_hanh: 'bao-hanh',
    hoan_thanh: 'tong-quan',
    tam_dung: 'tong-quan',
  };
  function openTab(tab: string, anchor?: string) {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    setSearchParams(params, { replace: true });
    if (anchor) {
      window.setTimeout(() => {
        const el = document.getElementById(anchor);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el?.querySelector<HTMLElement>('select, input')?.focus({ preventScroll: true });
      }, 50);
    }
  }
  // Điều kiện nào làm ở đâu — nút «làm ngay» cạnh dòng «Cần».
  const SITE_REQUIREMENT_ACTION: Record<string, { tab: string; anchor?: string; label: string }> = {
    commander_assigned: { tab: 'tong-quan', anchor: SITE_PREP_ANCHOR, label: 'Phân công' },
    planned_dates: { tab: 'tong-quan', anchor: SITE_PREP_ANCHOR, label: 'Ghi ngày' },
    milestones_passed: { tab: 'moc', label: 'Xem mốc' },
    customer_acceptance: { tab: 'nghiem-thu', label: 'Lập biên bản nghiệm thu' },
    warranties_declared: { tab: 'bao-hanh', label: 'Khai hạng mục bảo hành' },
    warranties_expired: { tab: 'bao-hanh', label: 'Xem bảo hành' },
    claims_closed: { tab: 'bao-hanh', label: 'Xem yêu cầu bảo hành' },
  };
  // T2 (0241): tồn tại chưa khắc phục CHỈ NHẮC, không chặn bàn giao (anh Dũng chốt) — không nằm trong
  // `stage_readiness` (mọi dòng ở đó chặn đổi bước), không tính vào `missing`.
  const openIssues = (issues ?? []).filter((i) => i.status === 'dang_mo').length;
  const issueReminder =
    next && openIssues > 0 && ['nghiem_thu', 'bao_hanh', 'hoan_thanh'].includes(next.stage)
      ? [
          {
            label: `Còn ${openIssues} tồn tại chưa khắc phục — chỉ nhắc, không chặn bàn giao`,
            met: false,
            reminder: true,
            action: (
              <button
                type="button"
                className="font-medium text-brand underline-offset-2 hover:underline"
                onClick={() => openTab('ton-tai')}
              >
                Xem tồn tại
              </button>
            ),
          },
        ]
      : [];
  // Điều kiện bước kế tiếp (0164, 0166) — cùng điều kiện CSDL chặn.
  const missing = next
    ? readiness.filter((r) => r.for_stage === next.stage && !r.met).map((r) => r.label)
    : [];
  const nextRequirements = next
    ? readiness
        .filter((r) => r.for_stage === next.stage)
        .map((r) => ({
          label: r.label,
          met: r.met,
          action: readOnly
            ? undefined
            : (() => {
                const go = SITE_REQUIREMENT_ACTION[r.requirement];
                return go ? (
                  <button
                    type="button"
                    className="font-medium text-brand underline-offset-2 hover:underline"
                    onClick={() => openTab(go.tab, go.anchor)}
                  >
                    {go.label}
                  </button>
                ) : undefined;
              })(),
        }))
    : [];

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  async function pause() {
    const reason = await promptDialog.ask({
      title: 'Tạm dừng thi công?',
      label: 'Nguyên nhân tạm dừng',
      confirmLabel: 'Tạm dừng thi công',
    });
    if (reason === null) return;
    void run(() => moveStage.mutateAsync({ siteId: site.id, stage: 'tam_dung', reason }));
  }

  const actions = readOnly ? undefined : (
    <>
      {next && (
        <Button
          // Đang thi công thì việc hằng ngày là ghi nhật ký, không phải đổi giai đoạn — nút này
          // lùi xuống nút phụ để không thành thứ to nhất trên màn hình (review UX, vấn đề 2).
          variant={site.stage === 'dang_thi_cong' ? 'secondary' : 'primary'}
          disabled={moveStage.isPending || missing.length > 0}
          title={missing.length > 0 ? `Cần: ${missing.join('; ')}` : undefined}
          onClick={() =>
            void run(() => moveStage.mutateAsync({ siteId: site.id, stage: next.stage }))
          }
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
      {promptDialog.dialog}
      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
        >
          {actionError}
        </p>
      )}

      <EntityDetail
        breadcrumbs={[
          { label: 'Thi công & Ngân sách' },
          { label: 'Công trình', to: '/tc/cong-trinh' },
          { label: site.name },
        ]}
        title={site.name}
        code={site.code}
        status={siteDisplayStatus(site.stage, site.planned_end_date)}
        responsiblePerson={site.responsible?.full_name ?? null}
        deadline={site.planned_end_date}
        progress={
          <>
            <RecordChain kind="site" id={site.id} />
            <StepTrack
              flow={SITE_FLOW}
              current={site.stage}
              nextRequirements={[...nextRequirements, ...issueReminder]}
              holder={site.responsible?.full_name ?? null}
            />
          </>
        }
        actions={actions}
        defaultTab={STAGE_TAB[site.stage]}
        tabs={[
          {
            id: 'nhat-ky',
            label: 'Nhật ký',
            badge: logs?.length || undefined,
            content: (
              <SiteLogPanel siteId={site.id} companyId={site.company_id} readOnly={readOnly} />
            ),
          },
          {
            // T3 (0242): đầu việc của tuần cho từng tổ đội — nhật ký ngày chỉ đánh dấu.
            id: 'ke-hoach',
            label: 'Kế hoạch tuần',
            content: (
              <SiteWeekPlanPanel siteId={site.id} companyId={site.company_id} readOnly={readOnly} />
            ),
          },
          {
            // T4 (0242): báo cáo tuần / tháng máy tự tổng hợp; chỉ huy trưởng thêm nhận định rồi gửi.
            id: 'bao-cao',
            label: 'Báo cáo tuần',
            content: <SiteReportPanel siteId={site.id} readOnly={readOnly} />,
          },
          {
            // Đợt 2 — 2A: nghiệm thu từng mốc trước khi che khuất (Quy chuẩn Nhà Việt One).
            id: 'moc',
            label: 'Mốc thi công',
            // Số mốc chờ phụ trách kỹ thuật kiểm — việc đang treo của Trưởng phòng.
            badge: milestones?.filter((m) => m.status === 'cho_ky_thuat').length || undefined,
            content: (
              <MilestonePanel
                siteId={site.id}
                companyId={site.company_id}
                stage={site.stage}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'diem-danh',
            label: 'Điểm danh',
            content: (
              <>
                <CrewAttendancePanel site={site} readOnly={readOnly} />
                <SiteCheckInPanel
                  siteId={site.id}
                  siteCode={site.code}
                  siteName={site.name}
                  readOnly={readOnly}
                />
              </>
            ),
          },
          {
            // Đứng ngay sau Nhật ký: khảo sát công trường 02/09/2026 xếp "không biết bản vẽ
            // nào đang có hiệu lực" là vướng mắc số một, và người mở màn hình này cần biết
            // điều đó TRƯỚC khi giao việc cho tổ đội, không phải sau khi xem ngân sách.
            id: 'ho-so',
            label: 'Hồ sơ – Bản vẽ',
            content: (
              <>
                {site.design_project_id && <SiteDesignDrawings siteId={site.id} />}
                <SiteDocumentPanel
                  siteId={site.id}
                  companyId={site.company_id}
                  readOnly={readOnly}
                />
              </>
            ),
          },
          {
            // TC-15 / TK-08: hỏi bản vẽ có người nhận và hạn trả lời, ngay cạnh tab bản vẽ.
            id: 'lam-ro',
            label: 'Yêu cầu làm rõ',
            content: (
              <SiteRfiPanel
                siteId={site.id}
                hasDesignProject={site.design_project_id !== null}
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
            id: 'de-nghi',
            label: 'Đề nghị',
            content: <SitePurchaseRequestPanel siteId={site.id} readOnly={isClosed} />,
          },
          {
            // T1 (0241): phát sinh lập từ công trường — Thi công thấy trạng thái, không thấy giá.
            id: 'phat-sinh',
            label: 'Phát sinh',
            content: (
              <SiteChangePanel
                siteId={site.id}
                companyId={site.company_id}
                hasContract={site.contract_id !== null}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'nghiem-thu',
            label: 'Nghiệm thu',
            badge: acceptances?.length || undefined,
            content: (
              <AcceptancePanel siteId={site.id} companyId={site.company_id} readOnly={readOnly} />
            ),
          },
          {
            // T2 (0241): tồn tại có người xử lý và hạn.
            id: 'ton-tai',
            label: 'Tồn tại',
            badge: openIssues || undefined,
            content: (
              <SiteIssuePanel siteId={site.id} companyId={site.company_id} readOnly={readOnly} />
            ),
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
                {(site.stage === 'chuan_bi' || !site.responsible_user_id) && (
                  <SitePrepCard
                    site={site}
                    canEdit={!readOnly}
                    highlight={site.stage === 'chuan_bi' && missing.length > 0}
                  />
                )}
                <DetailFields
                  fields={[
                    { label: 'Bước hiện tại', value: SITE_STAGE_META[site.stage].label },
                    { label: 'Địa điểm', value: site.site_address ?? EM_DASH },
                    {
                      label: 'Kế hoạch',
                      value:
                        site.planned_start_date || site.planned_end_date
                          ? `${site.planned_start_date ? formatDate(site.planned_start_date) : 'chưa ghi ngày bắt đầu'} — ${
                              site.planned_end_date
                                ? formatDate(site.planned_end_date)
                                : 'chưa ghi ngày kết thúc'
                            }`
                          : EM_DASH,
                    },
                    {
                      label: 'Thực tế',
                      value:
                        site.actual_start_date || site.actual_end_date
                          ? `${site.actual_start_date ? formatDate(site.actual_start_date) : 'chưa bắt đầu'} — ${
                              site.actual_end_date
                                ? formatDate(site.actual_end_date)
                                : 'chưa kết thúc'
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
                        className="mt-1 h-11 w-full rounded-field border border-border-strong bg-surface px-3"
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
                        Do chỉ huy trưởng tự đánh giá và ghi lại — hệ thống không tự suy ra từ nhật
                        ký khi chưa có quy ước đo tiến độ của công trường.
                      </span>
                    </label>

                    <label className="block">
                      <span className="block font-medium">Ghi chú</span>
                      <textarea
                        defaultValue={site.notes ?? ''}
                        rows={3}
                        className="mt-1 w-full rounded-field border border-border-strong bg-surface px-3 py-2"
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
          <div className="space-y-6">
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
            <StageHistory
              entityType="construction_sites"
              entityId={site.id}
              stage={site.stage}
              meta={SITE_STAGE_META}
            />
          </div>
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
                : site.contract_id
                  ? // Có hợp đồng nhưng vai trò này không xem được Module Hợp đồng (chủ dự án
                    // giữ nguyên quyền): nói rõ là CÓ và ai quản lý, không ghi «Chưa có hồ sơ
                    // liên quan» — sai sự thật. Không lộ số, giá trị, không có liên kết.
                    [
                      {
                        label: 'Hợp đồng',
                        value: 'Đã có hợp đồng — Kinh doanh và Ban Giám đốc quản lý nội dung',
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
      <SiteQuickActions siteId={site.id} readOnly={readOnly} />
    </>
  );
}
