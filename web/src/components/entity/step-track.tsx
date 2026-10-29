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
  /** Chỉ nhắc, không phải điều kiện chặn (vd tồn tại chưa khắc phục — 0241): nhãn «Nhắc» thay «Cần». */
  reminder?: boolean;
}

export interface StepTrackProps<S extends string> {
  flow: Flow<S>;
  current: S;
  /** Điều kiện để sang bước TIẾP THEO (đọc từ `stage_readiness`). Rỗng = không có điều kiện riêng. */
  nextRequirements?: StepRequirement[];
  /** Tên người đang giữ hồ sơ, nếu biết — đứng trước câu mô tả việc của bước. */
  holder?: string | null;
  /** Việc cụ thể của bước đang ở (danh sách việc kèm nút làm ngay) — hiện cuối thẻ «Bước tiếp theo». */
  extra?: React.ReactNode;
}

export function StepTrack<S extends string>({
  flow,
  current,
  nextRequirements = [],
  holder,
  extra,
}: StepTrackProps<S>): React.ReactElement {
  const w = stepWindow(flow, current);
  const step = flow.steps[current];
  const index = flow.main.indexOf(current);
  const position = w.isExit ? null : `Bước ${index + 1} trên ${flow.main.length}`;
  const nextStep = w.next ? flow.steps[w.next] : null;

  const nextCard = (
    // Thẻ tối «Bước tiếp theo» (v2) — sang cột phải của trang chi tiết khi màn hình đủ rộng (2xl).
    // Hẹp hơn thì nằm ở đầu cột chính, dạng GỌN: tên bước một dòng, «Đang làm / Sau đó / Bước cuối»
    // xếp ngang — dạng dọc 330px ở đó chiếm nửa màn hình trên laptop (anh Dũng 28/10/2026).
    <section
      aria-label="Bước tiếp theo"
      className="mb-4 rounded-card-dark bg-shell-card p-4 text-fg-inverse lg:mb-5 2xl:mb-0 2xl:p-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 2xl:block">
        <p className="text-xs font-semibold text-shell-fg-subtle">
          {nextStep ? 'Bước tiếp theo' : w.isExit ? 'Đã rẽ nhánh' : 'Bước cuối'}
        </p>
        <h2 className="text-md font-semibold 2xl:mt-1">
          {nextStep && w.next ? nextStep.label : step.label}
        </h2>
        {nextStep?.auto && <p className="text-shell-fg 2xl:mt-0.5">{nextStep.auto}</p>}
      </div>

      <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-[2fr_1fr_1fr] 2xl:mt-3 2xl:block 2xl:space-y-2">
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
                  r.met
                    ? 'bg-pill text-shell'
                    : r.reminder
                      ? 'bg-status-pending-bg text-status-pending'
                      : 'bg-brand-accent text-ink',
                )}
              >
                {r.met ? 'Đạt' : r.reminder ? 'Nhắc' : 'Cần'}
              </span>
              <span className={cn(r.met && 'text-ink-subtle')}>
                {r.label}
                {!r.met && r.action && <> {r.action}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {extra}
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
          // Thiếu chỗ thì xuống hàng thứ hai (thẻ bo 22 thay cho viên) — không cắt chữ, không bẻ tên bước.
          className="hidden flex-wrap gap-1 rounded-card-dark bg-surface p-1 sm:flex"
        >
          {flow.main.map((stage) => {
            const state = w.done.includes(stage) ? 'done' : stage === current ? 'current' : 'todo';
            return (
              <li
                key={stage}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  // Mỗi viên rộng theo chữ, một dòng (anh Dũng 25/10/2026: cột trái hẹp từng ra «Tiếp n…»,
                  // «Xác m…»); hàng giãn đều cho kín bề ngang.
                  'flex h-9 flex-auto items-center justify-center gap-1.5 rounded-full px-3',
                  'whitespace-nowrap',
                  state === 'done' && 'bg-pill text-ink',
                  state === 'current' && 'bg-shell font-semibold text-fg-inverse',
                  state === 'todo' && 'text-ink-subtle',
                )}
              >
                {state === 'done' && <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />}
                {state === 'current' && <CircleDot className="size-3.5 shrink-0" aria-hidden />}
                {state === 'todo' && <Circle className="size-3.5 shrink-0" aria-hidden />}
                <span>{flow.steps[stage].label}</span>
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
