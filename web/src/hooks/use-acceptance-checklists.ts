/**
 * TC-13 — danh mục kiểm tra khi nghiệm thu và kết quả từng mục (migration 0136).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcceptanceType } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export type ChecklistResult = 'dat' | 'khong_dat' | 'khong_ap_dung';

export const CHECKLIST_RESULT_LABELS: Record<ChecklistResult, string> = {
  dat: 'Đạt',
  khong_dat: 'Không đạt',
  khong_ap_dung: 'Không áp dụng',
};

export interface ChecklistItem {
  key: string;
  label: string;
  requires_photo: boolean;
}

export interface AcceptanceChecklist {
  id: string;
  name: string;
  acceptance_type: AcceptanceType | null;
  items: ChecklistItem[];
}

export interface ChecklistResultRow {
  id: string;
  position: number;
  item_label: string;
  result: ChecklistResult;
  note: string | null;
  photo_paths: string[];
}

export function useAcceptanceChecklists() {
  return useQuery<AcceptanceChecklist[], Error>({
    queryKey: ['acceptance-checklists'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acceptance_checklists')
        .select('id, name, acceptance_type, items')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as AcceptanceChecklist[];
    },
  });
}

export function useChecklistResults(acceptanceId: string) {
  return useQuery<ChecklistResultRow[], Error>({
    queryKey: ['acceptance-checklist-results', acceptanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acceptance_checklist_results')
        .select('id, position, item_label, result, note, photo_paths')
        .eq('acceptance_record_id', acceptanceId)
        .order('position');
      if (error) throw new Error(error.message);
      return (data ?? []) as ChecklistResultRow[];
    },
  });
}

export interface RecordWithChecklistInput {
  siteId: string;
  acceptanceType: AcceptanceType;
  stageName: string;
  checklistId: string;
  results: { key: string; result: ChecklistResult; note: string | null; photo_paths: string[] }[];
  scope: string | null;
  value: string | null;
  acceptedDate: string | null;
  subcontractorId: string | null;
  counterpartSignedBy: string | null;
  outstandingIssues: string | null;
}

export function useRecordAcceptanceWithChecklist() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, RecordWithChecklistInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('record_acceptance_with_checklist', {
        p_site_id: input.siteId,
        p_acceptance_type: input.acceptanceType,
        p_stage_name: input.stageName,
        p_checklist_id: input.checklistId,
        p_results: input.results,
        p_value: input.value || null,
        p_scope: input.scope || null,
        p_accepted_date: input.acceptedDate || null,
        p_subcontractor_id: input.subcontractorId || null,
        p_counterpart_signed_by: input.counterpartSignedBy || null,
        p_outstanding_issues: input.outstandingIssues || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_id, { siteId }) => {
      void queryClient.invalidateQueries({ queryKey: ['construction-sites', siteId] });
    },
  });
}
