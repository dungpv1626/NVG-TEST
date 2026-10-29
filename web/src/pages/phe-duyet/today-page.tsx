/**
 * Việc hôm nay (v2, màn 1.4) — một nơi cho mọi việc đang chờ chính người dùng: khách cần liên hệ
 * (CRM, Đợt 1 — 1C), hồ sơ chờ mình duyệt, hồ sơ mình đã gửi còn đang chờ người khác.
 *
 * Chỉ ĐỌC và dẫn đi: duyệt vẫn ở trang Phê duyệt (`/viec-can-lam`), ghi chăm sóc vẫn ở hồ sơ khách.
 * Trang đầu của từng vai trò KHÔNG đổi (`roles.default_route`) — muốn Kinh doanh vào thẳng đây thì
 * đổi dữ liệu vai trò, không đổi mã.
 */

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BID_REVIEW_DEPARTMENT_LABELS, formatDeadline, formatWaiting } from '@nvg/shared';
import { TodayFollowups } from '@/components/crm/today-followups';
import { WaitingOn } from '@/components/entity/waiting-on';
import { PageHeader } from '@/components/layout/app-shell';
import { useApprovalBox, usePendingApprovals } from '@/hooks/use-approvals';
import { useBidReviews } from '@/hooks/use-bid-participation';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';

/** Số hồ sơ hiện thẳng trên trang này — còn lại xem ở trang Phê duyệt. */
const PREVIEW_LIMIT = 4;

export function TodayPage() {
  const canSeeCrm = useCan('CRM');
  const { data: pending, isLoading: loadingPending } = usePendingApprovals();
  const { data: sent, isLoading: loadingSent } = useApprovalBox('sent');
  const sentWaiting = (sent ?? []).filter((r) => r.status === 'pending_approval');
  // 0247: gói thầu xin ý kiến phòng mình (Cung ứng / Thi công / Kế toán) — chỉ hiện khi có.
  const { data: reviews } = useBidReviews();
  const reviewsWaiting = (reviews ?? []).filter((r) => r.can_respond && r.status === 'cho_y_kien');

  return (
    <>
      <PageHeader
        title="Việc hôm nay"
        description="Những việc đang chờ chính mình: khách cần liên hệ, hồ sơ chờ duyệt, hồ sơ mình đã gửi."
        breadcrumbs={[{ label: 'Việc hôm nay' }]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {canSeeCrm && (
          <section className="xl:col-span-2">
            <TodayFollowups />
          </section>
        )}

        {reviewsWaiting.length > 0 && (
          <section
            className="rounded-card bg-surface p-5 xl:col-span-2"
            aria-labelledby="y-kien-goi-thau"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="y-kien-goi-thau" className="text-md font-semibold">
                Gói thầu cần ý kiến của phòng · {reviewsWaiting.length}
              </h2>
              <Link
                to="/y-kien-goi-thau"
                className="flex items-center gap-1 font-medium text-brand hover:underline"
              >
                Xem tất cả <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="divide-y divide-line-soft">
              {reviewsWaiting.slice(0, PREVIEW_LIMIT).map((r) => (
                <li key={r.id} className="py-2.5">
                  <Link
                    to={`/y-kien-goi-thau/${r.id}`}
                    className="font-semibold text-ink underline-offset-2 hover:underline"
                  >
                    {r.bid_code} — {r.bid_name}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-subtle">
                    Phòng {BID_REVIEW_DEPARTMENT_LABELS[r.department]} ·{' '}
                    {formatWaiting(r.requested_at)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-card bg-surface p-5" aria-labelledby="cho-toi-duyet">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="cho-toi-duyet" className="text-md font-semibold">
              Chờ tôi duyệt{pending?.length ? ` · ${pending.length}` : ''}
            </h2>
            <Link
              to="/viec-can-lam"
              className="flex items-center gap-1 font-medium text-brand hover:underline"
            >
              Mở Phê duyệt <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {loadingPending ? (
            <p className="text-ink-subtle">Đang tải…</p>
          ) : !pending?.length ? (
            <p className="text-ink-subtle">Không có hồ sơ nào chờ duyệt.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {pending.slice(0, PREVIEW_LIMIT).map((row) => {
                const overdue = row.due_at != null && new Date(row.due_at).getTime() < Date.now();
                return (
                  <li key={row.id} className="py-2.5">
                    <Link
                      to={`/viec-can-lam/${row.id}`}
                      className="font-semibold text-ink underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-subtle">
                      <span>{row.requested_by_name ?? '—'}</span>
                      {row.due_at && (
                        <span className={cn(overdue && 'font-medium text-status-overdue')}>
                          {formatDeadline(row.due_at)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-card bg-surface p-5" aria-labelledby="toi-da-gui">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="toi-da-gui" className="text-md font-semibold">
              Tôi đã gửi, đang chờ{sentWaiting.length ? ` · ${sentWaiting.length}` : ''}
            </h2>
            <Link
              to="/viec-can-lam?o=toi-da-gui"
              className="flex items-center gap-1 font-medium text-brand hover:underline"
            >
              Xem tất cả <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {loadingSent ? (
            <p className="text-ink-subtle">Đang tải…</p>
          ) : sentWaiting.length === 0 ? (
            <p className="text-ink-subtle">Không có hồ sơ nào của mình đang chờ người khác.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {sentWaiting.slice(0, PREVIEW_LIMIT).map((row) => (
                <li key={row.id} className="space-y-1.5 py-2.5">
                  <div className="font-semibold">{row.title}</div>
                  <WaitingOn approvalId={row.id} canNudge />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
