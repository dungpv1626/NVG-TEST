/**
 * Khối «Tiêu điểm» — Tổng giám đốc nhìn ÍT mà ra vấn đề ngay (phản hồi chủ dự án: Dashboard
 * «phải nhìn quá nhiều thứ cùng cấp bậc nên bị loạn»).
 *
 * Phân cấp, không xếp ngang hàng:
 *   Tầng 1 — một câu kết luận cỡ lớn: «N việc cần xử lý ngay» hoặc ✓ «không có việc quá hạn».
 *   Tầng 2 — tối đa 5 dòng vấn đề (công ty · mảng · số hồ sơ), bấm là tới đúng danh sách của
 *            công ty đó; cạnh đó hai số phụ: chờ quyết định, dòng tiền ròng tháng này.
 * Mọi thứ khác (thẻ phân hệ, biểu đồ theo kỳ) nằm dưới, thu gọn — xem `dashboard.tsx`.
 *
 * Cùng nguồn với Tổng quan điều hành (`exec_overview_by_company`): một quy tắc «quá hạn» cho
 * cả hai nơi, không đếm lại ở trình duyệt.
 */

import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Inbox, Wallet } from 'lucide-react';
import { formatMoneyCompact } from '@nvg/shared/bc-series';
import { usePendingApprovals } from '@/hooks/use-approvals';
import {
  useExecOverviewByCompany,
  useFinanceThisMonthByCompany,
  type ExecCompanyTile,
} from '@/hooks/use-exec-overview';
import { useCompanyStore } from '@/lib/company-store';
import { cn } from '@/lib/utils';

const MAX_ROWS = 5;

export function ExecFocus({ showPending }: { showPending: boolean }) {
  const navigate = useNavigate();
  const setCompany = useCompanyStore((s) => s.setSelectedCompany);
  const { data, isLoading } = useExecOverviewByCompany();
  const pending = usePendingApprovals();
  const finance = useFinanceThisMonthByCompany();

  const problems = (data ?? [])
    .filter((t) => t.level === 'red' || t.level === 'amber')
    .sort((a, b) =>
      a.level === b.level ? (b.total ?? 0) - (a.total ?? 0) : a.level === 'red' ? -1 : 1,
    );
  const urgent = problems.filter((t) => t.level === 'red');
  const pendingCount = pending.data?.length ?? 0;
  const all = finance.data?.get(null);

  function open(t: ExecCompanyTile) {
    if (!t.link) return;
    setCompany(t.company_id);
    void navigate(t.link);
  }

  if (isLoading) {
    return <div className="mb-6 h-40 animate-pulse rounded-lg bg-surface-hover" aria-hidden />;
  }

  return (
    <section
      aria-label="Tiêu điểm"
      className="mb-6 grid gap-4 rounded-lg border border-border bg-surface p-5 lg:grid-cols-[1fr_auto]"
    >
      <div className="min-w-0">
        {/* Tầng 1 — một câu, đủ to để đọc trong một giây. */}
        {urgent.length > 0 ? (
          <p className="text-2xl font-bold text-status-overdue">
            {urgent.length} việc cần xử lý ngay
          </p>
        ) : problems.length > 0 ? (
          <p className="text-2xl font-bold text-status-pending">{problems.length} việc cần chú ý</p>
        ) : (
          <p className="flex items-center gap-2 text-2xl font-bold text-status-completed">
            <Check className="size-7" aria-hidden /> Không có việc nào quá hạn
          </p>
        )}

        {/* Tầng 2 — chỉ vấn đề, mỗi vấn đề một dòng. */}
        {problems.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {problems.slice(0, MAX_ROWS).map((t) => (
              <li key={`${t.company_id}-${t.key}`}>
                <button
                  type="button"
                  onClick={() => open(t)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-2.5 shrink-0 rounded-full',
                      t.level === 'red' ? 'bg-status-overdue' : 'bg-status-pending',
                    )}
                  />
                  <span className="w-10 shrink-0 font-mono text-xs font-semibold text-fg-subtle">
                    {t.company_code}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{t.total}</span>
                  <span className="sr-only">{t.level === 'red' ? 'cần xử lý' : 'cần chú ý'}</span>
                  <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/tong-quan"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          {problems.length > MAX_ROWS
            ? `Xem cả ${problems.length} vấn đề ở Tổng quan điều hành`
            : 'Xem theo từng công ty ở Tổng quan điều hành'}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* Hai số phụ — nhỏ hơn câu kết luận, đứng bên phải. */}
      <dl className="flex gap-3 lg:flex-col">
        {showPending && (
          <Link
            to="/viec-can-lam"
            className="flex min-w-40 items-center gap-3 rounded-md bg-surface-sunken px-3 py-2 hover:bg-surface-hover"
          >
            <Inbox className="size-5 text-brand" aria-hidden />
            <span>
              <dt className="text-xs text-fg-subtle">Chờ quyết định</dt>
              <dd className="text-xl font-bold tabular-nums">{pendingCount}</dd>
            </span>
          </Link>
        )}
        {all && (
          <div className="flex min-w-40 items-center gap-3 rounded-md bg-surface-sunken px-3 py-2">
            <Wallet className="size-5 text-brand" aria-hidden />
            <span>
              <dt className="text-xs text-fg-subtle">Dòng tiền ròng tháng này</dt>
              <dd className="text-xl font-bold tabular-nums">
                {formatMoneyCompact(all.collected - all.paidOut)}
              </dd>
            </span>
          </div>
        )}
      </dl>
    </section>
  );
}
