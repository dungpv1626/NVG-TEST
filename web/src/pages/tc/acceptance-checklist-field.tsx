/**
 * Chấm từng mục của danh mục kiểm tra khi nghiệm thu — TC-13.
 *
 * Ba nút lớn mỗi mục, bấm được bằng ngón tay cái ở công trường. Trạng thái luôn có CHỮ, không
 * chỉ màu (CLAUDE.md 5.4). Mục bắt buộc ảnh có nút chụp ngay tại dòng — nghiệm thu mà không có
 * ảnh là thứ chủ đầu tư và tổ đội cãi nhau nhiều nhất.
 */

import { cn } from '@/lib/utils';
import {
  CHECKLIST_RESULT_LABELS,
  type ChecklistItem,
  type ChecklistResult,
} from '@/hooks/use-acceptance-checklists';
import { SitePhotoPicker } from './site-photo-picker';

export interface ItemAnswer {
  result: ChecklistResult | null;
  note: string;
  files: File[];
}

export type ChecklistAnswers = Record<string, ItemAnswer>;

const RESULT_STYLE: Record<ChecklistResult, string> = {
  dat: 'border-status-completed bg-status-completed-bg text-status-completed',
  khong_dat: 'border-status-overdue bg-status-overdue-bg text-status-overdue',
  khong_ap_dung: 'border-border-strong bg-surface-hover text-fg',
};

export const EMPTY_ANSWER: ItemAnswer = { result: null, note: '', files: [] };

/** Mục nào còn thiếu kết quả hoặc thiếu ảnh bắt buộc — để báo trước khi gửi. */
export function missingAnswers(items: ChecklistItem[], answers: ChecklistAnswers): string[] {
  return items
    .filter((item) => {
      const a = answers[item.key] ?? EMPTY_ANSWER;
      if (!a.result) return true;
      return item.requires_photo && a.result !== 'khong_ap_dung' && a.files.length === 0;
    })
    .map((item) => item.label);
}

export function AcceptanceChecklistField({
  items,
  answers,
  onChange,
  disabled = false,
}: {
  items: ChecklistItem[];
  answers: ChecklistAnswers;
  onChange: (answers: ChecklistAnswers) => void;
  disabled?: boolean;
}) {
  function update(key: string, patch: Partial<ItemAnswer>) {
    onChange({ ...answers, [key]: { ...(answers[key] ?? EMPTY_ANSWER), ...patch } });
  }

  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const answer = answers[item.key] ?? EMPTY_ANSWER;
        return (
          <li key={item.key} className="rounded-md border border-border p-3">
            <p className="font-medium">
              {index + 1}. {item.label}
              {item.requires_photo && (
                <span className="ms-2 text-xs font-normal text-fg-subtle">Cần ảnh</span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={item.label}>
              {(Object.keys(CHECKLIST_RESULT_LABELS) as ChecklistResult[]).map((result) => (
                <button
                  key={result}
                  type="button"
                  role="radio"
                  aria-checked={answer.result === result}
                  disabled={disabled}
                  onClick={() => update(item.key, { result })}
                  className={cn(
                    'min-h-10 rounded-md border px-3 text-sm font-medium',
                    answer.result === result
                      ? RESULT_STYLE[result]
                      : 'border-border bg-surface text-fg-subtle hover:bg-surface-hover',
                  )}
                >
                  {CHECKLIST_RESULT_LABELS[result]}
                </button>
              ))}
            </div>
            {answer.result === 'khong_dat' && (
              <input
                value={answer.note}
                disabled={disabled}
                onChange={(e) => update(item.key, { note: e.target.value })}
                placeholder="Không đạt ở đâu, cần khắc phục gì"
                aria-label={`Ghi chú — ${item.label}`}
                className="mt-2 h-10 w-full rounded-sm border border-border bg-surface px-3"
              />
            )}
            {answer.result !== 'khong_ap_dung' &&
              (item.requires_photo || answer.files.length > 0) && (
                <div className="mt-2">
                  <SitePhotoPicker
                    files={answer.files}
                    onChange={(files) => update(item.key, { files })}
                    disabled={disabled}
                  />
                </div>
              )}
          </li>
        );
      })}
    </ol>
  );
}
