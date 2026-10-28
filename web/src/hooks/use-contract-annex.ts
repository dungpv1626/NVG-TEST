/**
 * Phụ lục hợp đồng / biên bản thanh lý soạn từ mẫu (0229) — mẫu `contract_templates.document_kind`, văn bản đã điền
 * `contract_annex_documents` (bất biến, đánh số bản), tệp ở kho `contract-documents/<hợp đồng>/phu-luc-*|thanh-ly-*`.
 * Tải tệp TRƯỚC, ghi dòng SAU (như văn bản hợp đồng — `use-contract-templates.ts`).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOCX_MIME } from '@/lib/docx-template';
import { supabase } from '@/lib/supabase';
import {
  DOCUMENT_BUCKET,
  type ContractTemplateRecord,
  type TemplateDocumentKind,
} from './use-contract-templates';

export type AnnexKind = Extract<TemplateDocumentKind, 'phu_luc' | 'thanh_ly'>;

const TEMPLATE_SELECT =
  'id, company_id, title, contract_type, document_kind, price_form, storage_path, file_name, tags, ' +
  'payment_milestones, free_fields, options, is_active, notes, created_at';

/** Mẫu phụ lục / thanh lý đang dùng của pháp nhân — xếp theo tên (DC-01A, DC-01B…). */
export function useAnnexTemplates(companyId: string | undefined, kind: AnnexKind) {
  return useQuery<ContractTemplateRecord[], Error>({
    queryKey: ['contract-templates', 'annex', companyId, kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_templates')
        .select(TEMPLATE_SELECT)
        .eq('company_id', companyId!)
        .eq('document_kind', kind)
        .eq('is_active', true)
        .order('title', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractTemplateRecord[];
    },
    enabled: Boolean(companyId),
  });
}

export interface AnnexDocumentRecord {
  id: string;
  kind: AnnexKind;
  amendment_id: string | null;
  template_id: string | null;
  version: number;
  storage_path: string;
  file_name: string;
  filled_values: Record<string, unknown>;
  missing_fields: string[];
  change_reason: string | null;
  created_at: string;
  template: { title: string } | null;
  creator: { full_name: string } | null;
}

/** Mọi văn bản kèm theo của một hợp đồng, mới nhất trước. */
export function useAnnexDocuments(contractId: string | undefined) {
  return useQuery<AnnexDocumentRecord[], Error>({
    queryKey: ['contracts', 'annex-documents', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_annex_documents')
        .select(
          'id, kind, amendment_id, template_id, version, storage_path, file_name, filled_values, ' +
            'missing_fields, change_reason, created_at, template:contract_templates(title), ' +
            'creator:users!contract_annex_documents_created_by_fkey(full_name)',
        )
        .eq('contract_id', contractId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AnnexDocumentRecord[];
    },
    enabled: Boolean(contractId),
  });
}

export function useSaveAnnexDocument() {
  const queryClient = useQueryClient();
  return useMutation<
    number,
    Error,
    {
      contractId: string;
      companyId: string;
      kind: AnnexKind;
      amendmentId: string | null;
      templateId: string;
      blob: Blob;
      fileName: string;
      filledValues: Record<string, unknown>;
      missingFields: string[];
      changeReason: string | null;
    }
  >({
    mutationFn: async (v) => {
      const prefix = v.kind === 'phu_luc' ? 'phu-luc' : 'thanh-ly';
      const path = `${v.contractId}/${prefix}-${crypto.randomUUID()}.docx`;
      const up = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(path, v.blob, { contentType: DOCX_MIME, upsert: false });
      if (up.error) throw new Error('Không lưu được văn bản. Kiểm tra mạng rồi thử lại.');
      const { data, error } = await supabase
        .from('contract_annex_documents')
        .insert({
          contract_id: v.contractId,
          company_id: v.companyId,
          kind: v.kind,
          amendment_id: v.amendmentId,
          template_id: v.templateId,
          storage_path: path,
          file_name: v.fileName,
          filled_values: v.filledValues,
          missing_fields: v.missingFields,
          change_reason: v.changeReason,
        })
        .select('version')
        .single();
      if (error) throw error;
      return data.version as number;
    },
    onSuccess: (_v, { contractId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['contracts', 'annex-documents', contractId],
      });
    },
  });
}
