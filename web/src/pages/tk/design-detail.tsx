/**
 * Chi tiết Dự án thiết kế — "Hồ sơ 360°" (Webapp Flow 4.3), hành trình 3.3: Đầu bài → Khảo
 * sát → AI Design → Hồ sơ kỹ thuật → Phiên bản bản vẽ → Dự toán → Yêu cầu thay đổi, và nút
 * Bàn giao thi công ở header.
 *
 * Các tab là những KHÍA CẠNH của cùng một hồ sơ, không phải các trang riêng — nên chúng dùng
 * chung một đường dẫn và tab hiện tại nằm ở `?tab=`. Điều đó KHÔNG đổi khi đổi giao diện.
 *
 * Đổi ở đây (06/09/2026) chỉ là VỎ: thay `EntityDetail` bằng `DesignWorkspace` của riêng
 * Module Thiết kế, dựng theo bộ bàn giao thiết kế. Bốn tab cấp một nằm trên thanh tab, sáu
 * bước quy trình thành màn hình con mở từ thẻ công cụ ở Tổng quan — xem chú thích đầu
 * `design-workspace.tsx`. Nội dung từng tab giữ nguyên component cũ, không sửa một dòng.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  DESIGN_DISCIPLINES,
  DESIGN_STAGE_META,
  designDisplayStatus,
  formatDate,
  formatDateTime,
} from '@nvg/shared';
import { DraftContractButton } from '@/components/contract/draft-contract-button';
import { BoqPanel } from '@/components/estimate/boq-panel';
import { EstimatePanel } from '@/components/estimate/estimate-panel';
import { DetailFields, RecordNotFound } from '@/components/entity/entity-detail';
import { Button } from '@/components/ui/button';
import { SectionHelp } from '@/components/ui/section-help';
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
import { DesignWorkspace } from './design-workspace';
import { DESIGN_HELP } from './help-texts';
import { OverviewPanel } from './overview/overview-panel';
import { BriefPanel } from './brief-panel';
import { ChangeRequestPanel } from './change-request-panel';
import { DisciplinePanel } from './discipline-panel';
import { SurveyPanel } from './survey-panel';
import { AiDesignTab } from './ai/ai-design-tab';
import { VersionPanel } from './version-panel';

const EM_DASH = '—';

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

  /**
   * Hàng nút của header (bản mẫu §5.4 có hai nút: hướng dẫn và hành động chính).
   *
   * Nút hướng dẫn LUÔN có, kể cả với người chỉ được xem — người xem cũng cần hiểu màn hình
   * đang bày cái gì. Còn "Tạo phương án mới" của bản mẫu nằm ở chân thẻ AI phương án chứ
   * không ở đây: mỗi màn hình chỉ được có MỘT hành động chính (CGD 6.3), và ở màn hình này
   * hành động đó là "Bàn giao thi công" — điểm kết của cả module.
   */
  const actions = (
    <>
      <SectionHelp {...DESIGN_HELP.workspace} triggerLabel="Hướng dẫn sử dụng" />
      {canEdit && project.handed_over_at === null && project.stage !== 'dung_thiet_ke' && (
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
                  setNotice(
                    `Đã bàn giao hồ sơ thi công và thông báo cho ${String(notified)} người.`,
                  ),
              )
            }
          >
            Bàn giao thi công
          </Button>
          <Button variant="secondary" onClick={stopDesign}>
            Dừng thiết kế
          </Button>
        </>
      )}
    </>
  );

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

      <DesignWorkspace
        breadcrumbs={[
          { label: 'Thiết kế' },
          { label: 'Dự án thiết kế', to: '/tk/du-an' },
          { label: project.name },
        ]}
        title={project.name}
        code={project.code}
        status={designDisplayStatus(project.stage, project.handover_deadline)}
        deadline={project.handover_deadline}
        meta={[
          DESIGN_STAGE_META[project.stage].label,
          <>
            Người chịu trách nhiệm{' '}
            <span className="text-tk-tx">{project.responsible?.full_name ?? 'chưa phân công'}</span>
          </>,
          project.handover_deadline ? (
            <>
              Hạn bàn giao{' '}
              <span className="text-tk-tx">{formatDate(project.handover_deadline)}</span>
            </>
          ) : null,
        ]}
        actions={actions}
        primaryTabIds={['tong-quan', 'phien-ban', 'thay-doi']}
        tabs={[
          {
            id: 'tong-quan',
            label: 'Tổng quan',
            content: (
              <OverviewPanel
                project={project}
                readOnly={readOnly}
                onSaveNotes={(value) =>
                  void run(() =>
                    updateProject.mutateAsync({
                      id: project.id,
                      changes: { notes: value.trim() || null },
                    }),
                  )
                }
              />
            ),
          },
          {
            id: 'dau-bai',
            label: 'Đầu bài thiết kế',
            subtitle:
              'Chuẩn hoá yêu cầu khách hàng thành dữ liệu có cấu trúc làm đầu vào thiết kế.',
            content: (
              <BriefPanel
                projectId={project.id}
                companyId={project.company_id}
                projectName={project.name}
                projectCode={project.code}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'khao-sat',
            label: 'Khảo sát hiện trạng',
            subtitle: 'Số đo, ảnh và ghi chú hiện trạng khu đất — đầu vào của đầu bài.',
            content: (
              <SurveyPanel
                projectId={project.id}
                companyId={project.company_id}
                projectName={project.name}
                readOnly={readOnly}
              />
            ),
          },
          {
            id: 'thiet-ke-ai',
            label: 'AI Design',
            subtitle:
              'Mặt bằng từng tầng → mặt đứng → phối cảnh, do AI đề xuất. Kết quả là bản phác tham khảo, không đi vào hồ sơ phát hành.',
            content: <AiDesignTab projectId={project.id} readOnly={readOnly} />,
          },
          {
            id: 'ho-so-ky-thuat',
            label: 'Hồ sơ kỹ thuật',
            subtitle: 'Tiến độ ba bộ môn và các hạng mục còn chặn bàn giao thi công.',
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
                // Gồm cả bản phương án KTS tải lên (TK-03) lẫn bản vẽ kỹ thuật (T58).
                disciplines={DESIGN_DISCIPLINES}
                readOnly={readOnly}
                emptyMessage="Chưa có bản phương án hay bản vẽ kỹ thuật nào. Mỗi bộ môn phát hành bản riêng; hệ thống tự thông báo cho các bên liên quan."
              />
            ),
          },
          {
            id: 'du-toan',
            label: 'Dự toán',
            subtitle: 'Khối lượng và dự toán lập trên phương án đã chọn.',
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
