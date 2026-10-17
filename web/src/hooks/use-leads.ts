/**
 * Đầu mối + nhật ký chăm sóc (Đợt 1 — 1A, 1B; migration 0172).
 *
 * CRUD gọi thẳng Supabase, quyền nằm ở RLS (Tech Stack 3.2). Hai việc nhiều bước đi qua hàm CSDL:
 * chuyển đầu mối thành cơ hội (`convert_lead` — tạo khách hàng + cơ hội trong một giao dịch) và
 * kiểm trùng số điện thoại (`contact_duplicates` — chạy theo quyền người gọi).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactChannel, LeadStatus } from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export interface LeadRecord {
  id: string;
  company_id: string;
  code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  area: string | null;
  source: string;
  source_detail: string | null;
  need: string | null;
  project_type: string | null;
  status: LeadStatus;
  owner_id: string | null;
  next_action: string | null;
  next_action_at: string | null;
  last_contacted_at: string | null;
  recontact_at: string | null;
  closed_reason: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  converted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  owner: { full_name: string } | null;
  opportunity: { id: string; code: string; name: string } | null;
}

const LEAD_SELECT =
  'id, company_id, code, full_name, phone, email, area, source, source_detail, need, ' +
  'project_type, status, owner_id, next_action, next_action_at, last_contacted_at, ' +
  'recontact_at, closed_reason, customer_id, opportunity_id, converted_at, notes, ' +
  'created_at, updated_at, owner:users!leads_owner_id_fkey(full_name), ' +
  'opportunity:opportunities!leads_opportunity_id_fkey(id, code, name)';

/**
 * Đầu mối của pháp nhân đang chọn. Sắp theo NGÀY HẸN gần nhất trước — người Kinh doanh mở
 * danh sách để biết hôm nay gọi ai; đầu mối chưa hẹn (Mới) xếp sau.
 */
export function useLeads() {
  const scope = useCompanyScope();
  return useQuery<LeadRecord[], Error>({
    queryKey: ['leads', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('leads').select(LEAD_SELECT),
        scope,
      )
        .order('next_action_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LeadRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useLead(id: string | undefined) {
  return useQuery<LeadRecord | null, Error>({
    queryKey: ['leads', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select(LEAD_SELECT)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as LeadRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface NewLeadInput {
  companyId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  area: string | null;
  source: string;
  sourceDetail: string | null;
  need: string | null;
  projectType: string | null;
  notes: string | null;
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, Error, NewLeadInput>({
    mutationFn: async (input) => {
      // Mã và người phụ trách do CSDL đặt (trigger `leads_before_write`).
      const { data, error } = await supabase
        .from('leads')
        .insert({
          company_id: input.companyId,
          full_name: input.fullName,
          phone: input.phone,
          email: input.email,
          area: input.area,
          source: input.source,
          source_detail: input.sourceDetail,
          need: input.need,
          project_type: input.projectType,
          notes: input.notes,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });
}

/** Chỉ những cột người phụ trách được sửa; trạng thái «Đã thành cơ hội» đi qua `useConvertLead`. */
export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        full_name: string;
        phone: string | null;
        email: string | null;
        area: string | null;
        source: string;
        need: string | null;
        project_type: string | null;
        notes: string | null;
        owner_id: string | null;
        status: Exclude<LeadStatus, 'co_nhu_cau'>;
        recontact_at: string | null;
        closed_reason: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      // `.select().single()`: RLS chặn thì PostgREST trả 0 dòng mà không báo lỗi.
      const { error } = await supabase
        .from('leads')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useConvertLead() {
  const queryClient = useQueryClient();
  return useMutation<
    string,
    Error,
    {
      leadId: string;
      customerId: string | null;
      opportunityName: string | null;
      projectType: string | null;
      estimatedValue: number | null;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('convert_lead', {
        p_lead_id: input.leadId,
        p_customer_id: input.customerId,
        p_opportunity_name: input.opportunityName,
        p_project_type: input.projectType,
        p_estimated_value: input.estimatedValue,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['contact-logs'] });
    },
  });
}

export interface DuplicateHit {
  kind: 'lead' | 'customer';
  id: string;
  code: string;
  name: string;
  company_code: string | null;
  owner_name: string | null;
  status: LeadStatus | null;
}

/** Đầu mối / khách hàng có cùng số điện thoại (đủ 8 chữ số mới tra). */
export function useContactDuplicates(phone: string, excludeLeadId?: string) {
  const digits = phone.replace(/\D/g, '');
  return useQuery<DuplicateHit[], Error>({
    queryKey: ['contact-duplicates', digits, excludeLeadId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contact_duplicates', {
        p_phone: digits,
        p_exclude_lead: excludeLeadId ?? null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as DuplicateHit[];
    },
    enabled: digits.length >= 8,
    staleTime: 30_000,
  });
}

export interface ContactLogRecord {
  id: string;
  company_id: string;
  lead_id: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  channel: ContactChannel;
  contacted_at: string;
  content: string;
  result: string | null;
  next_action: string | null;
  next_action_at: string | null;
  closes_followup: boolean;
  created_at: string;
  author: { full_name: string } | null;
}

export type ContactSubject =
  { leadId: string } | { opportunityId: string } | { customerId: string; companyId: string | null };

function subjectFilter(subject: ContactSubject): [string, string] {
  if ('leadId' in subject) return ['lead_id', subject.leadId];
  if ('opportunityId' in subject) return ['opportunity_id', subject.opportunityId];
  return ['customer_id', subject.customerId];
}

/** Dòng thời gian chăm sóc — mới nhất trước. Khách hàng thấy cả nhật ký từ thời còn là đầu mối. */
export function useContactLogs(subject: ContactSubject) {
  const [column, value] = subjectFilter(subject);
  return useQuery<ContactLogRecord[], Error>({
    queryKey: ['contact-logs', column, value],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_logs')
        .select(
          'id, company_id, lead_id, customer_id, opportunity_id, channel, contacted_at, content, ' +
            'result, next_action, next_action_at, closes_followup, created_at, ' +
            'author:users!contact_logs_created_by_fkey(full_name)',
        )
        .eq(column, value)
        .order('contacted_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContactLogRecord[];
    },
    enabled: Boolean(value),
  });
}

export interface NewContactLogInput {
  channel: ContactChannel;
  contactedAt: string;
  content: string;
  result: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  closesFollowup: boolean;
}

export function useAddContactLog(subject: ContactSubject) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, NewContactLogInput>({
    mutationFn: async (input) => {
      const base =
        'leadId' in subject
          ? { lead_id: subject.leadId }
          : 'opportunityId' in subject
            ? { opportunity_id: subject.opportunityId }
            : { customer_id: subject.customerId, company_id: subject.companyId };
      const { error } = await supabase
        .from('contact_logs')
        .insert({
          ...base,
          channel: input.channel,
          contacted_at: input.contactedAt,
          content: input.content,
          result: input.result,
          next_action: input.closesFollowup ? null : input.nextAction,
          next_action_at: input.closesFollowup ? null : input.nextActionAt,
          closes_followup: input.closesFollowup,
        })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contact-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      void queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
    },
  });
}

export interface FollowupItem {
  kind:
    | 'lead_first_contact'
    | 'lead_followup'
    | 'lead_recontact'
    | 'opportunity_followup'
    | 'customer_followup';
  entity_id: string;
  code: string;
  title: string;
  action: string | null;
  due_date: string;
  company_code: string;
  path: string;
}

/**
 * Việc chăm sóc khách của người đang đăng nhập — quá hạn, hôm nay và `horizonDays` ngày tới
 * (`my_crm_followups`, 0173). Chỉ chạy khi xem được CRM.
 */
export function useMyFollowups(horizonDays = 7, enabled = true) {
  return useQuery<FollowupItem[], Error>({
    queryKey: ['today-tasks', horizonDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_crm_followups', {
        p_horizon_days: horizonDays,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as FollowupItem[];
    },
    enabled,
    staleTime: 60_000,
  });
}
