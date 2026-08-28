/**
 * Báo cáo hiệu quả kinh doanh (PRD BC-03) — Module BC mức đầy đủ.
 *
 * PRD BC-03 liệt kê bốn chỉ số: "nguồn khách, tỷ lệ chuyển đổi theo phễu bán hàng, tỷ lệ trúng
 * thầu và nguyên nhân trượt thầu, hiệu suất nhân sự/tổ đội/nhà cung cấp". Trang này CHỈ làm ba
 * chỉ số đầu — có nguồn dữ liệu rõ ràng (`customers.source`, `opportunities.stage`,
 * `bidding_projects.stage`/`lost_reason`). "Hiệu suất nhân sự/tổ đội/nhà cung cấp" CỐ Ý CHƯA
 * làm — xem ghi chú đầu `db/migrations/0059_bc_sales_effectiveness.sql` để biết vì sao.
 *
 * Không phải Mẫu D (không phải giá vốn/lương/lợi nhuận), nên KHÔNG hiện `BlockedNotice` như
 * BC-02 khi vai trò thiếu quyền — `ModuleGuard` đã chặn việc mở trang từ trước; lỗi ở đây chỉ
 * còn là lỗi tạm thời (mất mạng…), nên vẫn hiện nút "Thử lại" như một danh sách bình thường.
 *
 * Cả hai hàm CSDL nguồn trả về dòng thô đã gộp nhóm — mọi phép tính hiển thị (tổng theo nguồn,
 * phễu theo giai đoạn, tỷ lệ trúng thầu) đều qua `summarizeOpportunitiesBySource`/
 * `summarizeOpportunityFunnel`/`summarizeBiddingOutcomes` (shared/src/bc.ts), không tính lại
 * ở đây — một công thức duy nhất, đúng nguyên tắc đã áp dụng cho `summarizeBudget()`.
 *
 * Xuất Excel (CSV có BOM, cùng cách BC-02 đã làm) gộp CẢ BA phần vào một tệp — ba khối cách
 * nhau một dòng trống, mỗi khối có tiêu đề riêng, vì đây là MỘT báo cáo có ba lát cắt của
 * cùng một khoảng thời gian, không phải ba báo cáo độc lập.
 *
 * BC-07 ("Toàn NVG" vẫn truy ngược được xuống pháp nhân): hai hàm CSDL nguồn gộp theo NHÓM
 * (nguồn khách/giai đoạn, giai đoạn/nguyên nhân trượt) ngay ở CSDL, khác BC-02 (mỗi dòng là
 * một công trình nên chỉ cần thêm cột). Khi xem "Toàn NVG", dữ liệu ba pháp nhân bị TRỘN vào
 * cùng một dòng nếu không tách — `company_id` được thêm vào cả hai hàm ở
 * `0060_bc_sales_effectiveness_by_company.sql`, và `CompanyBreakdownSection` bên dưới gọi lại
 * ĐÚNG các hàm `summarize*` đã có (lọc dòng thô theo từng pháp nhân trước khi gộp), không tính
 * theo công thức riêng.
 */

import { Download, Printer } from 'lucide-react';
import {
  BUTTONS,
  OPPORTUNITY_STAGE_META,
  conversionRate,
  formatCurrency,
  formatPercent,
  summarizeBiddingOutcomes,
  summarizeOpportunitiesBySource,
  summarizeOpportunityFunnel,
  type BiddingOutcomeRow,
  type BiddingOutcomeSummary,
  type FunnelStageSummary,
  type OpportunityFunnelRow,
  type SourceSummary,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { type CompanyRecord, useCompanies } from '@/hooks/use-companies';
import { toUserMessage } from '@/hooks/use-error-message';
import { useBiddingOutcomes, useOpportunityFunnelBySource } from '@/hooks/use-reports';
import { useCompanyScope } from '@/lib/company-scope';
import { escapeHtml, openPrintReport } from '@/lib/print-report';
import { BcNav } from './bc-nav';
import { ReportFreshness, ReportIncompleteNote } from './report-meta';

function csvLine(values: readonly (string | number | null)[]): string {
  return values.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
}

function exportCsv(
  sources: SourceSummary[],
  funnel: FunnelStageSummary[],
  bidding: BiddingOutcomeSummary,
  byCompany: CompanyBreakdownRow[],
) {
  const lines: string[] = [];

  if (byCompany.length > 0) {
    lines.push('Theo pháp nhân — BC-07');
    lines.push(
      csvLine([
        'Pháp nhân',
        'Tổng số cơ hội',
        'Đã ký hợp đồng',
        'Tỷ lệ chuyển đổi (%)',
        'Tỷ lệ trúng thầu (%)',
      ]),
    );
    for (const r of byCompany) {
      lines.push(csvLine([r.company.short_name, r.total, r.won, r.winRate, r.bidding.winRate]));
    }
    lines.push('');
  }

  lines.push('Nguồn khách');
  lines.push(
    csvLine([
      'Nguồn khách',
      'Tổng số cơ hội',
      'Đã ký hợp đồng',
      'Tỷ lệ chuyển đổi (%)',
      'Giá trị ước tính',
    ]),
  );
  for (const r of sources) {
    lines.push(csvLine([r.source, r.total, r.won, r.winRate, r.value.toString()]));
  }

  lines.push('');
  lines.push('Phễu bán hàng — theo giai đoạn hiện tại');
  lines.push(csvLine(['Giai đoạn', 'Số cơ hội']));
  for (const r of funnel) {
    lines.push(csvLine([OPPORTUNITY_STAGE_META[r.stage].label, r.count]));
  }

  lines.push('');
  lines.push('Tỷ lệ trúng thầu và nguyên nhân trượt thầu');
  lines.push(csvLine(['Trúng thầu', bidding.won]));
  lines.push(csvLine(['Trượt thầu', bidding.lost]));
  lines.push(csvLine(['Tỷ lệ trúng thầu (%)', bidding.winRate]));
  lines.push('');
  lines.push(csvLine(['Nguyên nhân trượt thầu', 'Số lần']));
  for (const r of bidding.lossReasons) {
    lines.push(csvLine([r.reason, r.count]));
  }

  const csv = lines.join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bao-cao-hieu-qua-kinh-doanh-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Xuất PDF (BC-06) — mở cửa sổ in, cùng ba lát cắt với "Xuất Excel", trình bày dạng bảng. */
function printPdf(
  sources: SourceSummary[],
  funnel: FunnelStageSummary[],
  bidding: BiddingOutcomeSummary,
  byCompany: CompanyBreakdownRow[],
) {
  const rateOrMuted = (value: number | null) =>
    value === null
      ? '<span class="muted">Chưa có dữ liệu</span>'
      : escapeHtml(formatPercent(value));

  const byCompanyTable =
    byCompany.length === 0
      ? ''
      : `<h2>Theo pháp nhân — BC-07</h2>
        <table>
          <thead><tr>
            <th>Pháp nhân</th>
            <th class="num">Tổng số cơ hội</th>
            <th class="num">Đã ký hợp đồng</th>
            <th class="num">Tỷ lệ chuyển đổi</th>
            <th class="num">Tỷ lệ trúng thầu</th>
          </tr></thead>
          <tbody>${byCompany
            .map(
              (r) => `<tr>
                <td>${escapeHtml(r.company.short_name)}</td>
                <td class="num">${r.total}</td>
                <td class="num">${r.won}</td>
                <td class="num">${rateOrMuted(r.winRate)}</td>
                <td class="num">${rateOrMuted(r.bidding.winRate)}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>`;

  const sourceTable =
    sources.length === 0
      ? '<p>Chưa có cơ hội nào để gộp theo nguồn khách.</p>'
      : `<table>
          <thead><tr>
            <th>Nguồn khách</th>
            <th class="num">Tổng số cơ hội</th>
            <th class="num">Đã ký hợp đồng</th>
            <th class="num">Tỷ lệ chuyển đổi</th>
            <th class="num">Giá trị ước tính</th>
          </tr></thead>
          <tbody>${sources
            .map(
              (r) => `<tr>
                <td>${escapeHtml(r.source)}</td>
                <td class="num">${r.total}</td>
                <td class="num">${r.won}</td>
                <td class="num">${rateOrMuted(r.winRate)}</td>
                <td class="num">${escapeHtml(formatCurrency(r.value))}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>`;

  const funnelTable = `<table>
    <thead><tr><th>Giai đoạn</th><th class="num">Số cơ hội</th></tr></thead>
    <tbody>${funnel
      .map(
        (r) =>
          `<tr><td>${escapeHtml(OPPORTUNITY_STAGE_META[r.stage].label)}</td><td class="num">${r.count}</td></tr>`,
      )
      .join('')}</tbody>
  </table>`;

  const decided = bidding.won + bidding.lost;
  const biddingHtml =
    decided === 0
      ? '<p>Chưa có gói thầu nào có kết quả (trúng hoặc trượt).</p>'
      : `<dl>
          <div><dt>Đã có kết quả</dt><dd>${decided} gói thầu</dd></div>
          <div><dt>Trúng thầu</dt><dd>${bidding.won}</dd></div>
          <div><dt>Tỷ lệ trúng thầu</dt><dd>${rateOrMuted(bidding.winRate)}</dd></div>
        </dl>
        ${
          bidding.lossReasons.length === 0
            ? '<p>Chưa trượt gói thầu nào trong dữ liệu hiện có.</p>'
            : `<table>
                <thead><tr><th>Nguyên nhân trượt thầu</th><th class="num">Số lần</th></tr></thead>
                <tbody>${bidding.lossReasons
                  .map(
                    (r) =>
                      `<tr><td>${escapeHtml(r.reason)}</td><td class="num">${r.count}</td></tr>`,
                  )
                  .join('')}</tbody>
              </table>`
        }`;

  const body = `
    ${byCompanyTable}
    <h2>Nguồn khách</h2>
    ${sourceTable}
    <h2>Phễu bán hàng — theo giai đoạn hiện tại</h2>
    ${funnelTable}
    <h2>Tỷ lệ trúng thầu và nguyên nhân trượt thầu</h2>
    ${biddingHtml}`;

  openPrintReport('Báo cáo hiệu quả kinh doanh', body);
}

/** "Chưa có dữ liệu" khác hẳn "0%" — cùng nguyên tắc BC-06 đã áp dụng cho conversionRate. */
function RatePill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-fg-subtle">Chưa có dữ liệu</span>;
  return <span className="font-semibold">{formatPercent(value)}</span>;
}

function SourceSection({ rows }: { rows: ReturnType<typeof summarizeOpportunitiesBySource> }) {
  if (rows.length === 0) {
    return (
      <EmptyState message="Chưa có cơ hội nào để gộp theo nguồn khách. Cơ hội được lập ở màn hình Cơ hội kinh doanh (CRM)." />
    );
  }
  return (
    <section className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <table className="w-full min-w-[40rem] border-collapse">
        <caption className="sr-only">Cơ hội gộp theo nguồn khách</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-subtle">
            <th scope="col" className="px-3 py-2 font-medium">
              Nguồn khách
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Tổng số cơ hội
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Đã ký hợp đồng
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Tỷ lệ chuyển đổi
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Giá trị ước tính
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.source} className="border-b border-border last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {r.source}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.won}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                <RatePill value={r.winRate} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FunnelSection({ rows }: { rows: ReturnType<typeof summarizeOpportunityFunnel> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-3 font-medium">Phễu bán hàng — theo giai đoạn hiện tại</h2>
      <p className="mb-4 text-xs text-fg-subtle">
        Đếm theo giai đoạn cơ hội đang đứng hôm nay, không phải tỷ lệ chuyển đổi luỹ tiến qua lịch
        sử từng bước — cho thấy cơ hội đang ứ ở đâu.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.stage} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-sm">{OPPORTUNITY_STAGE_META[r.stage].label}</span>
            <span className="h-4 flex-1 overflow-hidden rounded-sm bg-surface-sunken">
              <span
                className="block h-full rounded-sm bg-brand"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right text-sm tabular-nums">{r.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BiddingSection({ summary }: { summary: ReturnType<typeof summarizeBiddingOutcomes> }) {
  const decided = summary.won + summary.lost;
  if (decided === 0) {
    return (
      <EmptyState message="Chưa có gói thầu nào có kết quả (trúng hoặc trượt) để tính tỷ lệ trúng thầu." />
    );
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-3 font-medium">Tỷ lệ trúng thầu và nguyên nhân trượt thầu</h2>
      <dl className="mb-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-fg-subtle">Đã có kết quả</dt>
          <dd className="mt-0.5">{decided} gói thầu</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Trúng thầu</dt>
          <dd className="mt-0.5">{summary.won}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Tỷ lệ trúng thầu</dt>
          <dd className="mt-0.5">
            <RatePill value={summary.winRate} />
          </dd>
        </div>
      </dl>

      {summary.lossReasons.length === 0 ? (
        <p className="text-sm text-fg-subtle">Chưa trượt gói thầu nào trong dữ liệu hiện có.</p>
      ) : (
        <div>
          <p className="mb-2 text-xs text-fg-subtle">
            Nguyên nhân trượt thầu, xếp theo số lần gặp giảm dần
          </p>
          <ul className="space-y-1.5">
            {summary.lossReasons.map((r) => (
              <li key={r.reason} className="flex items-center justify-between gap-3 text-sm">
                <span>{r.reason}</span>
                <span className="tabular-nums text-fg-subtle">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * BC-07 — chỉ hiện khi xem "Toàn NVG" (`scope.isAggregate`). Gọi lại ĐÚNG `summarizeOpportuni-
 * tiesBySource`/`summarizeBiddingOutcomes` trên tập con dòng thô của từng pháp nhân, không
 * tính tỷ lệ theo công thức riêng ở đây — một chỗ tính, khỏi lệch với ba phần bên trên.
 */
interface CompanyBreakdownRow {
  readonly company: CompanyRecord;
  readonly total: number;
  readonly won: number;
  readonly winRate: number | null;
  readonly bidding: BiddingOutcomeSummary;
}

/** Dùng chung cho phần hiện trên màn hình VÀ cho xuất Excel/PDF — một công thức duy nhất. */
function summarizeByCompany(
  companies: readonly CompanyRecord[],
  funnelRows: readonly OpportunityFunnelRow[],
  biddingRows: readonly BiddingOutcomeRow[],
): CompanyBreakdownRow[] {
  return companies
    .filter((c) => c.is_transactional)
    .map((company) => {
      const sources = summarizeOpportunitiesBySource(
        funnelRows.filter((r) => r.companyId === company.id),
      );
      const total = sources.reduce((sum, s) => sum + s.total, 0);
      const won = sources.reduce((sum, s) => sum + s.won, 0);
      const bidding = summarizeBiddingOutcomes(
        biddingRows.filter((r) => r.companyId === company.id),
      );
      return { company, total, won, winRate: conversionRate(won, total), bidding };
    });
}

function CompanyBreakdownSection({ rows }: { rows: CompanyBreakdownRow[] }) {
  if (rows.every((r) => r.total === 0 && r.bidding.won + r.bidding.lost === 0)) return null;

  return (
    <section className="overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
      <h2 className="border-b border-border px-3 py-2.5 font-medium">Theo pháp nhân — BC-07</h2>
      <table className="w-full min-w-[36rem] border-collapse">
        <caption className="sr-only">Hiệu quả kinh doanh gộp theo pháp nhân</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-fg-subtle">
            <th scope="col" className="px-3 py-2 font-medium">
              Pháp nhân
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Tổng số cơ hội
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Đã ký hợp đồng
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Tỷ lệ chuyển đổi
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Tỷ lệ trúng thầu
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ company, total, won, winRate, bidding }) => (
            <tr key={company.id} className="border-b border-border last:border-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {company.short_name}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{total}</td>
              <td className="px-3 py-2 text-right tabular-nums">{won}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                <RatePill value={winRate} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <RatePill value={bidding.winRate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SalesEffectivenessPage() {
  const scope = useCompanyScope();
  const funnel = useOpportunityFunnelBySource();
  const outcomes = useBiddingOutcomes();
  const companies = useCompanies(scope.isAggregate);

  const isLoading = funnel.isLoading || outcomes.isLoading;
  const error = funnel.error ?? outcomes.error;
  const hasAnyData = (funnel.data?.length ?? 0) > 0 || (outcomes.data?.length ?? 0) > 0;
  const byCompany = scope.isAggregate
    ? summarizeByCompany(companies.data ?? [], funnel.data ?? [], outcomes.data ?? [])
    : [];

  return (
    <>
      <PageHeader
        title="Hiệu quả kinh doanh"
        description="Nguồn khách, phễu bán hàng, tỷ lệ trúng thầu và nguyên nhân trượt thầu — BC-03"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Hiệu quả kinh doanh' }]}
        actions={
          hasAnyData && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  exportCsv(
                    summarizeOpportunitiesBySource(funnel.data ?? []),
                    summarizeOpportunityFunnel(funnel.data ?? []),
                    summarizeBiddingOutcomes(outcomes.data ?? []),
                    byCompany,
                  )
                }
              >
                <Download className="size-4" aria-hidden />
                {BUTTONS.exportExcel}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  printPdf(
                    summarizeOpportunitiesBySource(funnel.data ?? []),
                    summarizeOpportunityFunnel(funnel.data ?? []),
                    summarizeBiddingOutcomes(outcomes.data ?? []),
                    byCompany,
                  )
                }
              >
                <Printer className="size-4" aria-hidden />
                {BUTTONS.exportPdf}
              </Button>
            </>
          )
        }
      />

      <BcNav />

      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : error ? (
        <ErrorState
          message={toUserMessage(error)}
          onRetry={() => {
            void funnel.refetch();
            void outcomes.refetch();
          }}
        />
      ) : !hasAnyData ? (
        <EmptyState message="Chưa có cơ hội hoặc gói thầu nào trong hệ thống để tính hiệu quả kinh doanh." />
      ) : (
        <div className="space-y-6">
          <div>
            <ReportFreshness
              dataUpdatedAt={Math.max(funnel.dataUpdatedAt, outcomes.dataUpdatedAt)}
            />
            <ReportIncompleteNote>
              Báo cáo này chưa có phần "hiệu suất nhân sự/tổ đội/nhà cung cấp" — Thi công chưa có
              bảng phân công tổ đội, Mua hàng chưa có sổ đánh giá nhà cung cấp, nên chưa có nguồn dữ
              liệu đáng tin để tính. Ba phần dưới đây (nguồn khách, phễu bán hàng, tỷ lệ trúng thầu)
              đã đầy đủ.
            </ReportIncompleteNote>
          </div>
          {scope.isAggregate && <CompanyBreakdownSection rows={byCompany} />}
          <SourceSection rows={summarizeOpportunitiesBySource(funnel.data ?? [])} />
          <FunnelSection rows={summarizeOpportunityFunnel(funnel.data ?? [])} />
          <BiddingSection summary={summarizeBiddingOutcomes(outcomes.data ?? [])} />
        </div>
      )}
    </>
  );
}
