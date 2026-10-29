/**
 * Đề nghị thu tiền gửi chủ đầu tư (Đợt 3 — 3B, migration 0196).
 *
 * Máy soạn NHÁP từ biên bản nghiệm thu đã ký (`create_collection_request` — bấm lại thì trả bản
 * đang có); Kế toán sửa nội dung bằng cập nhật thường (chỉ khi còn nháp), còn Gửi / Ghi công nợ /
 * Hủy đi qua hàm. Bản quét ở kho `collection-docs`, thư mục đầu = đề nghị.
 *
 * G3 (0248): hồ sơ NVC gắn công trình qua bốn bước kiểm nội bộ (công trường → Thi công → Dự án / QS → Kế
 * toán) trước khi gửi; sau khi gửi Kế toán ghi số chủ đầu tư duyệt (kèm bản quét) và tiền giữ lại; «Ghi
 * công nợ» sinh khoản phải thu = số duyệt − giữ lại, cộng một khoản «giữ lại» riêng.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyValue } from '@nvg/shared';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export const COLLECTION_DOCS_BUCKET = 'collection-docs';

export type CollectionRequestStatus = 'nhap' | 'da_gui' | 'da_ghi_cong_no' | 'huy';

export const COLLECTION_REQUEST_STATUS_LABELS: Record<CollectionRequestStatus, string> = {
  nhap: 'Nháp',
  da_gui: 'Đã gửi khách',
  da_ghi_cong_no: 'Đã ghi công nợ',
  huy: 'Đã hủy',
};

export type CollectionCheckStatus = 'dang_kiem' | 'da_kiem' | 'tra_lai';

/** Bốn bước kiểm — khớp `collection_check_step_label` (0248). */
export const COLLECTION_CHECK_STEPS = [
  'Ban công trường xác nhận khối lượng',
  'Trưởng phòng Thi công kiểm',
  'Dự án / QS kiểm',
  'Kế toán kiểm',
] as const;

interface ReceivableBrief {
  id: string;
  code: string | null;
  amount: MoneyValue;
  settled_amount: MoneyValue;
  due_date: string | null;
}

export interface CollectionRequestRecord {
  id: string;
  company_id: string;
  code: string;
  contract_id: string;
  construction_site_id: string | null;
  acceptance_record_id: string | null;
  contract_term_id: string | null;
  party_name: string | null;
  title: string;
  amount: MoneyValue;
  basis: string;
  content: string | null;
  due_date: string | null;
  status: CollectionRequestStatus;
  sent_at: string | null;
  recorded_at: string | null;
  receivable_id: string | null;
  scan_path: string | null;
  cancel_reason: string | null;
  created_at: string;
  check_required: boolean;
  check_status: CollectionCheckStatus | null;
  check_step: number | null;
  check_round: number;
  owner_approved_amount: MoneyValue | null;
  owner_approved_date: string | null;
  owner_approval_scan_path: string | null;
  retention_rate: number | null;
  retention_amount: MoneyValue | null;
  invoice_number: string | null;
  invoice_date: string | null;
  retention_receivable_id: string | null;
  receivable: ReceivableBrief | null;
  retention_receivable: ReceivableBrief | null;
  contract: { code: string; contract_number: string | null; title: string } | null;
  site: { code: string; name: string } | null;
  company: { code: string; legal_name: string | null; short_name: string } | null;
}

const REQUEST_SELECT =
  'id, company_id, code, contract_id, construction_site_id, acceptance_record_id, contract_term_id, ' +
  'party_name, title, amount, basis, content, due_date, status, sent_at, recorded_at, receivable_id, ' +
  'scan_path, cancel_reason, created_at, check_required, check_status, check_step, check_round, ' +
  'owner_approved_amount, owner_approved_date, owner_approval_scan_path, retention_rate, retention_amount, ' +
  'invoice_number, invoice_date, retention_receivable_id, ' +
  'receivable:receivables_payables!collection_requests_receivable_id_fkey(id, code, amount, settled_amount, due_date), ' +
  'retention_receivable:receivables_payables!collection_requests_retention_receivable_id_fkey(id, code, amount, settled_amount, due_date), ' +
  'contract:contracts(code, contract_number, title), ' +
  'site:construction_sites(code, name), company:companies(code, legal_name, short_name)';

export function useCollectionRequests() {
  const scope = useCompanyScope();
  return useQuery<CollectionRequestRecord[], Error>({
    queryKey: ['collection-requests', scope.companyId],
    queryFn: async () => {
      let q = supabase.from('collection_requests').select(REQUEST_SELECT);
      // «Toàn NVG» bỏ điều kiện lọc, để RLS quyết phạm vi (CLAUDE.md 3.5).
      if (!scope.isAggregate && scope.companyId) q = q.eq('company_id', scope.companyId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CollectionRequestRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useCollectionRequest(id: string | undefined) {
  return useQuery<CollectionRequestRecord, Error>({
    queryKey: ['collection-requests', 'one', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_requests')
        .select(REQUEST_SELECT)
        .eq('id', id!)
        .single();
      if (error) throw new Error(error.message);
      return data as unknown as CollectionRequestRecord;
    },
    enabled: Boolean(id),
  });
}

export function useCreateCollectionRequest() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, { acceptanceId?: string; termId?: string }>({
    mutationFn: async ({ acceptanceId, termId }) => {
      const { data, error } = await supabase.rpc('create_collection_request', {
        p_acceptance_id: acceptanceId ?? null,
        p_term_id: termId ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection-requests'] });
    },
  });
}

export interface CollectionRequestEdit {
  title?: string;
  basis?: string;
  content?: string | null;
  due_date?: string | null;
  scan_path?: string | null;
  /** Chuỗi chữ số thô từ `MoneyInput`. */
  amount?: string;
}

export function useUpdateCollectionRequest() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; values: CollectionRequestEdit }>({
    mutationFn: async ({ id, values }) => {
      const { error } = await supabase
        .from('collection_requests')
        .update(values)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection-requests'] });
    },
  });
}

export type CollectionAction =
  | { kind: 'send'; id: string }
  | {
      kind: 'record';
      id: string;
      dueDate: string | null;
      invoiceNumber: string | null;
      invoiceDate?: string | null;
    }
  | { kind: 'start_check'; id: string }
  | { kind: 'cancel'; id: string; reason: string };

export function useCollectionRequestAction() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, CollectionAction>({
    mutationFn: async (action) => {
      const { error } =
        action.kind === 'send'
          ? await supabase.rpc('send_collection_request', { p_id: action.id })
          : action.kind === 'start_check'
            ? await supabase.rpc('start_collection_check', { p_id: action.id })
            : action.kind === 'record'
              ? await supabase.rpc('record_collection_receivable', {
                  p_id: action.id,
                  p_due_date: action.dueDate,
                  p_invoice_number: action.invoiceNumber,
                  p_invoice_date: action.invoiceDate ?? null,
                })
              : await supabase.rpc('cancel_collection_request', {
                  p_id: action.id,
                  p_reason: action.reason,
                });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['kt-signed-acceptances'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      void queryClient.invalidateQueries({ queryKey: ['collection-checks'] });
    },
  });
}

export interface CollectionCheckRecord {
  id: string;
  round_no: number;
  step_no: number;
  decision: 'dat' | 'tra_lai';
  note: string | null;
  decided_at: string;
  decider: { full_name: string } | null;
}

/** Các lần kiểm của một hồ sơ (mọi vòng) — Kế toán / lãnh đạo đọc. */
export function useCollectionChecks(requestId: string | undefined) {
  return useQuery<CollectionCheckRecord[], Error>({
    queryKey: ['collection-checks', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_request_checks')
        .select(
          'id, round_no, step_no, decision, note, decided_at, decider:users!collection_request_checks_decided_by_fkey(full_name)',
        )
        .eq('collection_request_id', requestId!)
        .order('round_no', { ascending: false })
        .order('step_no');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CollectionCheckRecord[];
    },
    enabled: Boolean(requestId),
  });
}

export interface MyCollectionCheck {
  id: string;
  company_code: string;
  code: string;
  title: string;
  step_no: number;
  step_label: string;
  round_no: number;
  /** Rỗng với người không xem được phân hệ Hợp đồng (Thi công). */
  contract_number: string | null;
  amount: MoneyValue | null;
  basis: string | null;
  site_id: string | null;
  site_code: string | null;
  site_name: string | null;
  acceptance_id: string | null;
  acceptance_code: string | null;
  acceptance_stage: string | null;
  previous_checks: {
    step_no: number;
    step_label: string;
    decision: 'dat' | 'tra_lai';
    note: string | null;
    decided_at: string;
    decided_by: string;
  }[];
  waiting_since: string;
}

/** Hồ sơ thanh toán đang chờ chính người đăng nhập kiểm (0248 `my_collection_checks`). */
export function useMyCollectionChecks() {
  return useQuery<MyCollectionCheck[], Error>({
    queryKey: ['collection-checks', 'mine'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_collection_checks');
      if (error) throw new Error(error.message);
      return (data ?? []) as MyCollectionCheck[];
    },
  });
}

export function useDecideCollectionCheck() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, { id: string; pass: boolean; note: string | null }>({
    mutationFn: async ({ id, pass, note }) => {
      const { data, error } = await supabase.rpc('decide_collection_check', {
        p_id: id,
        p_pass: pass,
        p_note: note,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection-checks'] });
      void queryClient.invalidateQueries({ queryKey: ['collection-requests'] });
    },
  });
}

/** Tỷ lệ giữ lại ghi ở điều khoản Bảo hành của hợp đồng — gợi ý khi ghi số chủ đầu tư duyệt. */
export function useContractRetentionRate(contractId: string | undefined) {
  return useQuery<number | null, Error>({
    queryKey: ['contract-retention-rate', contractId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contract_retention_rate', {
        p_contract_id: contractId!,
      });
      if (error) throw new Error(error.message);
      return data === null || data === undefined ? null : Number(data);
    },
    enabled: Boolean(contractId),
  });
}

export interface OwnerApprovalInput {
  id: string;
  file: File;
  /** Chuỗi chữ số thô từ `MoneyInput`. */
  approvedAmount: string;
  approvedDate: string;
  retentionRate: number | null;
  /** Chuỗi chữ số thô; rỗng = tính theo tỷ lệ. */
  retentionAmount: string | null;
}

/** Tải bản chủ đầu tư duyệt lên kho rồi ghi số duyệt + tiền giữ lại. */
export function useRecordOwnerApproval() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, OwnerApprovalInput>({
    mutationFn: async (input) => {
      const path = `${input.id}/chu-dau-tu-duyet-${crypto.randomUUID()}.pdf`;
      const { error: upload } = await supabase.storage
        .from(COLLECTION_DOCS_BUCKET)
        .upload(path, input.file, {
          contentType: input.file.type || 'application/pdf',
          upsert: false,
        });
      if (upload)
        throw new Error('Không tải được bản chủ đầu tư duyệt lên. Kiểm tra mạng rồi thử lại.');
      const { error } = await supabase.rpc('record_collection_owner_approval', {
        p_id: input.id,
        p_approved_amount: input.approvedAmount,
        p_approved_date: input.approvedDate,
        p_scan_path: path,
        p_retention_rate: input.retentionRate,
        p_retention_amount: input.retentionAmount || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection-requests'] });
    },
  });
}

/** Tải bản quét (PDF từ `DocumentScanner`) vào kho rồi gắn vào đề nghị. */
export function useAttachCollectionScan() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; file: File }>({
    mutationFn: async ({ id, file }) => {
      const path = `${id}/ban-quet-${crypto.randomUUID()}.pdf`;
      const { error: upload } = await supabase.storage
        .from(COLLECTION_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
      if (upload) throw new Error('Không tải được bản quét lên. Kiểm tra mạng rồi thử lại.');
      const { error } = await supabase
        .from('collection_requests')
        .update({ scan_path: path })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collection-requests'] });
    },
  });
}

export async function collectionScanUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(COLLECTION_DOCS_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
