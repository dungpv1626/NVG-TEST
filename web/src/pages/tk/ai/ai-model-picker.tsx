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

import { useEffect, useId, useMemo, useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ModelChooser } from './ai-model-cards';
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
}: {
  kind: 'text' | 'image';
  choice: AiChoice;
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
        />
      )}
    </div>
  );
}

const EFFORT_LABEL: Record<ReasoningEffort, string> = { low: 'Thấp', medium: 'Vừa', high: 'Cao' };

/**
 * Mức suy nghĩ cho LƯỢT NÀY (13/09/2026) — `Mặc định` là để model/tuyến tự quyết.
 *
 * Nghĩ nhiều thì chậm và tốn token hơn (token nghĩ tính tiền như token viết), nghĩ ít thì nhanh
 * mà danh sách phòng có thể kém chặt. Model không nhận tuỳ chọn này thì ô mờ đi và nói vì sao,
 * không ẩn (AFD 6.5).
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
  const id = useId();
  const noteId = useId();
  const supported = option?.supportsEffort !== false;
  return (
    <div className="min-w-40">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg-subtle">
        Mức suy nghĩ
      </label>
      <select
        id={id}
        aria-describedby={noteId}
        className="min-h-10 w-full rounded border border-border bg-surface px-2"
        value={supported ? (value ?? '') : ''}
        disabled={disabled || !supported}
        onChange={(e) => onChange((e.target.value || null) as ReasoningEffort | null)}
      >
        <option value="">Mặc định của model</option>
        {(Object.keys(EFFORT_LABEL) as ReasoningEffort[]).map((effort) => (
          <option key={effort} value={effort}>
            {EFFORT_LABEL[effort]}
          </option>
        ))}
      </select>
      <p id={noteId} className="mt-1 text-xs text-fg-subtle">
        {supported
          ? 'Nghĩ càng nhiều càng chậm và tốn token hơn.'
          : 'Model này chưa nhận tuỳ chọn mức suy nghĩ.'}
      </p>
    </div>
  );
}

export function effortLabel(effort: ReasoningEffort | null | undefined): string {
  return effort ? EFFORT_LABEL[effort] : 'mặc định';
}
