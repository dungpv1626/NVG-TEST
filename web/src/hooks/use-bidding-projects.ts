/**
 * Truy vấn và thao tác trên gói thầu (Module DA).
 *
 * Mọi bước đổi trạng thái đi qua hàm CSDL chứ không UPDATE thẳng: nộp thầu phải kiểm tra
 * giá đã duyệt và hồ sơ bắt buộc (DA-08), ghi kết quả phải bắt buộc nêu nguyên nhân khi
 * trượt. Đặt các quy tắc đó ở trình duyệt thì gọi thẳng PostgREST là đi vòng qua được.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BiddingStage, MoneyValue } from '@nvg/shared';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';

export interface BiddingProjectRecord {
  id: string;
  code: string;
  company_id: string;
  name: string;
  stage: BiddingStage;
  estimated_value: MoneyValue | null;
  submission_deadline: string | null;
  submitted_at: string | null;
  budget_generated_at: string | null;
  responsible_user_id: string | null;
  created_at: string;
  customer: { id: string; name: string } | null;
  responsible: { full_name: string } | null;
}

const PROJECT_SELECT =
  'id, code, company_id, name, stage, estimated_value, submission_deadline, submitted_at, ' +
  'budget_generated_at, responsible_user_id, created_at, ' +
  'customer:customers!bidding_projects_customer_id_customers_id_fk(id, name), ' +
  'responsible:users!bidding_projects_responsible_user_id_users_id_fk(full_name)';

export function useBiddingProjects() {
  const companyId = useCompanyStore((s) => s.selectedCompanyId);

  return useQuery<BiddingProjectRecord[], Error>({
    queryKey: ['bidding_projects', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_projects')
        .select(PROJECT_SELECT)
        .eq('company_id', companyId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BiddingProjectRecord[];
    },
    enabled: companyId !== null,
  });
}

export interface BiddingProjectDetailRecord extends BiddingProjectRecord {
  opportunity_id: string | null;
  site_address: string | null;
  clarification_notes: string | null;
  survey_notes: string | null;
  lost_reason: string | null;
  notes: string | null;
  updated_at: string;
  opportunity: { id: string; code: string; name: string } | null;
}

export function useBiddingProject(id: string | undefined) {
  return useQuery<BiddingProjectDetailRecord | null, Error>({
    queryKey: ['bidding_projects', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bidding_projects')
        .select(
          `${PROJECT_SELECT}, opportunity_id, site_address, clarification_notes, survey_notes, ` +
            'lost_reason, notes, updated_at, ' +
            'opportunity:opportunities!bidding_projects_opportunity_id_opportunities_id_fk(id, code, name)',
        )
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as BiddingProjectDetailRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface NewBiddingProjectInput {
  code: string;
  companyId: string;
  name: string;
  customerId: string | null;
  opportunityId: string | null;
  responsibleUserId: string | null;
  estimatedValue: string | null;
  submissionDeadline: string | null;
  siteAddress: string | null;
  clarificationNotes: string | null;
}

export function useCreateBiddingProject() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string }, Error, NewBiddingProjectInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('bidding_projects')
        .insert({
          code: input.code,
          company_id: input.companyId,
          name: input.name,
          customer_id: input.customerId,
          opportunity_id: input.opportunityId,
          responsible_user_id: input.responsibleUserId,
          estimated_value: input.estimatedValue,
          submission_deadline: input.submissionDeadline,
          site_address: input.siteAddress,
          clarification_notes: input.clarificationNotes,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] });
    },
  });
}

/**
 * Cập nhật các trường mô tả của gói thầu.
 *
 * Nhận đúng danh sách cột được phép sửa thay vì một `Record` mở: `stage`, `submitted_at` và
 * `budget_generated_at` chỉ được đổi qua hàm nghiệp vụ, để không nơi nào lỡ tay đẩy gói thầu
 * sang bước khác mà bỏ qua các điều kiện kèm theo.
 */
export function useUpdateBiddingProject() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        name: string;
        customer_id: string | null;
        responsible_user_id: string | null;
        estimated_value: string | null;
        submission_deadline: string | null;
        site_address: string | null;
        clarification_notes: string | null;
        survey_notes: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      // `.select().single()` bắt buộc: thiếu nó thì RLS chặn mà PostgREST vẫn báo thành công.
      const { error } = await supabase
        .from('bidding_projects')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] });
    },
  });
}

/** Nộp thầu (DA-08) — CSDL kiểm tra giá đã duyệt và checklist hồ sơ trước khi cho qua. */
export function useSubmitBid() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { error } = await supabase.rpc('submit_bid', { p_bidding_project_id: projectId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] });
      void queryClient.invalidateQueries({ queryKey: ['bid_documents'] });
    },
  });
}

/** Ghi kết quả trúng/trượt thầu (DA-08). Trượt thì CSDL bắt buộc nêu nguyên nhân. */
export function useRecordBidResult() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { projectId: string; won: boolean; reason?: string }>({
    mutationFn: async ({ projectId, won, reason }) => {
      const { error } = await supabase.rpc('record_bid_result', {
        p_bidding_project_id: projectId,
        p_won: won,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] });
    },
  });
}

/** Chuyển dự toán đã duyệt thành ngân sách thi công và thông báo các bên (DA-09). */
export function useGenerateBudget() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { data, error } = await supabase.rpc('generate_project_budget', {
        p_bidding_project_id: projectId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] });
      void queryClient.invalidateQueries({ queryKey: ['project_budgets'] });
    },
  });
}

export interface ProjectBudgetRecord {
  id: string;
  cost_group: string;
  cost_code: string;
  name: string;
  budgeted_amount: MoneyValue;
  actual_amount: MoneyValue;
  committed_amount: MoneyValue;
}

/**
 * Ngân sách thi công của một gói thầu.
 *
 * Dòng "lợi nhuận mục tiêu" bị RLS lọc bỏ với vai trò không được xem lợi nhuận — nên danh
 * sách này NGẮN hơn với người này và DÀI hơn với người kia, và đó là hành vi đúng (Mẫu D).
 */
export function useProjectBudgets(projectId: string | undefined) {
  return useQuery<ProjectBudgetRecord[], Error>({
    queryKey: ['project_budgets', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_budgets')
        .select('id, cost_group, cost_code, name, budgeted_amount, actual_amount, committed_amount')
        .eq('bidding_project_id', projectId!)
        .is('deleted_at', null)
        .order('cost_group');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ProjectBudgetRecord[];
    },
    enabled: Boolean(projectId),
  });
}
