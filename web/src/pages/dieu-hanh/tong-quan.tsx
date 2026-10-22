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
import { Check, FileText } from 'lucide-react';
import { formatMoneyCompact } from '@nvg/shared/bc-series';
import { MoneyChart, type ChartSeries } from '@/components/charts/money-chart';
import { CHART_COLORS } from '@/components/charts/chart-theme';
import { PageHeader } from '@/components/layout/app-shell';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCompanyPulse,
  useExecOverviewByCompany,
  type ExecCompanyTile,
  type ExecLevel,
} from '@/hooks/use-exec-overview';
import { daysLeftLabel, useExpiringContracts } from '@/hooks/use-expiring-contracts';
import { formatDate } from '@nvg/shared';
import { useAuth } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { CompanyBoards } from './company-boards';
import { AREA } from './exec-meta';
import { cn } from '@/lib/utils';

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
      {/* Công cụ kiểm soát của Đợt 3 — chỉ liên kết, mọi vai xem được trang này đều mở được. */}
      <nav aria-label="Công cụ kiểm soát" className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link to="/tong-quan/bat-thuong" className="text-brand hover:underline">
          Danh sách bất thường
        </Link>
        <Link to="/kt/dong-tien-theo-tuan" className="text-brand hover:underline">
          Dòng tiền theo tuần
        </Link>
        <Link to="/bc/lai-lo-quan-tri" className="text-brand hover:underline">
          Lãi / lỗ quản trị từng công trình
        </Link>
      </nav>

      {overview.error ? (
        <ErrorState
          message={toUserMessage(overview.error)}
          onRetry={() => void overview.refetch()}
        />
      ) : overview.isLoading ? (
        <CardGridSkeleton count={3} />
      ) : (
        <div className="space-y-6">
          {/* Mỗi công ty một khung đủ tình hình (cùng khối với Dashboard của lãnh đạo); dưới là
              hai cách SO SÁNH ba công ty: theo mảng cảnh báo và theo quy mô. */}
          <CompanyBoards period="thang-nay" showPending={!readOnly} />
          <Heatmap tiles={tiles} companies={companies} />
          <ExpiringContracts />
          <ScaleChart companies={companies} />
        </div>
      )}
    </>
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
  // Chỉ mảng có vấn đề mới chiếm chỗ — mảng ổn ở mọi công ty gom một dòng ✓ (chủ dự án: «nhìn
  // ít mà ra vấn đề ngay»; 26/30 ô dấu ✓ cùng cỡ với ô đỏ là nhiễu).
  const [showCalm, setShowCalm] = useState(false);
  const calmRows = rows.filter((r) => r.worst > LEVEL.amber.order);
  const shownRows = showCalm ? rows : rows.filter((r) => r.worst <= LEVEL.amber.order);

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
        {shownRows.map((r) => {
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

      {calmRows.length > 0 && (
        <button
          type="button"
          aria-expanded={showCalm}
          onClick={() => setShowCalm((v) => !v)}
          className="mt-3 flex items-center gap-2 text-sm text-status-completed hover:underline"
        >
          <Check className="size-4" aria-hidden />
          {showCalm
            ? 'Thu gọn các mảng đang ổn'
            : `${calmRows.length} mảng đang ổn ở cả ${companies.length} công ty`}
        </button>
      )}

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

// --- Quy mô theo công ty (so sánh) ---------------------------------------------------------
const SCALE_SERIES: ChartSeries[] = [
  { key: 'pipeline', name: 'Cơ hội đang theo đuổi', color: CHART_COLORS.pair },
  { key: 'contracts', name: 'Hợp đồng đang thực hiện', color: CHART_COLORS.primary },
];

// --- Hợp đồng sắp hết hạn (0218, câu 8: còn ≤ 90 ngày) ----------------------------------------
// Chỉ hợp đồng đã ký; đã qua ngày kết thúc là «Quá hạn» ở danh sách hợp đồng, không nằm ở đây.
function ExpiringContracts() {
  const { data, isLoading } = useExpiringContracts();
  if (isLoading) return null;
  const rows = data ?? [];
  return (
    <section
      aria-label="Hợp đồng sắp hết hạn"
      className="rounded-md border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">Hợp đồng sắp hết hạn</h2>
      {rows.length === 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-subtle">
          <Check className="h-4 w-4" aria-hidden />
          Không có hợp đồng đã ký nào hết hạn trong 90 ngày tới.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                to={`/hd/hop-dong/${c.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 hover:bg-surface-hover"
              >
                <span className="w-12 shrink-0 text-xs font-semibold text-fg-subtle">
                  {c.company_code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{c.contract_number ?? c.code}</span>{' '}
                  <span className="text-fg-subtle">{c.title}</span>
                </span>
                <span className="text-sm text-fg-subtle">{formatDate(c.end_date)}</span>
                <span className="text-sm font-semibold">{daysLeftLabel(c.days_left)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
