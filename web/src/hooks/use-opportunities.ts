/**
 * Truy vấn và thao tác trên cơ hội kinh doanh (Module CRM).
 *
 * Chuyển giai đoạn gọi hàm `move_opportunity_stage` của CSDL thay vì UPDATE trực tiếp:
 * hàm đó ghi lịch sử trong CÙNG giao dịch, nên không thể có cơ hội đổi giai đoạn mà
 * thiếu vết (NEN-03).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyValue, OpportunityStage } from '@nvg/shared';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';

export interface OpportunityRecord {
  id: string;
  code: string;
  company_id: string;
  name: string;
  stage: OpportunityStage;
  classification: string | null;
  estimated_value: MoneyValue | null;
  project_type: string | null;
  due_date: string | null;
  handed_over_at: string | null;
  created_at: string;
  customer: { id: string; name: string } | null;
  owner: { full_name: string } | null;
}

const OPPORTUNITY_SELECT =
  'id, code, company_id, name, stage, classification, estimated_value, project_type, due_date, ' +
  'handed_over_at, created_at, ' +
  'customer:customers!opportunities_customer_id_customers_id_fk(id, name), ' +
  'owner:users!opportunities_owner_id_users_id_fk(full_name)';

export function useOpportunities() {
  const companyId = useCompanyStore((s) => s.selectedCompanyId);

  return useQuery<OpportunityRecord[], Error>({
    queryKey: ['opportunities', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunities')
        .select(OPPORTUNITY_SELECT)
        .eq('company_id', companyId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OpportunityRecord[];
    },
    enabled: companyId !== null,
  });
}

export interface OpportunityDetailRecord extends OpportunityRecord {
  notes: string | null;
  lost_reason: string | null;
  expected_start_date: string | null;
  updated_at: string;
}

export function useOpportunity(id: string | undefined) {
  return useQuery<OpportunityDetailRecord | null, Error>({
    queryKey: ['opportunities', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunities')
        .select(
          `${OPPORTUNITY_SELECT}, notes, lost_reason, expected_start_date, updated_at, ` +
            'customer_full:customers!opportunities_customer_id_customers_id_fk(id, name, contact_person, phone, email)',
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as OpportunityDetailRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface StageHistoryRecord {
  id: string;
  from_stage: OpportunityStage | null;
  to_stage: OpportunityStage;
  note: string | null;
  changed_at: string;
  changed_by_user: { full_name: string } | null;
}

export function useOpportunityStageHistory(opportunityId: string | undefined) {
  return useQuery<StageHistoryRecord[], Error>({
    queryKey: ['opportunity_stage_history', opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_stage_history')
        .select(
          'id, from_stage, to_stage, note, changed_at, ' +
            'changed_by_user:users!opportunity_stage_history_changed_by_users_id_fk(full_name)',
        )
        .eq('opportunity_id', opportunityId!)
        .order('changed_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as StageHistoryRecord[];
    },
    enabled: Boolean(opportunityId),
  });
}

/** Chuyển giai đoạn pipeline — luôn qua hàm CSDL để lịch sử và trạng thái đi liền nhau. */
export function useMoveStage() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { opportunityId: string; toStage: OpportunityStage; note?: string; lostReason?: string }
  >({
    mutationFn: async ({ opportunityId, toStage, note, lostReason }) => {
      const { error } = await supabase.rpc('move_opportunity_stage', {
        p_opportunity_id: opportunityId,
        p_to_stage: toStage,
        p_note: note ?? null,
        p_lost_reason: lostReason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: ['opportunity_stage_history'] });
    },
  });
}
