/**
 * Tab «Thiết kế AI» — dải bốn bước nối nhau của nhánh AI (T17, 09/09/2026).
 *
 * Vì sao là một tab RIÊNG chứ không phải một ô chọn trong hai tab của bộ giải: nhánh AI thay
 * thế bộ giải, và khi nó làm tốt thì bộ giải bị xoá. Trộn hai nhánh vào cùng màn hình thì mỗi
 * con số hiện ra không rõ của bên nào, và ngày dọn phải gỡ từng khối ra khỏi panel của bên kia.
 * Ở đây, xoá bộ giải là xoá hai tab của nó — tab này đứng nguyên.
 *
 * Dải bước là thứ quan trọng nhất của màn hình: mỗi bước ăn kết quả của bước trước, nên người
 * dùng phải thấy ngay mình đang ở đâu và bước nào còn thiếu. Bước chưa đủ điều kiện thì MỜ kèm
 * lý do, không ẩn — ẩn đi thì không ai biết tính năng có tồn tại (AFD 6.5).
 */

import { useState } from 'react';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useAiDesignState, type AiDesignState } from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip, Panel } from '../tk-ui';
import { cn } from '@/lib/utils';
import { AiPlanStep } from './ai-plan-step';
import { AiProgramStep } from './ai-program-step';

type StepId = 'chuong-trinh' | 'mat-bang' | 'mat-dung' | 'phoi-canh';

interface StepMeta {
  id: StepId;
  label: string;
  /** Câu một dòng nói bước này làm gì — hiện dưới nhãn khi bước đang mở. */
  hint: string;
}

const STEPS: StepMeta[] = [
  {
    id: 'chuong-trinh',
    label: '1. Chương trình không gian',
    hint: 'AI đề xuất danh mục phòng, tầng và diện tích từ đầu bài và khảo sát.',
  },
  {
    id: 'mat-bang',
    label: '2. Mặt bằng từng tầng',
    hint: 'AI khai nội dung bản vẽ; chương trình dựng tờ mặt bằng theo đúng dữ liệu đó.',
  },
  {
    id: 'mat-dung',
    label: '3. Mặt đứng',
    hint: 'Ý tưởng mái, vật liệu, màu, cổng và ban công — sửa được trước khi dựng ảnh.',
  },
  {
    id: 'phoi-canh',
    label: '4. Phối cảnh',
    hint: 'Năm ảnh cùng một ngôi nhà, dựng từ tờ mặt đứng đã duyệt.',
  },
];

/** Bước có kết quả chưa, đang chạy không, và nếu chưa mở được thì vì sao. */
function statusOf(
  step: StepId,
  state: AiDesignState,
): { done: boolean; running: boolean; blocked: string | null; count: number } {
  const run = (stage: 'program' | 'plan' | 'facade' | 'images') =>
    state.runs[stage]?.status === 'running' || state.runs[stage]?.status === 'queued';

  switch (step) {
    case 'chuong-trinh':
      return {
        done: Boolean(state.program),
        running: run('program'),
        blocked: state.briefArtifactId ? null : 'Cần xác nhận đầu bài trước.',
        count: state.program ? state.program.payload.spaces.length : 0,
      };
    case 'mat-bang':
      return {
        done: state.plans.length > 0,
        running: run('plan'),
        blocked: state.program ? null : 'Cần chương trình không gian trước.',
        count: state.plans.length,
      };
    case 'mat-dung':
      return {
        done: Boolean(state.facadeArtifactId),
        running: run('facade'),
        // Có phương án là chưa đủ: phải có phương án được CHỌN. Mặt đứng dựng theo đúng một mặt
        // bằng, và chọn bản nào là quyết định của người (PRD 2.3).
        blocked: state.planHeadArtifactId ? null : 'Cần chọn một phương án mặt bằng trước.',
        count: 0,
      };
    case 'phoi-canh':
      return {
        done: Boolean(state.imageSetArtifactId),
        running: run('images'),
        blocked: state.facadeArtifactId ? null : 'Cần ý tưởng mặt đứng trước.',
        count: 0,
      };
  }
}

export function AiDesignTab({
  projectId,
  readOnly,
}: {
  projectId: string;
  readOnly: boolean;
}): React.ReactElement {
  const state = useAiDesignState(projectId);
  const [open, setOpen] = useState<StepId>('chuong-trinh');

  if (state.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (state.isError || !state.data) {
    return (
      <EmptyState
        icon={<Layers className="size-6" />}
        message={toUserMessage(state.error)}
        action={
          <Button variant="secondary" onClick={() => void state.refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  const data = state.data;
  const active = STEPS.find((s) => s.id === open)!;

  return (
    <div className="space-y-6">
      <Panel
        title="Thiết kế bằng AI"
        aside={<Chip tone="mute">Bản phác tham khảo — không đi vào hồ sơ phát hành</Chip>}
      >
        <p className="text-fg-subtle">
          Bốn bước nối nhau, mỗi bước dùng kết quả của bước trước. Kết quả do mô hình đề xuất, kiến
          trúc sư xem lại và quyết định.
        </p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => {
            const s = statusOf(step.id, data);
            return (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={step.id === open ? 'step' : undefined}
                  onClick={() => setOpen(step.id)}
                  className={cn(
                    'w-full rounded-md border p-3 text-left',
                    step.id === open
                      ? 'border-tk-bl-line bg-tk-bl-bg'
                      : 'border-tk-line bg-tk-panel',
                  )}
                >
                  <span className="block font-medium">{step.label}</span>
                  <span className="mt-1 block">
                    {/* Trạng thái luôn kèm CHỮ, không chỉ màu (CGD 6.8). */}
                    {s.running ? (
                      <Chip tone="bl">Đang chạy</Chip>
                    ) : s.done ? (
                      <Chip tone="gr">{s.count ? `Có ${s.count}` : 'Đã có'}</Chip>
                    ) : s.blocked ? (
                      <Chip tone="mute">Chưa đủ điều kiện</Chip>
                    ) : (
                      <Chip tone="am">Chưa chạy</Chip>
                    )}
                  </span>
                  {s.blocked && (
                    <span className="mt-1 block text-xs text-fg-subtle">{s.blocked}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </Panel>

      <div>
        <p className="mb-3 text-fg-subtle">{active.hint}</p>
        {open === 'chuong-trinh' && (
          <AiProgramStep projectId={projectId} readOnly={readOnly} state={data} />
        )}
        {open === 'mat-bang' && (
          <AiPlanStep projectId={projectId} readOnly={readOnly} state={data} />
        )}
        {open !== 'chuong-trinh' && open !== 'mat-bang' && (
          <Panel title={active.label}>
            {/* Đúng câu của CLAUDE.md 5.2: chưa có thì nói chưa có, không hiện số 0 hay ô rỗng
                trông như đã chạy xong. */}
            <p className="text-fg-subtle">Bước này chưa mở. Đang làm — sẽ có ở đợt tiếp theo.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
