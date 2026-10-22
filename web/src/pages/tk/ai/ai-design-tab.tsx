/**
 * Tab «AI Design» — dải BỐN bước (Đợt 5B, 22/10/2026, vấn đề 7 của chủ dự án «AI Design chưa công thái
 * học»): **Đầu vào** (đầu bài + khảo sát, chỉ xem) → **Mặt bằng** (giá ước tính trên nút, so phương án,
 * ba lý do trừ điểm, sửa bằng ô yêu cầu) → **Mặt ngoài** (mặt đứng + phối cảnh) → **Bộ kết quả** (tải cả
 * gói `.zip` theo mã hồ sơ). Đường dẫn có `?buoc=<bước>` (và `&phan=phoi-canh`) thì mở thẳng bước ấy — trang
 * ngoài đọc địa chỉ rồi đưa vào `initialStep` (thư mục `tk/ai/` không nhập router, `ai-independence.test.ts`); bấm đổi bước là trạng thái trong trang, không điều hướng (không thêm lịch sử trình duyệt).
 *
 * Lịch sử: dải ba bước nối nhau của nhánh AI (T17, 09/09/2026; bộ giải nội bộ gỡ ở T58).
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
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useAiDesignState, useUploadedDrawings, type AiDesignState } from '@/hooks/use-ai-design';
import { toUserMessage } from '@/hooks/use-error-message';
import { Chip } from '../tk-ui';
import { cn } from '@/lib/utils';
import { AiFacadeStep, facadeIsStale, STALE_FACADE } from './ai-facade-step';
import { AiPerspectiveStep } from './ai-perspective-step';
import { AiPlanStep } from './ai-plan-step';
import { AiResultBundle } from './ai-result-bundle';
import { AiUploadPanel } from './ai-upload-panel';

type StepId = 'dau-vao' | 'mat-bang' | 'mat-ngoai' | 'ket-qua';
/** Hai phần của bước «Mặt ngoài». */
type OuterPart = 'mat-dung' | 'phoi-canh';

interface StepMeta {
  id: StepId;
  label: string;
  /** Câu một dòng nói bước này làm gì — hiện dưới nhãn khi bước đang mở. */
  hint: string;
}

/**
 * Bước «Đầu vào» — chỉ có khi nơi dựng tab đưa vào vùng chèn `inputs` (trang AI Design riêng, T114).
 * Đầu bài và khảo sát là của HỒ SƠ, ở đây chỉ xem (T118).
 */
const INPUT_STEP: StepMeta = {
  id: 'dau-vao',
  label: 'Đầu vào',
  hint: 'Đầu bài đã xác nhận và khảo sát hiện trạng của hồ sơ — chỉ xem; sửa ở hồ sơ thiết kế.',
};

const STEPS: StepMeta[] = [
  {
    id: 'mat-bang',
    label: 'Mặt bằng',
    hint: 'AI khai nội dung bản vẽ; chương trình dựng tờ mặt bằng. So phương án, sửa bằng ô yêu cầu.',
  },
  {
    id: 'mat-ngoai',
    label: 'Mặt ngoài',
    hint: 'Mặt đứng mặt tiền và ảnh phối cảnh dựng trên phương án đã chọn.',
  },
  {
    id: 'ket-qua',
    label: 'Bộ kết quả',
    hint: 'Tải cả gói một phương án: tờ vẽ SVG, DXF và ảnh, tên theo mã hồ sơ.',
  },
];

const STEP_IDS: readonly StepId[] = ['dau-vao', 'mat-bang', 'mat-ngoai', 'ket-qua'];

/** Bước có kết quả chưa, đang chạy không, và nếu chưa mở được thì vì sao. */
function statusOf(
  step: StepId,
  state: AiDesignState,
): { done: boolean; running: boolean; blocked: string | null; count: number } {
  switch (step) {
    case 'dau-vao':
      return { done: Boolean(state.briefArtifactId), running: false, blocked: null, count: 0 };
    case 'mat-bang':
      return {
        done: state.plans.length > 0,
        running: isRunning(state, 'plan'),
        // Mặt bằng đọc đầu bài + khảo sát, không đọc chương trình không gian (T45, 15/09/2026).
        blocked: state.briefArtifactId ? null : 'Cần xác nhận đầu bài trước.',
        count: state.plans.length,
      };
    case 'mat-ngoai':
      return {
        // Mặt đứng dựng theo phương án cũ (T59) chưa tính là xong: cửa trên tờ ấy của nhà khác.
        done: Boolean(state.facadeArtifactId) && !facadeIsStale(state),
        running: isRunning(state, 'facade') || isRunning(state, 'images'),
        // Chỉ chặn khi chưa có phương án nào. Chọn phương án làm nền là việc NGAY TRONG bước này.
        blocked: state.plans.length > 0 ? null : 'Cần xếp mặt bằng trước.',
        count: 0,
      };
    case 'ket-qua':
      return {
        done: false,
        running: false,
        blocked: state.plans.length > 0 ? null : 'Cần ít nhất một phương án mặt bằng.',
        count: 0,
      };
  }
}

function isRunning(state: AiDesignState, stage: 'plan' | 'facade' | 'images'): boolean {
  return state.runs[stage]?.status === 'running' || state.runs[stage]?.status === 'queued';
}

/** Phối cảnh mở được chưa, và nếu chưa thì vì sao. */
function perspectiveBlocked(state: AiDesignState, facadeUploads: number): string | null {
  // Bản vẽ mặt đứng tải lên cũng mở được phần này (T114 Đợt 4b).
  if (state.facadeArtifactId) {
    return facadeIsStale(state) && facadeUploads === 0 ? STALE_FACADE : null;
  }
  return facadeUploads > 0 ? null : 'Cần ý tưởng mặt đứng (hoặc bản vẽ mặt đứng tải lên) trước.';
}

export function AiDesignTab({
  projectId,
  readOnly,
  inputs,
  briefLink,
  projectCode,
  projectName,
  initialStep,
  initialPart,
}: {
  /** Bước mở lúc vào (từ `?buoc=` của địa chỉ); giá trị lạ thì bỏ qua. */
  initialStep?: string | null;
  /** Phần mở của bước «Mặt ngoài» (`?phan=`). */
  initialPart?: string | null;
  projectId: string;
  readOnly: boolean;
  /** Mã hồ sơ thiết kế — tên gói tải về ở bước «Bộ kết quả». */
  projectCode?: string | null;
  projectName?: string | null;
  /** Màn hình đầu bài + khảo sát, do nơi dựng tab đưa vào. Có thì dải thêm bước đầu tiên. */
  inputs?: React.ReactNode;
  /** Lối sang đầu bài của hồ sơ (để sửa) — chèn cạnh phiếu mặt đứng chỉ xem. */
  briefLink?: React.ReactNode;
}): React.ReactElement {
  const state = useAiDesignState(projectId);
  const facadeUploads = useUploadedDrawings(projectId, 'facade').data?.items.length ?? 0;
  const steps = inputs ? [INPUT_STEP, ...STEPS] : STEPS;
  const fromUrl = initialStep ?? null;
  const [chosen, setOpen] = useState<StepId | null>(() =>
    fromUrl &&
    (STEP_IDS as readonly string[]).includes(fromUrl) &&
    (inputs || fromUrl !== 'dau-vao')
      ? (fromUrl as StepId)
      : null,
  );
  const [part, setPart] = useState<OuterPart>(() =>
    initialPart === 'phoi-canh' ? 'phoi-canh' : 'mat-dung',
  );
  // Chưa có đầu bài đã xác nhận thì mở ngay bước đầu vào — mọi bước sau đều đang chờ nó.
  const open: StepId =
    chosen ?? (inputs && state.data && !state.data.briefArtifactId ? 'dau-vao' : 'mat-bang');

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
    next && statusOf(open, data).done && !statusOf(next.id, data).blocked ? next : null;

  // Dải bước gọn một hàng (Haan, 07/10/2026): số tròn — dấu tích khi xong — nhãn, trạng thái
  // bằng chữ ngay dưới. Câu «Bản phác tham khảo — không đi vào hồ sơ phát hành» chuyển xuống dưới
  // tờ vẽ, cạnh đúng thứ nó nói tới.
  return (
    <div className="space-y-5">
      <nav aria-label="Các bước AI Design">
        <ol
          className={cn(
            'grid gap-1.5 rounded-lg border border-tk-line bg-tk-panel p-1.5',
            inputs ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3',
          )}
        >
          {steps.map((step, index) => {
            const s = statusOf(step.id, data);
            const isOpen = step.id === open;
            const done = step.id === 'dau-vao' ? s.done : s.done && !s.running;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  aria-current={isOpen ? 'step' : undefined}
                  onClick={() => setOpen(step.id)}
                  className={cn(
                    'group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left',
                    'transition-[translate,background-color] duration-(--motion-fast) ease-(--ease-out)',
                    isOpen
                      ? 'bg-tk-bl-bg ring-1 ring-tk-bl-line'
                      : 'hover:bg-tk-hover motion-safe:hover:-translate-y-px',
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
                      ) : step.id === 'mat-ngoai' && facadeIsStale(data) ? (
                        <Chip tone="am">Theo phương án cũ</Chip>
                      ) : step.id === 'ket-qua' ? (
                        s.blocked ? (
                          <Chip tone="mute">Chưa đủ điều kiện</Chip>
                        ) : (
                          <Chip tone="gr">Sẵn sàng tải</Chip>
                        )
                      ) : step.id === 'dau-vao' ? (
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
        {open === 'dau-vao' && inputs}
        {/* Ảnh từ bản vẽ của kỹ sư (T114 Đợt 4) không phụ thuộc bản AI: kỹ sư có thể sửa bản AI
            trên AutoCAD, hoặc tự vẽ từ đầu. Ở bước mặt bằng nó là một thẻ ở cuối cột thiết lập. */}
        {open === 'mat-bang' && (
          <AiPlanStep projectId={projectId} readOnly={readOnly} state={data} />
        )}
        {open === 'mat-ngoai' && (
          <div className="space-y-4">
            {/* Hai phần của mặt ngoài: phối cảnh dựng từ tờ mặt đứng, nên mặt đứng đứng trước. */}
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                options={['mat-dung', 'phoi-canh'] as const}
                value={part}
                onChange={setPart}
                getLabel={(value) => (value === 'mat-dung' ? 'Mặt đứng' : 'Phối cảnh')}
              />
              {part === 'phoi-canh' && perspectiveBlocked(data, facadeUploads) && (
                <span className="text-fg-subtle">{perspectiveBlocked(data, facadeUploads)}</span>
              )}
            </div>
            {part === 'mat-dung' ? (
              <div className="space-y-6">
                <AiFacadeStep
                  projectId={projectId}
                  readOnly={readOnly}
                  state={data}
                  briefLink={briefLink}
                />
                <AiUploadPanel projectId={projectId} drawing="facade" readOnly={readOnly} />
              </div>
            ) : (
              <AiPerspectiveStep projectId={projectId} readOnly={readOnly} state={data} />
            )}
          </div>
        )}
        {open === 'ket-qua' && (
          <AiResultBundle
            projectId={projectId}
            projectCode={projectCode}
            projectName={projectName}
            state={data}
            onGoTo={(step) => setOpen(step)}
          />
        )}
        {open !== 'dau-vao' && nextStep && (
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
