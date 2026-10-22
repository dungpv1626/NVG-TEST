/**
 * Đề nghị thu tiền gửi chủ đầu tư (Đợt 3 — 3B, migration 0196).
 *
 * Máy soạn NHÁP từ biên bản nghiệm thu đã ký (`create_collection_request` — bấm lại thì trả bản
 * đang có); Kế toán sửa nội dung bằng cập nhật thường (chỉ khi còn nháp), còn Gửi / Ghi công nợ /
 * Hủy đi qua hàm. Bản quét ở kho `collection-docs`, thư mục đầu = đề nghị.
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
  contract: { code: string; contract_number: string | null; title: string } | null;
  site: { code: string; name: string } | null;
  company: { code: string; legal_name: string | null; short_name: string } | null;
}

const REQUEST_SELECT =
  'id, company_id, code, contract_id, construction_site_id, acceptance_record_id, contract_term_id, ' +
  'party_name, title, amount, basis, content, due_date, status, sent_at, recorded_at, receivable_id, ' +
  'scan_path, cancel_reason, created_at, ' +
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
  | { kind: 'record'; id: string; dueDate: string | null; invoiceNumber: string | null }
  | { kind: 'cancel'; id: string; reason: string };

export function useCollectionRequestAction() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, CollectionAction>({
    mutationFn: async (action) => {
      const { error } =
        action.kind === 'send'
          ? await supabase.rpc('send_collection_request', { p_id: action.id })
          : action.kind === 'record'
            ? await supabase.rpc('record_collection_receivable', {
                p_id: action.id,
                p_due_date: action.dueDate,
                p_invoice_number: action.invoiceNumber,
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
