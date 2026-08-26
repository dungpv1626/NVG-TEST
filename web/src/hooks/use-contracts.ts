/**
 * Truy vấn và thao tác trên hợp đồng (Module HD).
 *
 * Mọi bước đổi trạng thái đi qua hàm CSDL chứ không UPDATE thẳng — và từ migration 0028 thì
 * đó không còn là quy ước mà là ràng buộc: trigger canh trạng thái từ chối mọi lệnh đổi
 * `stage`/`approved_at`/`signed_at` đến từ trình duyệt. Lý do: một câu PATCH của PostgREST
 * từng đủ để hợp đồng nhảy sang "đã ký" mà không có dòng nào trong Hộp thư Phê duyệt.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AmendmentStage,
  ContractSourceType,
  ContractStage,
  ContractTermType,
  ContractType,
  MoneyValue,
} from '@nvg/shared';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';

export interface ContractRecord {
  id: string;
  code: string;
  contract_number: string | null;
  company_id: string;
  title: string;
  type: ContractType;
  stage: ContractStage;
  value: MoneyValue | null;
  collected_amount: MoneyValue;
  signed_date: string | null;
  end_date: string | null;
  responsible_user_id: string | null;
  created_at: string;
  customer: { id: string; name: string } | null;
  responsible: { full_name: string } | null;
}

const CONTRACT_SELECT =
  'id, code, contract_number, company_id, title, type, stage, value, collected_amount, ' +
  'signed_date, end_date, responsible_user_id, created_at, ' +
  'customer:customers!contracts_customer_id_customers_id_fk(id, name), ' +
  'responsible:users!contracts_responsible_user_id_users_id_fk(full_name)';

export function useContracts() {
  const companyId = useCompanyStore((s) => s.selectedCompanyId);

  return useQuery<ContractRecord[], Error>({
    queryKey: ['contracts', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(CONTRACT_SELECT)
        .eq('company_id', companyId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractRecord[];
    },
    enabled: companyId !== null,
  });
}

export interface ContractDetailRecord extends ContractRecord {
  source_type: ContractSourceType | null;
  source_id: string | null;
  estimate_id: string | null;
  partner_name: string | null;
  start_date: string | null;
  approved_at: string | null;
  signed_at: string | null;
  settled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  updated_at: string;
  estimate: { id: string; code: string; version: number } | null;
}

export function useContract(id: string | undefined) {
  return useQuery<ContractDetailRecord | null, Error>({
    queryKey: ['contracts', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select(
          `${CONTRACT_SELECT}, source_type, source_id, estimate_id, partner_name, start_date, ` +
            'approved_at, signed_at, settled_at, cancel_reason, notes, updated_at, ' +
            'estimate:estimates!contracts_estimate_id_estimates_id_fk(id, code, version)',
        )
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as ContractDetailRecord | null;
    },
    enabled: Boolean(id),
  });
}

/**
 * Soạn hợp đồng từ hồ sơ nguồn (HD-01).
 *
 * KHÔNG có hook tạo hợp đồng trắng: PRD Mục 2.3 cấm nhập lại dữ liệu đã có, và mọi hợp đồng
 * ở Giai đoạn 1 đều sinh từ một cơ hội, gói thầu hoặc dự án thiết kế. Hàm CSDL tự lấy khách
 * hàng, tên và giá ĐÃ DUYỆT từ hồ sơ đó.
 */
export function useCreateContractFromSource() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    { sourceType: ContractSourceType; sourceId: string; type: ContractType; title?: string }
  >({
    mutationFn: async ({ sourceType, sourceId, type, title }) => {
      const { data, error } = await supabase.rpc('create_contract_from_source', {
        p_source_type: sourceType,
        p_source_id: sourceId,
        p_type: type,
        p_title: title ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

/**
 * Cập nhật các trường mô tả của hợp đồng.
 *
 * Nhận đúng danh sách cột được phép sửa. `stage`, `approved_at`, `signed_at`, `settled_at`
 * và `contract_number` KHÔNG có trong danh sách — chúng chỉ đổi qua hàm nghiệp vụ, và CSDL
 * cũng từ chối nếu gửi lên.
 */
export function useUpdateContract() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        title: string;
        type: ContractType;
        customer_id: string | null;
        partner_name: string | null;
        responsible_user_id: string | null;
        value: string | null;
        start_date: string | null;
        end_date: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      // `.select().single()` bắt buộc: thiếu nó thì RLS chặn mà PostgREST vẫn báo thành công.
      const { error } = await supabase
        .from('contracts')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

/** Trình ký theo hạn mức (HD-05) — CSDL kiểm giá trị và ba nhóm điều khoản bắt buộc. */
export function useSubmitContractApproval() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { contractId: string }>({
    mutationFn: async ({ contractId }) => {
      const { data, error } = await supabase.rpc('submit_contract_approval', {
        p_contract_id: contractId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/** Ghi nhận hợp đồng đã ký — chỉ sau khi phê duyệt nội bộ (HD-05). */
export function useSignContract() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { contractId: string; contractNumber: string; signedDate: string }>(
    {
      mutationFn: async ({ contractId, contractNumber, signedDate }) => {
        const { error } = await supabase.rpc('sign_contract', {
          p_contract_id: contractId,
          p_contract_number: contractNumber,
          p_signed_date: signedDate || null,
        });
        if (error) throw error;
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['contracts'] });
      },
    },
  );
}

/** Quyết toán hoặc hủy hợp đồng. Hủy thì CSDL bắt buộc nêu nguyên nhân. */
export function useCloseContract() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { contractId: string; stage: Extract<ContractStage, 'hoan_thanh' | 'huy'>; reason?: string }
  >({
    mutationFn: async ({ contractId, stage, reason }) => {
      const { error } = await supabase.rpc('close_contract', {
        p_contract_id: contractId,
        p_stage: stage,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Điều khoản (HD-02)
// ---------------------------------------------------------------------------

export interface ContractTermRecord {
  id: string;
  term_type: ContractTermType;
  description: string;
  amount: MoneyValue | null;
  percent_value: string | null;
  due_date: string | null;
  completed_at: string | null;
  position: string;
  notes: string | null;
}

export function useContractTerms(contractId: string | undefined) {
  return useQuery<ContractTermRecord[], Error>({
    queryKey: ['contract_terms', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_terms')
        .select(
          'id, term_type, description, amount, percent_value, due_date, completed_at, position, notes',
        )
        .eq('contract_id', contractId!)
        .is('deleted_at', null)
        .order('term_type')
        .order('position');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractTermRecord[];
    },
    enabled: Boolean(contractId),
  });
}

export function useSaveContractTerm() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { id?: string; contractId: string; companyId: string; values: Record<string, unknown> }
  >({
    mutationFn: async ({ id, contractId, companyId, values }) => {
      if (id) {
        const { error } = await supabase
          .from('contract_terms')
          .update(values)
          .eq('id', id)
          .select('id')
          .single();
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('contract_terms')
        .insert({ contract_id: contractId, company_id: companyId, ...values })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract_terms'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Phát sinh ngoài hợp đồng (HD-04)
// ---------------------------------------------------------------------------

export interface AmendmentRecord {
  id: string;
  code: string | null;
  title: string;
  stage: AmendmentStage;
  content: string;
  reason: string;
  value_change: MoneyValue;
  schedule_impact_days: string | null;
  quote_sent_at: string | null;
  customer_confirmed_at: string | null;
  customer_confirmed_by: string | null;
  is_emergency: boolean;
  emergency_authorized_by: string | null;
  emergency_reason: string | null;
  requested_at: string;
  approved_at: string | null;
  executed_at: string | null;
  decision_notes: string | null;
  requester: { full_name: string } | null;
  authorizer: { full_name: string } | null;
}

export function useContractAmendments(contractId: string | undefined) {
  return useQuery<AmendmentRecord[], Error>({
    queryKey: ['contract_amendments', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_amendments')
        .select(
          'id, code, title, stage, content, reason, value_change, schedule_impact_days, ' +
            'quote_sent_at, customer_confirmed_at, customer_confirmed_by, is_emergency, ' +
            'emergency_authorized_by, emergency_reason, requested_at, approved_at, executed_at, ' +
            'decision_notes, ' +
            'requester:users!contract_amendments_requested_by_users_id_fk(full_name), ' +
            'authorizer:users!contract_amendments_emergency_authorized_by_users_id_fk(full_name)',
        )
        .eq('contract_id', contractId!)
        .is('deleted_at', null)
        .order('requested_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AmendmentRecord[];
    },
    enabled: Boolean(contractId),
  });
}

export function useCreateAmendment() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { contractId: string; companyId: string; values: Record<string, unknown> }
  >({
    mutationFn: async ({ contractId, companyId, values }) => {
      const { error } = await supabase
        .from('contract_amendments')
        .insert({ contract_id: contractId, company_id: companyId, ...values })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract_amendments'] });
    },
  });
}

/** Gửi báo giá phát sinh cho khách — HD-04 đòi có báo giá trước khi thực hiện. */
export function useMarkAmendmentQuoteSent() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { amendmentId: string }>({
    mutationFn: async ({ amendmentId }) => {
      const { error } = await supabase
        .from('contract_amendments')
        .update({ quote_sent_at: new Date().toISOString() })
        .eq('id', amendmentId)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract_amendments'] });
    },
  });
}

export function useSubmitAmendmentApproval() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { amendmentId: string }>({
    mutationFn: async ({ amendmentId }) => {
      const { data, error } = await supabase.rpc('submit_amendment_approval', {
        p_amendment_id: amendmentId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract_amendments'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/** Ghi nhận khách hàng xác nhận phát sinh (HD-04) — bắt buộc đã gửi báo giá trước đó. */
export function useConfirmAmendmentByCustomer() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { amendmentId: string; confirmedBy: string }>({
    mutationFn: async ({ amendmentId, confirmedBy }) => {
      const { error } = await supabase.rpc('confirm_amendment_by_customer', {
        p_amendment_id: amendmentId,
        p_confirmed_by: confirmedBy,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract_amendments'] });
    },
  });
}

/** Ghi nhận phát sinh đã thực hiện — CSDL kiểm đúng hai đường hợp lệ của HD-04. */
export function useExecuteAmendment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { amendmentId: string }>({
    mutationFn: async ({ amendmentId }) => {
      const { error } = await supabase.rpc('execute_amendment', { p_amendment_id: amendmentId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract_amendments'] });
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

/**
 * Hợp đồng đã sinh ra từ một hồ sơ nguồn, nếu có.
 *
 * Dùng để nút trên màn hình nguồn đổi từ "Soạn hợp đồng" sang "Mở hợp đồng" — mời soạn bản
 * thứ hai rồi để CSDL từ chối là đúng thứ Webapp Flow 6.5 cấm.
 */
export function useContractForSource(
  sourceType: ContractSourceType | undefined,
  sourceId: string | undefined,
) {
  return useQuery<string | null, Error>({
    queryKey: ['contracts', 'by-source', sourceType, sourceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id')
        .eq('source_type', sourceType!)
        .eq('source_id', sourceId!)
        .neq('stage', 'huy')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { id: string } | null)?.id ?? null;
    },
    enabled: Boolean(sourceType && sourceId),
  });
}
