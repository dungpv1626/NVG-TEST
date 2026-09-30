/**
 * Biểu đồ tiền theo kỳ: cột (một hoặc nhiều chuỗi) và tuỳ chọn một đường (vd. dòng tiền ròng).
 *
 * Trục dọc rút gọn («2,6 tỷ»), ô gợi ý khi rê / chạm ghi đủ «2.600.000.000 đồng». Chú thích tự
 * dựng (không dùng chú thích của thư viện) để chữ luôn tiếng Việt và luôn có — màu không phải
 * cách duy nhất phân biệt chuỗi (CLAUDE.md 5.4).
 */

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@nvg/shared';
import { formatMoneyCompact, niceMoneyTicks } from '@nvg/shared/bc-series';
import { AXIS_TICK, GRID_STROKE, usePrefersReducedMotion } from './chart-theme';

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  kind?: 'bar' | 'line';
}

export type ChartRow = { label: string } & Record<string, number | string>;

function TooltipBox({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: readonly { name?: string | number; value?: unknown; color?: string }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-overlay">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={String(p.name)} className="flex items-center gap-2 tabular-nums">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-fg-subtle">{p.name}:</span>
          <span className="font-medium">{formatCurrency(Math.round(Number(p.value)))}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartLegend({ series }: { series: readonly ChartSeries[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-subtle">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            className={s.kind === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-sm'}
            style={{ background: s.color }}
            aria-hidden
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

export function MoneyChart({
  data,
  series,
  height = 240,
  summary,
}: {
  data: readonly ChartRow[];
  series: readonly ChartSeries[];
  height?: number;
  /** Câu tóm tắt cho trình đọc màn hình — biểu đồ là hình, phải có chữ đi kèm. */
  summary: string;
}) {
  const reduced = usePrefersReducedMotion();
  const hasNegative = data.some((row) => series.some((s) => Number(row[s.key]) < 0));
  const ticks = niceMoneyTicks(data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0)));
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={summary} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data as ChartRow[]}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={76}
              ticks={ticks}
              domain={[ticks[0] ?? 0, ticks[ticks.length - 1] ?? 0]}
              tickFormatter={(v: number) => (v === 0 ? '0' : formatMoneyCompact(Math.round(v)))}
            />
            {hasNegative && <ReferenceLine y={0} stroke="var(--color-border-strong)" />}
            <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--color-surface-hover)' }} />
            {series.map((s) =>
              s.kind === 'line' ? (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: s.color }}
                  isAnimationActive={!reduced}
                />
              ) : (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={!reduced}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend series={series} />
    </div>
  );
}
