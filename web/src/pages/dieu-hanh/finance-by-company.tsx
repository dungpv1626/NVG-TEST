/**
 * Tài chính theo kỳ — CẢ BA CÔNG TY cạnh nhau, không theo bộ chọn pháp nhân.
 *
 * Phản hồi chủ dự án: phần «số liệu chi tiết theo kỳ» của Dashboard đi theo bộ chọn ở góc trái,
 * không nói đang là công ty nào; muốn so phải chuyển từng công ty rồi nhớ số — Tổng giám đốc
 * «không thể nhớ được hết tất cả các công ty». Ở đây mỗi chỉ số có số tập đoàn + thanh chia theo
 * công ty kèm số từng công ty; biểu đồ theo tháng có cột riêng cho từng công ty.
 *
 * Cùng nguồn `finance_daily` và cùng cách cộng (`sumFinance`, `bucketFinance`) với Tổng quan
 * tài chính — chỉ tách theo `company_id` trước khi cộng.
 */

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  bucketFinance,
  comparisonRanges,
  formatMoneyCompact,
  sumFinance,
  type FinanceDay,
  type FinanceTotals,
} from '@nvg/shared/bc-series';
import {
  DASHBOARD_PERIOD_LABELS,
  formatCurrency,
  toNvgDateInput,
  type DashboardPeriod,
} from '@nvg/shared';
import { CHART_COLORS } from '@/components/charts/chart-theme';
import { MoneyChart, type ChartSeries } from '@/components/charts/money-chart';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Mỗi công ty một màu biểu đồ cố định theo thứ tự — không dùng màu trạng thái (DESIGN_SYSTEM §2.1). */
// Rừng · bạc hà · xám lục: ba tông khác hẳn độ đậm, để hai công ty không trùng màu (rừng và teal
// gần nhau, đã thấy trên ảnh chụp).
const COMPANY_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.pair,
  CHART_COLORS.neutral,
  CHART_COLORS.third,
];
const SERIES_EPOCH = '2000-01-01';

interface Company {
  id: string;
  code: string;
  name: string;
  color: string;
}

function useAllCompanyFinanceDays(enabled: boolean) {
  const today = toNvgDateInput(new Date());
  return useQuery<FinanceDay[], Error>({
    queryKey: ['exec-overview', 'finance-days-all', today],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('finance_daily', {
        p_from: SERIES_EPOCH,
        p_to: today,
        p_company_id: null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as FinanceDay[];
    },
    enabled,
  });
}

const METRICS: { key: keyof FinanceTotals; title: string }[] = [
  { key: 'revenue', title: 'Doanh thu' },
  { key: 'collected', title: 'Đã thu' },
  { key: 'paidOut', title: 'Đã chi' },
  { key: 'netCash', title: 'Dòng tiền ròng (thu – chi)' },
];

export function FinanceByCompanySection({ period }: { period: DashboardPeriod }) {
  const { profile } = useAuth();
  const { data: days = [], isLoading, error } = useAllCompanyFinanceDays(true);

  // Pháp nhân giao dịch theo thứ tự hiển thị — bỏ mã tổng hợp NVG (CLAUDE.md 3.5).
  const companies: Company[] = (profile?.scopeCompanies ?? [])
    .filter((c) => c.companyCode !== 'NVG')
    .map((c, i) => ({
      id: c.companyId,
      code: c.companyCode,
      name: c.companyShortName,
      color: COMPANY_COLORS[i % COMPANY_COLORS.length]!,
    }));

  if (isLoading) return <div className="mb-6 h-48 animate-pulse rounded-lg bg-surface-hover" />;
  if (error) return null;

  const today = toNvgDateInput(new Date());
  const range = comparisonRanges(period, today).current;
  const byCompany = new Map(
    companies.map((c) => [
      c.id,
      sumFinance(
        days.filter((d) => d.company_id === c.id),
        range.from,
        range.to,
      ),
    ]),
  );
  const group = sumFinance(days, range.from, range.to);

  // Theo tháng: một cột cho mỗi công ty — so ba công ty trên cùng một trục.
  const monthly = companies.map((c) =>
    bucketFinance(
      days.filter((d) => d.company_id === c.id),
      'thang',
      today,
    ),
  );
  const labels = [...new Set(monthly.flatMap((rows) => rows.map((r) => r.label)))];
  const months = [...new Set(monthly.flatMap((rows) => rows.map((r) => r.start)))].sort();
  const rowsFor = (pick: (t: FinanceTotals) => bigint) =>
    months.map((start) => {
      const row: { label: string } & Record<string, number | string> = {
        label: monthly.flatMap((r) => r).find((r) => r.start === start)?.label ?? start,
      };
      companies.forEach((c, i) => {
        const r = monthly[i]!.find((x) => x.start === start);
        row[c.code] = r ? Number(pick(r)) : 0;
      });
      return row;
    });
  const series: ChartSeries[] = companies.map((c) => ({
    key: c.code,
    name: c.name,
    color: c.color,
  }));
  const revenueRows = rowsFor((t) => t.revenue);
  const netRows = rowsFor((t) => t.netCash);

  return (
    <section aria-label="Tài chính theo công ty" className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Tài chính {DASHBOARD_PERIOD_LABELS[period].toLowerCase()} — ba công ty
        </h2>
        <Link to="/bc/tong-quan" className="text-sm font-medium text-brand hover:underline">
          Xem đầy đủ và xuất báo cáo →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => {
          const total = group[m.key] as bigint;
          return (
            <article key={m.key} className="rounded-lg border border-border bg-surface p-4">
              <h3 className="text-sm text-fg-subtle">{m.title}</h3>
              <p className="mt-1 text-2xl font-bold tabular-nums" title={formatCurrency(total)}>
                {formatMoneyCompact(total)}
              </p>
              <p className="text-xs text-fg-subtle">Cả tập đoàn</p>
              <SplitBar
                parts={companies.map((c) => ({
                  company: c,
                  value: (byCompany.get(c.id)?.[m.key] as bigint | undefined) ?? 0n,
                }))}
                label={m.title}
              />
            </article>
          );
        })}
      </div>

      {labels.length > 0 && (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <ChartBox title="Doanh thu theo tháng">
            <MoneyChart
              data={revenueRows}
              series={series}
              height={220}
              summary={`Doanh thu theo tháng của ${companies.map((c) => c.name).join(', ')}`}
            />
          </ChartBox>
          <ChartBox title="Dòng tiền ròng theo tháng">
            <MoneyChart
              data={netRows}
              series={series}
              height={220}
              summary={`Dòng tiền ròng theo tháng của ${companies.map((c) => c.name).join(', ')}`}
            />
          </ChartBox>
        </div>
      )}

      <p className="mt-2 text-2xs text-fg-subtle">
        Số cả tập đoàn chưa loại giao dịch nội bộ giữa các pháp nhân.
      </p>
    </section>
  );
}

/** Thanh chia theo công ty + số từng công ty — màu đi kèm mã và số, không đứng một mình. */
function SplitBar({
  parts,
  label,
}: {
  parts: { company: Company; value: bigint }[];
  label: string;
}) {
  const positive = parts.map((p) => (p.value > 0n ? p.value : 0n));
  const sum = positive.reduce((a, b) => a + b, 0n);
  return (
    <div className="mt-3">
      {sum > 0n && (
        <div className="flex h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
          {parts.map((p, i) =>
            positive[i]! > 0n ? (
              <span
                key={p.company.id}
                style={{
                  width: `${Number((positive[i]! * 1000n) / sum) / 10}%`,
                  background: p.company.color,
                }}
              />
            ) : null,
          )}
        </div>
      )}
      <ul className="mt-2 space-y-0.5 text-xs" aria-label={`${label} theo công ty`}>
        {parts.map((p) => (
          <li key={p.company.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ background: p.company.color }}
                aria-hidden
              />
              <span className="font-mono font-semibold">{p.company.code}</span>
            </span>
            <span className="tabular-nums">{formatMoneyCompact(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** MoneyChart tự vẽ chú thích (tên công ty) — ở đây chỉ thêm khung và tiêu đề. */
function ChartBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
