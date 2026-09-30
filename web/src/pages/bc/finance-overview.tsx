/**
 * Tổng quan tài chính bằng biểu đồ — dùng chung cho Dashboard (khổ gọn) và tab «Tổng quan tài
 * chính» của phân hệ Báo cáo (khổ đủ, kèm bảng số).
 *
 * Haan 30/09/2026: Tổng Giám đốc cần nhìn tổng quan bằng biểu đồ theo tháng / quý / năm và so với
 * kỳ trước. Chỉ dùng dữ liệu thật đang có — kỳ chưa có phát sinh nói rõ, không vẽ cột 0 (CLAUDE.md 5.2).
 *
 * Nguồn:
 *  - Doanh thu, thu, chi theo ngày nghiệp vụ: `finance_daily` (0140), gom ở `@nvg/shared/bc-series`.
 *  - Công nợ theo tuổi nợ: cùng hàm `receivableAging` với màn hình Công nợ của Kế toán.
 *  - Lãi/lỗ từng công trình: cùng hàm `project_profit_loss` với báo cáo lãi/lỗ (ghi nhật ký truy cập).
 * Cùng nguồn với các màn hình chi tiết → cùng con số.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatCurrency,
  receivableAging,
  toMoney,
  toNvgDateInput,
  type DashboardPeriod,
} from '@nvg/shared';
import {
  bucketFinance,
  comparisonRanges,
  formatMoneyCompact,
  percentChange,
  sumFinance,
  type FinanceBucketRow,
  type FinanceDay,
  type SeriesBucket,
} from '@nvg/shared/bc-series';
import { BarList, type BarListItem } from '@/components/charts/bar-list';
import { ChartCard } from '@/components/charts/chart-card';
import { CHART_COLORS } from '@/components/charts/chart-theme';
import { MetricTile } from '@/components/charts/metric-tile';
import { MoneyChart, type ChartRow, type ChartSeries } from '@/components/charts/money-chart';
import { useAgingBuckets, useReceivables } from '@/hooks/use-accounting';
import { useFinanceDaily, useProfitLossReport } from '@/hooks/use-reports';
import { cn } from '@/lib/utils';

/** Tải từ đầu: dữ liệu theo ngày thưa (chỉ ngày có phát sinh), đủ cho cả kỳ «Tất cả». */
const SERIES_EPOCH = '2000-01-01';

const REVENUE_SERIES: readonly ChartSeries[] = [
  { key: 'revenue', name: 'Doanh thu', color: CHART_COLORS.primary },
  { key: 'collected', name: 'Đã thu', color: CHART_COLORS.pair },
];

const CASH_SERIES: readonly ChartSeries[] = [
  { key: 'collected', name: 'Thu', color: CHART_COLORS.pair },
  { key: 'paidOut', name: 'Chi', color: CHART_COLORS.neutral },
  { key: 'netCash', name: 'Dòng tiền ròng', color: CHART_COLORS.third, kind: 'line' },
];

function toChartRows(rows: readonly FinanceBucketRow[]): ChartRow[] {
  return rows.map((r) => ({
    label: r.label,
    revenue: Number(r.revenue),
    collected: Number(r.collected),
    paidOut: Number(r.paidOut),
    netCash: Number(r.netCash),
  }));
}

function describeSeries(
  rows: readonly FinanceBucketRow[],
  pick: (r: FinanceBucketRow) => bigint,
  name: string,
) {
  return rows.map((r) => `${r.label}: ${name} ${formatMoneyCompact(pick(r))}`).join('; ');
}

export function useFinanceOverview(period: DashboardPeriod, enabled: boolean) {
  const today = toNvgDateInput(new Date());
  const daily = useFinanceDaily(SERIES_EPOCH, today, enabled);
  const days = useMemo(() => daily.data ?? [], [daily.data]);
  const ranges = comparisonRanges(period, today);
  const current = sumFinance(days, ranges.current.from, ranges.current.to);
  const previous = ranges.previous
    ? sumFinance(days, ranges.previous.from, ranges.previous.to)
    : null;
  return { today, daily, days, ranges, current, previous };
}

function tileChange(cur: bigint, prev: bigint | undefined, previousHasData: boolean) {
  return prev === undefined ? null : percentChange(cur, prev, previousHasData);
}

export function FinanceMetricStrip({
  days,
  current,
  previous,
  today,
}: {
  days: readonly FinanceDay[];
  current: ReturnType<typeof sumFinance>;
  previous: ReturnType<typeof sumFinance> | null;
  today: string;
}) {
  const monthly = bucketFinance(days, 'thang', today);
  const trend = (pick: (r: FinanceBucketRow) => bigint) => monthly.map((r) => Number(pick(r)));
  const prevHas = (previous?.activeDays ?? 0) > 0;
  const tiles = [
    {
      title: 'Doanh thu',
      value: current.revenue,
      prev: previous?.revenue,
      pick: (r: FinanceBucketRow) => r.revenue,
    },
    {
      title: 'Đã thu',
      value: current.collected,
      prev: previous?.collected,
      pick: (r: FinanceBucketRow) => r.collected,
    },
    {
      title: 'Đã chi',
      value: current.paidOut,
      prev: previous?.paidOut,
      pick: (r: FinanceBucketRow) => r.paidOut,
    },
    {
      title: 'Dòng tiền ròng (thu − chi)',
      value: current.netCash,
      prev: previous?.netCash,
      pick: (r: FinanceBucketRow) => r.netCash,
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <MetricTile
          key={t.title}
          title={t.title}
          value={t.value}
          hasData={current.activeDays > 0}
          change={tileChange(t.value, t.prev, prevHas)}
          trend={trend(t.pick)}
        />
      ))}
    </div>
  );
}

export function RevenueChart({
  days,
  today,
  isLoading,
  height,
  withTable = false,
}: {
  days: readonly FinanceDay[];
  today: string;
  isLoading: boolean;
  height?: number;
  withTable?: boolean;
}) {
  const [bucket, setBucket] = useState<SeriesBucket>('thang');
  const rows = bucketFinance(days, bucket, today);
  return (
    <ChartCard
      title="Doanh thu và tiền đã thu"
      hint="Doanh thu ghi theo ngày nghiệm thu với chủ đầu tư và ngày tất toán cho thuê; tiền đã thu theo ngày thu."
      bucket={bucket}
      onBucketChange={setBucket}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      height={height}
    >
      <MoneyChart
        data={toChartRows(rows)}
        series={REVENUE_SERIES}
        height={height}
        summary={describeSeries(rows, (r) => r.revenue, 'doanh thu')}
      />
      {withTable && <SeriesTable rows={rows} />}
    </ChartCard>
  );
}

export function CashChart({
  days,
  today,
  isLoading,
  height,
  withTable = false,
}: {
  days: readonly FinanceDay[];
  today: string;
  isLoading: boolean;
  height?: number;
  withTable?: boolean;
}) {
  const [bucket, setBucket] = useState<SeriesBucket>('thang');
  const rows = bucketFinance(days, bucket, today);
  return (
    <ChartCard
      title="Thu – chi"
      hint="Tiền đã thu của khách hàng và tiền đã chi theo đề nghị thanh toán; đường là dòng tiền ròng."
      bucket={bucket}
      onBucketChange={setBucket}
      isLoading={isLoading}
      isEmpty={rows.length === 0}
      height={height}
    >
      <MoneyChart
        data={toChartRows(rows)}
        series={CASH_SERIES}
        height={height}
        summary={describeSeries(rows, (r) => r.netCash, 'dòng tiền ròng')}
      />
      {withTable && <SeriesTable rows={rows} />}
    </ChartCard>
  );
}

/** Bảng số dưới biểu đồ — đọc được khi in, và cho người không đọc được màu. */
export function SeriesTable({ rows }: { rows: readonly FinanceBucketRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border text-fg-subtle">
            <th className="py-1.5 pr-3 text-left font-medium">Kỳ</th>
            <th className="py-1.5 pr-3 text-right font-medium">Doanh thu</th>
            <th className="py-1.5 pr-3 text-right font-medium">Hợp đồng ký mới</th>
            <th className="py-1.5 pr-3 text-right font-medium">Đã thu</th>
            <th className="py-1.5 pr-3 text-right font-medium">Đã chi</th>
            <th className="py-1.5 text-right font-medium">Dòng tiền ròng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.start} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3">{r.label}</td>
              <td className="py-1.5 pr-3 text-right">{formatCurrency(r.revenue)}</td>
              <td className="py-1.5 pr-3 text-right">{formatCurrency(r.contractsSigned)}</td>
              <td className="py-1.5 pr-3 text-right">{formatCurrency(r.collected)}</td>
              <td className="py-1.5 pr-3 text-right">{formatCurrency(r.paidOut)}</td>
              <td className="py-1.5 text-right">{formatCurrency(r.netCash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReceivableAgingChart({ enabled }: { enabled: boolean }) {
  const receivables = useReceivables('phai_thu', { enabled });
  const buckets = useAgingBuckets();
  const aging = receivableAging(
    (receivables.data ?? []).map((r) => ({
      amount: r.amount,
      settledAmount: r.settled_amount,
      dueDate: r.due_date,
    })),
    buckets.data ?? [],
  );
  const items: BarListItem[] = aging.rows.map((row, i) => ({
    key: row.code,
    label: `${row.label}${row.entries > 0 ? ` · ${row.entries} khoản` : ''}`,
    value: row.total,
    text: formatMoneyCompact(row.total),
    // Khung đầu (chưa đến hạn) màu chuỗi chính, các khung quá hạn nhạt dần sang xám — không tô đỏ.
    color: i === 0 ? CHART_COLORS.primary : i === 1 ? CHART_COLORS.pair : CHART_COLORS.neutral,
  }));
  return (
    <ChartCard
      title="Công nợ phải thu theo tuổi nợ"
      hint={`Còn phải thu ${formatCurrency(aging.total)} — tính phần còn lại, không tính phần đã thu.`}
      isLoading={receivables.isLoading || buckets.isLoading}
      isEmpty={aging.total === 0n}
      emptyLabel="Không còn khoản phải thu nào."
      action={
        <Link to="/kt/cong-no" className="text-sm font-medium text-brand hover:underline">
          Xem công nợ →
        </Link>
      }
    >
      <BarList items={items} />
    </ChartCard>
  );
}

export function SiteProfitChart({ enabled, limit = 6 }: { enabled: boolean; limit?: number }) {
  const report = useProfitLossReport(enabled);
  const rows = (report.data ?? [])
    .filter((r) => r.profit_actual !== null && toMoney(r.accepted_revenue) !== 0n)
    .sort((a, b) => (toMoney(b.profit_actual) > toMoney(a.profit_actual) ? 1 : -1))
    .slice(0, limit);
  const items: BarListItem[] = rows.map((r) => {
    const v = toMoney(r.profit_actual);
    return {
      key: r.construction_site_id,
      label: r.site_name,
      value: v,
      text: `${v < 0n ? 'Lỗ' : 'Lãi'} ${formatMoneyCompact(v < 0n ? -v : v)}`,
      color: v < 0n ? CHART_COLORS.neutral : CHART_COLORS.primary,
    };
  });
  return (
    <ChartCard
      title="Lãi/lỗ thực tế theo công trình"
      hint="Giá trị đã nghiệm thu với chủ đầu tư trừ chi phí đã phát sinh."
      isLoading={report.isLoading}
      isEmpty={items.length === 0}
      emptyLabel="Chưa có công trình nào nghiệm thu với chủ đầu tư."
      action={
        <Link to="/bc/lai-lo" className="text-sm font-medium text-brand hover:underline">
          Xem báo cáo lãi/lỗ →
        </Link>
      }
    >
      <BarList items={items} />
    </ChartCard>
  );
}

/** Khổ gọn cho Dashboard: dải 4 chỉ số, 2 biểu đồ theo kỳ, 2 biểu đồ chụp nhanh. */
export function FinanceOverviewSection({
  period,
  canSeeProfit,
  className,
}: {
  period: DashboardPeriod;
  canSeeProfit: boolean;
  className?: string;
}) {
  const { today, daily, days, current, previous } = useFinanceOverview(period, true);
  return (
    <section aria-label="Tổng quan tài chính" className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Tổng quan tài chính</h2>
        <Link to="/bc/tong-quan" className="text-sm font-medium text-brand hover:underline">
          Xem đầy đủ và xuất báo cáo →
        </Link>
      </div>
      <FinanceMetricStrip days={days} current={current} previous={previous} today={today} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueChart days={days} today={today} isLoading={daily.isLoading} />
        <CashChart days={days} today={today} isLoading={daily.isLoading} />
      </div>
      <div className={cn('grid gap-4', canSeeProfit && 'lg:grid-cols-2')}>
        <ReceivableAgingChart enabled />
        {canSeeProfit && <SiteProfitChart enabled />}
      </div>
    </section>
  );
}
