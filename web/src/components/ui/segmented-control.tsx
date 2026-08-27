/**
 * Bộ chọn dạng phân đoạn (segmented control) — dùng cho bộ lọc có vài lựa chọn loại trừ lẫn
 * nhau, hiện đang dùng cho "Kỳ báo cáo" trên Dashboard.
 *
 * Số lượng lựa chọn KHÔNG cố định (bản demo "dashboard soft light style" chỉ có 3, nhưng
 * `DASHBOARD_PERIODS` của dự án có 4 — thành phần này render đúng số lựa chọn được truyền vào,
 * không hard-code).
 */

import { cn } from '@/lib/utils';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  getLabel,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  getLabel: (option: T) => string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex gap-1.5 rounded-md border border-border bg-surface p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold',
              'transition-colors duration-(--motion-fast) ease-(--ease-out)',
              active
                ? 'bg-brand-mint text-brand-mint-ink'
                : 'bg-transparent text-fg-subtle hover:text-fg',
            )}
          >
            {getLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
