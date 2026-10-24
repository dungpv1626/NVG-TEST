/**
 * Khuôn biểu mẫu v2 (`NvgForm`, DESIGN_SYSTEM.md §8): các mục đánh số trong thẻ trắng, lưới 2
 * cột; cột phải (từ xl) là thẻ tối «Sau khi lưu» nói trước máy sẽ làm gì khi bấm lưu, cùng các
 * lưu ý. Dưới xl cột phải xuống cuối biểu mẫu.
 *
 * Chỉ là bố cục — không giữ trạng thái, không lưu gì. Biểu mẫu vẫn tự lo dữ liệu, kiểm lỗi và
 * hỏi khi rời trang chưa lưu (`useUnsavedChangesGuard`).
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FormLayout({
  children,
  afterSave,
  tips,
}: {
  children: ReactNode;
  /** Từng việc máy làm sau khi lưu, theo thứ tự — vd «Cơ hội vào bước Tiếp nhận». */
  afterSave?: string[];
  tips?: { title: string; items: string[] };
}) {
  const hasAside = (afterSave?.length ?? 0) > 0 || (tips?.items.length ?? 0) > 0;
  return (
    <div className={cn('grid gap-4', hasAside && 'xl:grid-cols-[minmax(0,1fr)_330px]')}>
      <div className="min-w-0 space-y-4">{children}</div>
      {hasAside && (
        <aside className="space-y-4 xl:sticky xl:top-2 xl:self-start" aria-label="Sau khi lưu">
          {afterSave && afterSave.length > 0 && (
            <section className="rounded-card-dark bg-shell-card p-5 text-fg-inverse">
              <h2 className="text-xs font-semibold text-shell-fg-subtle">Sau khi lưu</h2>
              <ol className="mt-3 space-y-2.5">
                {afterSave.map((item, i) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-shell-line text-xs font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-shell-fg">{item}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {tips && tips.items.length > 0 && (
            <section className="rounded-card bg-surface p-5">
              <h2 className="font-semibold">{tips.title}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-subtle">
                {tips.items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

/** Một mục của biểu mẫu: số thứ tự + tên mục + mô tả, nội dung là lưới 2 cột trên máy tính. */
export function FormSection({
  n,
  title,
  description,
  children,
  columns = 2,
}: {
  n: number;
  title: string;
  description?: string;
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <section className="rounded-card bg-surface p-5 lg:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-shell text-xs font-bold text-fg-inverse">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="text-md font-semibold">{title}</h2>
          {description && <p className="text-ink-subtle">{description}</p>}
        </div>
      </div>
      <div className={cn('grid gap-x-5 gap-y-4', columns === 2 && 'sm:grid-cols-2')}>
        {children}
      </div>
    </section>
  );
}
