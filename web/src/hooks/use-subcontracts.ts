/**
 * Nhà thầu phụ / tổ đội trọn vòng (G2 — A4 + T5, migration 0246).
 *
 * Chọn thầu phụ (gói việc + báo giá → duyệt theo hạn mức) → bảng đơn giá → đợt xác nhận khối lượng
 * (chỉ phần đã nghiệm thu, tổ trưởng ký, Trưởng phòng Thi công xác nhận) → đề nghị thanh toán gắn đợt.
 * Quyền do CSDL quyết (RLS + hàm); màn hình đọc cờ `can_edit` / `can_confirm` của đợt để ẩn nút.
 *
 * Kho `subcontract-docs`, đường dẫn `<công trình>/<đợt>/<loại>-<uuid>.<đuôi>` — tải TRƯỚC, ký SAU,
 * hàm ký kiểm tệp có thật trong đúng thư mục (cùng khuôn biên bản nghiệm thu 0192).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyValue } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export const SUBCONTRACT_DOCS_BUCKET = 'subcontract-docs';

export type PricingMethod = 'don_gia' | 'khoan_gon';

export const PRICING_METHOD_LABELS: Record<PricingMethod, string> = {
  don_gia: 'Bảng đơn giá theo hạng mục',
  khoan_gon: 'Khoán gọn trọn gói',
};

export type SelectionStatus = 'nhap' | 'cho_duyet' | 'da_duyet' | 'tu_choi';

export const SELECTION_STATUS_META: Record<
  SelectionStatus,
  { label: string; statusGroup: 'draft' | 'pending_approval' | 'completed' | 'disputed' }
> = {
  nhap: { label: 'Nháp', statusGroup: 'draft' },
  cho_duyet: { label: 'Chờ duyệt', statusGroup: 'pending_approval' },
  da_duyet: { label: 'Đã duyệt', statusGroup: 'completed' },
  tu_choi: { label: 'Bị từ chối', statusGroup: 'disputed' },
};

export type PeriodStatus = 'nhap' | 'cho_xac_nhan' | 'da_xac_nhan';

export const PERIOD_STATUS_META: Record<
  PeriodStatus,
  { label: string; statusGroup: 'draft' | 'pending_approval' | 'completed' }
> = {
  nhap: { label: 'Đang lập', statusGroup: 'draft' },
  cho_xac_nhan: { label: 'Tổ đã ký — chờ xác nhận', statusGroup: 'pending_approval' },
  da_xac_nhan: { label: 'Đã xác nhận', statusGroup: 'completed' },
};

// ---------------------------------------------------------------------------
// Chọn thầu phụ
// ---------------------------------------------------------------------------

export interface SelectionRow {
  id: string;
  code: string | null;
  work_package: string;
  status: SelectionStatus;
  subcontractor_id: string | null;
  created_at: string;
}

export function useSubcontractSelections(siteId: string | undefined) {
  return useQuery<SelectionRow[], Error>({
    queryKey: ['subcontract-selections', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontract_selections')
        .select('id, code, work_package, status, subcontractor_id, created_at')
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as SelectionRow[];
    },
    enabled: Boolean(siteId),
  });
}

export function useCreateSelection() {
  const queryClient = useQueryClient();
  return useMutation<
    string,
    Error,
    { siteId: string; workPackage: string; scope: string | null; costCode: string | null }
  >({
    mutationFn: async ({ siteId, workPackage, scope, costCode }) => {
      const { data, error } = await supabase
        .from('subcontract_selections')
        .insert({
          construction_site_id: siteId,
          work_package: workPackage,
          scope_of_work: scope,
          cost_code: costCode,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_id, { siteId }) => {
      void queryClient.invalidateQueries({ queryKey: ['subcontract-selections', siteId] });
    },
  });
}

export interface SelectionOffer {
  id: string;
  crew_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  pricing_method: PricingMethod;
  offered_value: MoneyValue;
  retention_rate: number | null;
  duration_days: number | null;
  notes: string | null;
  past_quality: number | null;
  past_periods: number;
}

export interface SelectionBoard {
  id: string;
  code: string | null;
  status: SelectionStatus;
  work_package: string;
  scope_of_work: string | null;
  cost_code: string | null;
  site: { id: string; code: string; name: string };
  budget: { name: string; budgeted: MoneyValue; remaining: MoneyValue } | null;
  budget_remaining_at_submit: MoneyValue | null;
  selected_offer_id: string | null;
  selection_reason: string | null;
  single_offer_reason: string | null;
  subcontractor_id: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  decision_note: string | null;
  offers: SelectionOffer[];
}

export function useSelectionBoard(id: string | undefined) {
  return useQuery<SelectionBoard | null, Error>({
    queryKey: ['subcontract-selection', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontract_selection_board', {
        p_selection_id: id!,
      });
      if (error) throw new Error(error.message);
      return (data ?? null) as SelectionBoard | null;
    },
    enabled: Boolean(id),
  });
}

function useInvalidateSelection() {
  const queryClient = useQueryClient();
  return (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['subcontract-selection', id] });
    void queryClient.invalidateQueries({ queryKey: ['subcontract-selections'] });
  };
}

export function useUpdateSelection() {
  const invalidate = useInvalidateSelection();
  return useMutation<void, Error, { id: string; values: Record<string, unknown> }>({
    mutationFn: async ({ id, values }) => {
      const { error } = await supabase
        .from('subcontract_selections')
        .update(values)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: (_v, { id }) => invalidate(id),
  });
}

export interface OfferInput {
  crew_name: string;
  contact_name: string | null;
  contact_phone: string | null;
  pricing_method: PricingMethod;
  offered_value: string;
  retention_rate: number | null;
  duration_days: number | null;
  notes: string | null;
}

export function useSaveOffer() {
  const invalidate = useInvalidateSelection();
  return useMutation<void, Error, { selectionId: string; offerId?: string; values: OfferInput }>({
    mutationFn: async ({ selectionId, offerId, values }) => {
      const query = offerId
        ? supabase.from('subcontract_offers').update(values).eq('id', offerId)
        : supabase.from('subcontract_offers').insert({ ...values, selection_id: selectionId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_v, { selectionId }) => invalidate(selectionId),
  });
}

export function useDeleteOffer() {
  const invalidate = useInvalidateSelection();
  return useMutation<void, Error, { selectionId: string; offerId: string }>({
    mutationFn: async ({ offerId }) => {
      const { error } = await supabase.from('subcontract_offers').delete().eq('id', offerId);
      if (error) throw error;
    },
    onSuccess: (_v, { selectionId }) => invalidate(selectionId),
  });
}

export function useSubmitSelection() {
  const invalidate = useInvalidateSelection();
  const queryClient = useQueryClient();
  return useMutation<void, Error, { selectionId: string; offerId: string; reason: string | null }>({
    mutationFn: async ({ selectionId, offerId, reason }) => {
      const { error } = await supabase.rpc('submit_subcontract_selection', {
        p_selection_id: selectionId,
        p_offer_id: offerId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: (_v, { selectionId }) => {
      invalidate(selectionId);
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export interface CostLine {
  cost_code: string;
  name: string;
  cost_group: string;
  budgeted: MoneyValue;
  remaining: MoneyValue;
}

export function useSiteCostLines(siteId: string | undefined) {
  return useQuery<CostLine[], Error>({
    queryKey: ['site-cost-lines', siteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_cost_lines', { p_site_id: siteId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as CostLine[];
    },
    enabled: Boolean(siteId),
  });
}

// ---------------------------------------------------------------------------
// Tổ đội: thông tin, bảng đơn giá, sổ theo dõi
// ---------------------------------------------------------------------------

export interface SubcontractorDetail {
  id: string;
  company_id: string;
  construction_site_id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  scope_of_work: string;
  pricing_method: PricingMethod;
  retention_rate: number | null;
  cost_code: string | null;
  contract_id: string | null;
  contract_value: MoneyValue | null;
  selection_id: string | null;
  quality_rating: number | null;
  site: { id: string; code: string; name: string } | null;
}

export function useSubcontractor(id: string | undefined) {
  return useQuery<SubcontractorDetail | null, Error>({
    queryKey: ['subcontractor', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontractors')
        .select(
          'id, company_id, construction_site_id, name, contact_name, contact_phone, scope_of_work, ' +
            'pricing_method, retention_rate, cost_code, contract_id, contract_value, selection_id, ' +
            'quality_rating, site:construction_sites(id, code, name)',
        )
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as SubcontractorDetail | null;
    },
    enabled: Boolean(id),
  });
}

export function useUpdateSubcontractor() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; values: Record<string, unknown> }>({
    mutationFn: async ({ id, values }) => {
      const { error } = await supabase
        .from('subcontractors')
        .update(values)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subcontractor'] });
      void queryClient.invalidateQueries({ queryKey: ['subcontract-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['construction-sites'] });
    },
  });
}

export interface LineProgress {
  line_id: string;
  line_position: number;
  item: string;
  unit: string;
  contract_quantity: number;
  unit_price: MoneyValue;
  amount: MoneyValue;
  confirmed_quantity: number;
  confirmed_amount: MoneyValue;
  pending_quantity: number;
}

export function useLineProgress(subcontractorId: string | undefined) {
  return useQuery<LineProgress[], Error>({
    queryKey: ['subcontract-lines', subcontractorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontract_line_progress', {
        p_subcontractor_id: subcontractorId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LineProgress[];
    },
    enabled: Boolean(subcontractorId),
  });
}

export function useSaveLine() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { subcontractorId: string; lineId?: string; values: Record<string, unknown> }
  >({
    mutationFn: async ({ subcontractorId, lineId, values }) => {
      const query = lineId
        ? supabase.from('subcontract_lines').update(values).eq('id', lineId)
        : supabase
            .from('subcontract_lines')
            .insert({ ...values, subcontractor_id: subcontractorId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_v, { subcontractorId }) => {
      void queryClient.invalidateQueries({ queryKey: ['subcontract-lines', subcontractorId] });
      void queryClient.invalidateQueries({ queryKey: ['subcontract-ledger'] });
    },
  });
}

export interface LedgerRow {
  subcontractor_id: string;
  name: string;
  pricing_method: PricingMethod;
  retention_rate: number | null;
  contract_value: MoneyValue | null;
  contract_id: string | null;
  confirmed_gross: MoneyValue;
  retention_held: MoneyValue;
  confirmed_net: MoneyValue;
  requested: MoneyValue;
  paid: MoneyValue;
  remaining_contract: MoneyValue;
  remaining_payable: MoneyValue;
  periods: number;
  open_period_id: string | null;
  last_quality: number | null;
}

export function useSubcontractLedger(siteId: string | undefined) {
  return useQuery<LedgerRow[], Error>({
    queryKey: ['subcontract-ledger', siteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontractor_ledger', { p_site_id: siteId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as LedgerRow[];
    },
    enabled: Boolean(siteId),
  });
}

// ---------------------------------------------------------------------------
// Đợt xác nhận khối lượng
// ---------------------------------------------------------------------------

export interface PeriodRow {
  id: string;
  code: string | null;
  period_no: number;
  status: PeriodStatus;
  period_end: string;
  net_amount: MoneyValue | null;
  gross_amount: MoneyValue | null;
  retention_rate_applied: number | null;
  quality_rating: number | null;
  safety_rating: number | null;
  evaluation_notes: string | null;
  confirmed_at: string | null;
}

export function useSubcontractPeriods(subcontractorId: string | undefined) {
  return useQuery<PeriodRow[], Error>({
    queryKey: ['subcontract-periods', subcontractorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subcontract_periods')
        .select(
          'id, code, period_no, status, period_end, net_amount, gross_amount, retention_rate_applied, ' +
            'quality_rating, safety_rating, evaluation_notes, confirmed_at',
        )
        .eq('subcontractor_id', subcontractorId!)
        .is('deleted_at', null)
        .order('period_no', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PeriodRow[];
    },
    enabled: Boolean(subcontractorId),
  });
}

export function useCreatePeriod() {
  const queryClient = useQueryClient();
  return useMutation<
    string,
    Error,
    { subcontractorId: string; siteId: string; periodStart: string | null; periodEnd: string }
  >({
    mutationFn: async ({ subcontractorId, siteId, periodStart, periodEnd }) => {
      const { data, error } = await supabase
        .from('subcontract_periods')
        .insert({
          subcontractor_id: subcontractorId,
          construction_site_id: siteId,
          period_start: periodStart,
          period_end: periodEnd,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_id, { subcontractorId }) => {
      void queryClient.invalidateQueries({ queryKey: ['subcontract-periods', subcontractorId] });
      void queryClient.invalidateQueries({ queryKey: ['subcontract-ledger'] });
    },
  });
}

export interface PeriodLineDoc {
  id: string;
  line_id: string;
  item: string;
  unit: string;
  contract_quantity: number;
  quantity: number;
  unit_price_applied: MoneyValue | null;
  amount: MoneyValue | null;
  excluded: boolean;
  exclusion_reason: string | null;
  acceptance_record_id: string | null;
  acceptance_code: string | null;
  acceptance_stage: string | null;
  site_milestone_id: string | null;
  milestone_label: string | null;
  previous_quantity: number;
}

export interface PeriodDocument {
  id: string;
  code: string | null;
  period_no: number;
  status: PeriodStatus;
  period_start: string | null;
  period_end: string;
  notes: string | null;
  prepared_by_name: string | null;
  crew_signer_name: string | null;
  crew_signer_title: string | null;
  paper_scan_path: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  confirmed_at: string | null;
  confirmed_by_name: string | null;
  return_note: string | null;
  quality_rating: number | null;
  safety_rating: number | null;
  evaluation_notes: string | null;
  gross_amount: MoneyValue | null;
  retention_rate_applied: number | null;
  retention_amount: MoneyValue | null;
  net_amount: MoneyValue | null;
  requested_amount: MoneyValue;
  company: { id: string; code: string; name: string };
  site: { id: string; code: string; name: string };
  subcontractor: {
    id: string;
    name: string;
    pricing_method: PricingMethod;
    retention_rate: number | null;
    contract_id: string | null;
    cost_code: string | null;
  };
  can_edit: boolean;
  can_confirm: boolean;
  lines: PeriodLineDoc[];
  payments: {
    id: string;
    code: string | null;
    stage: string;
    amount: MoneyValue;
    paid_amount: MoneyValue;
  }[];
}

export function usePeriodDocument(id: string | undefined | null) {
  return useQuery<PeriodDocument | null, Error>({
    queryKey: ['subcontract-period', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontract_period_document', {
        p_period_id: id!,
      });
      if (error) throw new Error(error.message);
      return (data ?? null) as PeriodDocument | null;
    },
    enabled: Boolean(id),
  });
}

function useInvalidatePeriod() {
  const queryClient = useQueryClient();
  return (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['subcontract-period', id] });
    void queryClient.invalidateQueries({ queryKey: ['subcontract-periods'] });
    void queryClient.invalidateQueries({ queryKey: ['subcontract-lines'] });
    void queryClient.invalidateQueries({ queryKey: ['subcontract-ledger'] });
  };
}

export interface PeriodLineInput {
  line_id: string;
  quantity: number;
  acceptance_record_id: string | null;
  site_milestone_id: string | null;
  excluded: boolean;
  exclusion_reason: string | null;
}

export function useSavePeriodLine() {
  const invalidate = useInvalidatePeriod();
  return useMutation<void, Error, { periodId: string; rowId?: string; values: PeriodLineInput }>({
    mutationFn: async ({ periodId, rowId, values }) => {
      const query = rowId
        ? supabase.from('subcontract_period_lines').update(values).eq('id', rowId)
        : supabase.from('subcontract_period_lines').insert({ ...values, period_id: periodId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_v, { periodId }) => invalidate(periodId),
  });
}

export function useDeletePeriodLine() {
  const invalidate = useInvalidatePeriod();
  return useMutation<void, Error, { periodId: string; rowId: string }>({
    mutationFn: async ({ rowId }) => {
      const { error } = await supabase.from('subcontract_period_lines').delete().eq('id', rowId);
      if (error) throw error;
    },
    onSuccess: (_v, { periodId }) => invalidate(periodId),
  });
}

async function uploadPeriodFile(siteId: string, periodId: string, kind: string, blob: Blob) {
  const type = blob.type || 'image/png';
  const ext = type === 'application/pdf' ? 'pdf' : (type.split('/')[1] ?? 'png');
  const path = `${siteId}/${periodId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SUBCONTRACT_DOCS_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error('Không tải được chữ ký / bản giấy lên. Kiểm tra mạng rồi thử lại.');
  return path;
}

export type SignPeriodInput = {
  siteId: string;
  periodId: string;
  crewName: string;
  crewTitle: string | null;
} & (
  | { method: 'man_hinh'; crewSignature: Blob; nvgSignature: Blob }
  | { method: 'ban_giay'; paperScan: File }
);

export function useSignPeriod() {
  const invalidate = useInvalidatePeriod();
  return useMutation<void, Error, SignPeriodInput>({
    mutationFn: async (input) => {
      let crew: string | null = null;
      let nvg: string | null = null;
      let paper: string | null = null;
      if (input.method === 'man_hinh') {
        crew = await uploadPeriodFile(
          input.siteId,
          input.periodId,
          'chu-ky-to',
          input.crewSignature,
        );
        nvg = await uploadPeriodFile(
          input.siteId,
          input.periodId,
          'chu-ky-nvg',
          input.nvgSignature,
        );
      } else {
        paper = await uploadPeriodFile(input.siteId, input.periodId, 'ban-giay', input.paperScan);
      }
      const { error } = await supabase.rpc('sign_subcontract_period', {
        p_period_id: input.periodId,
        p_crew_name: input.crewName,
        p_crew_title: input.crewTitle,
        p_crew_signature_path: crew,
        p_nvg_signature_path: nvg,
        p_paper_scan_path: paper,
      });
      if (error) throw error;
    },
    onSuccess: (_v, { periodId }) => invalidate(periodId),
  });
}

export function useConfirmPeriod() {
  const invalidate = useInvalidatePeriod();
  return useMutation<
    void,
    Error,
    {
      periodId: string;
      approve: boolean;
      quality: number | null;
      safety: number | null;
      note: string | null;
    }
  >({
    mutationFn: async ({ periodId, approve, quality, safety, note }) => {
      const { error } = await supabase.rpc('confirm_subcontract_period', {
        p_period_id: periodId,
        p_approve: approve,
        p_quality: quality,
        p_safety: safety,
        p_note: note,
      });
      if (error) throw error;
    },
    onSuccess: (_v, { periodId }) => invalidate(periodId),
  });
}

export function useCreatePaymentFromPeriod() {
  const invalidate = useInvalidatePeriod();
  return useMutation<string, Error, { periodId: string; dueDate: string | null }>({
    mutationFn: async ({ periodId, dueDate }) => {
      const { data, error } = await supabase.rpc('create_payment_request_from_period', {
        p_period_id: periodId,
        p_due_date: dueDate,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_v, { periodId }) => invalidate(periodId),
  });
}

/** Căn cứ chọn được cho một dòng: biên bản nghiệm thu đã ký của công trình, mốc đã đạt. */
export interface EvidenceOptions {
  acceptances: { id: string; code: string | null; stage_name: string; signed: boolean }[];
  milestones: { id: string; label: string }[];
}

export function useEvidenceOptions(
  siteId: string | undefined,
  subcontractorId: string | undefined,
) {
  return useQuery<EvidenceOptions, Error>({
    queryKey: ['subcontract-evidence', siteId, subcontractorId],
    queryFn: async () => {
      const [acc, ms] = await Promise.all([
        supabase
          .from('acceptance_records')
          .select('id, code, stage_name, signed_at, subcontractor_id')
          .eq('construction_site_id', siteId!)
          .eq('status', 'da_nghiem_thu')
          .is('deleted_at', null)
          .order('accepted_date', { ascending: false }),
        supabase
          .from('site_milestones')
          .select('id, label, status')
          .eq('construction_site_id', siteId!)
          .eq('status', 'dat')
          .order('position'),
      ]);
      if (acc.error) throw new Error(acc.error.message);
      if (ms.error) throw new Error(ms.error.message);
      return {
        acceptances: (acc.data ?? [])
          .filter((a) => a.subcontractor_id == null || a.subcontractor_id === subcontractorId)
          .map((a) => ({
            id: a.id as string,
            code: a.code as string | null,
            stage_name: a.stage_name as string,
            signed: a.signed_at != null,
          })),
        milestones: (ms.data ?? []).map((m) => ({ id: m.id as string, label: m.label as string })),
      };
    },
    enabled: Boolean(siteId && subcontractorId),
  });
}

// ---------------------------------------------------------------------------
// Hợp đồng khoán (phía người soạn hợp đồng)
// ---------------------------------------------------------------------------

export interface AwaitingContractRow {
  subcontractor_id: string;
  company_id: string;
  site_code: string;
  site_name: string;
  name: string;
  scope_of_work: string;
  pricing_method: PricingMethod;
  contract_value: MoneyValue | null;
  approved_at: string | null;
}

export function useSubcontractorsAwaitingContract(enabled: boolean) {
  return useQuery<AwaitingContractRow[], Error>({
    queryKey: ['subcontractors-awaiting-contract'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subcontractors_awaiting_contract');
      if (error) throw new Error(error.message);
      return (data ?? []) as AwaitingContractRow[];
    },
    enabled,
  });
}

export function useCreateSubcontractContract() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, { subcontractorId: string }>({
    mutationFn: async ({ subcontractorId }) => {
      const { data, error } = await supabase.rpc('create_subcontract_contract', {
        p_subcontractor_id: subcontractorId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subcontractors-awaiting-contract'] });
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}
