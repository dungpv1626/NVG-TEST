/**
 * Link gửi khách xem «Bộ ý tưởng» AI Design (B5, migration 0259).
 *
 * Mọi quyền do CSDL quyết: `design_concept_shares_for` trả trạng thái + nút nào hiện cho người gọi
 * (`can_approve`, `can_revoke`, `can_send`); ghi chỉ qua `request_ / approve_ / revoke_concept_share`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ConceptShareStatus = 'cho_duyet' | 'da_duyet' | 'het_han' | 'da_thu_hoi';

export interface ConceptShare {
  id: string;
  /** Chỉ có khi đã duyệt. */
  token: string | null;
  status: ConceptShareStatus;
  note: string | null;
  requested_by: string;
  requested_name: string | null;
  requested_at: string;
  approved_name: string | null;
  approved_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  can_approve: boolean;
  can_revoke: boolean;
  can_send: boolean;
}

export interface ConceptShareReadiness {
  can_request: boolean;
  reason: string | null;
  is_architect?: boolean;
}

export interface ConceptProjectContact {
  company_id: string;
  customer_id: string | null;
  opportunity_id: string | null;
}

export const CONCEPT_SHARE_STATUS_LABEL: Record<ConceptShareStatus, string> = {
  cho_duyet: 'Chờ kiến trúc sư duyệt',
  da_duyet: 'Đã duyệt',
  het_han: 'Hết hạn',
  da_thu_hoi: 'Đã thu hồi',
};

/** Địa chỉ khách mở — trang công khai `/xem-y-tuong/:token`. */
export function conceptShareUrl(token: string): string {
  return `${window.location.origin}/xem-y-tuong/${token}`;
}

export function useConceptShares(projectId: string) {
  return useQuery<{ shares: ConceptShare[]; readiness: ConceptShareReadiness }, Error>({
    queryKey: ['concept-shares', projectId],
    queryFn: async () => {
      const [list, ready] = await Promise.all([
        supabase.rpc('design_concept_shares_for', { p_project_id: projectId }),
        supabase.rpc('design_concept_share_readiness', { p_project_id: projectId }),
      ]);
      if (list.error) throw new Error(list.error.message);
      if (ready.error) throw new Error(ready.error.message);
      return {
        shares: (list.data ?? []) as ConceptShare[],
        readiness: (ready.data ?? { can_request: false, reason: null }) as ConceptShareReadiness,
      };
    },
    enabled: Boolean(projectId),
  });
}

/** Pháp nhân + khách của hồ sơ — để «Gửi qua Zalo» lấy số và tên công ty. */
export function useConceptProjectContact(projectId: string) {
  return useQuery<ConceptProjectContact | null, Error>({
    queryKey: ['concept-project-contact', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_projects')
        .select('company_id, customer_id, opportunity_id')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as ConceptProjectContact | null;
    },
    enabled: Boolean(projectId),
  });
}

function useShareMutation<V>(fn: (vars: V) => Promise<unknown>, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, V>({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['concept-shares', projectId] });
    },
  });
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export function useRequestConceptShare(projectId: string) {
  return useShareMutation(
    (note: string) =>
      rpc('request_concept_share', { p_project_id: projectId, p_note: note || null }),
    projectId,
  );
}

export function useApproveConceptShare(projectId: string) {
  return useShareMutation(
    (shareId: string) => rpc('approve_concept_share', { p_share_id: shareId }),
    projectId,
  );
}

export function useRevokeConceptShare(projectId: string) {
  return useShareMutation(
    (shareId: string) => rpc('revoke_concept_share', { p_share_id: shareId }),
    projectId,
  );
}
