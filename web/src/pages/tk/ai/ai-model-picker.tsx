/**
 * Ô chọn «Cách lập» cho nhánh AI (T10): Bộ giải nội bộ hay AI, và AI thì model nào.
 *
 * Dùng chung cho các bước của AI Design: Mặt bằng, Bộ ảnh. Danh mục lấy từ
 * `GET /design/ai/models` — nhãn và tên tuyến là DỮ LIỆU trong `config/models.yaml`, màn hình
 * không biết tên mô hình nào. Tuyến chưa bấm được (thiếu khoá, đang tắt) vẫn hiện nhưng MỜ kèm
 * lý do, để người dùng biết tính năng có tồn tại và vì sao chưa dùng được (AFD 6.5).
 *
 * Lựa chọn nhớ ở `localStorage` theo loại (`tk.ai.text_route`, `tk.ai.image_route`); mặc định
 * lấy từ máy chủ (`design_setting`). `localStorage` có thể ném (trình duyệt chặn) — bọc try.
 */

import { cn } from '@/lib/utils';
import { Brain, CheckCircle2, ChevronDown } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ModelChooser, usePopoverDismiss } from './ai-model-cards';
import { useAiModels, type AiModelOption, type ReasoningEffort } from '@/hooks/use-ai-design';

export type AiMode = 'solver' | 'ai';

export interface AiChoice {
  mode: AiMode;
  /** Tên tuyến khi `mode === 'ai'`; rỗng khi chưa có tuyến nào bấm được. */
  route: string | null;
}

const MODE_LABEL: Record<AiMode, string> = { solver: 'Bộ giải nội bộ', ai: 'AI' };
const MODES: readonly AiMode[] = ['solver', 'ai'];

function storageKey(kind: 'text' | 'image', scope?: string): string {
  return scope ? `tk.ai.${kind}_route.${scope}` : `tk.ai.${kind}_route`;
}

function readStored(kind: 'text' | 'image', scope?: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(kind, scope));
  } catch {
    return null;
  }
}

function writeStored(kind: 'text' | 'image', route: string | null, scope?: string): void {
  try {
    if (route) window.localStorage.setItem(storageKey(kind, scope), route);
    else window.localStorage.removeItem(storageKey(kind, scope));
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ mất tiện nghi nhớ lựa chọn, không mất tính năng.
  }
}

/**
 * Giữ lựa chọn của người dùng và tự chọn tuyến hợp lệ khi danh mục về.
 *
 * Tách thành hook để màn hình gọi được `choice` ngoài component (nút chính đổi chữ theo nó).
 */
/**
 * Tuyến nào dùng được cho một bước gửi dữ liệu hạng `dataClass`.
 *
 * Tuyến gói miễn phí chỉ nhận hạng 3 (bản tóm tắt đã ẩn danh). Bước gửi đầu bài hạng 2 mà vẫn
 * cho chọn nó thì lỗi chỉ lộ ra SAU khi bấm — đúng thứ AFD 6.5 cấm: hiện ra rồi mới báo lỗi.
 */
export function optionsForDataClass(options: AiModelOption[], dataClass: number): AiModelOption[] {
  return options.map((o) =>
    o.enabled && dataClass < o.maxDataClass
      ? {
          ...o,
          enabled: false,
          unavailableReason: 'gói miễn phí chỉ nhận dữ liệu đã ẩn danh, bước này gửi đầu bài',
        }
      : o,
  );
}

export function useAiChoice(
  kind: 'text' | 'image',
  allowSolver = true,
  dataClass = 2,
  /**
   * Nhớ lựa chọn RIÊNG cho một chỗ (khoá `tk.ai.text_route.<scope>`), và khi chưa chọn lần nào
   * thì ưu tiên model gói miễn phí. Dùng cho bước rẻ, hỏi nhiều lần — để lựa chọn model đắt ở
   * bước xếp mặt bằng không tự lan sang đây.
   *
   * ⚠️ Từ 20/09/2026 KHÔNG còn tuyến nào trong ô chọn chạy khoá miễn phí (`ai_text_gemini_free`
   * đã gỡ), nên nhánh «ưu tiên miễn phí» hiện không bao giờ khớp và lựa chọn rơi về mặc định của
   * tenant. Giữ lại vì nó là quy tắc chung theo `billed`, không phải theo tên một tuyến.
   */
  scope?: string,
) {
  const models = useAiModels();
  const catalogue = models.data?.[kind];
  const options: AiModelOption[] = useMemo(
    () => optionsForDataClass(catalogue ?? [], dataClass),
    [catalogue, dataClass],
  );
  const [choice, setChoice] = useState<AiChoice>({
    mode: allowSolver ? 'solver' : 'ai',
    route: null,
  });

  useEffect(() => {
    if (!models.data) return;
    const usable = options.filter((o) => o.enabled);
    const stored = readStored(kind, scope);
    const preferred =
      usable.find((o) => o.route === stored)?.route ??
      (scope ? usable.find((o) => o.billed === false)?.route : undefined) ??
      usable.find((o) => o.route === models.data?.defaults[kind])?.route ??
      usable[0]?.route ??
      null;
    setChoice((prev) => (prev.route === preferred ? prev : { ...prev, route: preferred }));
  }, [models.data, kind, options, scope]);

  const pickMode = (mode: AiMode) => setChoice((prev) => ({ ...prev, mode }));
  const pickRoute = (route: string) => {
    writeStored(kind, route, scope);
    setChoice((prev) => ({ ...prev, route }));
  };
  const selected = options.find((o) => o.route === choice.route) ?? null;
  return {
    choice,
    pickMode,
    pickRoute,
    options,
    selected,
    /** Tuyến mặc định của công ty — gợi ý trên ô chọn (`ModelChooser.recommended`). */
    defaultRoute: models.data?.defaults[kind] ?? null,
    loading: models.isLoading,
    error: models.error,
  };
}

export function AiModePicker({
  kind,
  choice,
  options,
  onMode,
  onRoute,
  allowSolver = true,
  disabled = false,
  recommended = null,
}: {
  kind: 'text' | 'image';
  choice: AiChoice;
  /** Tuyến mặc định của công ty — thẻ ấy mang nhãn gợi ý. */
  recommended?: string | null;
  options: AiModelOption[];
  onMode: (mode: AiMode) => void;
  onRoute: (route: string) => void;
  /** Bộ ảnh không có nhánh bộ giải — chỉ hiện ô chọn model. */
  allowSolver?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const showModel = !allowSolver || choice.mode === 'ai';

  return (
    <div className="flex flex-wrap items-end gap-3">
      {allowSolver && (
        <div>
          <p className="mb-1 text-xs font-medium text-fg-subtle">Cách lập</p>
          <SegmentedControl
            options={MODES}
            value={choice.mode}
            onChange={onMode}
            getLabel={(m) => MODE_LABEL[m]}
          />
        </div>
      )}
      {showModel && (
        <ModelChooser
          kind={kind}
          options={options}
          value={choice.route}
          onChange={onRoute}
          disabled={disabled}
          recommended={recommended}
        />
      )}
    </div>
  );
}

const EFFORT_LABEL: Record<ReasoningEffort, string> = { low: 'Thấp', medium: 'Vừa', high: 'Cao' };

/** Thẻ trong bảng nổi: nhãn ngắn bên phải và một câu nói đánh đổi — không có số đo, chỉ chiều. */
const EFFORT_CARDS: ReadonlyArray<{
  value: ReasoningEffort | null;
  label: string;
  tag: string;
  blurb: string;
}> = [
  {
    value: null,
    label: 'Mặc định',
    tag: 'Theo model',
    blurb: 'Để model tự quyết mức nghĩ. Hợp với đa số lượt chạy.',
  },
  {
    value: 'low',
    label: EFFORT_LABEL.low,
    tag: 'Nhanh, rẻ hơn',
    blurb: 'Nghĩ ít, trả kết quả nhanh. Danh sách phòng có thể kém chặt hơn.',
  },
  {
    value: 'medium',
    label: EFFORT_LABEL.medium,
    tag: 'Cân bằng',
    blurb: 'Cân bằng giữa thời gian chờ, chi phí và độ chặt của phương án.',
  },
  {
    value: 'high',
    label: EFFORT_LABEL.high,
    tag: 'Kỹ hơn',
    blurb: 'Nghĩ kỹ hơn, chậm và tốn token hơn — token nghĩ tính tiền như token viết.',
  },
];

/**
 * Mức suy nghĩ cho LƯỢT NÀY (13/09/2026) — `Mặc định` là để model/tuyến tự quyết.
 *
 * Nghĩ nhiều thì chậm và tốn token hơn (token nghĩ tính tiền như token viết), nghĩ ít thì nhanh
 * mà danh sách phòng có thể kém chặt. Model không nhận tuỳ chọn này thì ô mờ đi và nói vì sao,
 * không ẩn (AFD 6.5).
 *
 * 09/10/2026 (Haan, theo mẫu ô chọn model): nút dạng viên mở BẢNG NỔI gồm tiêu đề và thẻ từng mức
 * kèm nhãn và câu đánh đổi — thay `<select>` gốc, vốn mở danh sách trần của hệ điều hành.
 */
export function ReasoningEffortPicker({
  value,
  onChange,
  option,
  disabled = false,
}: {
  value: ReasoningEffort | null;
  onChange: (value: ReasoningEffort | null) => void;
  /** Model đang chọn — để biết có nhận mức suy nghĩ không. */
  option: AiModelOption | null;
  disabled?: boolean;
}): React.ReactElement {
  const labelId = useId();
  const noteId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const supported = option?.supportsEffort !== false;
  const current = supported ? value : null;
  const currentLabel = current ? EFFORT_LABEL[current] : 'Mặc định';
  const blocked = disabled || !supported;
  const popRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  usePopoverDismiss(rootRef, open, () => setOpen(false));
  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);
  // Bảng neo mép trái của nút như ô chọn model. Trên điện thoại ô này đứng giữa hàng nên bảng
  // tràn ra mép phải — đo rồi kéo vào cho cách lề 16px, không để trang cuộn ngang.
  useLayoutEffect(() => {
    if (!open) return setShift(0);
    const rect = popRef.current?.getBoundingClientRect();
    if (!rect) return;
    const over = rect.right - (document.documentElement.clientWidth - 16);
    setShift(over > 0 ? -Math.min(over, rect.left - 16) : 0);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="mb-1 text-xs font-medium text-fg-subtle">
        Mức suy nghĩ
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Đổi mức suy nghĩ — đang chọn ${currentLabel}`}
        aria-describedby={supported ? undefined : noteId}
        disabled={blocked}
        className={cn(
          'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left sm:min-h-9',
          'transition-colors duration-(--motion-fast) ease-(--ease-out)',
          open ? 'border-tk-pu-solid bg-tk-pu-bg' : 'border-tk-line2 bg-tk-card hover:bg-tk-hover',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <span className="font-semibold">{currentLabel}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-tk-t2 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Chọn mức suy nghĩ"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          className="absolute top-full left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-tk-line2 bg-tk-panel p-3 shadow-tk-card"
        >
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-tk-t2">
            <Brain className="size-4 text-tk-pu-fg" aria-hidden />
            Chọn mức suy nghĩ cho lượt này
          </p>
          <div className="space-y-1.5" role="radiogroup" aria-label="Mức suy nghĩ">
            {EFFORT_CARDS.map((card) => {
              const checked = card.value === current;
              return (
                <button
                  key={card.label}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => {
                    onChange(card.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'block w-full cursor-pointer rounded-md border p-3 text-left',
                    'transition-[translate,border-color,box-shadow] duration-(--motion-fast) ease-(--ease-out)',
                    'hover:border-tk-pu-solid hover:shadow-sm motion-safe:hover:-translate-y-px',
                    checked ? 'border-tk-pu-solid bg-tk-pu-bg' : 'border-tk-line bg-tk-card',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                      <span className="truncate">{card.label}</span>
                      {checked && (
                        <CheckCircle2 className="size-4 shrink-0 text-tk-pu-fg" aria-hidden />
                      )}
                    </span>
                    <span className="shrink-0 rounded-sm bg-tk-pu-tile px-2 py-0.5 text-xs font-medium text-tk-pu-fg">
                      {card.tag}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-tk-t2">{card.blurb}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!supported && (
        <p id={noteId} className="mt-1 text-xs text-fg-subtle">
          Model này chưa nhận tuỳ chọn mức suy nghĩ.
        </p>
      )}
    </div>
  );
}

export function effortLabel(effort: ReasoningEffort | null | undefined): string {
  return effort ? EFFORT_LABEL[effort] : 'mặc định';
}
