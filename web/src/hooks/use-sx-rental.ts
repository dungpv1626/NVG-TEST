/**
 * G5 (migration 0245) — báo giá thuê lưu được + duyệt, kiểm tồn ba nhóm, thuê giàn giáo nội bộ
 * (QĐ-6), điều chuyển giữa công trình, đơn thuê từ hợp đồng cho thuê.
 *
 * Các thao tác nhiều bước (gửi duyệt, xuất giàn giáo, ký điều chuyển) đi qua hàm CSDL — CLAUDE.md
 * 3.1(b): ghi nhiều bảng phải toàn vẹn và quy tắc phức tạp hơn RLS. Báo giá nháp là CRUD thường.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RentalItemInput } from './use-sx';

const num = (v: unknown) => Number(v ?? 0);

/* ------------------------------------------------------------------------ *
 * Kiểm tồn ba nhóm
 * ------------------------------------------------------------------------ */

export interface ExpectedReturn {
  code: string;
  date: string;
  quantity: number;
}

export interface AvailabilityRow {
  material_id: string;
  code: string;
  name: string;
  specification: string | null;
  unit: string | null;
  /** Tồn chắc chắn ở kho: mới + còn dùng được. */
  available: number;
  /** Dự kiến thu hồi TRƯỚC ngày cần — không cộng vào tồn chắc chắn. */
  returning: number;
  returningList: ExpectedReturn[];
  underRepair: number;
}

export function useRentalAvailability(companyId: string | null, neededDate: string | null) {
  return useQuery<AvailabilityRow[], Error>({
    queryKey: ['rental_availability', companyId, neededDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rental_availability', {
        p_company_id: companyId!,
        p_needed_date: neededDate || null,
      });
      if (error) throw new Error(error.message);
      return (
        (data ?? []) as {
          material_id: string;
          code: string;
          name: string;
          specification: string | null;
          unit: string | null;
          available: unknown;
          returning_qty: unknown;
          returning_list: { code: string; date: string; quantity: unknown }[] | null;
          under_repair: unknown;
        }[]
      ).map((r) => ({
        material_id: r.material_id,
        code: r.code,
        name: r.name,
        specification: r.specification,
        unit: r.unit,
        available: num(r.available),
        returning: num(r.returning_qty),
        returningList: (r.returning_list ?? []).map((x) => ({ ...x, quantity: num(x.quantity) })),
        underRepair: num(r.under_repair),
      }));
    },
    enabled: Boolean(companyId),
  });
}

/** Đơn giá theo mã sản phẩm của một tham số (`sx.rental_daily_rate`, `internal_rental_price`). */
export function useProductPrices(paramKey: 'sx.rental_daily_rate' | 'internal_rental_price') {
  return useQuery<Record<string, number>, Error>({
    queryKey: ['product-prices', paramKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_parameters')
        .select('scope_id, value')
        .eq('param_key', paramKey)
        .eq('scope_type', 'product')
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as { scope_id: string | null; value: unknown }[]) {
        const n = Number(r.value);
        if (r.scope_id && r.value !== null && Number.isFinite(n) && n > 0) out[r.scope_id] = n;
      }
      return out;
    },
  });
}

/* ------------------------------------------------------------------------ *
 * Báo giá thuê lưu được
 * ------------------------------------------------------------------------ */

export type RentalQuoteStatus = 'nhap' | 'cho_duyet' | 'da_duyet' | 'tu_choi';

export const RENTAL_QUOTE_STATUS_LABELS: Record<RentalQuoteStatus, string> = {
  nhap: 'Nháp',
  cho_duyet: 'Chờ duyệt',
  da_duyet: 'Đã duyệt',
  tu_choi: 'Bị từ chối',
};

export interface RentalQuoteItem {
  id: string;
  material_id: string;
  kind: 'thue' | 'mua';
  quantity: number;
  unit_price: number;
  list_price: number | null;
  note: string | null;
  material: { code: string; name: string; unit: string | null } | null;
}

export interface RentalQuote {
  id: string;
  code: string;
  company_id: string;
  customer_id: string;
  needed_date: string | null;
  expected_end_date: string | null;
  delivery_note: string | null;
  deposit_amount: number;
  notes: string | null;
  status: RentalQuoteStatus;
  special_price: boolean | null;
  credit_exceeded: boolean | null;
  credit_limit_applied: number | null;
  outstanding_at_submit: number | null;
  estimated_total: number | null;
  decision_note: string | null;
  created_at: string;
  customer: { code: string; name: string } | null;
  items: RentalQuoteItem[];
}

const QUOTE_SELECT =
  'id, code, company_id, customer_id, needed_date, expected_end_date, delivery_note, deposit_amount, ' +
  'notes, status, special_price, credit_exceeded, credit_limit_applied, outstanding_at_submit, ' +
  'estimated_total, decision_note, created_at, customer:customers(code, name), ' +
  'items:rental_quote_items(id, material_id, kind, quantity, unit_price, list_price, note, ' +
  'material:materials(code, name, unit))';

function toQuote(r: Record<string, unknown>): RentalQuote {
  const q = r as unknown as RentalQuote;
  return {
    ...q,
    deposit_amount: num(q.deposit_amount),
    estimated_total: q.estimated_total === null ? null : num(q.estimated_total),
    credit_limit_applied: q.credit_limit_applied === null ? null : num(q.credit_limit_applied),
    outstanding_at_submit: q.outstanding_at_submit === null ? null : num(q.outstanding_at_submit),
    items: (q.items ?? []).map((i) => ({
      ...i,
      quantity: num(i.quantity),
      unit_price: num(i.unit_price),
      list_price: i.list_price === null ? null : num(i.list_price),
    })),
  };
}

export function useRentalQuotes(companyId: string | null) {
  return useQuery<RentalQuote[], Error>({
    queryKey: ['rental-quotes', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_quotes')
        .select(QUOTE_SELECT)
        .eq('company_id', companyId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toQuote);
    },
    enabled: Boolean(companyId),
  });
}

export interface QuoteLineInput {
  material_id: string;
  kind: 'thue' | 'mua';
  quantity: number;
  unit_price: number;
  note?: string | null;
}

export interface SaveQuoteInput {
  id: string | null;
  companyId: string;
  customerId: string;
  neededDate: string | null;
  expectedEndDate: string | null;
  deliveryNote: string | null;
  depositAmount: number;
  notes: string | null;
  lines: QuoteLineInput[];
}

/** Lưu nháp báo giá: đầu báo giá + thay toàn bộ dòng (chỉ khi còn Nháp / Bị từ chối — RLS). */
export function useSaveRentalQuote() {
  const qc = useQueryClient();
  return useMutation<string, Error, SaveQuoteInput>({
    mutationFn: async (input) => {
      const head = {
        company_id: input.companyId,
        customer_id: input.customerId,
        needed_date: input.neededDate,
        expected_end_date: input.expectedEndDate,
        delivery_note: input.deliveryNote,
        deposit_amount: input.depositAmount,
        notes: input.notes,
      };
      let id = input.id;
      if (id) {
        const { error } = await supabase
          .from('rental_quotes')
          .update({
            needed_date: head.needed_date,
            expected_end_date: head.expected_end_date,
            delivery_note: head.delivery_note,
            deposit_amount: head.deposit_amount,
            notes: head.notes,
          })
          .eq('id', id);
        if (error) throw new Error(error.message);
        const del = await supabase.from('rental_quote_items').delete().eq('rental_quote_id', id);
        if (del.error) throw new Error(del.error.message);
      } else {
        const { data, error } = await supabase
          .from('rental_quotes')
          .insert(head)
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        id = (data as { id: string }).id;
      }
      if (input.lines.length > 0) {
        const { error } = await supabase
          .from('rental_quote_items')
          .insert(input.lines.map((l) => ({ ...l, rental_quote_id: id })));
        if (error) throw new Error(error.message);
      }
      return id!;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['rental-quotes'] }),
  });
}

export function useSubmitRentalQuote() {
  const qc = useQueryClient();
  return useMutation<'da_duyet' | 'cho_duyet', Error, string>({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc('submit_rental_quote', { p_quote_id: id });
      if (error) throw new Error(error.message);
      return data as 'da_duyet' | 'cho_duyet';
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['rental-quotes'] }),
  });
}

/* ------------------------------------------------------------------------ *
 * Đơn thuê từ hợp đồng cho thuê đã ký
 * ------------------------------------------------------------------------ */

export interface RentalContractReady {
  contract_id: string;
  code: string;
  contract_number: string | null;
  title: string;
  customer_id: string;
  customer_name: string | null;
  start_date: string | null;
  end_date: string | null;
  agreements: number;
  quote_id: string | null;
  quote_code: string | null;
}

export function useRentalContractsReady(companyId: string | null) {
  return useQuery<RentalContractReady[], Error>({
    queryKey: ['rental-contracts-ready', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rental_contracts_ready', {
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as RentalContractReady[];
    },
    enabled: Boolean(companyId),
  });
}

export interface CreateFromContractInput {
  contractId: string;
  quoteId: string | null;
  startDate: string;
  expectedEndDate: string | null;
  siteAddress: string | null;
  depositAmount: number;
  notes: string;
  items: RentalItemInput[];
}

export function useCreateRentalFromContract() {
  const qc = useQueryClient();
  return useMutation<string, Error, CreateFromContractInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('create_rental_agreement_from_contract', {
        p_contract_id: input.contractId,
        p_rental_quote_id: input.quoteId,
        p_start_date: input.startDate,
        p_expected_end_date: input.expectedEndDate,
        p_site_address: input.siteAddress,
        p_deposit_amount: input.depositAmount,
        p_notes: input.notes,
        p_items: input.items,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rental-agreements'] });
      void qc.invalidateQueries({ queryKey: ['rental-contracts-ready'] });
    },
  });
}

/** Đơn thuê đã lập từ một hợp đồng — cho trang hợp đồng. */
export function useContractRentalAgreements(contractId: string | undefined, enabled: boolean) {
  return useQuery<
    { id: string; code: string; status: string; start_date: string; is_internal: boolean }[],
    Error
  >({
    queryKey: ['rental-agreements', 'contract', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_agreements')
        .select('id, code, status, start_date, is_internal')
        .eq('contract_id', contractId!)
        .is('deleted_at', null)
        .order('start_date');
      if (error) throw new Error(error.message);
      return (data ?? []) as {
        id: string;
        code: string;
        status: string;
        start_date: string;
        is_internal: boolean;
      }[];
    },
    enabled: Boolean(contractId) && enabled,
  });
}

/* ------------------------------------------------------------------------ *
 * Thuê giàn giáo nội bộ
 * ------------------------------------------------------------------------ */

export type InternalRequestStatus =
  'cho_nvs' | 'cho_duyet' | 'da_duyet' | 'tu_choi' | 'da_xuat' | 'huy';

export const INTERNAL_REQUEST_STATUS_LABELS: Record<InternalRequestStatus, string> = {
  cho_nvs: 'Chờ Nhà Việt Steel chuẩn bị',
  cho_duyet: 'Chờ Ban Giám đốc duyệt',
  da_duyet: 'Đã duyệt — chờ xuất hàng',
  tu_choi: 'Bị từ chối',
  da_xuat: 'Đã xuất giàn giáo',
  huy: 'Đã huỷ',
};

export interface InternalRequest {
  id: string;
  code: string;
  company_id: string;
  requesting_company_id: string;
  construction_site_id: string;
  site_label: string;
  needed_date: string;
  expected_return_date: string | null;
  notes: string | null;
  status: InternalRequestStatus;
  estimated_total: number | null;
  rental_agreement_id: string | null;
  rental_agreement_code: string | null;
  decision_note: string | null;
  created_at: string;
  requested_by: string | null;
  requester: { full_name: string } | null;
  items: {
    id: string;
    material_id: string;
    quantity: number;
    material: { code: string; name: string; unit: string | null } | null;
  }[];
}

const REQUEST_SELECT =
  'id, code, company_id, requesting_company_id, construction_site_id, site_label, needed_date, ' +
  'expected_return_date, notes, status, estimated_total, rental_agreement_id, rental_agreement_code, ' +
  'decision_note, created_at, requested_by, requester:users!internal_rental_requests_requested_by_fkey(full_name), ' +
  'items:internal_rental_request_items(id, material_id, quantity, material:materials(code, name, unit))';

function toRequest(r: Record<string, unknown>): InternalRequest {
  const x = r as unknown as InternalRequest;
  return {
    ...x,
    estimated_total: x.estimated_total === null ? null : num(x.estimated_total),
    items: (x.items ?? []).map((i) => ({ ...i, quantity: num(i.quantity) })),
  };
}

export function useInternalRentalRequests(filter: { siteId?: string; companyId?: string | null }) {
  return useQuery<InternalRequest[], Error>({
    queryKey: ['internal-rental-requests', filter.siteId ?? null, filter.companyId ?? null],
    queryFn: async () => {
      let q = supabase.from('internal_rental_requests').select(REQUEST_SELECT);
      if (filter.siteId) q = q.eq('construction_site_id', filter.siteId);
      if (filter.companyId) q = q.eq('company_id', filter.companyId);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(toRequest);
    },
    enabled: Boolean(filter.siteId || filter.companyId),
  });
}

function useRequestMutation<V>(fn: (v: V) => PromiseLike<{ error: { message: string } | null }>) {
  const qc = useQueryClient();
  return useMutation<void, Error, V>({
    mutationFn: async (v) => {
      const { error } = await fn(v);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['internal-rental-requests'] });
      void qc.invalidateQueries({ queryKey: ['rental-agreements'] });
    },
  });
}

export function useRequestInternalRental() {
  return useRequestMutation(
    (v: {
      siteId: string;
      neededDate: string;
      expectedReturnDate: string | null;
      notes: string;
      items: { material_id: string; quantity: number }[];
    }) =>
      supabase.rpc('request_internal_rental', {
        p_site_id: v.siteId,
        p_needed_date: v.neededDate,
        p_expected_return_date: v.expectedReturnDate,
        p_notes: v.notes,
        p_items: v.items,
      }),
  );
}

export function usePrepareInternalRental() {
  return useRequestMutation((v: { id: string; note: string | null }) =>
    supabase.rpc('prepare_internal_rental_request', { p_request_id: v.id, p_note: v.note }),
  );
}

export function useCloseInternalRental() {
  return useRequestMutation((v: { id: string; reason: string }) =>
    supabase.rpc('close_internal_rental_request', { p_request_id: v.id, p_reason: v.reason }),
  );
}

export function useIssueInternalRental() {
  return useRequestMutation((v: { id: string; startDate: string }) =>
    supabase.rpc('issue_internal_rental', { p_request_id: v.id, p_start_date: v.startDate }),
  );
}

/* ------------------------------------------------------------------------ *
 * Điều chuyển giữa công trình
 * ------------------------------------------------------------------------ */

export interface RentalTransfer {
  id: string;
  code: string;
  transfer_date: string;
  to_site_label: string;
  status: 'nhap' | 'da_ky' | 'huy';
  to_agreement_id: string | null;
  customer_representative: string | null;
  signed_at: string | null;
  items: {
    material_id: string;
    quantity: number;
    material: { code: string; name: string } | null;
  }[];
}

export function useRentalTransfers(agreementId: string | undefined) {
  return useQuery<RentalTransfer[], Error>({
    queryKey: ['rental-transfers', agreementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_transfers')
        .select(
          'id, code, transfer_date, to_site_label, status, to_agreement_id, customer_representative, ' +
            'signed_at, items:rental_transfer_items(material_id, quantity, material:materials(code, name))',
        )
        .eq('from_agreement_id', agreementId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as RentalTransfer[]).map((t) => ({
        ...t,
        items: t.items.map((i) => ({ ...i, quantity: num(i.quantity) })),
      }));
    },
    enabled: Boolean(agreementId),
  });
}

function useTransferMutation<V, R = void>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rental-transfers'] });
      void qc.invalidateQueries({ queryKey: ['rental-agreements'] });
      void qc.invalidateQueries({ queryKey: ['rental-agreement-items'] });
      void qc.invalidateQueries({ queryKey: ['rental-returns'] });
    },
  });
}

export function useCreateRentalTransfer() {
  return useTransferMutation(
    async (v: {
      fromAgreementId: string;
      transferDate: string;
      toSiteId: string | null;
      toSiteLabel: string;
      items: { material_id: string; quantity: number }[];
      notes: string;
    }) => {
      const { data, error } = await supabase.rpc('create_rental_transfer', {
        p_from_agreement_id: v.fromAgreementId,
        p_transfer_date: v.transferDate,
        p_to_site_id: v.toSiteId,
        p_to_site_label: v.toSiteLabel || null,
        p_items: v.items,
        p_notes: v.notes,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
  );
}

/** Công trình NVG nhận được khi điều chuyển đơn nội bộ (Xưởng không xem phân hệ Thi công). */
export function useTransferTargetSites(agreementId: string | undefined, enabled: boolean) {
  return useQuery<{ site_id: string; company_code: string; code: string; name: string }[], Error>({
    queryKey: ['rental-transfer-target-sites', agreementId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rental_transfer_target_sites', {
        p_from_agreement_id: agreementId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as {
        site_id: string;
        company_code: string;
        code: string;
        name: string;
      }[];
    },
    enabled: Boolean(agreementId) && enabled,
  });
}

export function useCancelRentalTransfer() {
  return useTransferMutation(async (id: string) => {
    const { error } = await supabase.rpc('cancel_rental_transfer', { p_transfer_id: id });
    if (error) throw new Error(error.message);
  });
}

export const RENTAL_TRANSFER_BUCKET = 'rental-transfer-docs';

export async function uploadTransferFile(
  transferId: string,
  kind: string,
  file: Blob & { name?: string },
) {
  const ext = file.name?.split('.').pop()?.toLowerCase() ?? file.type.split('/').pop() ?? 'png';
  const path = `${transferId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(RENTAL_TRANSFER_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/png', upsert: false });
  if (error) throw new Error('Không tải được chữ ký hoặc ảnh biên bản. Kiểm tra mạng rồi thử lại.');
  return path;
}

export function useSignRentalTransfer() {
  return useTransferMutation(
    async (v: {
      id: string;
      representative: string;
      customerSignature: string | null;
      nvgSignature: string | null;
      paperScan: string | null;
    }) => {
      const { data, error } = await supabase.rpc('sign_rental_transfer', {
        p_transfer_id: v.id,
        p_customer_representative: v.representative,
        p_customer_signature_path: v.customerSignature,
        p_nvg_signature_path: v.nvgSignature,
        p_paper_scan_path: v.paperScan,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
  );
}
