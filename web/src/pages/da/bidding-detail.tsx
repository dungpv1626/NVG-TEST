/**
 * Chi tiết Gói thầu — "Hồ sơ 360°" (Webapp Flow 4.3), các tab đúng theo hành trình 3.2:
 * Khảo sát → Khối lượng → Dự toán → Hồ sơ thầu, và Ngân sách sau khi trúng thầu.
 *
 * Bốn tab đó là bốn KHÍA CẠNH của cùng một hồ sơ, không phải bốn trang riêng — nên chúng
 * dùng chung một đường dẫn và tab hiện tại nằm ở `?tab=`.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BIDDING_STAGE_META,
  BUTTONS,
  biddingDisplayStatus,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import {
  useBiddingProject,
  useGenerateBudget,
  useRecordBidResult,
  useUpdateBiddingProject,
} from '@/hooks/use-bidding-projects';
import { useContractForSource } from '@/hooks/use-contracts';
import { DraftContractButton } from '@/components/contract/draft-contract-button';
import { BoqPanel } from '@/components/estimate/boq-panel';
import { EstimatePanel } from '@/components/estimate/estimate-panel';
import { toUserMessage } from '@/hooks/use-error-message';
import { companyCodeOf, useAuth, useCan } from '@/lib/auth';
import { BidDocumentsPanel } from './bid-documents-panel';
import { BudgetPanel } from './budget-panel';

const EM_DASH = '—';

export function BiddingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canEdit = useCan('DA', 'edit');

  const { data, isLoading, error } = useBiddingProject(id);
  const { data: contractId } = useContractForSource('bidding_projects', id);
  const updateProject = useUpdateBiddingProject();
  const recordResult = useRecordBidResult();
  const generateBudget = useGenerateBudget();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="gói thầu"
        listPath="/da/goi-thau"
        listLabel="Quay lại danh sách gói thầu"
      />
    );
  }

  const project = data;
  // Nộp thầu rồi thì hồ sơ đóng băng — bộ trên hệ thống phải khớp bộ đã gửi chủ đầu tư.
  const readOnly = !canEdit || project.submitted_at !== null;
  const companyCode = companyCodeOf(profile, project.company_id) ?? 'NVC';

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  function recordResultWithReason(won: boolean) {
    if (won) {
      void run(() => recordResult.mutateAsync({ projectId: project.id, won: true }));
      return;
    }
    // DA-08 yêu cầu ghi nguyên nhân; hỏi ngay tại chỗ thay vì để CSDL báo lỗi rồi mới hỏi.
    const reason = window.prompt('Nguyên nhân trượt thầu:');
    if (reason === null) return;
    void run(() =>
      recordResult.mutateAsync({ projectId: project.id, won: false, reason: reason.trim() }),
    );
  }

  const actions = canEdit ? (
    <>
      {project.stage === 'nop_thau' && (
        <>
          <Button variant="primary" onClick={() => recordResultWithReason(true)}>
            Ghi nhận trúng thầu
          </Button>
          <Button variant="secondary" onClick={() => recordResultWithReason(false)}>
            Ghi nhận trượt thầu
          </Button>
        </>
      )}
      {/* Webapp Flow 3.2: "khi trúng thầu → tạo Hợp đồng" — ngay tại chỗ, không sang module khác. */}
      {project.stage === 'trung_thau' && (
        <DraftContractButton
          sourceType="bidding_projects"
          sourceId={project.id}
          defaultType="thi_cong"
          existingContractId={contractId}
        />
      )}
    </>
  ) : undefined;

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
        breadcrumbs={[
          { label: 'Dự án – Đấu thầu' },
          { label: 'Gói thầu', to: '/da/goi-thau' },
          { label: project.name },
        ]}
        title={project.name}
        code={project.code}
        status={biddingDisplayStatus(project.stage, project.submission_deadline)}
        responsiblePerson={project.responsible?.full_name ?? null}
        deadline={project.submission_deadline}
        actions={actions}
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <DetailFields
                fields={[
                  { label: 'Bước hiện tại', value: BIDDING_STAGE_META[project.stage].label },
                  {
                    label: 'Chủ đầu tư',
                    value: project.customer ? (
                      <Link
                        to={`/crm/khach-hang/${project.customer.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {project.customer.name}
                      </Link>
                    ) : (
                      EM_DASH
                    ),
                  },
                  {
                    label: 'Giá trị dự kiến',
                    value:
                      project.estimated_value != null
                        ? formatCurrency(project.estimated_value)
                        : EM_DASH,
                  },
                  {
                    label: 'Hạn nộp thầu',
                    value: project.submission_deadline
                      ? formatDate(project.submission_deadline)
                      : EM_DASH,
                  },
                  { label: 'Địa điểm công trình', value: project.site_address ?? EM_DASH },
                  {
                    label: 'Nội dung cần làm rõ',
                    value: project.clarification_notes ?? EM_DASH,
                  },
                  { label: 'Nguyên nhân trượt thầu', value: project.lost_reason ?? EM_DASH },
                  { label: 'Ghi chú', value: project.notes ?? EM_DASH },
                ]}
              />
            ),
          },
          {
            id: 'khao-sat',
            label: 'Khảo sát',
            content: (
              <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <p className="mb-2 font-medium">Hiện trạng, biện pháp và rủi ro (DA-03)</p>
                {readOnly ? (
                  <p className="whitespace-pre-wrap">{project.survey_notes ?? EM_DASH}</p>
                ) : (
                  <textarea
                    defaultValue={project.survey_notes ?? ''}
                    rows={8}
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2"
                    placeholder="Điều kiện thi công, mặt bằng, đường vận chuyển, rủi ro đã nhận diện…"
                    onBlur={(e) =>
                      void run(() =>
                        updateProject.mutateAsync({
                          id: project.id,
                          changes: { survey_notes: e.target.value.trim() || null },
                        }),
                      )
                    }
                  />
                )}
              </div>
            ),
          },
          {
            id: 'khoi-luong',
            label: 'Khối lượng',
            content: (
              <BoqPanel
                parent={{ kind: 'bidding', id: project.id }}
                companyId={project.company_id}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'du-toan',
            label: 'Dự toán',
            content: (
              <EstimatePanel
                parent={{ kind: 'bidding', id: project.id }}
                companyId={project.company_id}
                companyCode={companyCode}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'ho-so-thau',
            label: 'Hồ sơ thầu',
            content: (
              <BidDocumentsPanel
                projectId={project.id}
                companyId={project.company_id}
                readOnly={!canEdit}
                submittedAt={project.submitted_at}
              />
            ),
          },
          {
            id: 'ngan-sach',
            label: 'Ngân sách',
            content: (
              <BudgetPanel
                projectId={project.id}
                canGenerate={canEdit && project.stage === 'trung_thau'}
                budgetGeneratedAt={project.budget_generated_at}
                pending={generateBudget.isPending}
                onGenerate={() =>
                  void run(() => generateBudget.mutateAsync({ projectId: project.id }))
                }
              />
            ),
          },
        ]}
        historyContent={
          <DetailFields
            fields={[
              { label: 'Tạo lúc', value: formatDateTime(project.created_at) },
              { label: 'Cập nhật gần nhất', value: formatDateTime(project.updated_at) },
              {
                label: 'Nộp thầu',
                value: project.submitted_at ? formatDateTime(project.submitted_at) : EM_DASH,
              },
              {
                label: 'Bàn giao ngân sách',
                value: project.budget_generated_at
                  ? formatDateTime(project.budget_generated_at)
                  : EM_DASH,
              },
            ]}
          />
        }
        related={[
          {
            title: 'Hồ sơ liên quan',
            records: project.opportunity
              ? [
                  {
                    label: 'Cơ hội kinh doanh',
                    value: `${project.opportunity.code} — ${project.opportunity.name}`,
                    to: `/crm/co-hoi/${project.opportunity.id}`,
                  },
                ]
              : [],
          },
        ]}
      />

      {/* Lối quay lại an toàn khi mở thẳng đường dẫn từ thông báo. */}
      <div className="mt-4">
        <Button variant="subtle" asChild>
          <Link to="/da/goi-thau">{BUTTONS.back}</Link>
        </Button>
      </div>
    </>
  );
}
