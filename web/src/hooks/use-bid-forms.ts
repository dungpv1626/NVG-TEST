/**
 * Hồ sơ dự thầu / biên bản thương thảo soạn từ mẫu (0236) — mẫu ở `contract_templates` (`document_kind`
 * ho_so_du_thau / thuong_thao), văn bản đã điền ở `bid_form_documents` (bất biến, đánh số bản), ô đang điền ở
 * `bid_form_inputs` (lưu dần theo gói thầu). Tệp ở kho `bid-documents/<gói thầu>/ho-so-du-thau-*|thuong-thao-*`.
 * Tải tệp TRƯỚC, ghi dòng SAU (như văn bản hợp đồng — `use-contract-templates.ts`).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BidFormInputs, BidFormKind, MoneyValue } from '@nvg/shared';
import { DOCX_MIME } from '@/lib/docx-template';
import { supabase } from '@/lib/supabase';
import type { ContractTemplateRecord } from './use-contract-templates';

export const BID_DOCUMENT_BUCKET = 'bid-documents';

const TEMPLATE_SELECT =
  'id, company_id, title, contract_type, document_kind, price_form, storage_path, file_name, tags, ' +
  'payment_milestones, free_fields, options, is_active, notes, created_at';

/** Mẫu đang dùng của pháp nhân cho một loại văn bản gói thầu. */
export function useBidFormTemplates(companyId: string | undefined, kind: BidFormKind) {
  return useQuery<ContractTemplateRecord[], Error>({
    queryKey: ['contract-templates', 'bid', companyId, kind],
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

export interface BidFormDocumentRecord {
  id: string;
  kind: BidFormKind;
  template_id: string | null;
  version: number;
  storage_path: string;
  file_name: string;
  filled_values: Record<string, unknown>;
  missing_fields: string[];
  change_reason: string | null;
  created_at: string;
  creator: { full_name: string } | null;
}

/** Mọi văn bản đã lưu của gói thầu, mới nhất trước. */
export function useBidFormDocuments(projectId: string | undefined) {
  return useQuery<BidFormDocumentRecord[], Error>({
    queryKey: ['bid-form-documents', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bid_form_documents')
        .select(
          'id, kind, template_id, version, storage_path, file_name, filled_values, missing_fields, ' +
            'change_reason, created_at, creator:users!bid_form_documents_created_by_fkey(full_name)',
        )
        .eq('bidding_project_id', projectId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BidFormDocumentRecord[];
    },
    enabled: Boolean(projectId),
  });
}

/** Ô đang điền (nháp) của một loại văn bản. Chưa có thì `null`. */
export function useBidFormInputs(projectId: string | undefined, kind: BidFormKind) {
  return useQuery<BidFormInputs | null, Error>({
    queryKey: ['bid-form-inputs', projectId, kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bid_form_inputs')
        .select('values')
        .eq('bidding_project_id', projectId!)
        .eq('kind', kind)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.values ?? null) as BidFormInputs | null;
    },
    enabled: Boolean(projectId),
    staleTime: Infinity,
  });
}

export function useSaveBidFormInputs() {
  return useMutation<
    void,
    Error,
    { projectId: string; companyId: string; kind: BidFormKind; values: BidFormInputs }
  >({
    mutationFn: async (v) => {
      const { error } = await supabase.from('bid_form_inputs').upsert(
        {
          bidding_project_id: v.projectId,
          company_id: v.companyId,
          kind: v.kind,
          values: v.values,
        },
        { onConflict: 'bidding_project_id,kind' },
      );
      if (error) throw error;
    },
  });
}

export function useSaveBidFormDocument() {
  const queryClient = useQueryClient();
  return useMutation<
    number,
    Error,
    {
      projectId: string;
      companyId: string;
      kind: BidFormKind;
      templateId: string;
      blob: Blob;
      fileName: string;
      filledValues: Record<string, unknown>;
      missingFields: string[];
      changeReason: string | null;
    }
  >({
    mutationFn: async (v) => {
      const prefix = v.kind === 'ho_so_du_thau' ? 'ho-so-du-thau' : 'thuong-thao';
      const path = `${v.projectId}/${prefix}-${crypto.randomUUID()}.docx`;
      const up = await supabase.storage
        .from(BID_DOCUMENT_BUCKET)
        .upload(path, v.blob, { contentType: DOCX_MIME, upsert: false });
      if (up.error) throw new Error('Không lưu được văn bản. Kiểm tra mạng rồi thử lại.');
      const { data, error } = await supabase
        .from('bid_form_documents')
        .insert({
          bidding_project_id: v.projectId,
          company_id: v.companyId,
          kind: v.kind,
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
    onSuccess: (_v, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ['bid-form-documents', projectId] });
    },
  });
}

/** Giá dự thầu của bản dự toán hiện hành ĐÃ PHÊ DUYỆT (`status = completed`, như `submit_bid`). */
export function useApprovedBidPrice(projectId: string | undefined) {
  return useQuery<{ bid_price: MoneyValue | null; code: string; version: number } | null, Error>({
    queryKey: ['estimates', 'approved-bid-price', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estimates')
        .select('bid_price, code, version')
        .eq('bidding_project_id', projectId!)
        .eq('is_current_version', true)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as {
        bid_price: MoneyValue | null;
        code: string;
        version: number;
      } | null;
    },
    enabled: Boolean(projectId),
  });
}

export interface BidExperienceRecord {
  contract_id: string;
  code: string;
  contract_number: string | null;
  title: string;
  customer_name: string | null;
  value: MoneyValue | null;
  start_date: string | null;
  end_date: string | null;
  signed_date: string | null;
  location: string | null;
  has_signed_scan: boolean;
  has_liquidation: boolean;
}

/** Hợp đồng đã ký / đã quyết toán của pháp nhân — chọn dòng nào đưa vào Mẫu 06. */
export function useBidExperience(companyId: string | undefined, enabled = true) {
  return useQuery<BidExperienceRecord[], Error>({
    queryKey: ['bid-form-experience', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bid_form_experience', {
        p_company_id: companyId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as BidExperienceRecord[];
    },
    enabled: Boolean(companyId) && enabled,
  });
}

export interface BidPersonRecord {
  employee_id: string;
  full_name: string;
  job_title: string | null;
  certificate: string | null;
  certificate_no: string | null;
  certificate_expiry: string | null;
}

/** Người có chứng chỉ hành nghề trong Nhân sự (0208 `bid_key_personnel` — không lộ lương, CCCD). */
export function useBidPersonnel(companyId: string | undefined, enabled = true) {
  return useQuery<BidPersonRecord[], Error>({
    queryKey: ['bid-key-personnel', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bid_key_personnel', { p_company_id: companyId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as BidPersonRecord[];
    },
    enabled: Boolean(companyId) && enabled,
  });
}

export interface BidEquipmentRecord {
  id: string;
  title: string;
  document_number: string | null;
  expiry_date: string | null;
}

/** Giấy tờ thiết bị trong kho hồ sơ năng lực (`company_documents`, nhóm thiết bị). */
export function useBidEquipment(companyId: string | undefined, enabled = true) {
  return useQuery<BidEquipmentRecord[], Error>({
    queryKey: ['company-documents', 'thiet_bi', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_documents')
        .select('id, title, document_number, expiry_date')
        .eq('company_id', companyId!)
        .eq('category', 'thiet_bi')
        .is('deleted_at', null)
        .order('title');
      if (error) throw new Error(error.message);
      return (data ?? []) as BidEquipmentRecord[];
    },
    enabled: Boolean(companyId) && enabled,
  });
}
