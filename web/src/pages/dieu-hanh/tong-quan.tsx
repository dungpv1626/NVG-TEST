/**
 * «Tổng quan điều hành» — Ban Giám đốc và Kiểm soát nội bộ nắm CẢ BA công ty trên một trang
 * (Giai đoạn 2, doc/MOC_CAI_TIEN_UX.md vấn đề 1; bố cục chủ dự án chọn sau bản đầu).
 *
 * Bản đầu (0169) gộp mọi pháp nhân thành một con số: «2 hồ sơ chờ duyệt» không nói của NVC hay
 * NVO, muốn biết phải đổi bộ chọn pháp nhân rồi tự so. Trang này trả lời bốn câu, theo thứ tự
 * Tổng giám đốc cần:
 *   1. Việc nào đang chờ chính mình quyết?                      → `my_pending_approvals`
 *   2. Công ty nào đang có vấn đề, vấn đề gì?                    → bảng cảnh báo hàng × công ty
 *   3. Mỗi công ty đang chạy những gì?                           → `exec_company_pulse`
 *   4. Tiền tháng này của từng công ty và cả tập đoàn?           → `finance_daily`
 *
 * Mọi ô cảnh báo tính ở CSDL theo đúng quy tắc «quá hạn» của danh sách (`exec_overview_by_company`).
 * Bấm một ô: đặt pháp nhân của ô đó vào bộ chọn rồi mở danh sách đã lọc — tới đúng hồ sơ của
 * công ty đó, không phải danh sách gộp. Mức luôn nói bằng CHỮ, màu chỉ là phụ (CGD 6.8).
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { EMPTY_STATES, formatCurrency, formatWaiting } from '@nvg/shared';
import { formatMoneyCompact } from '@nvg/shared/bc-series';
import { PageHeader } from '@/components/layout/app-shell';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { usePendingApprovals } from '@/hooks/use-approvals';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCompanyPulse,
  useExecOverviewByCompany,
  useFinanceThisMonthByCompany,
  type ExecCompanyTile,
  type ExecLevel,
} from '@/hooks/use-exec-overview';
import { useAuth } from '@/lib/auth';
import { useCompanyStore } from '@/lib/company-store';
import { cn } from '@/lib/utils';

const LEVEL: Record<ExecLevel, { text: string; className: string; order: number }> = {
  red: { text: 'cần xử lý', className: 'bg-status-overdue-bg text-status-overdue', order: 0 },
  amber: { text: 'cần chú ý', className: 'bg-status-pending-bg text-status-pending', order: 1 },
  ok: { text: 'ổn', className: 'text-fg-subtle', order: 2 },
  no_data: { text: 'chưa đủ dữ liệu', className: 'text-fg-subtle', order: 3 },
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

  // Thứ tự công ty theo CSDL (display_order) — lấy từ chính dữ liệu, không viết cứng mã.
  const companies: Company[] = [];
  for (const t of tiles) {
    if (!companies.some((c) => c.id === t.company_id)) {
      companies.push({ id: t.company_id, code: t.company_code, name: t.company_name });
    }
  }
  const troubled = companies.filter((c) =>
    tiles.some((t) => t.company_id === c.id && t.level === 'red'),
  );

  // Kiểm soát nội bộ không phê duyệt — không có khối «việc chờ quyết».
  const readOnly = Boolean(profile?.assignments.every((a) => a.roleCode === 'KSNB'));

  return (
    <>
      <PageHeader
        title="Tổng quan điều hành"
        description={
          profile
            ? `Chào ${profile.fullName}, ${
                overview.isLoading
                  ? 'đang tổng hợp tình hình ba công ty.'
                  : troubled.length > 0
                    ? `${troubled.map((c) => c.name).join(', ')} đang có việc cần xử lý.`
                    : 'chưa công ty nào có việc quá hạn.'
              }`
            : undefined
        }
      />

      <div className="space-y-6">
        {!readOnly && <PendingDecisions />}

        {overview.error ? (
          <ErrorState
            message={toUserMessage(overview.error)}
            onRetry={() => void overview.refetch()}
          />
        ) : overview.isLoading ? (
          <CardGridSkeleton count={3} />
        ) : (
          <>
            <AlertMatrix tiles={tiles} companies={companies} />
            <AttentionList tiles={tiles} />
          </>
        )}

        <CompanyPulse />
        <FinanceByCompanyTable companies={companies} />
      </div>
    </>
  );
}

// --- 1. Việc chờ quyết ------------------------------------------------------------------------
function PendingDecisions() {
  const { data, isLoading } = usePendingApprovals();
  const list = data ?? [];
  return (
    <section
      aria-label="Việc chờ quyết định"
      className="rounded-md border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          Việc chờ quyết định{' '}
          {list.length > 0 && <span className="text-fg-subtle">({list.length})</span>}
        </h2>
        {list.length > 0 && (
          <Link to="/viec-can-lam" className="text-sm font-medium text-brand hover:underline">
            Mở Hộp thư Phê duyệt
          </Link>
        )}
      </div>
      {isLoading ? null : list.length === 0 ? (
        <p className="mt-1 text-sm text-fg-subtle">Không có hồ sơ nào đang chờ phê duyệt.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border text-sm">
          {list.slice(0, 5).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
              {a.company_code && <CompanyChip code={a.company_code} />}
              <Link to="/viec-can-lam" className="line-clamp-2 min-w-0 flex-1 hover:underline">
                {a.title}
              </Link>
              {/* Điện thoại: số tiền và thời gian chờ xuống dòng dưới, tên hồ sơ giữ trọn bề ngang. */}
              <span className="flex items-baseline gap-3 max-sm:w-full max-sm:pl-11">
                {a.amount !== null && (
                  <span className="font-medium">{formatCurrency(a.amount)}</span>
                )}
                <span className="text-xs text-fg-subtle">{formatWaiting(a.requested_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- 2. Bảng cảnh báo: hàng = vấn đề, cột = công ty ---------------------------------------------
function AlertMatrix({ tiles, companies }: { tiles: ExecCompanyTile[]; companies: Company[] }) {
  const navigate = useNavigate();
  const setCompany = useCompanyStore((s) => s.setSelectedCompany);

  const keys: { key: string; label: string; area: string; worst: number }[] = [];
  for (const t of tiles) {
    const k = keys.find((x) => x.key === t.key);
    const w = LEVEL[t.level].order;
    if (!k) keys.push({ key: t.key, label: t.label, area: t.area, worst: w });
    else k.worst = Math.min(k.worst, w);
  }
  // Vấn đề nặng nhất lên đầu; giữ thứ tự gốc trong cùng một mức.
  const rows = keys.map((k, i) => ({ ...k, i })).sort((a, b) => a.worst - b.worst || a.i - b.i);
  // Mảng ổn ở cả ba công ty gom vào một dòng mở ra được — bảng chỉ dài bằng số vấn đề thật.
  const [showCalm, setShowCalm] = useState(false);
  const issueRows = rows.filter((r) => r.worst <= LEVEL.amber.order);
  const calmRows = rows.filter((r) => r.worst > LEVEL.amber.order);
  const visibleRows = showCalm ? rows : issueRows;

  function open(t: ExecCompanyTile) {
    if (!t.link) return;
    setCompany(t.company_id);
    void navigate(t.link);
  }

  return (
    <section
      aria-label="Cảnh báo theo công ty"
      className="rounded-md border border-border bg-surface"
    >
      <h2 className="border-b border-border px-4 py-3 font-semibold">Cảnh báo theo công ty</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm sm:min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              <th scope="col" className="px-4 py-2 font-medium">
                Vấn đề
              </th>
              {companies.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-2 text-center font-medium">
                  {/* Điện thoại: mã ngắn để ba cột vừa màn hình; tên đầy đủ vẫn đọc được. */}
                  <span className="sm:hidden" aria-hidden>
                    {c.code}
                  </span>
                  <span className="max-sm:sr-only">{c.name}</span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-center font-medium">
                <span className="sm:hidden" aria-hidden>
                  Tổng
                </span>
                <span className="max-sm:sr-only">Cả tập đoàn</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const cells = companies.map((c) =>
                tiles.find((t) => t.key === r.key && t.company_id === c.id),
              );
              const sum = cells.reduce((s, t) => s + (t?.total ?? 0), 0);
              const allNoData = cells.every((t) => !t || t.level === 'no_data');
              return (
                <tr key={r.key} className="border-t border-border">
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <span className="block text-xs text-fg-subtle">{r.area}</span>
                    {r.label}
                  </th>
                  {cells.map((t, i) => (
                    <td key={companies[i]!.id} className="px-2 py-1.5 text-center">
                      {t ? <Cell tile={t} onOpen={() => open(t)} /> : null}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold">{allNoData ? '—' : sum}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {calmRows.length > 0 && (
        // Nằm NGOÀI bảng: bảng cuộn ngang trên điện thoại, câu dài trong bảng bị cắt mất.
        <div className="border-t border-border px-4 py-2">
          <button
            type="button"
            aria-expanded={showCalm}
            onClick={() => setShowCalm((v) => !v)}
            className="text-left text-sm text-fg-subtle hover:text-fg hover:underline"
          >
            {showCalm
              ? 'Thu gọn các mảng đang ổn'
              : `${calmRows.length} mảng đang ổn ở cả ${companies.length} công ty: ${calmRows
                  .map((r) => r.label.toLowerCase())
                  .join(', ')} — xem chi tiết`}
          </button>
        </div>
      )}
      {tiles.some((t) => t.level === 'no_data') && (
        <p className="border-t border-border px-4 py-2 text-xs text-fg-subtle">
          «Chưa đủ dữ liệu»: {EMPTY_STATES.notEnoughData}
        </p>
      )}
    </section>
  );
}

function Cell({ tile, onOpen }: { tile: ExecCompanyTile; onOpen: () => void }) {
  const level = LEVEL[tile.level];
  if (tile.level === 'no_data') return <span className="text-xs text-fg-subtle">{level.text}</span>;
  if (tile.level === 'ok' && !tile.total) return <span className="text-xs text-fg-subtle">Ổn</span>;
  const body = (
    <>
      <span className="font-semibold">{tile.total}</span>{' '}
      <span className="text-xs">{level.text}</span>
      {tile.amount !== null && Number(tile.amount) > 0 && (
        <span className="block text-xs">{formatMoneyCompact(tile.amount)}</span>
      )}
    </>
  );
  const box = cn('inline-block min-w-20 rounded-sm px-2 py-1', level.className);
  return tile.link ? (
    <button
      type="button"
      onClick={onOpen}
      title={`${tile.company_name}: ${tile.label}${tile.note ? ` — ${tile.note}` : ''}`}
      className={cn(box, 'hover:underline')}
    >
      {body}
    </button>
  ) : (
    <span className={box} title={tile.note ?? undefined}>
      {body}
    </span>
  );
}

// --- Hồ sơ cụ thể của các ô có vấn đề --------------------------------------------------------
function AttentionList({ tiles }: { tiles: ExecCompanyTile[] }) {
  const items = tiles
    .filter((t) => t.level === 'red' || t.level === 'amber')
    .sort((a, b) => LEVEL[a.level].order - LEVEL[b.level].order)
    .flatMap((t) => t.items.map((it) => ({ ...it, company: t.company_code, label: t.label })))
    .slice(0, 10);
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Hồ sơ cần chú ý"
      className="rounded-md border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">Hồ sơ cần chú ý</h2>
      <ul className="mt-2 divide-y divide-border text-sm">
        {items.map((it, i) => {
          const body = (
            <>
              <CompanyChip code={it.company} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <span className="font-mono text-xs text-fg-subtle">{it.code}</span> {it.title}
                </span>
                <span className="block text-xs text-fg-subtle">
                  {it.label}
                  {it.detail ? ` · ${it.detail}` : ''}
                </span>
              </span>
            </>
          );
          return (
            <li key={`${it.code}-${i}`}>
              {it.link ? (
                <Link to={it.link} className="flex items-start gap-3 py-1.5 hover:bg-surface-hover">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 py-1.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- 3. Hoạt động từng công ty ------------------------------------------------------------------
function CompanyPulse() {
  const { data, isLoading } = useCompanyPulse();
  if (isLoading) return <CardGridSkeleton count={3} />;
  const rows = data ?? [];
  const companies: Company[] = [];
  for (const r of rows) {
    if (!companies.some((c) => c.id === r.company_id)) {
      companies.push({ id: r.company_id, code: r.company_code, name: r.company_name });
    }
  }
  return (
    <section aria-label="Hoạt động từng công ty">
      <h2 className="mb-2 font-semibold">Hoạt động từng công ty</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {companies.map((c) => (
          <article key={c.id} className="rounded-md border border-border bg-surface p-4">
            <h3 className="font-semibold">{c.name}</h3>
            <dl className="mt-2 space-y-1.5 text-sm">
              {rows
                .filter((r) => r.company_id === c.id)
                .map((r) => (
                  <div key={r.metric} className="flex items-baseline justify-between gap-3">
                    <dt className="text-fg-subtle">{r.label}</dt>
                    <dd className="shrink-0 text-right">
                      <span className="font-semibold">{r.total}</span>
                      {r.amount !== null && Number(r.amount) > 0 && (
                        <span className="text-fg-subtle"> · {formatMoneyCompact(r.amount)}</span>
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
          </article>
        ))}
        {companies.length === 0 && (
          <p className="text-sm text-fg-subtle">Chưa có hoạt động nào trên hệ thống.</p>
        )}
      </div>
    </section>
  );
}

// --- 4. Tài chính tháng này theo công ty --------------------------------------------------------
function FinanceByCompanyTable({ companies }: { companies: Company[] }) {
  const { data, isLoading, error } = useFinanceThisMonthByCompany();
  if (isLoading || error || companies.length === 0) return null;
  const cols: { id: string | null; name: string; short: string }[] = [
    ...companies.map((c) => ({ id: c.id, name: c.name, short: c.code })),
    { id: null, name: 'Cả tập đoàn', short: 'Tổng' },
  ];
  const get = (id: string | null) =>
    data?.get(id) ?? { revenue: 0n, signed: 0n, collected: 0n, paidOut: 0n };
  const rows: { label: string; pick: (f: ReturnType<typeof get>) => bigint }[] = [
    { label: 'Doanh thu (nghiệm thu + cho thuê)', pick: (f) => f.revenue },
    { label: 'Hợp đồng ký mới', pick: (f) => f.signed },
    { label: 'Đã thu', pick: (f) => f.collected },
    { label: 'Đã chi', pick: (f) => f.paidOut },
    { label: 'Dòng tiền ròng (thu – chi)', pick: (f) => f.collected - f.paidOut },
  ];
  return (
    <section
      aria-label="Tài chính tháng này"
      className="rounded-md border border-border bg-surface"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-semibold">Tài chính tháng này</h2>
        <Link
          to="/bc/tong-quan"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          Báo cáo tài chính đầy đủ <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              <th scope="col" className="px-4 py-2 font-medium">
                Chỉ số
              </th>
              {cols.map((c) => (
                <th key={c.id ?? 'all'} scope="col" className="px-3 py-2 text-right font-medium">
                  <span className="sm:hidden" aria-hidden>
                    {c.short}
                  </span>
                  <span className="max-sm:sr-only">{c.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  {r.label}
                </th>
                {cols.map((c) => (
                  <td
                    key={c.id ?? 'all'}
                    className={cn(
                      'px-3 py-2 text-right tabular-nums',
                      c.id === null && 'font-semibold',
                    )}
                  >
                    {formatMoneyCompact(r.pick(get(c.id)))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-fg-subtle">
        Cột «Cả tập đoàn» chưa loại giao dịch nội bộ giữa các pháp nhân (ví dụ NVC thuê giàn giáo
        của NVS) — hệ thống chưa đánh dấu được giao dịch nội bộ.
      </p>
    </section>
  );
}

function CompanyChip({ code }: { code: string }) {
  return (
    <span className="shrink-0 rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-fg-subtle">
      {code}
    </span>
  );
}
