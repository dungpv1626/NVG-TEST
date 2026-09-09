/**
 * Ô chọn «Cách lập» cho nhánh AI (T10): Bộ giải nội bộ hay AI, và AI thì model nào.
 *
 * Dùng chung cho ba chỗ: Chương trình không gian, Phương án, Bộ ảnh. Danh mục lấy từ
 * `GET /design/ai/models` — nhãn và tên tuyến là DỮ LIỆU trong `config/models.yaml`, màn hình
 * không biết tên mô hình nào. Tuyến chưa bấm được (thiếu khoá, đang tắt) vẫn hiện nhưng MỜ kèm
 * lý do, để người dùng biết tính năng có tồn tại và vì sao chưa dùng được (AFD 6.5).
 *
 * Lựa chọn nhớ ở `localStorage` theo loại (`tk.ai.text_route`, `tk.ai.image_route`); mặc định
 * lấy từ máy chủ (`design_setting`). `localStorage` có thể ném (trình duyệt chặn) — bọc try.
 */

import { useEffect, useId, useState } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useAiModels, type AiModelOption } from '@/hooks/use-ai-design';

export type AiMode = 'solver' | 'ai';

export interface AiChoice {
  mode: AiMode;
  /** Tên tuyến khi `mode === 'ai'`; rỗng khi chưa có tuyến nào bấm được. */
  route: string | null;
}

const MODE_LABEL: Record<AiMode, string> = { solver: 'Bộ giải nội bộ', ai: 'AI' };
const MODES: readonly AiMode[] = ['solver', 'ai'];

function storageKey(kind: 'text' | 'image'): string {
  return `tk.ai.${kind}_route`;
}

function readStored(kind: 'text' | 'image'): string | null {
  try {
    return window.localStorage.getItem(storageKey(kind));
  } catch {
    return null;
  }
}

function writeStored(kind: 'text' | 'image', route: string | null): void {
  try {
    if (route) window.localStorage.setItem(storageKey(kind), route);
    else window.localStorage.removeItem(storageKey(kind));
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ mất tiện nghi nhớ lựa chọn, không mất tính năng.
  }
}

/**
 * Giữ lựa chọn của người dùng và tự chọn tuyến hợp lệ khi danh mục về.
 *
 * Tách thành hook để màn hình gọi được `choice` ngoài component (nút chính đổi chữ theo nó).
 */
export function useAiChoice(kind: 'text' | 'image', allowSolver = true) {
  const models = useAiModels();
  const options: AiModelOption[] = models.data?.[kind] ?? [];
  const [choice, setChoice] = useState<AiChoice>({
    mode: allowSolver ? 'solver' : 'ai',
    route: null,
  });

  useEffect(() => {
    if (!models.data) return;
    const usable = options.filter((o) => o.enabled);
    const stored = readStored(kind);
    const preferred =
      usable.find((o) => o.route === stored)?.route ??
      usable.find((o) => o.route === models.data?.defaults[kind])?.route ??
      usable[0]?.route ??
      null;
    setChoice((prev) => (prev.route === preferred ? prev : { ...prev, route: preferred }));
  }, [models.data, kind, options]);

  const pickMode = (mode: AiMode) => setChoice((prev) => ({ ...prev, mode }));
  const pickRoute = (route: string) => {
    writeStored(kind, route);
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
  const selectId = useId();
  const noteId = useId();
  const usable = options.filter((o) => o.enabled);
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
        <div className="min-w-56">
          <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-fg-subtle">
            Model
          </label>
          <select
            id={selectId}
            aria-describedby={noteId}
            className="min-h-10 w-full rounded border border-border bg-surface px-2"
            value={choice.route ?? ''}
            disabled={disabled || usable.length === 0}
            onChange={(e) => onRoute(e.target.value)}
          >
            {usable.length === 0 && <option value="">Chưa có model nào dùng được</option>}
            {options.map((o) => (
              <option key={o.route} value={o.route} disabled={!o.enabled}>
                {o.enabled ? o.label : `${o.label} — ${o.unavailableReason ?? 'chưa dùng được'}`}
              </option>
            ))}
          </select>
          <p id={noteId} className="mt-1 text-xs text-fg-subtle">
            {kind === 'text'
              ? 'Dữ liệu gửi đi đã lược tên, số điện thoại, địa chỉ, mã hồ sơ và ngân sách.'
              : 'Ảnh gửi đi không mang khung tên hay mã hồ sơ.'}
          </p>
        </div>
      )}
    </div>
  );
}
