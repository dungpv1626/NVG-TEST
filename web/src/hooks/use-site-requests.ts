/**
 * TC-10 — theo dõi đề nghị từ công trường và «Thúc» (migration 0134).
 *
 * Dữ liệu là HÀM TÍNH `site_request_tracker`, không phải bảng: bước, người giữ, chờ từ lúc nào
 * đều suy từ chứng từ gốc (đề nghị mua, phê duyệt, đơn hàng). Chỉ lịch sử «Thúc» là bảng.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type RequestHolderKind = 'requester' | 'approver' | 'purchasing';

export interface SiteRequestRow {
  entity_type: 'purchase_requests';
  entity_id: string;
  code: string | null;
  title: string;
  site_id: string;
  site_code: string;
  site_name: string;
  company_id: string;
  requested_by: string | null;
  requested_by_name: string | null;
  needed_date: string | null;
  urgency: string;
  stage: string;
  is_closed: boolean;
  holder_kind: RequestHolderKind | null;
  holder_label: string | null;
  holder_ids: string[];
  holder_names: string[];
  waiting_since: string | null;
  /** Rỗng khi chưa khai thời hạn cam kết — giao diện không hiện đồng hồ. */
  due_at: string | null;
  promised_date: string | null;
  last_nudged_at: string | null;
  nudge_count: number;
  next_nudge_at: string | null;
  created_at: string;
}

export interface RequestReminder {
  id: string;
  nudged_at: string;
  stage_at_nudge: string;
  waited_hours: number | null;
  note: string | null;
  nudger: { full_name: string } | null;
}

const TRACKER_KEY = ['site-requests'] as const;

export function useSiteRequestTracker(options: { siteId?: string; mineOnly?: boolean } = {}) {
  const { siteId, mineOnly = false } = options;
  return useQuery<SiteRequestRow[], Error>({
    queryKey: [...TRACKER_KEY, siteId ?? 'all', mineOnly],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_request_tracker', {
        p_site_id: siteId ?? null,
        p_mine_only: mineOnly,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as SiteRequestRow[];
    },
  });
}

export function useRequestReminders(entityId: string | undefined) {
  return useQuery<RequestReminder[], Error>({
    queryKey: ['request-reminders', entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('request_reminders')
        .select(
          'id, nudged_at, stage_at_nudge, waited_hours, note, nudger:users!nudged_by(full_name)',
        )
        .eq('entity_id', entityId!)
        .order('nudged_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RequestReminder[];
    },
    enabled: Boolean(entityId),
  });
}

export function useNudgeRequest() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, { entityId: string; note?: string }>({
    mutationFn: async ({ entityId, note }) => {
      const { data, error } = await supabase.rpc('nudge_request', {
        p_entity_type: 'purchase_requests',
        p_entity_id: entityId,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, { entityId }) => {
      void queryClient.invalidateQueries({ queryKey: TRACKER_KEY });
      void queryClient.invalidateQueries({ queryKey: ['request-reminders', entityId] });
    },
  });
}
