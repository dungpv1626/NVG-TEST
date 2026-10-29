/**
 * Các hợp đồng của một cơ hội qua mọi đường (cơ hội, gói thầu, hồ sơ thiết kế) — 0243.
 *
 * Một cơ hội có tối đa một hợp đồng thiết kế + một hợp đồng thi công, hoặc một hợp đồng trọn gói.
 * CSDL trả cả hợp đồng người dùng không xem được (không có `contract_id`) để màn hình biết còn soạn
 * được loại nào mà không lộ nội dung (cùng lý lẽ `opportunity_has_contract`, 0159).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractScopeKind, ContractStage } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface GroupContractRow {
  /** Rỗng khi người dùng không xem được hợp đồng này. */
  contract_id: string | null;
  code: string;
  title: string | null;
  scope_kind: ContractScopeKind | null;
  stage: ContractStage;
  source_type: string | null;
}

export function useContractGroup(
  entityType: 'opportunity' | 'design' | 'bidding',
  id: string | undefined,
) {
  return useQuery<GroupContractRow[], Error>({
    queryKey: ['contract-group', entityType, id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contract_group_contracts', {
        p_entity_type: entityType,
        p_id: id!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as GroupContractRow[];
    },
    enabled: Boolean(id),
  });
}

export interface HandoverContractRow {
  contract_id: string | null;
  code: string;
  scope_kind: ContractScopeKind;
  stage: ContractStage;
  signed: boolean;
}

/** Hợp đồng thi công / trọn gói mở cổng bàn giao thiết kế → thi công (0243). */
export function useDesignHandoverContracts(designProjectId: string | undefined) {
  return useQuery<HandoverContractRow[], Error>({
    queryKey: ['contract-group', 'handover', designProjectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('design_handover_contracts', {
        p_design_project_id: designProjectId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as HandoverContractRow[];
    },
    enabled: Boolean(designProjectId),
  });
}

/** «Chỉ thiết kế»: khách chỉ mua thiết kế — hợp đồng thiết kế ký là thắng cơ hội (0243). */
export function useMarkDesignOnly() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { opportunityId: string; reason: string | null }>({
    mutationFn: async ({ opportunityId, reason }) => {
      const { error } = await supabase.rpc('mark_opportunity_design_only', {
        p_opportunity_id: opportunityId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: ['contract-group'] });
      void queryClient.invalidateQueries({ queryKey: ['record-chain'] });
    },
  });
}
