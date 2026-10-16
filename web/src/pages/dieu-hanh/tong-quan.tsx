/**
 * «Tổng quan điều hành» — Ban Giám đốc và Kiểm soát nội bộ nắm CẢ BA công ty bằng HÌNH, không
 * phải bằng chữ (Giai đoạn 2, doc/MOC_CAI_TIEN_UX.md vấn đề 1; chủ dự án: «còn nhiều chữ quá,
 * tối ưu thành các sơ đồ»).
 *
 * Bốn tầng, đọc từ trên xuống trong vài giây:
 *   1. Dải «chờ quyết định» — số việc theo từng công ty, một nút sang Hộp thư.
 *   2. Ba thẻ sức khoẻ — vòng tròn chia theo mức của 10 mảng cảnh báo, số mảng cần xử lý ở giữa,
 *      vài biểu tượng hoạt động đang chạy.
 *   3. Bản đồ cảnh báo — hàng = mảng (nhãn ngắn + biểu tượng), cột = công ty; mỗi ô một ô màu kèm
 *      SỐ hoặc dấu ✓. Rê / chọn ô: hồ sơ cụ thể. Bấm: chọn đúng pháp nhân rồi mở danh sách lọc.
 *   4. Hai biểu đồ cột theo công ty — tài chính tháng này; quy mô hoạt động (cơ hội, hợp đồng).
 *
 * Dữ liệu: `exec_overview_by_company`, `exec_company_pulse` (0170), `finance_daily`,
 * `my_pending_approvals`. Màu trạng thái chỉ dùng cho MỨC; chuỗi biểu đồ dùng màu biểu đồ
 * (DESIGN_SYSTEM §2.1). Mức không bao giờ chỉ nói bằng màu: ô có số / dấu ✓, tên đọc được đầy
 * đủ cho trình đọc màn hình (CGD 6.8).
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  FileText,
  Handshake,
  HardHat,
  IdCard,
  Inbox,
  Layers,
  MapPinOff,
  PenTool,
  Stamp,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { formatMoneyCompact } from '@nvg/shared/bc-series';
import { MoneyChart, type ChartSeries } from '@/components/charts/money-chart';
import { CHART_COLORS, usePrefersReducedMotion } from '@/components/charts/chart-theme';
import { PageHeader } from '@/components/layout/app-shell';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCompanyPulse,
  useExecOverviewByCompany,
  useFinanceThisMonthByCompany,
  type CompanyPulseRow,
  type ExecCompanyTile,
  type ExecLevel,
} from '@/hooks/use-exec-overview';
import { useAuth } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { cn } from '@/lib/utils';

type Icon = LucideIcon;

const LEVEL: Record<ExecLevel, { text: string; cell: string; color: string; order: number }> = {
  red: {
    text: 'Cần xử lý',
    cell: 'bg-status-overdue text-fg-inverse',
    color: 'var(--color-status-overdue)',
    order: 0,
  },
  amber: {
    text: 'Cần chú ý',
    cell: 'bg-status-pending-bg text-status-pending ring-1 ring-status-pending',
    color: 'var(--color-status-pending)',
    order: 1,
  },
  ok: {
    text: 'Ổn',
    cell: 'bg-status-completed-bg text-status-completed',
    color: 'var(--color-status-completed-bg)',
    order: 2,
  },
  no_data: {
    text: 'Chưa đủ dữ liệu',
    cell: 'bg-surface-sunken text-fg-subtle',
    color: 'var(--color-border)',
    order: 3,
  },
};

/** Nhãn NGẮN + biểu tượng cho từng mảng — tên đầy đủ nằm ở chú thích khi rê chuột. */
const AREA: Record<string, { short: string; icon: Icon }> = {
  approvals_stale: { short: 'Phê duyệt', icon: Stamp },
  payments_stuck: { short: 'Đề nghị chi', icon: Wallet },
  receivables_overdue: { short: 'Phải thu', icon: ArrowDownLeft },
  payables_overdue: { short: 'Phải trả', icon: ArrowUpRight },
  contracts_overdue: { short: 'Hợp đồng', icon: FileText },
  sites_late: { short: 'Tiến độ', icon: Clock },
  sites_over_budget: { short: 'Ngân sách', icon: TrendingUp },
  rentals_overdue: { short: 'Giàn giáo', icon: Layers },
  hr_documents: { short: 'Giấy tờ NS', icon: IdCard },
  survey_waived: { short: 'Bỏ khảo sát', icon: MapPinOff },
};

/** Biểu tượng cho chỉ số hoạt động của từng công ty. */
const PULSE: Record<string, { short: string; icon: Icon }> = {
  opportunities_open: { short: 'Cơ hội', icon: Handshake },
  contracts_active: { short: 'Hợp đồng', icon: FileText },
  contracts_pending: { short: 'HĐ chờ ký', icon: Stamp },
  sites_active: { short: 'Công trình', icon: HardHat },
  sites_warranty: { short: 'Bảo hành', icon: Check },
  designs_active: { short: 'Thiết kế', icon: PenTool },
  designs_waiting_customer: { short: 'Chờ khách', icon: Clock },
  rentals_active: { short: 'Cho thuê', icon: Layers },
  production_running: { short: 'Sản xuất', icon: HardHat },
};

interface Company {
  id: string;
  code: string;
  name: string;
}

export function ExecOverviewPage() {
  const { profile } = useAuth();
  const overview = useExecOverviewByCompany();
  const tiles = overview.data ?? [];

  // Thứ tự công ty theo CSDL (display_order) — lấy từ dữ liệu, không viết cứng mã.
  const companies: Company[] = [];
  for (const t of tiles) {
    if (!companies.some((c) => c.id === t.company_id)) {
      companies.push({ id: t.company_id, code: t.company_code, name: t.company_name });
    }
  }
  const troubled = companies.filter((c) =>
    tiles.some((t) => t.company_id === c.id && t.level === 'red'),
  );
  // Kiểm soát nội bộ không phê duyệt — không có dải «chờ quyết định».
  const readOnly = Boolean(profile?.assignments.every((a) => a.roleCode === 'KSNB'));

  return (
    <>
      <PageHeader
        title="Tổng quan điều hành"
        description={
          profile && !overview.isLoading
            ? troubled.length > 0
              ? `Chào ${profile.fullName}, ${troubled.map((c) => c.code).join(', ')} đang có việc cần xử lý.`
              : `Chào ${profile.fullName}, chưa công ty nào có việc quá hạn.`
            : undefined
        }
      />

      {overview.error ? (
        <ErrorState
          message={toUserMessage(overview.error)}
          onRetry={() => void overview.refetch()}
        />
      ) : overview.isLoading ? (
        <CardGridSkeleton count={3} />
      ) : (
        <div className="space-y-6">
          {!readOnly && <PendingStrip companies={companies} />}
          <HealthCards tiles={tiles} companies={companies} />
          <Heatmap tiles={tiles} companies={companies} />
          <div className="grid gap-6 xl:grid-cols-2">
            <FinanceChart companies={companies} />
            <ScaleChart companies={companies} />
          </div>
        </div>
      )}
    </>
  );
}

// --- 1. Chờ quyết định: một dải, số theo công ty ----------------------------------------------
function PendingStrip({ companies }: { companies: Company[] }) {
  const { data } = usePendingApprovals();
  const list = data ?? [];
  return (
    <section
      aria-label="Việc chờ quyết định"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-surface px-4 py-3"
    >
      <span className="flex items-center gap-2 font-semibold">
        <Inbox className="size-5 text-brand" aria-hidden />
        Chờ quyết định
        <span className="text-2xl font-bold tabular-nums">{list.length}</span>
      </span>
      <ul className="flex flex-wrap gap-2 text-sm">
        {companies.map((c) => {
          const n = list.filter((a) => a.company_code === c.code).length;
          return (
            <li
              key={c.id}
              className={cn(
                'rounded-full px-2.5 py-0.5',
                n > 0
                  ? 'bg-brand-subtle font-semibold text-brand-forest'
                  : 'bg-surface-sunken text-fg-subtle',
              )}
            >
              {c.code} {n}
            </li>
          );
        })}
      </ul>
      {list.length > 0 && (
        <Link
          to="/viec-can-lam"
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          Mở Hộp thư <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}

// --- 2. Ba thẻ sức khoẻ ------------------------------------------------------------------------
function HealthCards({ tiles, companies }: { tiles: ExecCompanyTile[]; companies: Company[] }) {
  const pulse = useCompanyPulse().data ?? [];
  const reduced = usePrefersReducedMotion();
  return (
    <section aria-label="Sức khoẻ từng công ty" className="grid gap-4 md:grid-cols-3">
      {companies.map((c) => {
        const own = tiles.filter((t) => t.company_id === c.id);
        const count = (l: ExecLevel) => own.filter((t) => t.level === l).length;
        const slices = (['red', 'amber', 'ok', 'no_data'] as const)
          .map((l) => ({ level: l, value: count(l) }))
          .filter((s) => s.value > 0);
        const red = count('red');
        const summary = `${c.name}: ${red} mảng cần xử lý, ${count('amber')} cần chú ý, ${count('ok')} ổn`;
        const metrics = pulse.filter((p) => p.company_id === c.id);
        return (
          <article key={c.id} className="rounded-md border border-border bg-surface p-4">
            <h2 className="font-semibold">{c.name}</h2>
            <div className="mt-2 flex items-center gap-4">
              <div role="img" aria-label={summary} className="relative size-24 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="level"
                      innerRadius="68%"
                      outerRadius="100%"
                      paddingAngle={slices.length > 1 ? 3 : 0}
                      stroke="none"
                      isAnimationActive={!reduced}
                    >
                      {slices.map((s) => (
                        <Cell key={s.level} fill={LEVEL[s.level].color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <span className="absolute inset-0 grid place-items-center text-center leading-none">
                  {red > 0 ? (
                    <span className="text-status-overdue">
                      <span className="block text-2xl font-bold">{red}</span>
                      <span className="text-2xs">cần xử lý</span>
                    </span>
                  ) : (
                    <Check className="size-8 text-status-completed" aria-hidden />
                  )}
                </span>
              </div>
              <ul className="space-y-0.5 text-xs" aria-hidden>
                {(['red', 'amber', 'ok'] as const).map((l) => (
                  <li key={l} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: LEVEL[l].color }} />
                    <span className="font-semibold tabular-nums">{count(l)}</span>
                    <span className="text-fg-subtle">{LEVEL[l].text.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </div>
            {metrics.length > 0 && <PulseIcons metrics={metrics} />}
          </article>
        );
      })}
    </section>
  );
}

function PulseIcons({ metrics }: { metrics: CompanyPulseRow[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
      {metrics.map((m) => {
        const meta = PULSE[m.metric];
        const Icon = meta?.icon ?? FileText;
        const value = m.amount && Number(m.amount) > 0 ? ` — ${formatMoneyCompact(m.amount)}` : '';
        return (
          <li
            key={m.metric}
            title={`${m.label}: ${m.total}${value}`}
            className="flex items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-1 text-xs"
          >
            <Icon className="size-3.5 text-fg-subtle" aria-hidden />
            <span className="font-semibold tabular-nums">{m.total}</span>
            <span className="text-fg-subtle">{meta?.short ?? m.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

// --- 3. Bản đồ cảnh báo: mảng × công ty --------------------------------------------------------
function Heatmap({ tiles, companies }: { tiles: ExecCompanyTile[]; companies: Company[] }) {
  const navigate = useNavigate();
  const setCompany = useCompanyStore((s) => s.setSelectedCompany);
  const [focus, setFocus] = useState<ExecCompanyTile | null>(null);

  const keys: { key: string; label: string; worst: number; i: number }[] = [];
  for (const t of tiles) {
    const k = keys.find((x) => x.key === t.key);
    const w = LEVEL[t.level].order;
    if (!k) keys.push({ key: t.key, label: t.label, worst: w, i: keys.length });
    else k.worst = Math.min(k.worst, w);
  }
  // Mảng nặng nhất lên đầu.
  const rows = keys.sort((a, b) => a.worst - b.worst || a.i - b.i);

  function open(t: ExecCompanyTile) {
    if (!t.link) return;
    setCompany(t.company_id);
    void navigate(t.link);
  }

  return (
    <section
      aria-label="Bản đồ cảnh báo"
      className="rounded-md border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Bản đồ cảnh báo</h2>
        <ul className="flex flex-wrap gap-3 text-xs text-fg-subtle" aria-hidden>
          {(['red', 'amber', 'ok'] as const).map((l) => (
            <li key={l} className="flex items-center gap-1.5">
              <span className={cn('size-3 rounded-sm', LEVEL[l].cell)} />
              {LEVEL[l].text}
            </li>
          ))}
        </ul>
      </div>

      <div
        className="mt-3 grid items-center gap-1.5"
        style={{
          gridTemplateColumns: `minmax(6.5rem, 11rem) repeat(${companies.length}, minmax(0, 1fr))`,
        }}
        role="table"
        aria-label="Cảnh báo theo mảng và công ty"
      >
        <div role="row" className="contents">
          {/* Ô thật trong lưới (chữ ẩn bên trong): ô `sr-only` không chiếm chỗ, cả lưới trượt một cột. */}
          <span role="columnheader">
            <span className="sr-only">Mảng</span>
          </span>
          {companies.map((c) => (
            <span
              key={c.id}
              role="columnheader"
              title={c.name}
              className="text-center text-xs font-semibold text-fg-subtle"
            >
              {c.code}
            </span>
          ))}
        </div>
        {rows.map((r) => {
          const meta = AREA[r.key];
          const Icon = meta?.icon ?? FileText;
          return (
            <div key={r.key} role="row" className="contents">
              <span
                role="rowheader"
                title={r.label}
                className="flex min-w-0 items-center gap-2 text-sm"
              >
                <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                <span className="truncate">{meta?.short ?? r.label}</span>
              </span>
              {companies.map((c) => {
                const t = tiles.find((x) => x.key === r.key && x.company_id === c.id);
                return (
                  <span key={c.id} role="cell" className="flex justify-center">
                    {t && <HeatCell tile={t} onOpen={() => open(t)} onFocus={setFocus} />}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {focus && (focus.level === 'red' || focus.level === 'amber') && (
        <FocusDetail tile={focus} onClose={() => setFocus(null)} />
      )}
    </section>
  );
}

function HeatCell({
  tile,
  onOpen,
  onFocus,
}: {
  tile: ExecCompanyTile;
  onOpen: () => void;
  onFocus: (t: ExecCompanyTile) => void;
}) {
  const level = LEVEL[tile.level];
  const problem = tile.level === 'red' || tile.level === 'amber';
  const label = `${tile.company_name} — ${tile.label}: ${
    problem ? `${tile.total} hồ sơ, ${level.text.toLowerCase()}` : level.text.toLowerCase()
  }${tile.note ? `. ${tile.note}` : ''}`;
  const content = problem ? (
    <span className="text-sm font-bold tabular-nums">{tile.total}</span>
  ) : tile.level === 'ok' ? (
    <Check className="size-4" aria-hidden />
  ) : (
    <span className="text-xs">—</span>
  );
  const cls = cn('grid h-8 w-full max-w-20 place-items-center rounded-md', level.cell);
  if (!problem || !tile.link) {
    return (
      <span className={cls} title={label} role="img" aria-label={label}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cn(cls, 'transition-transform hover:scale-105 focus-visible:scale-105')}
      title={label}
      aria-label={`${label}. Mở danh sách`}
      onMouseEnter={() => onFocus(tile)}
      onFocus={() => onFocus(tile)}
      onClick={onOpen}
    >
      {content}
    </button>
  );
}

/** Hồ sơ cụ thể của ô đang rê / chọn — chữ chỉ hiện khi người xem muốn biết thêm. */
function FocusDetail({ tile, onClose }: { tile: ExecCompanyTile; onClose: () => void }) {
  return (
    <div className="mt-3 rounded-md bg-surface-sunken p-3 text-sm" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold">
          {tile.company_code} · {tile.label}
          {tile.note && <span className="font-normal text-fg-subtle"> — {tile.note}</span>}
        </p>
        <button type="button" onClick={onClose} className="text-xs text-fg-subtle hover:underline">
          Đóng
        </button>
      </div>
      {tile.items.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {tile.items.map((it, i) => (
            <li key={`${it.code}-${i}`} className="flex gap-2">
              <span className="shrink-0 font-mono text-xs text-fg-subtle">{it.code}</span>
              {it.link ? (
                <Link to={it.link} className="truncate hover:underline">
                  {it.title}
                </Link>
              ) : (
                <span className="truncate">{it.title}</span>
              )}
              {it.detail && <span className="shrink-0 text-xs text-fg-subtle">{it.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- 4. Biểu đồ theo công ty --------------------------------------------------------------------
const FINANCE_SERIES: ChartSeries[] = [
  { key: 'revenue', name: 'Doanh thu', color: CHART_COLORS.primary },
  { key: 'collected', name: 'Đã thu', color: CHART_COLORS.pair },
  { key: 'paidOut', name: 'Đã chi', color: CHART_COLORS.neutral },
];

function FinanceChart({ companies }: { companies: Company[] }) {
  const { data, isLoading, error } = useFinanceThisMonthByCompany();
  if (isLoading || error) return null;
  const rows = companies.map((c) => {
    const f = data?.get(c.id);
    return {
      label: c.code,
      revenue: Number(f?.revenue ?? 0n),
      collected: Number(f?.collected ?? 0n),
      paidOut: Number(f?.paidOut ?? 0n),
    };
  });
  const all = data?.get(null);
  const summary = `Tài chính tháng này theo công ty: ${rows
    .map(
      (r) =>
        `${r.label} doanh thu ${formatMoneyCompact(r.revenue)}, đã thu ${formatMoneyCompact(r.collected)}, đã chi ${formatMoneyCompact(r.paidOut)}`,
    )
    .join('; ')}`;
  return (
    <section
      aria-label="Tài chính tháng này"
      className="rounded-md border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Tài chính tháng này</h2>
        <Link to="/bc/tong-quan" className="text-sm font-medium text-brand hover:underline">
          Chi tiết
        </Link>
      </div>
      {all && (
        <p className="mt-1 text-sm text-fg-subtle">
          Cả tập đoàn: thu {formatMoneyCompact(all.collected)} · chi{' '}
          {formatMoneyCompact(all.paidOut)} · ròng{' '}
          <span className="font-semibold text-fg">
            {formatMoneyCompact(all.collected - all.paidOut)}
          </span>
        </p>
      )}
      <div className="mt-3">
        <MoneyChart data={rows} series={FINANCE_SERIES} height={220} summary={summary} />
      </div>
      <p className="mt-2 text-2xs text-fg-subtle">
        Số cả tập đoàn chưa loại giao dịch nội bộ giữa các pháp nhân.
      </p>
    </section>
  );
}

const SCALE_SERIES: ChartSeries[] = [
  { key: 'pipeline', name: 'Cơ hội đang theo đuổi', color: CHART_COLORS.pair },
  { key: 'contracts', name: 'Hợp đồng đang thực hiện', color: CHART_COLORS.primary },
];

function ScaleChart({ companies }: { companies: Company[] }) {
  const { data, isLoading } = useCompanyPulse();
  if (isLoading) return null;
  const pulse = data ?? [];
  const amountOf = (cid: string, metric: string) =>
    Number(pulse.find((p) => p.company_id === cid && p.metric === metric)?.amount ?? 0);
  const rows = companies.map((c) => ({
    label: c.code,
    pipeline: amountOf(c.id, 'opportunities_open'),
    contracts: amountOf(c.id, 'contracts_active'),
  }));
  const summary = `Quy mô theo công ty: ${rows
    .map(
      (r) =>
        `${r.label} cơ hội ${formatMoneyCompact(r.pipeline)}, hợp đồng đang thực hiện ${formatMoneyCompact(r.contracts)}`,
    )
    .join('; ')}`;
  return (
    <section
      aria-label="Quy mô hoạt động"
      className="rounded-md border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">Quy mô hoạt động</h2>
      <p className="mt-1 text-sm text-fg-subtle">Giá trị cơ hội và hợp đồng đang chạy</p>
      <div className="mt-3">
        <MoneyChart data={rows} series={SCALE_SERIES} height={220} summary={summary} />
      </div>
    </section>
  );
}
