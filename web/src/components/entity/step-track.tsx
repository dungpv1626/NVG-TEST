/**
 * Dải tiến trình của một hồ sơ — đang ở đâu, ai đang giữ, bước tiếp theo cần gì, sau đó là gì,
 * bước cuối là gì.
 *
 * Review UX (doc/MOC_CAI_TIEN_UX.md, vấn đề 4): người dùng không biết hồ sơ đang đến đâu và bước
 * kế tiếp là gì. Luồng lấy từ `shared/src/flow.ts` (một định nghĩa cho mọi module); điều kiện
 * của bước tiếp theo truyền vào từ `stage_readiness` của CSDL — cùng hàm với hàm chặn chuyển bước.
 *
 * Trạng thái luôn nói bằng CHỮ («đã xong», «đang ở đây», «đạt», «chưa đạt»), màu thanh chỉ là
 * phụ (CGD 6.8). Trên điện thoại chỉ còn một dòng tóm tắt + phần «Tiếp theo».
 */

import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { stepWindow, type Flow } from '@nvg/shared';
import { cn } from '@/lib/utils';

export interface StepRequirement {
  label: string;
  met: boolean;
}

export interface StepTrackProps<S extends string> {
  flow: Flow<S>;
  current: S;
  /** Điều kiện để sang bước TIẾP THEO (đọc từ `stage_readiness`). Rỗng = không có điều kiện riêng. */
  nextRequirements?: StepRequirement[];
  /** Tên người đang giữ hồ sơ, nếu biết — đứng trước câu mô tả việc của bước. */
  holder?: string | null;
}

export function StepTrack<S extends string>({
  flow,
  current,
  nextRequirements = [],
  holder,
}: StepTrackProps<S>): React.ReactElement {
  const w = stepWindow(flow, current);
  const step = flow.steps[current];
  const index = flow.main.indexOf(current);
  const position = w.isExit ? null : `Bước ${index + 1} trên ${flow.main.length}`;
  const nextStep = w.next ? flow.steps[w.next] : null;

  return (
    <section
      aria-label="Tiến trình hồ sơ"
      className="mb-4 rounded-md border border-border bg-surface p-3 lg:mb-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {w.isExit ? `Đã rẽ nhánh: ${step.label}` : `Đang ở: ${step.label}`}
        </p>
        {position && <span className="text-xs text-fg-subtle">{position}</span>}
      </div>

      {/* Đường chính — ẩn trên điện thoại, chỉ giữ phần chữ bên dưới. */}
      <ol aria-label="Các bước của hồ sơ" className="mt-3 hidden gap-2 sm:flex">
        {flow.main.map((stage) => {
          const state = w.done.includes(stage) ? 'done' : stage === current ? 'current' : 'todo';
          return (
            <li key={stage} className="min-w-0 flex-1">
              <span
                aria-hidden
                className={cn(
                  'block h-1 rounded-full',
                  state === 'done' && 'bg-brand',
                  state === 'current' && 'bg-brand-mint',
                  state === 'todo' && 'bg-border',
                )}
              />
              <span
                className={cn(
                  'mt-1.5 flex items-center gap-1 text-xs',
                  state === 'todo' ? 'text-fg-subtle' : 'text-fg',
                  state === 'current' && 'font-semibold',
                )}
              >
                {state === 'done' && <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />}
                {state === 'current' && <CircleDot className="size-3.5 shrink-0" aria-hidden />}
                {state === 'todo' && <Circle className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{flow.steps[stage].label}</span>
                <span className="sr-only">
                  {state === 'done' ? ' — đã xong' : state === 'current' ? ' — đang ở đây' : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-fg-subtle">Đang làm</dt>
          <dd>
            {holder && <span className="font-medium">{holder}: </span>}
            {step.owner}
          </dd>
        </div>

        {nextStep && w.next && (
          <div>
            <dt className="text-xs text-fg-subtle">Tiếp theo</dt>
            <dd>
              <span className="font-medium">{nextStep.label}</span>
              {nextStep.auto && <span className="text-fg-subtle"> — {nextStep.auto}</span>}
              {nextRequirements.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {nextRequirements.map((r) => (
                    <li key={r.label} className="flex items-start gap-1.5 text-xs">
                      <span
                        className={cn(
                          'shrink-0 font-medium',
                          r.met ? 'text-status-completed' : 'text-status-pending',
                        )}
                      >
                        {r.met ? 'Đạt' : 'Cần'}
                      </span>
                      <span className={cn(r.met && 'text-fg-subtle')}>{r.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        )}

        {w.after && (
          <div>
            <dt className="text-xs text-fg-subtle">Sau đó</dt>
            <dd>{flow.steps[w.after].label}</dd>
          </div>
        )}

        {!w.isExit && w.last !== current && (
          <div>
            <dt className="text-xs text-fg-subtle">Bước cuối</dt>
            <dd>{flow.steps[w.last].label}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
