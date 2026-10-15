/**
 * Chuỗi hồ sơ Cơ hội → Gói thầu / Thiết kế → Hợp đồng → Công trình (0159).
 *
 * CSDL chỉ trả hồ sơ người dùng được xem — hồ sơ ngoài quyền biến mất khỏi chuỗi, không hiện mờ
 * (CLAUDE.md 5.4).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ChainKind = 'opportunity' | 'bidding' | 'design' | 'contract' | 'site';

export interface ChainRecord {
  kind: ChainKind;
  id: string;
  code: string;
  title: string;
  stage: string;
}

export function useRecordChain(entityType: ChainKind, id: string | undefined) {
  return useQuery<ChainRecord[], Error>({
    queryKey: ['record-chain', entityType, id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('record_chain', {
        p_entity_type: entityType,
        p_id: id!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ChainRecord[];
    },
    enabled: Boolean(id),
  });
}

/** Cơ hội đã có hợp đồng (chưa hủy) qua bất kỳ đường nào — kể cả hợp đồng người dùng không xem được. */
export function useOpportunityHasContract(id: string | undefined) {
  return useQuery<boolean | null, Error>({
    queryKey: ['opportunities', 'has-contract', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('opportunity_has_contract', {
        p_opportunity_id: id!,
      });
      if (error) throw new Error(error.message);
      return data as boolean | null;
    },
    enabled: Boolean(id),
  });
}
