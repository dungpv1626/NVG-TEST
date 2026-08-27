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
 */

import {
  OPPORTUNITY_STAGE_META,
  formatCurrency,
  formatPercent,
  summarizeBiddingOutcomes,
  summarizeOpportunitiesBySource,
  summarizeOpportunityFunnel,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useBiddingOutcomes, useOpportunityFunnelBySource } from '@/hooks/use-reports';
import { BcNav } from './bc-nav';

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

export function SalesEffectivenessPage() {
  const funnel = useOpportunityFunnelBySource();
  const outcomes = useBiddingOutcomes();

  const isLoading = funnel.isLoading || outcomes.isLoading;
  const error = funnel.error ?? outcomes.error;
  const hasAnyData = (funnel.data?.length ?? 0) > 0 || (outcomes.data?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Hiệu quả kinh doanh"
        description="Nguồn khách, phễu bán hàng, tỷ lệ trúng thầu và nguyên nhân trượt thầu — BC-03"
        breadcrumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Hiệu quả kinh doanh' }]}
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
          <SourceSection rows={summarizeOpportunitiesBySource(funnel.data ?? [])} />
          <FunnelSection rows={summarizeOpportunityFunnel(funnel.data ?? [])} />
          <BiddingSection summary={summarizeBiddingOutcomes(outcomes.data ?? [])} />
        </div>
      )}
    </>
  );
}
