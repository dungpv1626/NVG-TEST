/**
 * Trang «AI Design» riêng của một hồ sơ (T114, 03/10/2026) — Haan: «AI Design là công cụ hỗ trợ
 * phòng thiết kế, làm độc lập, có tính module».
 *
 * Mọi bước của công cụ ở MỘT chỗ, bốn bước (Đợt 5B): Đầu vào → Mặt bằng → Mặt ngoài → Bộ kết quả.
 * Vẫn gắn hồ sơ thiết kế (`design_projects`): quyền (RLS) và artifact đi theo hồ sơ.
 *
 * Đầu trang KHÔNG mang trạng thái, bước quy trình hay hạn bàn giao của hồ sơ (Haan, 07/10/2026): AI
 * Design không thuộc quy trình thiết kế, bày những thứ ấy ở đây là ngầm nói kết quả AI đẩy hồ sơ đi
 * tiếp. Chỉ còn mã hồ sơ, một câu nói rõ ranh giới, và lối về hồ sơ thiết kế.
 *
 * Trang này nằm ở `tk/`, KHÔNG ở `tk/ai/`: nó nạp hồ sơ, đầu bài và khảo sát qua hook dùng chung của
 * Module TK, mà thư mục `tk/ai/` bị cấm nhập hook ấy (`ai-independence.test.ts`). Bước đầu bài đưa
 * vào `AiDesignTab` qua vùng chèn `inputs` — phần AI không biết đầu bài được sửa bằng gì.
 */

import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
  const [params] = useSearchParams();
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

  // Đầu bài và khảo sát là của HỒ SƠ, ở đây CHỈ XEM (Haan, 07/10/2026): AI Design là công cụ hỗ
  // trợ, không được sửa đầu vào chính thức của quy trình. Muốn sửa thì quay về hồ sơ thiết kế.
  const editPath = `/tk/du-an/${project.id}`;
  const inputs = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-subtle p-3">
        <p className="mr-auto text-fg-subtle">
          Đầu bài và khảo sát của hồ sơ thiết kế — chỉ xem ở đây. Sửa hoặc xác nhận ở hồ sơ thiết
          kế; AI Design đọc bản đầu bài đã xác nhận mới nhất.
        </p>
        {!readOnly && (
          <>
            <Button asChild variant="secondary">
              <Link to={`${editPath}?tab=dau-bai`}>Sửa đầu bài</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to={`${editPath}?tab=khao-sat`}>Sửa khảo sát</Link>
            </Button>
          </>
        )}
      </div>
      <section>
        <h2 className="mb-2 font-semibold">Đầu bài thiết kế</h2>
        <BriefPanel
          projectId={project.id}
          companyId={project.company_id}
          projectName={project.name}
          projectCode={project.code}
          readOnly
        />
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Khảo sát hiện trạng</h2>
        <SurveyPanel
          projectId={project.id}
          companyId={project.company_id}
          projectName={project.name}
          readOnly
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
      meta={[]}
      actions={
        <Button asChild variant="secondary">
          <Link to={`/tk/du-an/${project.id}`}>Mở hồ sơ thiết kế</Link>
        </Button>
      }
      compact
      primaryTabIds={['thiet-ke-ai']}
      tabs={[
        {
          id: 'thiet-ke-ai',
          label: 'AI Design',
          content: (
            <AiDesignTab
              projectId={project.id}
              readOnly={readOnly}
              projectCode={project.code}
              projectName={project.name}
              initialStep={params.get('buoc')}
              initialPart={params.get('phan')}
              inputs={inputs}
              briefLink={
                <Link className="underline" to={`${editPath}?tab=dau-bai`}>
                  Sửa ở đầu bài của hồ sơ
                </Link>
              }
            />
          ),
        },
      ]}
    />
  );
}
