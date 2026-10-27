/**
 * «Tóm tắt đầu bài» — bản xem trước sống của đầu bài (anh Dũng 25/10/2026: luôn có phần xem trước để người dùng nắm
 * được thay vì mơ hồ; đầu bài 98 câu đọc thành một danh sách dài khó nắm).
 *
 * Chỉ nêu THÔNG TIN CHÍNH: các câu nặng điểm (`weight` ≥ `KEY_WEIGHT` trong cấu hình biểu mẫu hiệu lực) — chính là thứ
 * thiếu thì không dựng nổi mặt bằng. Không chọn tay danh sách trường ở đây: thêm / đổi trọng số ở `brief-form.json`
 * (hoặc lớp phủ của quản trị viên) thì tóm tắt đổi theo. Giá trị đọc qua `describeField` — cùng hàm với màn hình xem
 * và bản in, để ba nơi không nói ba cách.
 */

import { CheckCircle2, CircleDashed } from 'lucide-react';
import {
  valueAtPath,
  visibleFields,
  type BriefFormConfig,
  type DesignBriefDraft,
} from '@nvg/shared/design';
import { cn } from '@/lib/utils';
import { describeField } from './brief-describe';

/** Trọng số từ mức này trở lên là «thông tin chính». */
export const KEY_WEIGHT = 2;

export interface KeyFact {
  path: string;
  sectionId: string;
  sectionTitle: string;
  label: string;
  value: string | null;
}

export function briefKeyFacts(form: BriefFormConfig, draft: DesignBriefDraft): KeyFact[] {
  return visibleFields(form, draft)
    .filter(({ field }) => field.weight >= KEY_WEIGHT && !field.path.startsWith('legacy.'))
    .map(({ field, section }) => ({
      path: field.path,
      sectionId: section.id,
      sectionTitle: section.title,
      label: field.label,
      value: describeField(field, valueAtPath(draft, field.path), draft.family),
    }));
}

export function BriefSummary({
  form,
  draft,
  onJump,
  className,
}: {
  form: BriefFormConfig;
  draft: DesignBriefDraft;
  /** Bấm một dòng → tới câu hỏi ấy. Vắng thì dòng không bấm được. */
  onJump?: (sectionId: string, path: string) => void;
  className?: string;
}) {
  const facts = briefKeyFacts(form, draft);
  const done = facts.filter((f) => f.value !== null).length;
  const groups = new Map<string, KeyFact[]>();
  for (const f of facts) groups.set(f.sectionTitle, [...(groups.get(f.sectionTitle) ?? []), f]);

  return (
    <section aria-label="Tóm tắt đầu bài" className={cn('rounded-card bg-surface p-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Tóm tắt đầu bài</h3>
        <span className="text-xs text-fg-subtle">
          Thông tin chính: {done}/{facts.length}
        </span>
      </div>
      {facts.length === 0 ? (
        <p className="mt-2 text-fg-subtle">Chưa chọn loại hình công trình.</p>
      ) : (
        <div className="mt-2 space-y-3">
          {[...groups].map(([title, list]) => (
            <div key={title}>
              <p className="text-xs font-medium text-fg-subtle">{title}</p>
              <ul className="mt-1 space-y-1">
                {list.map((f) => {
                  const body = (
                    <>
                      {f.value !== null ? (
                        <CheckCircle2
                          className="mt-0.5 size-4 shrink-0 text-status-completed"
                          aria-hidden
                        />
                      ) : (
                        <CircleDashed
                          className="mt-0.5 size-4 shrink-0 text-status-pending"
                          aria-hidden
                        />
                      )}
                      <span className="min-w-0">
                        <span className="text-fg-subtle">{f.label}: </span>
                        {f.value !== null ? (
                          <span className="whitespace-pre-wrap">{f.value}</span>
                        ) : (
                          <span className="text-status-pending">chưa trả lời</span>
                        )}
                      </span>
                    </>
                  );
                  return (
                    <li key={f.path}>
                      {onJump ? (
                        <button
                          type="button"
                          onClick={() => onJump(f.sectionId, f.path)}
                          className="flex w-full items-start gap-1.5 rounded-sm text-left text-sm hover:bg-surface-hover"
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="flex items-start gap-1.5 text-sm">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
