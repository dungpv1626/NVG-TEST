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
import { DetailAside } from './detail-aside';

export interface StepRequirement {
  label: string;
  met: boolean;
  /** Lối tới đúng chỗ làm việc này (mở tab, mở ô nhập) — hiện cạnh điều kiện CHƯA đạt. */
  action?: React.ReactNode;
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

  const nextCard = (
    // Thẻ tối «Bước tiếp theo» (v2) — sang cột phải của trang chi tiết khi màn hình đủ rộng.
    <section
      aria-label="Bước tiếp theo"
      className="mb-4 rounded-card-dark bg-shell-card p-5 text-fg-inverse lg:mb-5 xl:mb-0"
    >
      <p className="text-xs font-semibold text-shell-fg-subtle">
        {nextStep ? 'Bước tiếp theo' : w.isExit ? 'Đã rẽ nhánh' : 'Bước cuối'}
      </p>
      <h2 className="mt-1 text-md font-semibold">
        {nextStep && w.next ? nextStep.label : step.label}
      </h2>
      {nextStep?.auto && <p className="mt-0.5 text-shell-fg">{nextStep.auto}</p>}

      <dl className="mt-3 space-y-2">
        <div>
          <dt className="text-xs text-shell-fg-subtle">Đang làm</dt>
          <dd className="text-shell-fg">
            {holder && <span className="font-semibold text-fg-inverse">{holder}: </span>}
            {step.owner}
          </dd>
        </div>
        {w.after && (
          <div>
            <dt className="text-xs text-shell-fg-subtle">Sau đó</dt>
            <dd className="text-shell-fg">{flow.steps[w.after].label}</dd>
          </div>
        )}
        {!w.isExit && w.last !== current && (
          <div>
            <dt className="text-xs text-shell-fg-subtle">Bước cuối</dt>
            <dd className="text-shell-fg">{flow.steps[w.last].label}</dd>
          </div>
        )}
      </dl>

      {/* Điều kiện để qua bước — trên nền sáng bên trong thẻ tối, để nút «làm ngay» của từng điều
          kiện giữ đúng kiểu của nó. */}
      {nextStep && nextRequirements.length > 0 && (
        <ul className="mt-3 space-y-1.5 rounded-field bg-surface p-3 text-ink">
          {nextRequirements.map((r) => (
            <li key={r.label} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 font-semibold',
                  r.met ? 'bg-pill text-shell' : 'bg-brand-accent text-ink',
                )}
              >
                {r.met ? 'Đạt' : 'Cần'}
              </span>
              <span className={cn(r.met && 'text-ink-subtle')}>
                {r.label}
                {!r.met && r.action && <> {r.action}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <section aria-label="Tiến trình hồ sơ" className="mb-4 lg:mb-5">
        {/* Điện thoại: một dòng tóm tắt thay cho dải bước. */}
        <p className="font-semibold sm:hidden">
          {w.isExit ? `Đã rẽ nhánh: ${step.label}` : `Đang ở: ${step.label}`}
          {position && <span className="font-normal text-ink-subtle"> · {position}</span>}
        </p>

        {/* Thanh bước dạng viên (v2): xong = viên nhạt có dấu tích, đang ở = viên rừng, chưa tới = chữ. */}
        <ol
          aria-label="Các bước của hồ sơ"
          className="hidden gap-1 overflow-x-auto rounded-full bg-surface p-1 sm:flex"
        >
          {flow.main.map((stage) => {
            const state = w.done.includes(stage) ? 'done' : stage === current ? 'current' : 'todo';
            return (
              <li
                key={stage}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-3',
                  state === 'done' && 'bg-pill text-ink',
                  state === 'current' && 'bg-shell font-semibold text-fg-inverse',
                  state === 'todo' && 'text-ink-subtle',
                )}
              >
                {state === 'done' && <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />}
                {state === 'current' && <CircleDot className="size-3.5 shrink-0" aria-hidden />}
                {state === 'todo' && <Circle className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{flow.steps[stage].label}</span>
                <span className="sr-only">
                  {state === 'done' ? ' — đã xong' : state === 'current' ? ' — đang ở đây' : ''}
                </span>
              </li>
            );
          })}
        </ol>
        {w.isExit && (
          <p className="mt-2 hidden font-semibold sm:block">Đã rẽ nhánh: {step.label}</p>
        )}
      </section>

      <DetailAside place="next">{nextCard}</DetailAside>
    </>
  );
}
