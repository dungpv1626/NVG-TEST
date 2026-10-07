/**
 * Tab «AI Design» — dải ba bước nối nhau của nhánh AI (T17, 09/09/2026; bộ giải nội bộ gỡ ở T58).
 *
 * Bước «Chương trình không gian» đã gỡ khỏi dải (19/09/2026): mặt bằng đọc đầu bài + khảo sát,
 * không đọc chương trình không gian (T45), nên bước ấy không còn là đầu vào của bước nào.
 *
 * Dải bước là thứ quan trọng nhất của màn hình: mỗi bước ăn kết quả của bước trước, nên người
 * dùng phải thấy ngay mình đang ở đâu và bước nào còn thiếu. Bước chưa đủ điều kiện thì MỜ kèm
 * lý do, không ẩn — ẩn đi thì không ai biết tính năng có tồn tại (AFD 6.5).
 */

import { useState } from 'react';
import { ArrowRight, Check, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useAiDesignState, useUploadedDrawings, type AiDesignState } from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip } from '../tk-ui';
import { cn } from '@/lib/utils';
import { AiFacadeStep, facadeIsStale, STALE_FACADE } from './ai-facade-step';
import { AiPerspectiveStep } from './ai-perspective-step';
import { AiPlanStep } from './ai-plan-step';
import { AiUploadPanel } from './ai-upload-panel';

type StepId = 'dau-bai' | 'mat-bang' | 'mat-dung' | 'phoi-canh';

interface StepMeta {
  id: StepId;
  label: string;
  /** Câu một dòng nói bước này làm gì — hiện dưới nhãn khi bước đang mở. */
  hint: string;
}

/**
 * Bước «Đầu bài và khảo sát» — chỉ có khi nơi dựng tab đưa vào vùng chèn `inputs` (trang AI Design
 * riêng, T114). Trong trang hồ sơ, đầu bài có tab riêng nên dải giữ ba bước.
 */
const INPUT_STEP: StepMeta = {
  id: 'dau-bai',
  label: 'Đầu bài và khảo sát',
  hint: 'Đầu bài ba phần (chung · mặt bằng · mặt đứng) và khảo sát hiện trạng của hồ sơ — đầu vào duy nhất của các bước AI.',
};

const STEPS: StepMeta[] = [
  {
    id: 'mat-bang',
    label: 'Mặt bằng từng tầng',
    hint: 'AI khai nội dung bản vẽ; chương trình dựng tờ mặt bằng theo đúng dữ liệu đó.',
  },
  {
    id: 'mat-dung',
    label: 'Mặt đứng',
    hint: 'Ý tưởng mái, vật liệu, màu, cổng và ban công — sửa được trước khi dựng ảnh.',
  },
  {
    id: 'phoi-canh',
    label: 'Phối cảnh',
    hint: 'Năm ảnh cùng một ngôi nhà, dựng từ tờ mặt đứng và tờ mặt bằng mái.',
  },
];

/** Bước có kết quả chưa, đang chạy không, và nếu chưa mở được thì vì sao. */
function statusOf(
  step: StepId,
  state: AiDesignState,
  /** Số bản vẽ mặt đứng kỹ sư đã tải lên — đủ để dựng phối cảnh dù chưa có ý tưởng AI (T114 Đợt 4b). */
  facadeUploads = 0,
): { done: boolean; running: boolean; blocked: string | null; count: number } {
  const run = (stage: 'plan' | 'facade' | 'images') =>
    state.runs[stage]?.status === 'running' || state.runs[stage]?.status === 'queued';

  switch (step) {
    case 'dau-bai':
      return {
        done: Boolean(state.briefArtifactId),
        running: false,
        blocked: null,
        count: 0,
      };
    case 'mat-bang':
      return {
        done: state.plans.length > 0,
        running: run('plan'),
        // Mặt bằng đọc đầu bài + khảo sát, không đọc chương trình không gian (T45, 15/09/2026).
        blocked: state.briefArtifactId ? null : 'Cần xác nhận đầu bài trước.',
        count: state.plans.length,
      };
    case 'mat-dung':
      return {
        // Mặt đứng dựng theo phương án cũ (T59) chưa tính là xong: cửa trên tờ ấy của nhà khác.
        done: Boolean(state.facadeArtifactId) && !facadeIsStale(state),
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
        // Bản vẽ mặt đứng tải lên cũng mở được bước này: trước 07/10/2026 dải bước vẫn báo «Chưa
        // đủ điều kiện» dù đã có bản tải lên, ngược với chính câu nhắc của nó.
        blocked: state.facadeArtifactId
          ? facadeIsStale(state) && facadeUploads === 0
            ? STALE_FACADE
            : null
          : facadeUploads > 0
            ? null
            : 'Cần ý tưởng mặt đứng (hoặc bản vẽ mặt đứng tải lên) trước.',
        count: 0,
      };
  }
}

export function AiDesignTab({
  projectId,
  readOnly,
  inputs,
  briefLink,
}: {
  projectId: string;
  readOnly: boolean;
  /** Màn hình đầu bài + khảo sát, do nơi dựng tab đưa vào. Có thì dải thêm bước đầu tiên. */
  inputs?: React.ReactNode;
  /** Lối sang đầu bài của hồ sơ (để sửa) — chèn cạnh phiếu mặt đứng chỉ xem. */
  briefLink?: React.ReactNode;
}): React.ReactElement {
  const state = useAiDesignState(projectId);
  const facadeUploads = useUploadedDrawings(projectId, 'facade').data?.items.length ?? 0;
  const steps = inputs ? [INPUT_STEP, ...STEPS] : STEPS;
  // Chưa có đầu bài đã xác nhận thì mở ngay bước đầu bài — mọi bước sau đều đang chờ nó.
  const [chosen, setOpen] = useState<StepId | null>(null);
  const open: StepId =
    chosen ?? (inputs && state.data && !state.data.briefArtifactId ? 'dau-bai' : 'mat-bang');

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
  // Nút «Tiếp» chỉ hiện khi bước hiện tại đã có kết quả và bước sau mở được.
  const nextIndex = steps.findIndex((s) => s.id === open) + 1;
  const next = steps[nextIndex];
  const nextStep =
    next &&
    statusOf(open, data, facadeUploads).done &&
    !statusOf(next.id, data, facadeUploads).blocked
      ? next
      : null;

  // Dải bước gọn một hàng (Haan, 07/10/2026): số tròn — dấu tích khi xong — nhãn, trạng thái
  // bằng chữ ngay dưới. Câu «Bản phác tham khảo — không đi vào hồ sơ phát hành» chuyển xuống dưới
  // tờ vẽ, cạnh đúng thứ nó nói tới.
  return (
    <div className="space-y-5">
      <nav aria-label="Các bước AI Design">
        <ol
          className={cn(
            'grid gap-1.5 rounded-lg border border-tk-line bg-tk-panel p-1.5',
            inputs ? 'sm:grid-cols-4' : 'sm:grid-cols-3',
          )}
        >
          {steps.map((step, index) => {
            const s = statusOf(step.id, data, facadeUploads);
            const isOpen = step.id === open;
            const done = step.id === 'dau-bai' ? s.done : s.done && !s.running;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={isOpen ? 'step' : undefined}
                  onClick={() => setOpen(step.id)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                    isOpen ? 'bg-tk-bl-bg ring-1 ring-tk-bl-line' : 'hover:bg-tk-hover',
                    s.blocked && !isOpen && 'opacity-70',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                      done
                        ? 'bg-tk-gr-badge text-tk-gr-fg2'
                        : isOpen
                          ? 'bg-brand text-fg-inverse'
                          : 'bg-tk-chip-mute text-tk-t2',
                    )}
                    aria-hidden
                  >
                    {done ? <Check className="size-4" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    {/* Tên bước và nhãn trạng thái CÙNG hàng — dải thấp hơn, nhường chỗ cho bản vẽ. */}
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{step.label}</span>
                      {/* Trạng thái luôn kèm CHỮ, không chỉ màu (CGD 6.8). */}
                      {s.running ? (
                        <Chip tone="bl">Đang chạy</Chip>
                      ) : step.id === 'mat-dung' && facadeIsStale(data) ? (
                        <Chip tone="am">Theo phương án cũ</Chip>
                      ) : step.id === 'dau-bai' ? (
                        s.done ? (
                          <Chip tone="gr">Đã xác nhận</Chip>
                        ) : (
                          <Chip tone="am">Chưa xác nhận</Chip>
                        )
                      ) : s.done ? (
                        <Chip tone="gr">{s.count ? `Có ${s.count}` : 'Đã có'}</Chip>
                      ) : s.blocked ? (
                        <Chip tone="mute">Chưa đủ điều kiện</Chip>
                      ) : (
                        <Chip tone="am">Chưa chạy</Chip>
                      )}
                    </span>
                    {s.blocked && (
                      <span className="mt-0.5 block text-xs text-fg-subtle">{s.blocked}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div>
        {open === 'dau-bai' && inputs}
        {/* Ảnh từ bản vẽ của kỹ sư (T114 Đợt 4) không phụ thuộc bản AI: kỹ sư có thể sửa bản AI
            trên AutoCAD, hoặc tự vẽ từ đầu. Ở bước mặt bằng nó là một thẻ ở cuối cột thiết lập. */}
        {open === 'mat-bang' && (
          <AiPlanStep projectId={projectId} readOnly={readOnly} state={data} />
        )}
        {open === 'mat-dung' && (
          <div className="space-y-6">
            <AiFacadeStep
              projectId={projectId}
              readOnly={readOnly}
              state={data}
              briefLink={briefLink}
            />
            <AiUploadPanel projectId={projectId} drawing="facade" readOnly={readOnly} />
          </div>
        )}
        {open === 'phoi-canh' && (
          <AiPerspectiveStep projectId={projectId} readOnly={readOnly} state={data} />
        )}
        {open !== 'dau-bai' && nextStep && (
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={() => setOpen(nextStep.id)}>
              Tiếp: {nextStep.label}
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {/* «Nhật ký gọi AI» của hồ sơ (`AiCallLedger`) TẠM ẨN theo Haan 07/10/2026, sẽ xoá sau.
          Chi phí của từng lượt vẫn xem được trong «Xem chi tiết» của tiến độ. */}
    </div>
  );
}
