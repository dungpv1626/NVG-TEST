/**
 * Truy vấn và thao tác của Module KT — Kế toán và Tài chính.
 *
 * Nguồn: PRD KT-01 → KT-10, Backend Schema 4.9.
 *
 * Ranh giới giữa hai lớp (CLAUDE.md Mục 3.1) chạy đúng ở đây:
 *  - Đọc danh sách, soạn bản nháp, nhập dòng phân bổ, lập khoản công nợ và kế hoạch dòng
 *    tiền → gọi thẳng Supabase, RLS lo phân quyền.
 *  - Mọi thứ ĐỘNG TỚI TIỀN đi qua hàm CSDL, vì mỗi cái có điều kiện mà trình duyệt không
 *    được phép bỏ qua: gửi đi (kiểm phân bổ, mã chi phí, điều kiện tạm ứng), xử lý một bước
 *    kiểm (đúng người đúng bước), ghi nhận đã chi (phải đã duyệt, cập nhật ngân sách + tạm
 *    ứng + công nợ trong một giao dịch), ghi chứng từ thu (không thu quá số còn nợ), khóa và
 *    mở lại kỳ kế toán.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountingPeriodStatus,
  AgingBucketDef,
  AdvanceStatus,
  CashFlowPeriodType,
  CostGroup,
  PartyType,
  PaymentCheckStep,
  PaymentMethod,
  PaymentRequestStage,
  PaymentRequestType,
  ReceivableDirection,
} from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

/* ========================================================================== *
 * Đề nghị chi — KT-01, KT-02
 * ========================================================================== */

export interface PaymentRequestRecord {
  id: string;
  company_id: string;
  code: string | null;
  request_type: PaymentRequestType;
  title: string;
  stage: PaymentRequestStage;
  amount: string;
  department: string | null;
  origin_module: string;
  supplier_id: string | null;
  payee_name: string | null;
  advance_user_id: string | null;
  advance_due_date: string | null;
  advance_override_reason: string | null;
  settles_advance_id: string | null;
  receivable_id: string | null;
  purchase_order_id: string | null;
  contract_id: string | null;
  accounting_period: string | null;
  due_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  payment_method: PaymentMethod | null;
  paid_date: string | null;
  payment_reference: string | null;
  paid_amount: string;
  posted_at: string | null;
  posted_reference: string | null;
  closed_reason: string | null;
  notes: string | null;
  created_at: string;
  requested_by: string | null;
  requester: { full_name: string } | null;
  advance_user: { full_name: string } | null;
  supplier: { id: string; code: string; name: string } | null;
}

const PAYMENT_SELECT =
  'id, company_id, code, request_type, title, stage, amount, department, origin_module, ' +
  'supplier_id, payee_name, advance_user_id, advance_due_date, advance_override_reason, ' +
  'settles_advance_id, receivable_id, purchase_order_id, contract_id, accounting_period, ' +
  'due_date, submitted_at, approved_at, payment_method, paid_date, payment_reference, ' +
  'paid_amount, posted_at, posted_reference, closed_reason, notes, created_at, requested_by, ' +
  'requester:users!payment_requests_requested_by_users_id_fk(full_name), ' +
  'advance_user:users!payment_requests_advance_user_id_users_id_fk(full_name), ' +
  'supplier:suppliers(id, code, name)';

export function usePaymentRequests() {
  const scope = useCompanyScope();

  return useQuery<PaymentRequestRecord[], Error>({
    queryKey: ['payment-requests', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('payment_requests').select(PAYMENT_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PaymentRequestRecord[];
    },
    enabled: scope.isReady,
  });
}

export function usePaymentRequest(id: string | undefined) {
  return useQuery<PaymentRequestRecord | null, Error>({
    queryKey: ['payment-requests', 'one', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_requests')
        .select(PAYMENT_SELECT)
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as PaymentRequestRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface NewPaymentRequestInput {
  companyId: string;
  requestType: PaymentRequestType;
  title: string;
  amount: string;
  department?: string | null;
  originModule: string;
  supplierId?: string | null;
  payeeName?: string | null;
  advanceUserId?: string | null;
  advanceDueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}

export function useCreatePaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, NewPaymentRequestInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('payment_requests')
        .insert({
          company_id: input.companyId,
          request_type: input.requestType,
          title: input.title.trim(),
          amount: input.amount,
          department: input.department?.trim() || null,
          origin_module: input.originModule,
          supplier_id: input.supplierId || null,
          payee_name: input.payeeName?.trim() || null,
          advance_user_id: input.advanceUserId || null,
          advance_due_date: input.advanceDueDate || null,
          due_date: input.dueDate || null,
          notes: input.notes?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
    },
  });
}

/**
 * Sửa nội dung bản nháp.
 *
 * `stage`, `amount`, `paid_*` và `posted_*` KHÔNG có ở đây — CSDL cũng từ chối chúng qua
 * trigger, nên để lọt vào danh sách này chỉ tạo ra một lỗi khó hiểu ở màn hình.
 */
export function useUpdatePaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        title: string;
        department: string | null;
        supplier_id: string | null;
        payee_name: string | null;
        advance_user_id: string | null;
        advance_due_date: string | null;
        advance_override_reason: string | null;
        due_date: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase
        .from('payment_requests')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
    },
  });
}

export function useSubmitPaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { requestId: string }>({
    mutationFn: async ({ requestId }) => {
      const { error } = await supabase.rpc('submit_payment_request', {
        p_request_id: requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/** Xử lý một bước kiểm tra của luồng KT-01 — xác nhận hoặc trả lại kèm lý do. */
export function useAdvancePaymentStep() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { requestId: string; decision: 'approved' | 'rejected'; note?: string }
  >({
    mutationFn: async ({ requestId, decision, note }) => {
      const { error } = await supabase.rpc('advance_payment_step', {
        p_request_id: requestId,
        p_decision: decision,
        p_note: note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useCancelPaymentRequest() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { requestId: string; reason: string }>({
    mutationFn: async ({ requestId, reason }) => {
      const { error } = await supabase.rpc('cancel_payment_request', {
        p_request_id: requestId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { requestId: string; paidDate: string; method: PaymentMethod; reference?: string }
  >({
    mutationFn: async ({ requestId, paidDate, method, reference }) => {
      const { error } = await supabase.rpc('record_payment', {
        p_request_id: requestId,
        p_paid_date: paidDate,
        p_method: method,
        p_reference: reference?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['advances'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      // Chi phí vừa vào ngân sách công trình — màn hình Thi công phải đọc lại.
      void queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
    },
  });
}

export function usePostPayment() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { requestId: string; reference?: string }>({
    mutationFn: async ({ requestId, reference }) => {
      const { error } = await supabase.rpc('post_payment', {
        p_request_id: requestId,
        p_reference: reference?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
    },
  });
}

/* --- Dòng phân bổ chi phí — KT-05 --- */

export interface PaymentAllocationRecord {
  id: string;
  construction_site_id: string | null;
  cost_code: string | null;
  cost_group: CostGroup;
  amount: string;
  basis: string | null;
  notes: string | null;
  site: { id: string; code: string; name: string } | null;
}

export function usePaymentAllocations(requestId: string | undefined) {
  return useQuery<PaymentAllocationRecord[], Error>({
    queryKey: ['payment-requests', requestId, 'allocations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_request_allocations')
        .select(
          'id, construction_site_id, cost_code, cost_group, amount, basis, notes, ' +
            'site:construction_sites(id, code, name)',
        )
        .eq('payment_request_id', requestId!)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PaymentAllocationRecord[];
    },
    enabled: Boolean(requestId),
  });
}

export function useSaveAllocation() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id?: string;
      requestId: string;
      values: {
        construction_site_id: string | null;
        cost_code: string | null;
        cost_group: CostGroup;
        amount: string;
        basis: string | null;
      };
    }
  >({
    mutationFn: async ({ id, requestId, values }) => {
      const query = id
        ? supabase.from('payment_request_allocations').update(values).eq('id', id)
        : supabase
            .from('payment_request_allocations')
            .insert({ ...values, payment_request_id: requestId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['payment-requests', variables.requestId, 'allocations'],
      });
    },
  });
}

export function useDeleteAllocation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; requestId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('payment_request_allocations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['payment-requests', variables.requestId, 'allocations'],
      });
    },
  });
}

/* --- Lịch sử các bước kiểm — KT-02 --- */

export interface PaymentStepRecord {
  id: string;
  step: PaymentCheckStep;
  decision: 'approved' | 'rejected';
  note: string | null;
  entered_at: string | null;
  decided_at: string;
  decided_by_user: { full_name: string } | null;
}

export function usePaymentSteps(requestId: string | undefined) {
  return useQuery<PaymentStepRecord[], Error>({
    queryKey: ['payment-requests', requestId, 'steps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_request_steps')
        .select(
          'id, step, decision, note, entered_at, decided_at, ' +
            'decided_by_user:users!payment_request_steps_decided_by_users_id_fk(full_name)',
        )
        .eq('payment_request_id', requestId!)
        .order('decided_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PaymentStepRecord[];
    },
    enabled: Boolean(requestId),
  });
}

/* ========================================================================== *
 * Tạm ứng — KT-03
 * ========================================================================== */

export interface AdvanceRecord {
  id: string;
  company_id: string;
  payment_request_id: string;
  user_id: string;
  purpose: string;
  amount: string;
  settled_amount: string;
  advance_date: string;
  due_date: string | null;
  status: AdvanceStatus;
  settled_at: string | null;
  holder: { full_name: string } | null;
}

export function useAdvances() {
  const scope = useCompanyScope();

  return useQuery<AdvanceRecord[], Error>({
    queryKey: ['advances', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('advances')
          .select(
            'id, company_id, payment_request_id, user_id, purpose, amount, settled_amount, ' +
              'advance_date, due_date, status, settled_at, ' +
              'holder:users!advances_user_id_users_id_fk(full_name)',
          ),
        scope,
      )
        .is('deleted_at', null)
        .order('due_date', { nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AdvanceRecord[];
    },
    enabled: scope.isReady,
  });
}

/* ========================================================================== *
 * Công nợ — KT-04
 * ========================================================================== */

export interface ReceivableRecord {
  id: string;
  company_id: string;
  code: string | null;
  direction: ReceivableDirection;
  party_type: PartyType;
  customer_id: string | null;
  supplier_id: string | null;
  party_name: string | null;
  contract_id: string | null;
  construction_site_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  description: string | null;
  amount: string;
  settled_amount: string;
  due_date: string | null;
  settled_at: string | null;
  reconciled_at: string | null;
  notes: string | null;
  customer: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
  contract: { id: string; code: string; title: string } | null;
}

const RECEIVABLE_SELECT =
  'id, company_id, code, direction, party_type, customer_id, supplier_id, party_name, ' +
  'contract_id, construction_site_id, invoice_number, invoice_date, description, amount, ' +
  'settled_amount, due_date, settled_at, reconciled_at, notes, ' +
  'customer:customers(id, name), supplier:suppliers(id, name), ' +
  'contract:contracts(id, code, title)';

export function useReceivables(
  direction: ReceivableDirection,
  options: { enabled?: boolean } = {},
) {
  const scope = useCompanyScope();

  return useQuery<ReceivableRecord[], Error>({
    queryKey: ['receivables', direction, scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('receivables_payables').select(RECEIVABLE_SELECT),
        scope,
      )
        .eq('direction', direction)
        .is('deleted_at', null)
        .order('due_date', { nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReceivableRecord[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export interface NewReceivableInput {
  companyId: string;
  direction: ReceivableDirection;
  partyType: PartyType;
  customerId?: string | null;
  supplierId?: string | null;
  partyName?: string | null;
  contractId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  description?: string | null;
  amount: string;
  dueDate?: string | null;
}

export function useCreateReceivable() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, NewReceivableInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('receivables_payables')
        .insert({
          company_id: input.companyId,
          direction: input.direction,
          party_type: input.partyType,
          customer_id: input.customerId || null,
          supplier_id: input.supplierId || null,
          party_name: input.partyName?.trim() || null,
          contract_id: input.contractId || null,
          invoice_number: input.invoiceNumber?.trim() || null,
          invoice_date: input.invoiceDate || null,
          description: input.description?.trim() || null,
          amount: input.amount,
          due_date: input.dueDate || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
    },
  });
}

export interface SettlementRecord {
  id: string;
  receivable_id: string;
  settled_date: string;
  amount: string;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
}

export function useSettlements(receivableId: string | undefined) {
  return useQuery<SettlementRecord[], Error>({
    queryKey: ['receivables', receivableId, 'settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receivable_settlements')
        .select('id, receivable_id, settled_date, amount, method, reference, notes')
        .eq('receivable_id', receivableId!)
        .order('settled_date');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SettlementRecord[];
    },
    enabled: Boolean(receivableId),
  });
}

/** Ghi một chứng từ thu/trả — cửa duy nhất làm đổi số "đã thu" của hợp đồng (HD-03). */
export function useRecordSettlement() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      receivableId: string;
      settledDate: string;
      amount: string;
      method?: PaymentMethod | null;
      reference?: string | null;
    }
  >({
    mutationFn: async ({ receivableId, settledDate, amount, method, reference }) => {
      const { error } = await supabase.rpc('record_receivable_settlement', {
        p_receivable_id: receivableId,
        p_settled_date: settledDate,
        p_amount: Number(amount),
        p_method: method ?? null,
        p_reference: reference?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

export function useReconcileReceivable() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { receivableId: string }>({
    mutationFn: async ({ receivableId }) => {
      const { error } = await supabase.rpc('reconcile_receivable', {
        p_receivable_id: receivableId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
    },
  });
}

/* ========================================================================== *
 * Khung tuổi nợ — KT-04
 * ========================================================================== */

/**
 * Các mốc chia nhóm công nợ quá hạn, đọc từ CẤU HÌNH chứ không từ hằng số trong mã.
 *
 * Mốc riêng của pháp nhân (nếu NVG đặt) THAY THẾ mốc chung, không trộn lẫn: trộn hai bộ mốc
 * sẽ tạo ra các khung chồng lấn và một khoản nợ rơi vào hai cột cùng lúc. Cùng quy tắc với
 * hàm `receivable_aging` trong CSDL.
 *
 * Chưa cấu hình gì thì trả về mảng rỗng — màn hình khi đó chỉ còn khung "Chưa đến hạn", và đó
 * là hành vi đúng: dựng lại mốc mặc định ở đây sẽ khiến việc xoá hết cấu hình trông như thể
 * cấu hình vẫn còn hiệu lực.
 */
export function useAgingBuckets() {
  const scope = useCompanyScope();

  return useQuery<AgingBucketDef[], Error>({
    queryKey: ['aging-buckets', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aging_buckets')
        .select('company_id, code, label, position, from_days, to_days')
        .eq('is_active', true)
        .order('position');
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as {
        company_id: string | null;
        code: string;
        label: string;
        from_days: number;
        to_days: number | null;
      }[];

      const own = scope.companyId ? rows.filter((r) => r.company_id === scope.companyId) : [];
      const applicable = own.length > 0 ? own : rows.filter((r) => r.company_id === null);

      return applicable.map((r) => ({
        code: r.code,
        label: r.label,
        fromDays: r.from_days,
        toDays: r.to_days,
      }));
    },
    enabled: scope.isReady,
  });
}

/* ========================================================================== *
 * Dòng tiền — KT-06
 * ========================================================================== */

export interface CashFlowRow {
  company_id: string;
  company_code: string;
  company_name: string;
  opening_balance: string;
  planned_in: string;
  planned_out: string;
  receivables_due: string;
  payables_due: string;
  approved_payments: string;
  closing_balance: string;
}

export function useCashFlow(from: string, to: string, options: { enabled?: boolean } = {}) {
  const scope = useCompanyScope();

  return useQuery<CashFlowRow[], Error>({
    queryKey: ['cash-flow', from, to, scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cash_flow_current', {
        p_from: from,
        p_to: to,
        // "Toàn NVG" bỏ hẳn điều kiện lọc và để RLS quyết định phạm vi (CLAUDE.md 3.5).
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CashFlowRow[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export interface CashFlowPlanRecord {
  id: string;
  company_id: string;
  period_type: CashFlowPeriodType;
  period_start: string;
  period_end: string;
  opening_balance: string;
  balance_note: string | null;
  planned_in: string;
  planned_out: string;
  notes: string | null;
}

export function useCashFlowPlans() {
  const scope = useCompanyScope();

  return useQuery<CashFlowPlanRecord[], Error>({
    queryKey: ['cash-flow-plans', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('cash_flow_plans')
          .select(
            'id, company_id, period_type, period_start, period_end, opening_balance, ' +
              'balance_note, planned_in, planned_out, notes',
          ),
        scope,
      )
        .is('deleted_at', null)
        .order('period_start', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CashFlowPlanRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useSaveCashFlowPlan() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { id?: string; values: Partial<CashFlowPlanRecord> & { company_id?: string } }
  >({
    mutationFn: async ({ id, values }) => {
      const query = id
        ? supabase.from('cash_flow_plans').update(values).eq('id', id)
        : supabase.from('cash_flow_plans').insert(values);
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cash-flow-plans'] });
      void queryClient.invalidateQueries({ queryKey: ['cash-flow'] });
    },
  });
}

/* ========================================================================== *
 * Kỳ kế toán — KT-09
 * ========================================================================== */

export interface AccountingPeriodRecord {
  id: string;
  company_id: string;
  period_code: string;
  period_start: string;
  period_end: string;
  status: AccountingPeriodStatus;
  closed_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  exported_at: string | null;
  notes: string | null;
  closer: { full_name: string } | null;
  reopener: { full_name: string } | null;
}

export function useAccountingPeriods() {
  const scope = useCompanyScope();

  return useQuery<AccountingPeriodRecord[], Error>({
    queryKey: ['accounting-periods', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('accounting_periods')
          .select(
            'id, company_id, period_code, period_start, period_end, status, closed_at, ' +
              'reopened_at, reopen_reason, exported_at, notes, ' +
              'closer:users!accounting_periods_closed_by_users_id_fk(full_name), ' +
              'reopener:users!accounting_periods_reopened_by_users_id_fk(full_name)',
          ),
        scope,
      ).order('period_code', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AccountingPeriodRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useCreateAccountingPeriod() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { companyId: string; periodCode: string; periodStart: string; periodEnd: string }
  >({
    mutationFn: async ({ companyId, periodCode, periodStart, periodEnd }) => {
      const { error } = await supabase
        .from('accounting_periods')
        .insert({
          company_id: companyId,
          period_code: periodCode,
          period_start: periodStart,
          period_end: periodEnd,
        })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
  });
}

export function useCloseAccountingPeriod() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { periodId: string }>({
    mutationFn: async ({ periodId }) => {
      const { data, error } = await supabase.rpc('close_accounting_period', {
        p_period_id: periodId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
  });
}

export function useReopenAccountingPeriod() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { periodId: string; reason: string }>({
    mutationFn: async ({ periodId, reason }) => {
      const { error } = await supabase.rpc('reopen_accounting_period', {
        p_period_id: periodId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
  });
}
