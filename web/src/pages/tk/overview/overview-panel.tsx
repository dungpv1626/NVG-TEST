/**
 * Tab Tổng quan của Trang dự án thiết kế (bản mẫu §5.5).
 *
 * Đây là bộ điều phối, không tự vẽ gì: dải tiến trình · năm thẻ công cụ · thông tin dự án ·
 * cột phải (kèm lối sang AI Design — công cụ hỗ trợ, không thuộc quy trình) · dự án gần đây. Mỗi khối tự nạp dữ liệu của mình và tự bày khung chờ, nên một
 * truy vấn chậm không giữ cả trang lại.
 *
 * Các khối dùng CHUNG khoá truy vấn với màn hình con tương ứng, nên bấm vào một thẻ là mở ra
 * dữ liệu đã nằm sẵn trong bộ nhớ đệm — không chờ lần thứ hai.
 */

import {
  useDesignBriefs,
  useDesignVersions,
  useDisciplineTasks,
  type DesignProjectDetailRecord,
} from '@/hooks/use-design-projects';
import { useDesignSurveys } from '@/hooks/use-design-surveys';
import { useEstimates } from '@/hooks/use-estimates';
import { ContextColumn } from './context-column';
import { ProgressTrack } from './progress-track';
import { ProjectFacts } from './project-facts';
import { RecentProjects } from './recent-projects';
import { designSteps } from './steps';
import { BriefCard, EstimateCard, ExportCard, PresentCard, SurveyCard } from './tool-cards';

export function OverviewPanel({
  project,
  readOnly,
  onSaveNotes,
}: {
  project: DesignProjectDetailRecord;
  readOnly: boolean;
  onSaveNotes: (value: string) => void;
}): React.ReactElement {
  const basePath = `/tk/du-an/${project.id}`;
  const steps = useDesignStepStates(project);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 gap-4">
        <ProgressTrack steps={steps} basePath={basePath} />

        {/* Năm thẻ của QUY TRÌNH, đúng thứ tự dải tiến trình, CÙNG cỡ (Haan, 07/10/2026): ba thẻ
            một hàng, hàng dưới căn giữa. Cao cố định để hai hàng bằng nhau; ô «chưa có» tự kéo
            đầy. AI Design không ở đây — nó là công cụ hỗ trợ độc lập, nằm ở cột phải. */}
        <div className="@container">
          <section
            aria-label="Bộ công cụ thiết kế"
            className="flex flex-wrap justify-center gap-3.5"
          >
            {[
              <BriefCard key="dau-bai" projectId={project.id} basePath={basePath} />,
              <SurveyCard key="khao-sat" projectId={project.id} basePath={basePath} />,
              <ExportCard key="ho-so" projectId={project.id} basePath={basePath} />,
              <EstimateCard key="du-toan" projectId={project.id} basePath={basePath} />,
              <PresentCard key="trinh-khach" projectId={project.id} basePath={basePath} />,
            ].map((card) => (
              <div
                key={card.key}
                className="w-full @xl:min-h-64 @xl:w-[calc((100%-0.875rem)/2)] @4xl:w-[calc((100%-1.75rem)/3)]"
              >
                {card}
              </div>
            ))}
          </section>
        </div>

        <ProjectFacts project={project} readOnly={readOnly} onSaveNotes={onSaveNotes} />
      </div>

      <ContextColumn project={project} />

      <div className="xl:col-span-2">
        <RecentProjects currentId={project.id} />
      </div>
    </div>
  );
}

/** Gom đầu vào của dải tiến trình. Phép suy nằm ở `steps.ts` để kiểm thử được rời khỏi React. */
function useDesignStepStates(project: DesignProjectDetailRecord) {
  const briefs = useDesignBriefs(project.id);
  const surveys = useDesignSurveys(project.id);
  const tasks = useDisciplineTasks(project.id);
  const versions = useDesignVersions(project.id);
  const estimates = useEstimates({ kind: 'design', id: project.id });

  const brief = briefs.data?.find((b) => b.is_current_version) ?? briefs.data?.[0] ?? null;

  return designSteps({
    brief: brief
      ? {
          confirmed: brief.confirmed_at !== null,
          completeness: brief.completeness_score != null ? Number(brief.completeness_score) : null,
        }
      : null,
    surveyCount: surveys.data?.length ?? 0,
    disciplinePercents: (tasks.data ?? []).map((t) => t.progress_percent),
    // Hai bước cuối đọc từ CHÍNH nguồn mà màn hình con của chúng dùng, không đoán theo `stage`.
    hasEstimate: (estimates.data ?? []).length > 0,
    customerApproved: (versions.data ?? []).some((v) => v.customer_approved_at !== null),
  });
}
