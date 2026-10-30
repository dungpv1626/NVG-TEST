/**
 * Tab «Kế hoạch tuần» của công trình (T3, migration 0242).
 *
 * Đầu tuần chỉ huy trưởng lập đầu việc: tên ngắn, tổ đội / người, khối lượng mục tiêu, mốc. Ưu tiên
 * chọn từ gợi ý thay gõ (CLAUDE.md 4.6): tên đầu việc đã dùng, tổ đội của công trình, mốc chưa đạt.
 * «Chép việc chưa xong của tuần trước» một lần bấm. Hằng ngày chỉ đánh dấu trong nhật ký — không phải
 * vào tab này.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import {
  SITE_PLAN_STATUS_LABELS,
  addDaysIso,
  formatDate,
  formatNumber,
  planProgressPercent,
  toNvgDateInput,
  weekStartOf,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FIELD_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useSubcontractors } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useCopyUnfinishedPlanItems,
  useCreateSitePlanItem,
  useSitePlanItems,
  useSitePlanNameSuggestions,
  useRemoveSitePlanItem,
  useUpdateSitePlanItem,
  type SitePlanItem,
} from '@/hooks/use-site-plan';
import { useSiteMilestones } from '@/hooks/use-site-milestones';
import { cn } from '@/lib/utils';
import { useCommanderCandidates } from './site-prep-card';

const UNITS = ['m3', 'm2', 'md', 'tấn', 'kg', 'cái', 'bộ'];

/** Tổng khối lượng đã ghi trong nhật ký cho một đầu việc — chưa ghi số nào thì null. */
export function doneQuantity(item: Pick<SitePlanItem, 'progress'>): number | null {
  const nums = item.progress.map((p) => p.quantity_done).filter((v): v is number => v != null);
  return nums.length === 0 ? null : nums.reduce((a, b) => a + Number(b), 0);
}

function weekLabel(start: string) {
  return `Tuần ${formatDate(start)} – ${formatDate(addDaysIso(start, 6))}`;
}

interface Draft {
  name: string;
  assignee: string;
  target: string;
  unit: string;
  milestoneId: string;
  note: string;
}
const EMPTY: Draft = { name: '', assignee: '', target: '', unit: '', milestoneId: '', note: '' };

export function SiteWeekPlanPanel({
  siteId,
  companyId,
  readOnly,
}: {
  siteId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const thisWeek = weekStartOf(toNvgDateInput(new Date()));
  const [week, setWeek] = useState(thisWeek);
  const { data: items, isLoading } = useSitePlanItems(siteId, week);
  const { data: lastWeekItems } = useSitePlanItems(siteId, addDaysIso(week, -7));
  const { data: names } = useSitePlanNameSuggestions(siteId);
  const { data: crews } = useSubcontractors(siteId);
  const { data: people } = useCommanderCandidates(companyId);
  const { data: milestones } = useSiteMilestones(siteId);
  const create = useCreateSitePlanItem();
  const update = useUpdateSitePlanItem();
  const remove = useRemoveSitePlanItem();
  const copy = useCopyUnfinishedPlanItems();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const list = useMemo(() => items ?? [], [items]);
  const copiedIds = new Set(list.map((i) => i.copied_from_id).filter(Boolean));
  const unfinishedLast = (lastWeekItems ?? []).filter(
    (i) => i.status === 'dang_lam' && !copiedIds.has(i.id),
  );
  const openMilestones = (milestones ?? []).filter((m) => m.status !== 'dat');
  const nameChips = useMemo(() => {
    const here = new Set(list.map((i) => i.name.toLocaleLowerCase('vi')));
    const q = draft.name.trim().toLocaleLowerCase('vi');
    return (names ?? [])
      .filter((n) => !here.has(n.name.toLocaleLowerCase('vi')))
      .filter((n) => !q || n.name.toLocaleLowerCase('vi').includes(q))
      .slice(0, 8);
  }, [names, list, draft.name]);

  async function run(fn: () => Promise<unknown>, action: 'create' | 'edit' = 'edit') {
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (e) {
      setError(toUserMessage(e, action));
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError('Vui lòng nhập tên đầu việc.');
      return;
    }
    const target = draft.target.trim() ? Number(draft.target.replace(',', '.')) : null;
    if (target != null && !(target >= 0)) {
      setError('Khối lượng mục tiêu phải là số không âm.');
      return;
    }
    await run(async () => {
      await create.mutateAsync({
        construction_site_id: siteId,
        company_id: companyId,
        week_start: week,
        position: list.length + 1,
        name: draft.name.trim(),
        subcontractor_id: draft.assignee.startsWith('t:') ? draft.assignee.slice(2) : null,
        assigned_user_id: draft.assignee.startsWith('u:') ? draft.assignee.slice(2) : null,
        target_quantity: target,
        quantity_unit: draft.unit.trim() || null,
        site_milestone_id: draft.milestoneId || null,
        note: draft.note.trim() || null,
      });
      // Giữ tổ đội + mốc cho đầu việc tiếp theo — thường cùng một tổ, cùng một mốc.
      setDraft((d) => ({ ...EMPTY, assignee: d.assignee, milestoneId: d.milestoneId }));
    }, 'create');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="subtle"
          aria-label="Tuần trước"
          onClick={() => setWeek(addDaysIso(week, -7))}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-[13rem] text-center font-medium">
          {weekLabel(week)}
          {week === thisWeek ? ' (tuần này)' : ''}
        </span>
        <Button
          variant="subtle"
          aria-label="Tuần sau"
          disabled={week > thisWeek}
          onClick={() => setWeek(addDaysIso(week, 7))}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="rounded-sm bg-status-completed-bg px-3 py-2 text-sm">
          {info}
        </p>
      )}

      {!readOnly && unfinishedLast.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-surface p-4">
          <p className="min-w-0 flex-1 text-sm">
            Tuần trước còn {unfinishedLast.length} đầu việc chưa xong.
          </p>
          <Button
            variant="secondary"
            disabled={copy.isPending}
            onClick={() =>
              void run(async () => {
                const n = await copy.mutateAsync({ siteId, weekStart: week });
                setInfo(
                  `Đã chép ${n} đầu việc sang tuần này — khối lượng mục tiêu là phần còn lại.`,
                );
              }, 'create')
            }
          >
            <Copy className="size-4" aria-hidden />
            Chép việc chưa xong của tuần trước
          </Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-24" />
      ) : list.length === 0 ? (
        <EmptyState message="Tuần này chưa có đầu việc. Thêm đầu việc cho từng tổ đội để nhật ký ngày chỉ cần đánh dấu việc đã làm." />
      ) : (
        <ul className="space-y-2">
          {list.map((item) => {
            const done = doneQuantity(item);
            const pct = planProgressPercent({
              target_quantity: item.target_quantity,
              done_quantity: done,
            });
            return (
              <li key={item.id} className="rounded-card bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">{item.name}</span>
                  <span
                    className={cn(
                      'text-sm',
                      item.status === 'xong' ? 'text-status-completed' : 'text-fg-subtle',
                    )}
                  >
                    {SITE_PLAN_STATUS_LABELS[item.status]}
                  </span>
                </div>
                <p className="text-sm text-fg-subtle">
                  {[
                    item.crew?.name ?? item.assignee?.full_name ?? 'Chưa giao',
                    item.milestone ? `Mốc: ${item.milestone.label}` : null,
                    item.copied_from_id ? 'Chép từ tuần trước' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-sm">
                  Mục tiêu:{' '}
                  {item.target_quantity != null
                    ? `${formatNumber(Number(item.target_quantity), 3)} ${item.quantity_unit ?? ''}`
                    : 'không đặt'}{' '}
                  · Đã làm:{' '}
                  {done != null
                    ? `${formatNumber(done, 3)} ${item.quantity_unit ?? ''}${pct != null ? ` (${pct}%)` : ''}`
                    : item.progress.length > 0
                      ? `${new Set(item.progress.map((p) => p.site_log_id)).size} lần ghi, chưa ghi khối lượng`
                      : 'Chưa đủ dữ liệu'}
                </p>
                {item.note && <p className="text-sm text-fg-subtle">{item.note}</p>}
                {!readOnly && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={update.isPending}
                      onClick={() =>
                        void run(() =>
                          update.mutateAsync({
                            id: item.id,
                            changes: { status: item.status === 'xong' ? 'dang_lam' : 'xong' },
                          }),
                        )
                      }
                    >
                      {item.status === 'xong' ? 'Mở lại' : 'Đánh dấu xong'}
                    </Button>
                    {item.progress.length === 0 && (
                      <Button
                        variant="subtle"
                        disabled={remove.isPending}
                        onClick={() => void run(() => remove.mutateAsync(item.id))}
                      >
                        Bỏ đầu việc
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && (
        <form onSubmit={(e) => void add(e)} noValidate className="rounded-card bg-surface p-4">
          <p className="mb-3 font-medium">Thêm đầu việc</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tên đầu việc" required className="sm:col-span-2">
              <Input
                value={draft.name}
                maxLength={200}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Lắp dựng cốt thép móng M1–M6"
              />
            </Field>
            {nameChips.length > 0 && (
              <div className="flex flex-wrap gap-2 sm:col-span-2" aria-label="Đầu việc đã dùng">
                {nameChips.map((n) => (
                  <button
                    key={n.name}
                    type="button"
                    className="min-h-10 rounded-full bg-pill px-3 text-sm hover:bg-surface-sunken"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        name: n.name,
                        unit: d.unit || n.quantity_unit || '',
                      }))
                    }
                  >
                    {n.name}
                  </button>
                ))}
              </div>
            )}

            <Field label="Tổ đội / người làm" className="sm:col-span-2">
              <div className="flex flex-wrap gap-2">
                {(crews ?? []).map((c) => {
                  const v = `t:${c.id}`;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={draft.assignee === v}
                      onClick={() =>
                        setDraft((d) => ({ ...d, assignee: d.assignee === v ? '' : v }))
                      }
                      className={cn(
                        'min-h-10 rounded-full border px-3 text-sm',
                        draft.assignee === v
                          ? 'border-shell bg-shell text-fg-inverse'
                          : 'border-border-strong bg-surface',
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
                <select
                  value={draft.assignee.startsWith('u:') ? draft.assignee : ''}
                  onChange={(e) => setDraft((d) => ({ ...d, assignee: e.target.value }))}
                  className={cn(FIELD_BOX, 'min-w-[12rem]')}
                  aria-label="Người Thi công"
                >
                  <option value="">Người Thi công…</option>
                  {(people ?? []).map((u) => (
                    <option key={u.id} value={`u:${u.id}`}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              {(crews ?? []).length === 0 && (
                <p className="mt-1 text-xs text-fg-subtle">
                  Công trình chưa có tổ đội — thêm ở tab «Tổ đội».
                </p>
              )}
            </Field>

            <Field label="Khối lượng mục tiêu" hint="Tuỳ chọn.">
              <Input
                value={draft.target}
                inputMode="decimal"
                onChange={(e) =>
                  setDraft((d) => ({ ...d, target: e.target.value.replace(/[^\d.,]/g, '') }))
                }
              />
            </Field>
            <Field label="Đơn vị">
              <Input
                value={draft.unit}
                maxLength={32}
                onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    aria-pressed={draft.unit === u}
                    onClick={() => setDraft((d) => ({ ...d, unit: u }))}
                    className={cn(
                      'min-h-10 min-w-10 rounded-full border px-2 text-sm',
                      draft.unit === u
                        ? 'border-shell bg-shell text-fg-inverse'
                        : 'border-border bg-surface',
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Mốc liên quan" hint="Tuỳ chọn.">
              <select
                value={draft.milestoneId}
                onChange={(e) => setDraft((d) => ({ ...d, milestoneId: e.target.value }))}
                className={cn(FIELD_BOX, 'w-full')}
              >
                <option value="">Không gắn mốc</option>
                {openMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ghi chú" hint="Tuỳ chọn.">
              <Input
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Button type="submit" variant="primary" disabled={create.isPending}>
              Thêm đầu việc
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
