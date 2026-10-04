/**
 * Trang «AI Design» riêng của một hồ sơ (T114, 03/10/2026) — Haan: «AI Design là công cụ hỗ trợ
 * phòng thiết kế, làm độc lập, có tính module».
 *
 * Mọi bước của công cụ ở MỘT chỗ: đầu bài và khảo sát hiện trạng → mặt bằng → mặt đứng → phối cảnh.
 * Vẫn gắn hồ sơ thiết kế (`design_projects`): quyền (RLS) và artifact đi theo hồ sơ.
 *
 * Trang này nằm ở `tk/`, KHÔNG ở `tk/ai/`: nó nạp hồ sơ, đầu bài và khảo sát qua hook dùng chung của
 * Module TK, mà thư mục `tk/ai/` bị cấm nhập hook ấy (`ai-independence.test.ts`). Bước đầu bài đưa
 * vào `AiDesignTab` qua vùng chèn `inputs` — phần AI không biết đầu bài được sửa bằng gì.
 */

import { designDisplayStatus, DESIGN_STAGE_META, formatDate } from '@nvg/shared';
import { useParams } from 'react-router-dom';
import { RecordNotFound } from '@/components/entity/entity-detail';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { useDesignProject } from '@/hooks/use-design-projects';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { AiDesignTab } from './ai/ai-design-tab';
import { BriefPanel } from './brief-panel';
import { DesignWorkspace } from './design-workspace';
import { SurveyPanel } from './survey-panel';

export function AiDesignPage() {
  const { id } = useParams<{ id: string }>();
  const canEdit = useCan('TK', 'edit');
  const { data: project, isLoading, error } = useDesignProject(id);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  if (!project) {
    return (
      <RecordNotFound
        entity="dự án thiết kế"
        listPath="/tk/ai-design"
        listLabel="Quay lại danh sách AI Design"
      />
    );
  }

  // Cùng điều kiện với trang hồ sơ: bàn giao rồi thì đóng băng.
  const readOnly = !canEdit || project.handed_over_at !== null;

  const inputs = (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">Đầu bài thiết kế</h2>
        <BriefPanel
          projectId={project.id}
          companyId={project.company_id}
          projectName={project.name}
          projectCode={project.code}
          readOnly={readOnly}
        />
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Khảo sát hiện trạng</h2>
        <SurveyPanel
          projectId={project.id}
          companyId={project.company_id}
          projectName={project.name}
          readOnly={readOnly}
        />
      </section>
    </div>
  );

  return (
    <DesignWorkspace
      breadcrumbs={[
        { label: 'Thiết kế' },
        { label: 'AI Design', to: '/tk/ai-design' },
        { label: project.name },
      ]}
      title={project.name}
      code={project.code}
      status={designDisplayStatus(project.stage, project.handover_deadline)}
      deadline={project.handover_deadline}
      meta={[
        DESIGN_STAGE_META[project.stage].label,
        project.handover_deadline ? `Hạn bàn giao ${formatDate(project.handover_deadline)}` : null,
      ]}
      primaryTabIds={['thiet-ke-ai']}
      tabs={[
        {
          id: 'thiet-ke-ai',
          label: 'AI Design',
          content: <AiDesignTab projectId={project.id} readOnly={readOnly} inputs={inputs} />,
        },
      ]}
    />
  );
}
