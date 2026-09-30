/**
 * Thẻ chỉ số KPI trên Dashboard ("dashboard soft light style", xem DESIGN_SYSTEM.md).
 *
 * `min-h-40` đồng nhất cho mọi thẻ — bản demo dùng 172/158px cố định vì lưới của nó CỐ ĐỊNH
 * 6 thẻ; ở đây số lượng và loại thẻ biến động theo quyền xem từng module
 * (`useVisibleModules`/`useCan`), nên không có "hàng 1 luôn cao hơn hàng 2" để bám theo.
 * `CardGridSkeleton` (`components/ui/states.tsx`) dùng cùng `min-h-40` để không nhảy layout.
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function KpiCard({
  title,
  hint,
  icon: Icon,
  iconWellClassName = 'bg-surface-subtle text-fg-subtle',
  children,
  className,
}: {
  title: string;
  hint: string;
  icon: LucideIcon;
  /** Lớp Tailwind cho ô icon: nền + màu chữ (icon dùng `currentColor`). */
  iconWellClassName?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col gap-3 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-sm',
            iconWellClassName,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-md font-bold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-xs leading-snug text-fg-subtle">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Khối rỗng dạng viền đứt nét — đặt trong thân `KpiCard` khi không có dữ liệu. */
export function KpiEmptyBlock({ label }: { label: string }) {
  return (
    <p
      className={cn(
        'mt-auto rounded-md border border-dashed border-border-dashed bg-surface-empty',
        'p-3.5 text-center text-xs font-medium text-fg-subtle',
      )}
    >
      {label}
    </p>
  );
}

/**
 * Dot + pill cho breakdown trạng thái trên thẻ KPI.
 *
 * KHÔNG dùng lại `StatusLozenge` — đây là hệ màu KHÁC (chart-neutral/chart-positive), cố tình
 * lệch hex với status-draft/status-completed để không học nhầm hai hệ (xem index.css và
 * design-rules.test.ts "Ranh giới màu thương hiệu").
 */
export function PillBadge({
  tone,
  children,
}: {
  tone: 'neutral' | 'positive';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'positive'
          ? 'bg-brand-subtle text-brand-hover'
          : 'bg-surface-subtle text-fg-subtle',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          tone === 'positive' ? 'bg-chart-positive' : 'bg-chart-neutral',
        )}
      />
      {children}
    </span>
  );
}

/**
 * Kiểu chữ DUY NHẤT cho con số chính của một thẻ chỉ số — mọi thẻ Dashboard, ô chỉ số tài chính.
 *
 * Haan 30/09/2026, hai lần: `text-3xl font-extrabold` (30px) rồi `text-2xl` (24px) vẫn to; cần
 * «nổi bật nhưng cân đối». 20px đậm vừa: vẫn là chữ lớn nhất trong thẻ (tiêu đề thẻ 16px, nhãn
 * 12px) nhưng không lấn tiêu đề. Đổi ở đây là đổi cho mọi thẻ.
 */
export const KPI_VALUE_CLASS = 'text-xl font-semibold tracking-tight tabular-nums';
