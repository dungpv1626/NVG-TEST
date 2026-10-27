/**
 * «Các lần chuyển bước» trong tab Lịch sử của hợp đồng / gói thầu / công trình (bảng `stage_transitions`, 0225).
 *
 * Mỗi dòng: bước cũ → bước mới (tên bước, không dùng nhãn trạng thái — nhiều bước cùng một nhóm trạng thái), ai đổi,
 * lúc nào, lý do nếu có. Lịch sử chỉ có từ 0225 (không dựng lùi từ `updated_at` — đoán ra là bịa), nên hồ sơ cũ hiện
 * câu nói rõ điều đó thay vì một danh sách trống.
 *
 * `stage` (bước hiện tại) nằm trong khoá truy vấn: hồ sơ đổi bước ở bất kỳ đâu thì lịch sử tự tải lại.
 */

import { useQuery } from '@tanstack/react-query';
import { formatDateTime, type StatusGroup } from '@nvg/shared';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { Skeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export type StageEntityType = 'contracts' | 'bidding_projects' | 'construction_sites';

interface StageMeta {
  readonly label: string;
  readonly statusGroup: StatusGroup;
}

export interface StageTransitionRecord {
  id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  changed_at: string;
  changed_by_user: { full_name: string } | null;
}

export function useStageTransitions(
  entityType: StageEntityType,
  entityId: string | undefined,
  stage: string | undefined,
) {
  return useQuery<StageTransitionRecord[], Error>({
    queryKey: ['stage_transitions', entityType, entityId, stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stage_transitions')
        .select(
          'id, from_stage, to_stage, note, changed_at, ' +
            'changed_by_user:users!stage_transitions_changed_by_fkey(full_name)',
        )
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as StageTransitionRecord[];
    },
    enabled: Boolean(entityId),
  });
}

export function StageHistory({
  entityType,
  entityId,
  stage,
  meta,
  negativeStages = [],
}: {
  entityType: StageEntityType;
  entityId: string;
  /** Bước hiện tại của hồ sơ — đổi thì tải lại. */
  stage: string;
  meta: Readonly<Record<string, StageMeta>>;
  /** Bước kết thúc không thành (hủy, trượt thầu…) — chấm đỏ thay vì xanh. */
  negativeStages?: readonly string[];
}) {
  const history = useStageTransitions(entityType, entityId, stage);
  const label = (s: string) => meta[s]?.label ?? s;

  return (
    <section aria-labelledby={`lich-su-buoc-${entityId}`} className="space-y-3">
      <h3 id={`lich-su-buoc-${entityId}`} className="font-semibold">
        Các lần chuyển bước
      </h3>
      {history.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : history.isError ? (
        <p className="text-status-overdue">{toUserMessage(history.error)}</p>
      ) : (history.data ?? []).length === 0 ? (
        <p className="text-fg-subtle">
          Chưa có lần chuyển bước nào được ghi. Hệ thống ghi từng lần chuyển bước từ ngày
          27/10/2026; với hồ sơ cũ hơn, các mốc chính ở trên là phần lịch sử còn lại.
        </p>
      ) : (
        <ol className="space-y-3">
          {history.data!.map((h) => (
            <li key={h.id} className="flex gap-3">
              <div
                aria-hidden
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  negativeStages.includes(h.to_stage) ? 'bg-status-overdue' : 'bg-brand',
                )}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {h.from_stage ? (
                    <>
                      <span className="text-fg-subtle">{label(h.from_stage)}</span>
                      <span className="text-fg-subtle" aria-label="sang">
                        →
                      </span>
                    </>
                  ) : (
                    <span className="text-fg-subtle">Tạo hồ sơ ở bước</span>
                  )}
                  <span className="font-medium">{label(h.to_stage)}</span>
                  {meta[h.to_stage] && <StatusLozenge status={meta[h.to_stage]!.statusGroup} />}
                </div>
                <div className="text-xs text-fg-subtle">
                  {h.changed_by_user?.full_name ?? 'Hệ thống'} · {formatDateTime(h.changed_at)}
                </div>
                {h.note && <p className="mt-0.5">{h.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
