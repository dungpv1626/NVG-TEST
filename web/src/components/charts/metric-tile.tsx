/**
 * Ô chỉ số tài chính: số CỠ VỪA (Haan 30/09/2026 — số to «không đẹp»), số đầy đủ ngay dưới, so
 * với kỳ trước và đường xu hướng nhỏ.
 *
 * So kỳ trước tô bằng MỰC TRUNG TÍNH: tăng / giảm tốt hay xấu tuỳ chỉ số (chi tiền tăng là xấu,
 * doanh thu tăng là tốt), và màu xanh / đỏ lại là màu trạng thái — không dùng cho việc khác.
 */

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '@nvg/shared';
import { formatMoneyCompact } from '@nvg/shared/bc-series';
import { KPI_VALUE_CLASS } from '@/components/ui/kpi-card';
import { Sparkline } from './sparkline';

export function formatChange(change: number | null): string {
  if (change === null) return 'Chưa có kỳ trước để so sánh';
  const rounded = Math.round(change * 10) / 10;
  if (rounded === 0) return 'Không đổi so với kỳ trước';
  const text = Math.abs(rounded).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  return `${rounded > 0 ? 'Tăng' : 'Giảm'} ${text}% so với kỳ trước`;
}

export function MetricTile({
  title,
  value,
  hasData,
  change,
  trend,
}: {
  title: string;
  value: bigint;
  /** Kỳ đang xem có phát sinh không — không có thì nói «Chưa có phát sinh», không hiện «0». */
  hasData: boolean;
  change: number | null;
  trend: readonly number[];
}) {
  const Arrow =
    change === null || Math.round(change * 10) === 0
      ? ArrowRight
      : change > 0
        ? ArrowUpRight
        : ArrowDownRight;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-fg-subtle">{title}</p>
      {hasData ? (
        <>
          <div className="flex items-end justify-between gap-2">
            <span className={KPI_VALUE_CLASS} title={formatCurrency(value)}>
              {formatMoneyCompact(value)}
            </span>
            <Sparkline values={trend} />
          </div>
          <p className="text-xs tabular-nums text-fg-subtle">{formatCurrency(value)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-fg">
            <Arrow className="size-3.5 shrink-0" aria-hidden />
            {formatChange(change)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-fg-subtle">Chưa có phát sinh trong kỳ này.</p>
      )}
    </div>
  );
}
