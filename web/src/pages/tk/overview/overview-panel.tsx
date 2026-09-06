/**
 * Tab Tổng quan của Trang dự án thiết kế (bản mẫu §5.5).
 *
 * Đây là bộ điều phối, không tự vẽ gì: dải tiến trình · sáu thẻ công cụ · thông tin dự án ·
 * cột phải · dự án gần đây. Mỗi khối tự nạp dữ liệu của mình và tự bày khung chờ, nên một
 * truy vấn chậm không giữ cả trang lại.
 *
 * Các khối dùng CHUNG khoá truy vấn với màn hình con tương ứng, nên bấm vào một thẻ là mở ra
 * dữ liệu đã nằm sẵn trong bộ nhớ đệm — không chờ lần thứ hai.
 */

import {
  useDesignBriefs,
  useDesignVersions,
  useDisciplineTasks,
  useFloorPlanVariants,
  useSpaceProgram,
  type DesignProjectDetailRecord,
} from '@/hooks/use-design-projects';
import { useDesignSurveys } from '@/hooks/use-design-surveys';
import { useEstimates } from '@/hooks/use-estimates';
import { ContextColumn } from './context-column';
import { ProgressTrack } from './progress-track';
import { ProjectFacts } from './project-facts';
import { RecentProjects } from './recent-projects';
import { designSteps } from './steps';
import { BriefCard, ExportCard, ProgramCard, SurveyCard, VariantsCard } from './tool-cards';

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

        {/* Tối đa BA thẻ một hàng — Haan chốt 06/09/2026, thay bản `auto-fit` trước đó.
            `auto-fit minmax(292px,1fr)` của bản mẫu cho ra bốn cột ở màn hình rộng, và khi đó
            thẻ hẹp tới mức bảng bốn hàng của Chương trình không gian phải nén số liệu.
            Hai cột thì ngược lại: ở màn 1850px mỗi thẻ nở tới ~680px, ruột loãng và trang dài
            gấp đôi. Ba là mức giữa, và trùng với cách bản mẫu tự bày ở khổ màn hình của nó.
            Ở `xl` (1280px) mỗi thẻ vẫn rộng ~290px, tức vẫn trên mức tối thiểu 292px của §5.5b. */}
        <section
          aria-label="Bộ công cụ thiết kế"
          className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3"
        >
          <BriefCard projectId={project.id} basePath={basePath} />
          <SurveyCard projectId={project.id} basePath={basePath} />
          <ProgramCard projectId={project.id} basePath={basePath} />
          <VariantsCard projectId={project.id} basePath={basePath} readOnly={readOnly} />
          <ExportCard projectId={project.id} basePath={basePath} />
        </section>

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
  const program = useSpaceProgram(project.id);
  const variants = useFloorPlanVariants(project.id);
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
    program: program.data
      ? {
          committed: program.data.matchesHead && program.data.headArtifactId !== null,
          spaceCount: program.data.program.spaces.length,
        }
      : null,
    feasibleVariants: (variants.data?.variants ?? []).filter((v) => v.status === 'ok').length,
    disciplinePercents: (tasks.data ?? []).map((t) => t.progress_percent),
    // Hai bước cuối đọc từ CHÍNH nguồn mà màn hình con của chúng dùng, không đoán theo `stage`.
    hasEstimate: (estimates.data ?? []).length > 0,
    customerApproved: (versions.data ?? []).some((v) => v.customer_approved_at !== null),
  });
}
