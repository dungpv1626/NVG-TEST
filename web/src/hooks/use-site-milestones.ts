/**
 * Mốc thi công của công trình (Đợt 2 — 2A, migration 0182).
 *
 * Đọc thẳng Supabase (RLS Mẫu E); mọi chuyển trạng thái đi qua hàm CSDL — trình duyệt chỉ sửa
 * được ngày dự kiến xong của mốc.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteMilestoneStatus } from '@nvg/shared';
import { supabase } from '@/lib/supabase';
import type { ChecklistResult } from './use-acceptance-checklists';

export interface SiteMilestoneEvent {
  id: string;
  event: string;
  note: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

export interface SiteMilestone {
  id: string;
  company_id: string;
  position: number;
  step_key: string;
  label: string;
  status: SiteMilestoneStatus;
  requires_technical_check: boolean;
  planned_end_date: string | null;
  acceptance_checklist_id: string | null;
  acceptance_record_id: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  technical_note: string | null;
  technical_checked_at: string | null;
  passed_at: string | null;
  acceptance: { code: string | null } | null;
  events: SiteMilestoneEvent[];
}

export interface MilestoneTemplate {
  id: string;
  name: string;
  is_default: boolean;
  steps: { key: string; label: string }[];
}

const keyOf = (siteId: string) => ['site-milestones', siteId];

export function useSiteMilestones(siteId: string | undefined) {
  return useQuery<SiteMilestone[], Error>({
    queryKey: keyOf(siteId ?? ''),
    enabled: Boolean(siteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_milestones')
        .select(
          `id, company_id, position, step_key, label, status, requires_technical_check,
           planned_end_date, acceptance_checklist_id, acceptance_record_id, submitted_by,
           submitted_at, technical_note, technical_checked_at, passed_at,
           acceptance:acceptance_records!site_milestones_acceptance_record_id_fkey(code),
           events:site_milestone_events(id, event, note, created_at,
             actor:users!site_milestone_events_actor_id_fkey(full_name))`,
        )
        .eq('construction_site_id', siteId!)
        .order('position');
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as SiteMilestone[]).map((m) => ({
        ...m,
        events: [...(m.events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }));
    },
  });
}

/** Người đang đăng nhập có kiểm lớp kỹ thuật / áp bộ mốc cho pháp nhân này không. */
export function useCanReviewMilestones(companyId: string | undefined) {
  return useQuery<boolean, Error>({
    queryKey: ['can-review-milestones', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('auth_can_review_milestones', {
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return data === true;
    },
  });
}

export function useMilestoneTemplates(companyId: string | undefined, enabled: boolean) {
  return useQuery<MilestoneTemplate[], Error>({
    queryKey: ['milestone-templates', companyId],
    enabled: Boolean(companyId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestone_templates')
        .select('id, name, is_default, steps')
        .eq('company_id', companyId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as MilestoneTemplate[];
    },
  });
}

function useInvalidate(siteId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: keyOf(siteId) });
    void queryClient.invalidateQueries({ queryKey: ['construction-sites', siteId] });
  };
}

export function useApplyMilestoneTemplate(siteId: string) {
  const invalidate = useInvalidate(siteId);
  return useMutation<number, Error, string>({
    mutationFn: async (templateId) => {
      const { data, error } = await supabase.rpc('apply_milestone_template', {
        p_site_id: siteId,
        p_template_id: templateId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: invalidate,
  });
}

export interface MilestoneAcceptanceInput {
  milestoneId: string;
  results: { key: string; result: ChecklistResult; note: string | null; photo_paths: string[] }[];
  acceptedDate: string | null;
  outstandingIssues: string | null;
}

/** Trả kết quả: `dat` · `cho_ky_thuat` · `khong_dat`. */
export function useRecordMilestoneAcceptance(siteId: string) {
  const invalidate = useInvalidate(siteId);
  return useMutation<'dat' | 'cho_ky_thuat' | 'khong_dat', Error, MilestoneAcceptanceInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('record_milestone_acceptance', {
        p_milestone_id: input.milestoneId,
        p_results: input.results,
        p_accepted_date: input.acceptedDate,
        p_outstanding_issues: input.outstandingIssues,
      });
      if (error) throw error;
      return data as 'dat' | 'cho_ky_thuat' | 'khong_dat';
    },
    onSuccess: invalidate,
  });
}

export function useReviewMilestone(siteId: string) {
  const invalidate = useInvalidate(siteId);
  return useMutation<void, Error, { milestoneId: string; approve: boolean; note: string | null }>({
    mutationFn: async ({ milestoneId, approve, note }) => {
      const { error } = await supabase.rpc('review_milestone_technical', {
        p_milestone_id: milestoneId,
        p_approve: approve,
        p_note: note,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetMilestonePlan(siteId: string) {
  const invalidate = useInvalidate(siteId);
  return useMutation<void, Error, { milestoneId: string; plannedEndDate: string | null }>({
    mutationFn: async ({ milestoneId, plannedEndDate }) => {
      const { error } = await supabase
        .from('site_milestones')
        .update({ planned_end_date: plannedEndDate })
        .eq('id', milestoneId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
