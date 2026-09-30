/**
 * Tab «Tổng quan tài chính» của phân hệ Báo cáo — cùng các biểu đồ với Dashboard, khổ lớn hơn,
 * kèm bảng số dưới mỗi biểu đồ, cơ cấu theo pháp nhân khi xem NVG Group, và xuất Excel / PDF.
 *
 * Quyền: như thẻ Dòng tiền — vai trò không xem được tài chính thấy câu nói rõ ai xem được, không
 * thấy biểu đồ rỗng (CSDL cũng từ chối `finance_daily` cho vai trò đó).
 */

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS,
  DEFAULT_DASHBOARD_PERIOD,
  formatCurrency,
  type DashboardPeriod,
} from '@nvg/shared';
import { bucketFinance, sumFinance, type FinanceDay } from '@nvg/shared/bc-series';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { BlockedNotice, ErrorState } from '@/components/ui/states';
import { useCompanyLookup } from '@/hooks/use-companies';
import { toUserMessage } from '@/hooks/use-error-message';
import { useSensitiveAccess } from '@/hooks/use-sensitive-access';
import { useCompanyScope } from '@/lib/company-scope';
import { APP_HELP } from '@/lib/help-texts';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { BcNav } from './bc-nav';
import {
  CashChart,
  FinanceMetricStrip,
  ReceivableAgingChart,
  RevenueChart,
  SiteProfitChart,
  useFinanceOverview,
} from './finance-overview';
import { ReportFreshness } from './report-meta';

const CSV_HEADER = ['Kỳ', 'Doanh thu', 'Hợp đồng ký mới', 'Đã thu', 'Đã chi', 'Dòng tiền ròng'];

function monthlyRows(days: readonly FinanceDay[], today: string) {
  return bucketFinance(days, 'thang', today).map((r) => [
    r.label,
    r.revenue,
    r.contractsSigned,
    r.collected,
    r.paidOut,
    r.netCash,
  ]);
}

/** CSV theo tháng (mở bằng Excel) — BOM UTF-8 để Excel đọc đúng tiếng Việt (BC-06). */
function exportCsv(days: readonly FinanceDay[], today: string) {
  const lines = monthlyRows(days, today).map((row) =>
    row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
  );
  const csv = [CSV_HEADER.join(','), ...lines].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tong-quan-tai-chinh-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printPdf(days: readonly FinanceDay[], today: string, periodLabel: string) {
  const rows = monthlyRows(days, today)
    .map(
      ([label, ...money]) =>
        `<tr><td>${escapeHtml(String(label))}</td>${money
          .map((v) => `<td class="num">${escapeHtml(formatCurrency(v as bigint))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const table = `<p class="muted">Kỳ đang xem trên màn hình: ${escapeHtml(periodLabel)}. Bảng dưới theo tháng.</p>
    <table><thead><tr>${CSV_HEADER.map((h, i) => `<th${i ? ' class="num"' : ''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table>`;
  openPrintReport('Tổng quan tài chính', table);
}

function CompanyBreakdown({
  days,
  from,
  to,
}: {
  days: readonly FinanceDay[];
  from: string;
  to: string;
}) {
  const scope = useCompanyScope();
  const companyOf = useCompanyLookup(scope.isAggregate);
  if (!scope.isAggregate) return null;
  const ids = [...new Set(days.map((d) => d.company_id))];
  const rows = ids
    .map((id) => ({
      id,
      name: companyOf(id)?.short_name ?? companyOf(id)?.code ?? '—',
      t: sumFinance(
        days.filter((d) => d.company_id === id),
        from,
        to,
      ),
    }))
    .filter((r) => r.t.activeDays > 0);
  if (rows.length === 0) return null;
  return (
    <section aria-label="Theo pháp nhân" className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-md font-bold">Theo pháp nhân</h2>
      <p className="mt-0.5 text-xs text-fg-subtle">Trong kỳ đang chọn.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-xs text-fg-subtle">
              <th className="py-2 pr-3 text-left font-medium">Pháp nhân</th>
              <th className="py-2 pr-3 text-right font-medium">Doanh thu</th>
              <th className="py-2 pr-3 text-right font-medium">Đã thu</th>
              <th className="py-2 pr-3 text-right font-medium">Đã chi</th>
              <th className="py-2 text-right font-medium">Dòng tiền ròng</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-2 pr-3">{r.name}</td>
                <td className="py-2 pr-3 text-right">{formatCurrency(r.t.revenue)}</td>
                <td className="py-2 pr-3 text-right">{formatCurrency(r.t.collected)}</td>
                <td className="py-2 pr-3 text-right">{formatCurrency(r.t.paidOut)}</td>
                <td className="py-2 text-right">{formatCurrency(r.t.netCash)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function FinanceOverviewPage() {
  const access = useSensitiveAccess();
  const canSeeFinance = access.data?.finance === true;
  const canSeeProfit = access.data?.profit === true;
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_DASHBOARD_PERIOD);
  const { today, daily, days, ranges, current, previous } = useFinanceOverview(
    period,
    canSeeFinance,
  );

  return (
    <>
      <PageHeader
        help={APP_HELP.financeOverview}
        title="Tổng quan tài chính"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Tổng quan tài chính' }]}
        description="Doanh thu, tiền đã thu, đã chi theo tháng / quý / năm và so với kỳ trước"
        actions={
          canSeeFinance && days.length > 0 ? (
            <>
              <Button variant="secondary" size="lg" onClick={() => exportCsv(days, today)}>
                <Download aria-hidden />
                Xuất Excel
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => printPdf(days, today, DASHBOARD_PERIOD_LABELS[period])}
              >
                <Printer aria-hidden />
                Xuất PDF
              </Button>
            </>
          ) : undefined
        }
      />
      <BcNav />

      {access.isLoading ? null : !canSeeFinance ? (
        <BlockedNotice
          title="Không xem được số liệu tài chính."
          detail="Tổng quan tài chính chỉ dành cho Ban Giám đốc, Giám đốc Tài chính và Kế toán. Liên hệ quản trị hệ thống nếu công việc cần tới báo cáo này."
        />
      ) : daily.error ? (
        <ErrorState message={toUserMessage(daily.error)} onRetry={() => void daily.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold tracking-wide text-fg-subtle">KỲ BÁO CÁO</span>
            <SegmentedControl
              options={DASHBOARD_PERIODS}
              value={period}
              onChange={setPeriod}
              getLabel={(p) => DASHBOARD_PERIOD_LABELS[p]}
            />
            <ReportFreshness dataUpdatedAt={daily.dataUpdatedAt} />
          </div>
          <FinanceMetricStrip days={days} current={current} previous={previous} today={today} />
          <RevenueChart
            days={days}
            today={today}
            isLoading={daily.isLoading}
            height={300}
            withTable
          />
          <CashChart days={days} today={today} isLoading={daily.isLoading} height={300} withTable />
          <div className={canSeeProfit ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'}>
            <ReceivableAgingChart enabled />
            {canSeeProfit && <SiteProfitChart enabled limit={10} />}
          </div>
          <CompanyBreakdown days={days} from={ranges.current.from} to={ranges.current.to} />
        </div>
      )}
    </>
  );
}
