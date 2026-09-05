/**
 * Chi tiết Dự án thiết kế — "Hồ sơ 360°" (Webapp Flow 4.3), các tab đúng theo hành trình
 * 3.3: Đầu bài → Khảo sát → Phương án → Hồ sơ kỹ thuật → Phiên bản bản vẽ → Dự toán →
 * Yêu cầu thay đổi, và nút Bàn giao thi công ở header.
 *
 * Các tab là những KHÍA CẠNH của cùng một hồ sơ, không phải các trang riêng — nên chúng
 * dùng chung một đường dẫn và tab hiện tại nằm ở `?tab=`.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BUTTONS,
  DESIGN_STAGE_META,
  TECHNICAL_DISCIPLINES,
  designDisplayStatus,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import { DraftContractButton } from '@/components/contract/draft-contract-button';
import { BoqPanel } from '@/components/estimate/boq-panel';
import { EstimatePanel } from '@/components/estimate/estimate-panel';
import { DetailFields, EntityDetail, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { useContractForSource } from '@/hooks/use-contracts';
import {
  useDesignProject,
  useDesignSync,
  useHandoverToConstruction,
  useMoveDesignStage,
  useUpdateDesignProject,
} from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { companyCodeOf, useAuth, useCan } from '@/lib/auth';
import { BriefPanel } from './brief-panel';
import { ChangeRequestPanel } from './change-request-panel';
import { DisciplinePanel } from './discipline-panel';
import { ProgramPanel } from './program-panel';
import { SurveyPanel } from './survey-panel';
import { VariantsPanel } from './variants-panel';
import { VersionPanel } from './version-panel';

const EM_DASH = '—';
const CONCEPT_DISCIPLINES = ['phuong_an'] as const;

export function DesignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const canEdit = useCan('TK', 'edit');

  const { data, isLoading, error } = useDesignProject(id);
  const { data: findings } = useDesignSync(id);
  const { data: contractId } = useContractForSource('design_projects', id);
  const updateProject = useUpdateDesignProject();
  const moveStage = useMoveDesignStage();
  const handover = useHandoverToConstruction();
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!data) {
    return (
      <RecordNotFound
        entity="dự án thiết kế"
        listPath="/tk/du-an"
        listLabel="Quay lại danh sách dự án thiết kế"
      />
    );
  }

  const project = data;
  // Bàn giao rồi thì hồ sơ đóng băng — bộ trên hệ thống phải khớp bộ công trường đang cầm.
  const readOnly = !canEdit || project.handed_over_at !== null;
  const blockingCount = (findings ?? []).filter((f) => f.blocking).length;

  async function run(action: () => Promise<unknown>, onDone?: (result: unknown) => void) {
    setActionError(null);
    setNotice(null);
    try {
      const result = await action();
      onDone?.(result);
    } catch (e) {
      setActionError(toUserMessage(e, 'edit'));
    }
  }

  function stopDesign() {
    const reason = window.prompt('Nguyên nhân dừng thiết kế:');
    if (reason === null) return;
    void run(() =>
      moveStage.mutateAsync({
        projectId: project.id,
        stage: 'dung_thiet_ke',
        reason: reason.trim(),
      }),
    );
  }

  const actions =
    canEdit && project.handed_over_at === null && project.stage !== 'dung_thiet_ke' ? (
      <>
        {project.stage === 'phuong_an' && (
          <Button
            variant="secondary"
            onClick={() =>
              void run(() =>
                moveStage.mutateAsync({ projectId: project.id, stage: 'cho_khach_duyet' }),
              )
            }
          >
            Gửi khách hàng duyệt phương án
          </Button>
        )}
        {project.stage === 'dau_bai' && (
          <Button
            variant="secondary"
            onClick={() =>
              void run(() => moveStage.mutateAsync({ projectId: project.id, stage: 'phuong_an' }))
            }
          >
            Bắt đầu dựng phương án
          </Button>
        )}
        {project.stage === 'ho_so_ky_thuat' && (
          <Button
            variant="secondary"
            onClick={() =>
              void run(() => moveStage.mutateAsync({ projectId: project.id, stage: 'du_toan' }))
            }
          >
            Chuyển sang lập dự toán
          </Button>
        )}
        {/* Webapp Flow 3.3 bước 5: dự toán xong thì gửi Kinh doanh chốt với khách và ký. */}
        {project.stage === 'du_toan' && (
          <DraftContractButton
            sourceType="design_projects"
            sourceId={project.id}
            defaultType="thiet_ke"
            existingContractId={contractId}
          />
        )}
        <Button
          variant="primary"
          disabled={blockingCount > 0 || handover.isPending}
          title={
            blockingCount > 0
              ? `Còn ${blockingCount} hạng mục chưa đồng bộ. Xem tab Hồ sơ kỹ thuật.`
              : undefined
          }
          onClick={() =>
            void run(
              () => handover.mutateAsync({ projectId: project.id }),
              (notified) =>
                setNotice(`Đã bàn giao hồ sơ thi công và thông báo cho ${notified} người.`),
            )
          }
        >
          Bàn giao thi công
        </Button>
        <Button variant="secondary" onClick={stopDesign}>
          Dừng thiết kế
        </Button>
      </>
    ) : undefined;

  return (
    <>
      {notice && (
        <p className="mb-3 rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed">
          {notice}
        </p>
      )}
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
          { label: 'Thiết kế' },
          { label: 'Dự án thiết kế', to: '/tk/du-an' },
          { label: project.name },
        ]}
        title={project.name}
        code={project.code}
        status={designDisplayStatus(project.stage, project.handover_deadline)}
        responsiblePerson={project.responsible?.full_name ?? null}
        deadline={project.handover_deadline}
        actions={actions}
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <>
                <DetailFields
                  fields={[
                    { label: 'Bước hiện tại', value: DESIGN_STAGE_META[project.stage].label },
                    {
                      label: 'Khách hàng',
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
                      label: 'Hạn bàn giao hồ sơ',
                      value: project.handover_deadline
                        ? formatDate(project.handover_deadline)
                        : EM_DASH,
                    },
                    { label: 'Địa điểm khu đất', value: project.site_address ?? EM_DASH },
                    {
                      label: 'Nguyên nhân dừng thiết kế',
                      value: project.stopped_reason ?? EM_DASH,
                    },
                  ]}
                />
                <label className="mt-4 block">
                  <span className="block font-medium">Ghi chú</span>
                  {readOnly ? (
                    <p className="mt-1 whitespace-pre-wrap">{project.notes ?? EM_DASH}</p>
                  ) : (
                    <textarea
                      defaultValue={project.notes ?? ''}
                      rows={3}
                      className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2"
                      onBlur={(e) =>
                        void run(() =>
                          updateProject.mutateAsync({
                            id: project.id,
                            changes: { notes: e.target.value.trim() || null },
                          }),
                        )
                      }
                    />
                  )}
                </label>
              </>
            ),
          },
          {
            id: 'dau-bai',
            label: 'Đầu bài',
            content: (
              <BriefPanel
                projectId={project.id}
                companyId={project.company_id}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'khao-sat',
            label: 'Khảo sát hiện trạng',
            content: (
              <SurveyPanel
                projectId={project.id}
                companyId={project.company_id}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'chuong-trinh-khong-gian',
            label: 'Chương trình không gian',
            content: <ProgramPanel projectId={project.id} readOnly={readOnly} />,
          },
          {
            id: 'phuong-an',
            label: 'Phương án kiến trúc',
            content: (
              <div className="space-y-8">
                {/* Phương án do engine sinh (TK-12) đứng trước; bên dưới là các bản phương án
                    tải lên theo cơ chế phiên bản của TK-03 — hai nguồn, cùng một tab. */}
                <VariantsPanel projectId={project.id} readOnly={readOnly} />
                <VersionPanel
                  projectId={project.id}
                  companyId={project.company_id}
                  disciplines={CONCEPT_DISCIPLINES}
                  readOnly={readOnly}
                  emptyMessage="Chưa có bản phương án nào tải lên. Thêm phương án rồi phát hành để gửi khách hàng xem và ghi nhận góp ý."
                />
              </div>
            ),
          },
          {
            id: 'ho-so-ky-thuat',
            label: 'Hồ sơ kỹ thuật',
            content: (
              <DisciplinePanel
                projectId={project.id}
                companyId={project.company_id}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'phien-ban',
            label: 'Phiên bản bản vẽ',
            content: (
              <VersionPanel
                projectId={project.id}
                companyId={project.company_id}
                disciplines={TECHNICAL_DISCIPLINES}
                readOnly={readOnly}
                emptyMessage="Chưa có bản vẽ kỹ thuật nào. Mỗi bộ môn phát hành bản vẽ riêng; hệ thống tự thông báo cho các bên liên quan."
              />
            ),
          },
          {
            id: 'du-toan',
            label: 'Dự toán',
            content: (
              <div className="space-y-4">
                <BoqPanel
                  parent={{ kind: 'design', id: project.id }}
                  companyId={project.company_id}
                  readOnly={readOnly}
                />
                <EstimatePanel
                  parent={{ kind: 'design', id: project.id }}
                  companyId={project.company_id}
                  companyCode={companyCodeOf(profile, project.company_id) ?? 'NVO'}
                  readOnly={readOnly}
                />
              </div>
            ),
          },
          {
            id: 'thay-doi',
            label: 'Yêu cầu thay đổi',
            content: (
              <ChangeRequestPanel
                projectId={project.id}
                companyId={project.company_id}
                canEdit={canEdit}
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
                label: 'Bàn giao thi công',
                value: project.handed_over_at ? formatDateTime(project.handed_over_at) : EM_DASH,
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
    </>
  );
}
