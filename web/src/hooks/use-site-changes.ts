/**
 * Đề xuất phát sinh từ công trường (T1) và tồn tại (T2) — migration 0241.
 *
 * Đề xuất đọc thẳng bảng (RLS: người xem được công trình HOẶC hợp đồng) — bảng không có cột tiền.
 * Trạng thái + người đang giữ là HÀM (`site_change_proposal_states`): suy từ phát sinh hợp đồng mà Thi
 * công không đọc được, nên hàm chỉ trả cột không có tiền.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteChangeCause, SiteChangeDisplayStatus, SiteIssueStatus } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface SiteChangeProposal {
  id: string;
  code: string | null;
  construction_site_id: string;
  company_id: string;
  contract_id: string | null;
  cause: SiteChangeCause;
  description: string;
  location: string | null;
  measurements: string | null;
  estimated_quantity: number | null;
  quantity_unit: string | null;
  schedule_impact_days: number | null;
  photo_paths: string[];
  is_emergency: boolean;
  emergency_requested_to: string | null;
  emergency_authorized_by: string | null;
  emergency_authorized_at: string | null;
  emergency_note: string | null;
  status: 'da_gui' | 'da_chuyen' | 'tu_choi';
  amendment_id: string | null;
  reject_reason: string | null;
  created_by: string | null;
  created_at: string;
  creator: { full_name: string } | null;
  authorizer: { full_name: string } | null;
  requested_to: { full_name: string } | null;
  site: { code: string; name: string } | null;
}

export interface SiteChangeState {
  proposal_id: string;
  site_id: string;
  display_status: SiteChangeDisplayStatus;
  is_closed: boolean;
  holder_kind: 'office' | 'reviewer' | 'external' | null;
  holder_label: string | null;
  holder_ids: string[];
  holder_names: string[];
  waiting_since: string | null;
  /** Rỗng khi chưa khai thời hạn cam kết (`sla_definitions`) — không hiện đồng hồ. */
  due_at: string | null;
  amendment_code: string | null;
}

const SELECT =
  'id, code, construction_site_id, company_id, contract_id, cause, description, location, measurements, ' +
  'estimated_quantity, quantity_unit, schedule_impact_days, photo_paths, is_emergency, ' +
  'emergency_requested_to, emergency_authorized_by, emergency_authorized_at, emergency_note, status, ' +
  'amendment_id, reject_reason, created_by, created_at, ' +
  'creator:users!site_change_proposals_created_by_fkey(full_name), ' +
  'authorizer:users!site_change_proposals_emergency_authorized_by_fkey(full_name), ' +
  'requested_to:users!site_change_proposals_emergency_requested_to_fkey(full_name), ' +
  'site:construction_sites!site_change_proposals_construction_site_id_fkey(code, name)';

const KEY = ['site-change-proposals'] as const;

/** Theo công trình (Thi công) hoặc theo hợp đồng (Kinh doanh / Dự án). */
export function useSiteChangeProposals(filter: { siteId?: string; contractId?: string }) {
  return useQuery<SiteChangeProposal[], Error>({
    queryKey: [...KEY, filter.siteId ?? null, filter.contractId ?? null],
    queryFn: async () => {
      let q = supabase.from('site_change_proposals').select(SELECT).is('deleted_at', null);
      if (filter.siteId) q = q.eq('construction_site_id', filter.siteId);
      if (filter.contractId) q = q.eq('contract_id', filter.contractId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteChangeProposal[];
    },
    enabled: Boolean(filter.siteId || filter.contractId),
  });
}

export function useSiteChangeStates(siteId: string | undefined) {
  return useQuery<Record<string, SiteChangeState>, Error>({
    queryKey: [...KEY, 'states', siteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_change_proposal_states', {
        p_site_id: siteId!,
      });
      if (error) throw new Error(error.message);
      const out: Record<string, SiteChangeState> = {};
      for (const row of (data ?? []) as SiteChangeState[]) out[row.proposal_id] = row;
      return out;
    },
    enabled: Boolean(siteId),
  });
}

/** Người có quyền cao hơn chỉ huy trưởng — Trưởng phòng Thi công, Ban Giám đốc (0241). */
export function useSiteChangeAuthorizers(companyId: string | undefined) {
  return useQuery<{ id: string; full_name: string }[], Error>({
    queryKey: ['users', 'site-change-authorizers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_change_authorizer_candidates', {
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; full_name: string }[];
    },
    enabled: Boolean(companyId),
  });
}

/** Người đang đăng nhập có quyền cao hơn chỉ huy trưởng trên pháp nhân này không. */
export function useIsSiteSuperior(userId: string | undefined, companyId: string | undefined) {
  return useQuery<boolean, Error>({
    queryKey: ['users', 'site-superior', userId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('user_is_site_superior', {
        p_user_id: userId!,
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    enabled: Boolean(userId && companyId),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
    void queryClient.invalidateQueries({ queryKey: ['site-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['contract_amendments'] });
  };
}

export interface NewSiteChangeProposal {
  construction_site_id: string;
  company_id: string;
  cause: SiteChangeCause;
  description: string;
  location: string | null;
  measurements: string | null;
  estimated_quantity: string | null;
  quantity_unit: string | null;
  schedule_impact_days: number | null;
  photo_paths: string[];
  is_emergency: boolean;
  emergency_requested_to: string | null;
  emergency_note: string | null;
  client_created_at: string;
  client_generated_id: string;
}

export function useCreateSiteChangeProposal() {
  const invalidate = useInvalidate();
  return useMutation<string, Error, NewSiteChangeProposal>({
    mutationFn: async (values) => {
      const { data, error } = await supabase
        .from('site_change_proposals')
        .insert(values)
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: invalidate,
  });
}

export function useAuthorizeSiteChangeEmergency() {
  const invalidate = useInvalidate();
  return useMutation<void, Error, { proposalId: string; note: string | null }>({
    mutationFn: async ({ proposalId, note }) => {
      const { error } = await supabase.rpc('authorize_site_change_emergency', {
        p_proposal_id: proposalId,
        p_note: note,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useConvertSiteChangeProposal() {
  const invalidate = useInvalidate();
  return useMutation<string, Error, { proposalId: string; title: string | null }>({
    mutationFn: async ({ proposalId, title }) => {
      const { data, error } = await supabase.rpc('convert_site_change_proposal', {
        p_proposal_id: proposalId,
        p_title: title,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });
}

export function useRejectSiteChangeProposal() {
  const invalidate = useInvalidate();
  return useMutation<void, Error, { proposalId: string; reason: string }>({
    mutationFn: async ({ proposalId, reason }) => {
      const { error } = await supabase.rpc('reject_site_change_proposal', {
        p_proposal_id: proposalId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

// ----------------------------------------------------------------- T2 — tồn tại

export interface SiteIssue {
  id: string;
  code: string | null;
  construction_site_id: string;
  acceptance_record_id: string | null;
  site_milestone_id: string | null;
  work_item: string | null;
  description: string;
  before_photo_paths: string[];
  after_photo_paths: string[];
  subcontractor_id: string | null;
  assigned_user_id: string | null;
  due_date: string | null;
  status: SiteIssueStatus;
  close_note: string | null;
  closed_at: string | null;
  created_at: string;
  subcontractor: { name: string } | null;
  assignee: { full_name: string } | null;
  closer: { full_name: string } | null;
}

const ISSUE_SELECT =
  'id, code, construction_site_id, acceptance_record_id, site_milestone_id, work_item, description, ' +
  'before_photo_paths, after_photo_paths, subcontractor_id, assigned_user_id, due_date, status, ' +
  'close_note, closed_at, created_at, ' +
  'subcontractor:subcontractors(name), ' +
  'assignee:users!site_issues_assigned_user_id_fkey(full_name), ' +
  'closer:users!site_issues_closed_by_fkey(full_name)';

const ISSUE_KEY = ['site-issues'] as const;

export function useSiteIssues(siteId: string | undefined) {
  return useQuery<SiteIssue[], Error>({
    queryKey: [...ISSUE_KEY, siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_issues')
        .select(ISSUE_SELECT)
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('status')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SiteIssue[];
    },
    enabled: Boolean(siteId),
  });
}

export interface NewSiteIssue {
  construction_site_id: string;
  company_id: string;
  acceptance_record_id?: string | null;
  site_milestone_id?: string | null;
  work_item: string | null;
  description: string;
  before_photo_paths: string[];
  subcontractor_id: string | null;
  assigned_user_id: string | null;
  due_date: string | null;
  client_created_at: string;
  client_generated_id: string;
}

export function useCreateSiteIssues() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, NewSiteIssue[]>({
    mutationFn: async (rows) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from('site_issues').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ISSUE_KEY });
      void queryClient.invalidateQueries({ queryKey: ['construction-sites', 'board'] });
    },
  });
}

export function useCloseSiteIssue() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; afterPhotoPaths: string[]; note: string | null }>({
    mutationFn: async ({ id, afterPhotoPaths, note }) => {
      const { error } = await supabase
        .from('site_issues')
        .update({ status: 'da_dong', after_photo_paths: afterPhotoPaths, close_note: note })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ISSUE_KEY });
      void queryClient.invalidateQueries({ queryKey: ['construction-sites', 'board'] });
    },
  });
}
