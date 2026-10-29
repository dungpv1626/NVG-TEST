/**
 * Đánh dấu đầu việc tuần này trong nhật ký ngày (T3, migration 0242).
 *
 * Ngân sách thao tác công trường là tiêu chí nghiệm thu (CLAUDE.md 4.6, 5–10 phút / ngày): mỗi đầu
 * việc đã làm hôm nay = MỘT chạm. Khối lượng hôm nay và «Xong» chỉ hiện sau khi chạm, đều tuỳ chọn —
 * không có ô bắt buộc mới nào. Tuần chưa lập kế hoạch thì khối này không hiện.
 */

import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { formatNumber } from '@nvg/shared';
import { Input } from '@/components/ui/input';
import { useSitePlanItems, type PlanTick } from '@/hooks/use-site-plan';
import { cn } from '@/lib/utils';

export type PlanTicks = Record<string, { qty: string; done: boolean }>;

export function ticksToRows(ticks: PlanTicks): PlanTick[] {
  return Object.entries(ticks).map(([planItemId, t]) => {
    const n = t.qty.trim() ? Number(t.qty.replace(',', '.')) : null;
    return {
      planItemId,
      quantityDone: n != null && Number.isFinite(n) && n >= 0 ? n : null,
      markedDone: t.done,
    };
  });
}

export function PlanTickList({
  siteId,
  weekStart,
  ticks,
  onChange,
  disabled,
  className,
}: {
  siteId: string;
  weekStart: string;
  ticks: PlanTicks;
  onChange: (ticks: PlanTicks) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { data: items, isSuccess } = useSitePlanItems(siteId, weekStart);
  const open = (items ?? []).filter((i) => i.status === 'dang_lam' || ticks[i.id]);

  // Đổi ngày ghi sang tuần khác: bỏ dấu của đầu việc không thuộc tuần đó.
  useEffect(() => {
    if (!isSuccess) return;
    const ids = new Set((items ?? []).map((i) => i.id));
    const stale = Object.keys(ticks).filter((id) => !ids.has(id));
    if (stale.length > 0) {
      const next = { ...ticks };
      for (const id of stale) delete next[id];
      onChange(next);
    }
  }, [isSuccess, items, ticks, onChange]);

  if (open.length === 0) return null;

  return (
    <fieldset className={cn('rounded-sm bg-surface-sunken p-3', className)} disabled={disabled}>
      <legend className="sr-only">Đầu việc tuần này đã làm hôm nay</legend>
      <p className="mb-2 text-sm">
        <span className="font-medium">Đầu việc tuần này đã làm hôm nay</span>
        <span className="text-fg-subtle"> — chạm để đánh dấu, không bắt buộc.</span>
      </p>
      <ul className="space-y-2">
        {open.map((item) => {
          const t = ticks[item.id];
          const toggle = () => {
            const next = { ...ticks };
            if (t) delete next[item.id];
            else next[item.id] = { qty: '', done: false };
            onChange(next);
          };
          return (
            <li key={item.id} className="rounded-sm bg-surface">
              <button
                type="button"
                aria-pressed={Boolean(t)}
                onClick={toggle}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 rounded-sm border px-3 py-2 text-left',
                  t ? 'border-shell' : 'border-border',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex size-5 shrink-0 items-center justify-center rounded-sm border',
                    t ? 'border-shell bg-shell text-fg-inverse' : 'border-border-strong',
                  )}
                >
                  {t && <Check className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.name}</span>
                  <span className="block text-xs text-fg-subtle">
                    {item.crew?.name ?? item.assignee?.full_name ?? 'Chưa giao'}
                    {item.target_quantity != null
                      ? ` · mục tiêu ${formatNumber(Number(item.target_quantity), 3)} ${item.quantity_unit ?? ''}`
                      : ''}
                  </span>
                </span>
              </button>
              {t && (
                <div className="flex flex-wrap items-center gap-3 px-3 pb-2 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-fg-subtle">Hôm nay làm được</span>
                    <Input
                      value={t.qty}
                      inputMode="decimal"
                      className="w-24"
                      aria-label={`Khối lượng hôm nay — ${item.name}`}
                      onChange={(e) =>
                        onChange({
                          ...ticks,
                          [item.id]: { ...t, qty: e.target.value.replace(/[^\d.,]/g, '') },
                        })
                      }
                    />
                    {item.quantity_unit && <span>{item.quantity_unit}</span>}
                  </label>
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={t.done}
                      onChange={(e) =>
                        onChange({ ...ticks, [item.id]: { ...t, done: e.target.checked } })
                      }
                    />
                    Xong đầu việc này
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
