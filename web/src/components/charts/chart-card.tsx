/**
 * Khung chung của một biểu đồ: tiêu đề, giải thích ngắn, nút chọn Tháng / Quý / Năm, trạng thái
 * đang tải (khối xám đúng chiều cao) và rỗng («Chưa đủ dữ liệu» — không vẽ trục trống với cột 0).
 */

import type { ReactNode } from 'react';
import { EMPTY_STATES } from '@nvg/shared';
import { SERIES_BUCKETS, SERIES_BUCKET_LABELS, type SeriesBucket } from '@nvg/shared/bc-series';
import { KpiEmptyBlock } from '@/components/ui/kpi-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/utils';

export function ChartCard({
  title,
  hint,
  bucket,
  onBucketChange,
  isLoading = false,
  isEmpty = false,
  emptyLabel = EMPTY_STATES.notEnoughData,
  height = 240,
  action,
  children,
  className,
}: {
  title: string;
  hint?: string;
  bucket?: SeriesBucket;
  onBucketChange?: (bucket: SeriesBucket) => void;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyLabel?: string;
  height?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-md font-bold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
        </div>
        {bucket && onBucketChange && (
          <SegmentedControl
            options={SERIES_BUCKETS}
            value={bucket}
            onChange={onBucketChange}
            getLabel={(b) => SERIES_BUCKET_LABELS[b]}
          />
        )}
      </div>
      {isLoading ? (
        <div className="w-full animate-pulse rounded-sm bg-surface-hover" style={{ height }} />
      ) : isEmpty ? (
        <div className="flex flex-1 items-center" style={{ minHeight: height / 2 }}>
          <div className="w-full">
            <KpiEmptyBlock label={emptyLabel} />
          </div>
        </div>
      ) : (
        children
      )}
      {action && <div className="mt-auto">{action}</div>}
    </section>
  );
}
