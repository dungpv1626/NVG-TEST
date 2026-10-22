/**
 * Đợt thu của hợp đồng gắn mốc / biên bản (Đợt 3 — 3A, migration 0195).
 *
 * Kế toán và Kinh doanh không xem được phân hệ Thi công, nên tên mốc / biên bản đi qua hai hàm
 * CSDL: `contract_collection_targets` (căn cứ chọn được của MỘT hợp đồng, theo quyền xem hợp
 * đồng) và `kt_collection_schedule` (danh sách đợt thu của Kế toán, theo quyền xem Kế toán).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyValue } from '@nvg/shared';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export type CollectionState = 'den_han' | 'sap_den' | 'chua_den' | 'da_xong';

export interface CollectionScheduleRow {
  term_id: string;
  company_id: string;
  contract_id: string;
  contract_code: string;
  contract_number: string | null;
  contract_title: string;
  customer_name: string;
  responsible_name: string | null;
  term_type: string;
  description: string;
  amount: MoneyValue | null;
  due_date: string | null;
  completed_at: string | null;
  basis_kind: 'moc' | 'bien_ban' | null;
  basis_label: string | null;
  basis_reached_at: string | null;
  site_code: string | null;
  acceptance_record_id: string | null;
  collection_due_at: string | null;
  state: CollectionState;
}

export function useCollectionSchedule() {
  const scope = useCompanyScope();
  return useQuery<CollectionScheduleRow[], Error>({
    queryKey: ['kt-collection-schedule', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kt_collection_schedule', {
        // «Toàn NVG» bỏ điều kiện lọc, hàm tự giới hạn theo pháp nhân người xem (CLAUDE.md 3.5).
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as CollectionScheduleRow[];
    },
    enabled: scope.isReady,
  });
}

export interface CollectionTarget {
  kind: 'moc' | 'bien_ban';
  id: string;
  label: string;
  site_code: string;
  reached: boolean;
  reached_at: string | null;
}

export function useContractCollectionTargets(contractId: string | undefined, enabled = true) {
  return useQuery<CollectionTarget[], Error>({
    queryKey: ['contract-collection-targets', contractId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contract_collection_targets', {
        p_contract_id: contractId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as CollectionTarget[];
    },
    enabled: Boolean(contractId) && enabled,
  });
}

export function useLinkCollectionTerm() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { termId: string; contractId: string; target: { kind: 'moc' | 'bien_ban'; id: string } | null }
  >({
    mutationFn: async ({ termId, target }) => {
      const { error } = await supabase.rpc('link_collection_term', {
        p_term_id: termId,
        p_milestone_id: target?.kind === 'moc' ? target.id : null,
        p_acceptance_id: target?.kind === 'bien_ban' ? target.id : null,
      });
      if (error) throw error;
    },
    onSuccess: (_v, { contractId }) => {
      void queryClient.invalidateQueries({ queryKey: ['contract_terms', contractId] });
      void queryClient.invalidateQueries({ queryKey: ['kt-collection-schedule'] });
    },
  });
}
