/**
 * Khung từng công ty — Tổng giám đốc nhìn MỘT khung là nắm tình hình MỘT công ty (chủ dự án:
 * «không cần chia như thế, nhìn một nơi thôi nắm được tình hình của công ty đó»).
 *
 * Trước đây trang chia theo CHỦ ĐỀ (khối tài chính tách công ty, khối cảnh báo, lưới thẻ phân
 * hệ theo bộ chọn) — muốn biết NVC ra sao phải gom bằng mắt từ ba khối. Ở đây gom theo CÔNG
 * TY: mỗi khung đủ bốn thứ, cùng thứ tự ở cả ba khung để mắt so được theo hàng ngang:
 *   1. Tình trạng — một dòng: «N việc cần xử lý» hoặc ✓ «Ổn»; dưới là các vấn đề (bấm mở đúng
 *      danh sách của công ty đó).
 *   2. Chờ duyệt — số hồ sơ của công ty đó đang chờ người xem (chỉ người có quyền duyệt).
 *   3. Tiền trong kỳ — doanh thu, đã thu, đã chi, dòng tiền ròng.
 *   4. Đang chạy — cơ hội, hợp đồng, công trình, thiết kế, cho thuê… chỉ thứ có hoạt động.
 *
 * Nguồn: `exec_overview_by_company`, `exec_company_pulse` (0170), `finance_daily`,
 * `my_pending_approvals` — cùng quy tắc với Tổng quan điều hành và báo cáo, không đếm lại.
 */

import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, FileText, Inbox } from 'lucide-react';
import {
  DASHBOARD_PERIOD_LABELS,
  formatCurrency,
  toNvgDateInput,
  type DashboardPeriod,
} from '@nvg/shared';
import { comparisonRanges, formatMoneyCompact, sumFinance } from '@nvg/shared/bc-series';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useAllCompanyFinanceDays,
  useCompanyPulse,
  useExecOverviewByCompany,
  type ExecCompanyTile,
} from '@/hooks/use-exec-overview';
import { useCompanyStore } from '@/lib/company-store';
import { cn } from '@/lib/utils';
import { AREA, PULSE } from './exec-meta';

interface Company {
  id: string;
  code: string;
  name: string;
}

export function CompanyBoards({
  period,
  showPending,
}: {
  period: DashboardPeriod;
  /** Người xem duyệt được hồ sơ — Kiểm soát nội bộ thì không, dòng «Chờ duyệt» ẩn. */
  showPending: boolean;
}) {
  const overview = useExecOverviewByCompany();
  const pulse = useCompanyPulse();
  const finance = useAllCompanyFinanceDays();
  const pending = usePendingApprovals();

  if (overview.error) {
    return (
      <ErrorState message={toUserMessage(overview.error)} onRetry={() => void overview.refetch()} />
    );
  }
  if (overview.isLoading) return <CardGridSkeleton count={3} />;

  const tiles = overview.data ?? [];
  // Thứ tự công ty theo CSDL (display_order) — lấy từ dữ liệu, không viết cứng mã.
  const companies: Company[] = [];
  for (const t of tiles) {
    if (!companies.some((c) => c.id === t.company_id)) {
      companies.push({ id: t.company_id, code: t.company_code, name: t.company_name });
    }
  }

  const today = toNvgDateInput(new Date());
  const range = comparisonRanges(period, today).current;
  const days = finance.data ?? [];

  return (
    <section aria-label="Tình hình từng công ty" className="grid gap-4 lg:grid-cols-3">
      {companies.map((c) => (
        <Board
          key={c.id}
          company={c}
          tiles={tiles.filter((t) => t.company_id === c.id)}
          pendingCount={
            showPending
              ? (pending.data ?? []).filter((a) => a.company_code === c.code).length
              : null
          }
          money={
            finance.data
              ? sumFinance(
                  days.filter((d) => d.company_id === c.id),
                  range.from,
                  range.to,
                )
              : null
          }
          periodLabel={DASHBOARD_PERIOD_LABELS[period]}
          metrics={(pulse.data ?? []).filter((p) => p.company_id === c.id)}
        />
      ))}
    </section>
  );
}

function Board({
  company,
  tiles,
  pendingCount,
  money,
  periodLabel,
  metrics,
}: {
  company: Company;
  tiles: ExecCompanyTile[];
  pendingCount: number | null;
  money: ReturnType<typeof sumFinance> | null;
  periodLabel: string;
  metrics: { metric: string; label: string; total: number; amount: string | null }[];
}) {
  const navigate = useNavigate();
  const setCompany = useCompanyStore((s) => s.setSelectedCompany);
  const problems = tiles
    .filter((t) => t.level === 'red' || t.level === 'amber')
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  const urgent = problems.filter((t) => t.level === 'red').length;

  function open(t: ExecCompanyTile) {
    if (!t.link) return;
    setCompany(t.company_id);
    void navigate(t.link);
  }

  return (
    <article
      aria-label={company.name}
      className={cn(
        // `min-w-0`: ô lưới không giãn theo nội dung dài nhất — thiếu nó thì ở 390 px thẻ thò 8 px ra ngoài.
        'flex min-w-0 flex-col rounded-lg border bg-surface p-4',
        urgent > 0 ? 'border-status-overdue' : 'border-border',
      )}
    >
      <h2 className="text-lg font-semibold">{company.name}</h2>

      {/* 1. Tình trạng — một dòng, rồi các vấn đề. */}
      {urgent > 0 ? (
        <p className="mt-1 font-semibold text-status-overdue">{urgent} việc cần xử lý</p>
      ) : problems.length > 0 ? (
        <p className="mt-1 font-semibold text-status-pending">{problems.length} việc cần chú ý</p>
      ) : (
        <p className="mt-1 flex items-center gap-1.5 font-semibold text-status-completed">
          <Check className="size-4" aria-hidden /> Ổn — không có việc quá hạn
        </p>
      )}
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1">
          {problems.map((t) => {
            const meta = AREA[t.key];
            const Icon = meta?.icon ?? FileText;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => open(t)}
                  title={t.note ?? t.label}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-surface-hover"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      t.level === 'red' ? 'bg-status-overdue' : 'bg-status-pending',
                    )}
                  />
                  <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <span className="font-semibold tabular-nums">{t.total}</span>
                  <span className="sr-only">{t.level === 'red' ? 'cần xử lý' : 'cần chú ý'}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 2. Chờ duyệt. */}
      {pendingCount !== null && (
        <Link
          to="/viec-can-lam"
          className="mt-3 flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2 text-sm hover:bg-surface-hover"
        >
          <Inbox className="size-4 text-brand" aria-hidden />
          <span className="flex-1">Chờ duyệt</span>
          <span className="font-bold tabular-nums">{pendingCount}</span>
        </Link>
      )}

      {/* 3. Tiền trong kỳ. */}
      <section aria-label={`Tiền ${periodLabel.toLowerCase()}`} className="mt-4">
        <h3 className="text-xs font-semibold text-fg-subtle">Tiền {periodLabel.toLowerCase()}</h3>
        {money ? (
          <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Money label="Doanh thu" value={money.revenue} strong />
            <Money label="Dòng tiền ròng" value={money.netCash} strong />
            <Money label="Đã thu" value={money.collected} />
            <Money label="Đã chi" value={money.paidOut} />
          </dl>
        ) : (
          <div className="mt-1.5 h-12 animate-pulse rounded-md bg-surface-hover" aria-hidden />
        )}
      </section>

      {/* 4. Đang chạy. */}
      <section aria-label="Đang chạy" className="mt-4">
        <h3 className="text-xs font-semibold text-fg-subtle">Đang chạy</h3>
        {metrics.length === 0 ? (
          <p className="mt-1.5 text-sm text-fg-subtle">Chưa có hoạt động nào trên hệ thống.</p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {metrics.map((m) => {
              const meta = PULSE[m.metric];
              const Icon = meta?.icon ?? FileText;
              const value = m.amount && Number(m.amount) > 0 ? formatMoneyCompact(m.amount) : null;
              return (
                <li
                  key={m.metric}
                  title={`${m.label}: ${m.total}${value ? ` — ${value}` : ''}`}
                  className="flex items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-1 text-xs"
                >
                  <Icon className="size-3.5 text-fg-subtle" aria-hidden />
                  <span className="font-semibold tabular-nums">{m.total}</span>
                  <span className="text-fg-subtle">{meta?.short ?? m.label}</span>
                  {value && <span className="text-fg-subtle">· {value}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </article>
  );
}

function Money({ label, value, strong }: { label: string; value: bigint; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd
        title={formatCurrency(value)}
        className={cn('tabular-nums', strong ? 'text-base font-bold' : 'font-medium')}
      >
        {formatMoneyCompact(value)}
      </dd>
    </div>
  );
}
