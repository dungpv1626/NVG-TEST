/**
 * Mẫu hợp đồng Word và văn bản hợp đồng đã điền (migration 0171).
 *
 * Hai bucket riêng tư: `contract-templates` (`<pháp nhân>/<uuid>.docx`) và
 * `contract-documents` (`<hợp đồng>/<uuid>.docx`). Tải tệp TRƯỚC, ghi dòng SAU — dòng hỏng thì
 * còn tệp mồ côi (chấp nhận được), ngược lại là dòng trỏ vào tệp không có (mẫu 0135).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractPriceForm, ContractType } from '@nvg/shared';
import { DOCX_MIME, type TemplateTags } from '@/lib/docx-template';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export const TEMPLATE_BUCKET = 'contract-templates';
export const DOCUMENT_BUCKET = 'contract-documents';

export interface ContractTemplateRecord {
  id: string;
  company_id: string;
  title: string;
  contract_type: ContractType;
  price_form: ContractPriceForm | null;
  storage_path: string;
  file_name: string;
  tags: TemplateTags;
  /** Các đợt thanh toán mẫu đề xuất (0185) — `ty_le` là số %, hoặc null khi mẫu để trống. */
  payment_milestones: { noi_dung: string; ty_le: string | null; ty_le_mau?: string }[];
  /** Chỗ trống tự do của mẫu (0186) — rỗng với mẫu tự tải lên. */
  free_fields: TemplateFreeField[];
  /** Nhóm «☐ Phương án» (0186). */
  options: TemplateOptionGroup[];
  is_active: boolean;
  notes: string | null;
  created_at: string;
  company: { code: string; short_name: string } | null;
  creator: { full_name: string } | null;
}

const TEMPLATE_SELECT =
  'id, company_id, title, contract_type, price_form, storage_path, file_name, tags, ' +
  'payment_milestones, free_fields, options, is_active, ' +
  'notes, created_at, company:companies(code, short_name), ' +
  'creator:users!contract_templates_created_by_fkey(full_name)';

/** Mẫu của pháp nhân đang chọn (Toàn NVG = mọi pháp nhân người dùng xem được). */
export function useContractTemplates() {
  const scope = useCompanyScope();
  return useQuery<ContractTemplateRecord[], Error>({
    queryKey: ['contract-templates', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('contract_templates').select(TEMPLATE_SELECT),
        scope,
      )
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractTemplateRecord[];
    },
    enabled: scope.isReady,
  });
}

/** Mẫu đang dùng cho một hợp đồng: cùng pháp nhân, cùng loại hợp đồng. */
export function useTemplatesForContract(
  companyId: string | undefined,
  type: ContractType | undefined,
) {
  return useQuery<ContractTemplateRecord[], Error>({
    queryKey: ['contract-templates', 'for', companyId, type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_templates')
        .select(TEMPLATE_SELECT)
        .eq('company_id', companyId!)
        .eq('contract_type', type!)
        .eq('is_active', true)
        // Xếp theo tên — tên bộ mẫu mở đầu bằng mã (NVC-HĐ-01 trước NVC-HĐ-02).
        .order('title', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractTemplateRecord[];
    },
    enabled: Boolean(companyId && type),
  });
}

/** Mẫu khớp hình thức giá đứng trước, mẫu dùng chung (không ghi hình thức giá) sau. */
export function rankTemplates(
  list: ContractTemplateRecord[],
  priceForm: ContractPriceForm | null,
): ContractTemplateRecord[] {
  return list
    .filter((t) => t.price_form === null || t.price_form === priceForm)
    .sort((a, b) => Number(b.price_form === priceForm) - Number(a.price_form === priceForm));
}

export function useUploadContractTemplate() {
  const queryClient = useQueryClient();
  return useMutation<
    string,
    Error,
    {
      companyId: string;
      title: string;
      contractType: ContractType;
      priceForm: ContractPriceForm | null;
      file: File;
      tags: TemplateTags;
      notes: string | null;
    }
  >({
    mutationFn: async ({ companyId, title, contractType, priceForm, file, tags, notes }) => {
      const path = `${companyId}/${crypto.randomUUID()}.docx`;
      const up = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .upload(path, file, { contentType: DOCX_MIME, upsert: false });
      if (up.error) {
        throw new Error(
          'Không tải được tệp mẫu lên. Kiểm tra mạng và dung lượng (tối đa 10 MB), rồi thử lại.',
        );
      }
      const { data, error } = await supabase
        .from('contract_templates')
        .insert({
          company_id: companyId,
          title,
          contract_type: contractType,
          price_form: priceForm,
          storage_path: path,
          file_name: file.name,
          tags,
          notes,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract-templates'] });
    },
  });
}

export function useSetTemplateActive() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; isActive: boolean }>({
    mutationFn: async ({ id, isActive }) => {
      const { error } = await supabase
        .from('contract_templates')
        .update({ is_active: isActive })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contract-templates'] });
    },
  });
}

/** Tải nội dung một tệp trong kho về dạng ArrayBuffer. */
export async function downloadFile(bucket: string, path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error('Không tải được tệp. Kiểm tra mạng rồi thử lại.');
  }
  return data;
}

// ---------------------------------------------------------------------------------------------
// Dữ liệu điền: pháp nhân + đối tác
// ---------------------------------------------------------------------------------------------

export interface CompanyContractInfo {
  id: string;
  code: string;
  legal_name: string;
  tax_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  legal_representative: string | null;
  representative_title: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
}

const COMPANY_INFO_SELECT =
  'id, code, legal_name, tax_code, address, phone, email, legal_representative, ' +
  'representative_title, bank_account_number, bank_name';

export function useCompanyContractInfo(companyId: string | undefined) {
  return useQuery<CompanyContractInfo | null, Error>({
    queryKey: ['companies', 'contract-info', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(COMPANY_INFO_SELECT)
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as CompanyContractInfo | null;
    },
    enabled: Boolean(companyId),
  });
}

/** Pháp nhân giao dịch (bỏ NVG — mã tổng hợp không ký hợp đồng). */
export function useTransactionalCompanies() {
  return useQuery<CompanyContractInfo[], Error>({
    queryKey: ['companies', 'contract-info', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(COMPANY_INFO_SELECT)
        .eq('is_transactional', true)
        .order('display_order');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CompanyContractInfo[];
    },
  });
}

/** Quản trị hệ thống sửa thông tin pháp nhân in trên hợp đồng (CSDL chỉ cho ADMIN). */
export function useUpdateCompanyContractInfo() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<
        Pick<
          CompanyContractInfo,
          | 'tax_code'
          | 'address'
          | 'phone'
          | 'email'
          | 'legal_representative'
          | 'representative_title'
          | 'bank_account_number'
          | 'bank_name'
        >
      >;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase
        .from('companies')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export interface PartnerContractInfo {
  name: string;
  tax_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  representative_name: string | null;
  representative_title: string | null;
}

/**
 * Ô bên khách của mẫu (`doi_tac_*`, hoặc `ben_a_*` / `ben_b_*` khi khách đứng bên ấy) → cột hồ sơ khách hàng. Dùng để
 * điền thẳng vào hồ sơ khách ngay trong tab Soạn hợp đồng (anh Dũng 25/10/2026) — lần sau máy tự điền.
 */
export const CUSTOMER_COLUMN_BY_FIELD: Readonly<Record<string, string>> = {
  ma_so_thue: 'tax_code',
  dia_chi: 'address',
  dien_thoai: 'phone',
  email: 'email',
  dai_dien: 'representative_name',
  chuc_vu: 'representative_title',
};

export function customerColumnOf(templateKey: string): string | null {
  const suffix = templateKey.replace(/^(doi_tac|ben_a|ben_b)_/, '');
  return CUSTOMER_COLUMN_BY_FIELD[suffix] ?? null;
}

/** Ghi thông tin vào hồ sơ khách hàng — RLS `customers_update` quyết ai sửa được. */
export function useSaveCustomerInfo() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { customerId: string; changes: Record<string, string> }>({
    mutationFn: async ({ customerId, changes }) => {
      const { data, error } = await supabase
        .from('customers')
        .update(changes)
        .eq('id', customerId)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error(
          'Không sửa được hồ sơ khách hàng — người chịu trách nhiệm khách hàng hoặc Ban Giám đốc sửa được. Có thể điền riêng cho văn bản này ở dưới.',
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function usePartnerContractInfo(customerId: string | undefined) {
  return useQuery<PartnerContractInfo | null, Error>({
    queryKey: ['customers', 'contract-info', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('name, tax_code, address, phone, email, representative_name, representative_title')
        .eq('id', customerId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as PartnerContractInfo | null;
    },
    enabled: Boolean(customerId),
  });
}

// ---------------------------------------------------------------------------------------------
// Văn bản đã điền
// ---------------------------------------------------------------------------------------------

export interface ContractDocumentRecord {
  id: string;
  version: number;
  storage_path: string;
  file_name: string;
  missing_fields: string[];
  change_reason: string | null;
  created_at: string;
  /** `sua_trong_word` = người soạn sửa trong Word rồi tải lên (0222) — máy không đọc ngược tệp này. */
  source: 'mau' | 'sua_trong_word';
  template: { title: string } | null;
  creator: { full_name: string } | null;
}

export function useContractDocuments(contractId: string | undefined) {
  return useQuery<ContractDocumentRecord[], Error>({
    queryKey: ['contracts', 'documents', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_documents')
        .select(
          'id, version, storage_path, file_name, missing_fields, change_reason, created_at, source, ' +
            'template:contract_templates(title), ' +
            'creator:users!contract_documents_created_by_fkey(full_name)',
        )
        .eq('contract_id', contractId!)
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractDocumentRecord[];
    },
    enabled: Boolean(contractId),
  });
}

/** Một dải chấm (`o_N`) hoặc lựa chọn trong ngoặc vuông (`c_N`) của mẫu — xem convert.py. */
export interface TemplateFreeField {
  key: string;
  /** Thứ tự xuất hiện trong văn bản. */
  seq?: number;
  article: string;
  before: string;
  after: string;
  default: string | null;
  choices?: string[];
  /** Khối phương án chứa chỗ trống (`pa_3_b`), null khi nằm ngoài mọi phương án. */
  option: string | null;
  /** «Bên A» / «Bên B» khi nằm ở phần thông tin hai bên. */
  party?: string;
  /** «<hàng> — <cột>» khi nằm trong ô bảng (ô bảng không có câu văn quanh nó). */
  cell?: string;
}

export interface TemplateOptionGroup {
  id: string;
  article: string;
  label: string;
  options: { key: string; letter: string; text: string }[];
}

/**
 * Giá trị người soạn đã điền cho văn bản của một hợp đồng (0186) — lưu dần khi gõ, mở lại không
 * mất. Khoá: chỗ trống chuẩn (`so_hop_dong`) dùng chung mọi mẫu; chỗ trống tự do gắn mẫu
 * (`<template_id>:o_12`, `<template_id>:pa_3` = chữ phương án đã chọn).
 */
export function useContractDocumentInputs(contractId: string) {
  return useQuery<Record<string, string>, Error>({
    queryKey: ['contract-document-inputs', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_document_inputs')
        .select('values')
        .eq('contract_id', contractId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return ((data as { values?: Record<string, string> } | null)?.values ?? {}) as Record<
        string,
        string
      >;
    },
    // Giá trị đang gõ giữ ở trang; tải lại nền giữa chừng sẽ đè chữ người dùng vừa gõ.
    staleTime: Infinity,
  });
}

export function useSaveContractDocumentInputs() {
  return useMutation<
    void,
    Error,
    { contractId: string; companyId: string; values: Record<string, string> }
  >({
    mutationFn: async ({ contractId, companyId, values }) => {
      const { error } = await supabase.from('contract_document_inputs').upsert(
        // Pháp nhân do CSDL đặt lại theo hợp đồng (trigger); gửi kèm vì cột NOT NULL.
        { contract_id: contractId, company_id: companyId, values },
        { onConflict: 'contract_id' },
      );
      if (error) throw new Error(error.message);
    },
  });
}

export function useSaveContractDocument() {
  const queryClient = useQueryClient();
  return useMutation<
    number,
    Error,
    {
      contractId: string;
      companyId: string;
      templateId: string | null;
      blob: Blob;
      fileName: string;
      filledValues: Record<string, unknown>;
      missingFields: string[];
      changeReason: string | null;
      /** Bản tải lên sau khi sửa trong Word (0222); vắng = máy điền từ mẫu. */
      source?: 'mau' | 'sua_trong_word';
    }
  >({
    mutationFn: async (v) => {
      const path = `${v.contractId}/${crypto.randomUUID()}.docx`;
      const up = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(path, v.blob, { contentType: DOCX_MIME, upsert: false });
      if (up.error) {
        throw new Error('Không lưu được văn bản. Kiểm tra mạng rồi thử lại.');
      }
      const { data, error } = await supabase
        .from('contract_documents')
        .insert({
          contract_id: v.contractId,
          company_id: v.companyId,
          template_id: v.templateId,
          storage_path: path,
          file_name: v.fileName,
          filled_values: v.filledValues,
          missing_fields: v.missingFields,
          change_reason: v.changeReason,
          source: v.source ?? 'mau',
        })
        .select('version')
        .single();
      if (error) throw error;
      return data.version as number;
    },
    onSuccess: (_v, { contractId }) => {
      void queryClient.invalidateQueries({ queryKey: ['contracts', 'documents', contractId] });
    },
  });
}
