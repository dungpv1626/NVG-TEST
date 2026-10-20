/**
 * «Chăm sóc khách» trên trang Việc cần làm (Đợt 1 — 1C).
 *
 * Ba nhóm theo ngày: Quá hạn · Hôm nay · Sắp tới (7 ngày). Mỗi dòng là một khách — tên, việc
 * phải làm, hẹn ngày — bấm vào là tới đúng chỗ ghi lần liên hệ tiếp theo. Khách không bị bỏ quên
 * vì không ai phải nhớ trong đầu.
 */

import { Link } from 'react-router-dom';
import { daysUntil, formatDate } from '@nvg/shared';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useMyFollowups, type FollowupItem } from '@/hooks/use-leads';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<FollowupItem['kind'], string> = {
  lead_first_contact: 'Đầu mối mới',
  lead_followup: 'Đầu mối',
  lead_recontact: 'Đầu mối chưa có nhu cầu',
  opportunity_followup: 'Cơ hội',
  customer_followup: 'Khách cũ',
};

export function TodayFollowups() {
  const { data, isLoading, error, refetch } = useMyFollowups(7);

  if (isLoading) return <Skeleton className="mb-6 h-24" />;
  if (error) return <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />;

  const items = data ?? [];
  const overdue = items.filter((i) => (daysUntil(i.due_date) ?? 0) < 0);
  const today = items.filter((i) => daysUntil(i.due_date) === 0);
  const upcoming = items.filter((i) => (daysUntil(i.due_date) ?? 0) > 0);

  return (
    <section aria-labelledby="cham-soc-khach" className="mb-8">
      <h2 id="cham-soc-khach" className="mb-2 text-lg font-semibold">
        Chăm sóc khách
      </h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-fg-subtle">
          Không có khách nào cần liên hệ trong 7 ngày tới.
        </p>
      ) : (
        <div className="space-y-4">
          <Group title="Quá hạn" items={overdue} tone="overdue" />
          <Group title="Hôm nay" items={today} tone="today" />
          <Group title="Sắp tới" items={upcoming} tone="upcoming" />
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  items,
  tone,
}: {
  title: string;
  items: FollowupItem[];
  tone: 'overdue' | 'today' | 'upcoming';
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p
        className={cn(
          'mb-1 text-xs font-semibold',
          tone === 'overdue' ? 'text-status-overdue' : 'text-fg-subtle',
        )}
      >
        {title} · {items.length}
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {items.map((item) => {
          const days = daysUntil(item.due_date) ?? 0;
          return (
            <li key={`${item.kind}-${item.entity_id}`}>
              <Link to={item.path} className="block px-4 py-2.5 hover:bg-surface-hover">
                <span className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
                  <span>
                    {KIND_LABEL[item.kind]} · {item.company_code}
                  </span>
                  <span className={cn(days < 0 && 'font-semibold text-status-overdue')}>
                    {days < 0
                      ? `Quá hạn ${-days} ngày`
                      : days === 0
                        ? 'Hôm nay'
                        : `Hẹn ${formatDate(item.due_date)}`}
                  </span>
                </span>
                <span className="mt-0.5 block">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-fg-subtle"> — {item.action ?? 'Liên hệ tiếp'}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
