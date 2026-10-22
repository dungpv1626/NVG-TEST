/**
 * Giấy tờ có thời hạn của pháp nhân (Đợt 5 — 5F, 5C; migration 0206, 0208).
 *
 * Một bảng `company_documents` cho cả giấy tờ hành chính (giấy phép, bảo hiểm, đăng kiểm — phân
 * hệ NS) lẫn hồ sơ năng lực đấu thầu (pháp lý, báo cáo tài chính, chứng chỉ, thiết bị — phân hệ
 * DA): một giấy đăng ký kinh doanh chỉ có một bản. RLS quyết ai thấy loại nào.
 *
 * Tệp ở kho `company-docs`, đường dẫn `<pháp nhân>/<giấy tờ>/<tệp>`: lập dòng trước, tải tệp sau.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toNvgDateInput } from '@nvg/shared';
import { supabase } from '@/lib/supabase';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';

export const COMPANY_DOCS_BUCKET = 'company-docs';

export interface CompanyDocumentRecord {
  id: string;
  company_id: string;
  category: string;
  module: string;
  title: string;
  document_number: string | null;
  issuer: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  fiscal_year: number | null;
  responsible_user_id: string | null;
  file_path: string | null;
  file_name: string | null;
  notes: string | null;
  responsible: { full_name: string } | null;
  company: { code: string } | null;
}

/** Đọc một tham số số (`system_parameters`, phạm vi chung). `null` = chưa cấu hình. */
export function useParameterNumber(key: string) {
  return useQuery<number | null, Error>({
    queryKey: ['system-parameter', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_parameters')
        .select('value')
        .eq('param_key', key)
        .eq('scope_type', 'global')
        .maybeSingle();
      if (error) throw new Error(error.message);
      const v = (data as { value: unknown } | null)?.value;
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
    staleTime: 300_000,
  });
}

export function useCompanyDocuments(categories: readonly string[]) {
  const scope = useCompanyScope();
  return useQuery<CompanyDocumentRecord[], Error>({
    queryKey: ['company_documents', categories.join(','), scope.companyId],
    queryFn: async () => {
      const q = supabase
        .from('company_documents')
        .select(
          'id, company_id, category, module, title, document_number, issuer, issued_date, ' +
            'expiry_date, fiscal_year, responsible_user_id, file_path, file_name, notes, ' +
            'responsible:users!company_documents_responsible_user_id_fkey(full_name), ' +
            'company:companies(code)',
        )
        .in('category', [...categories])
        .is('deleted_at', null)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      const { data, error } = await withCompanyScope(q, scope);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as CompanyDocumentRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface CompanyDocumentInput {
  companyId: string;
  category: string;
  title: string;
  documentNumber: string | null;
  issuer: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  fiscalYear: number | null;
  responsibleUserId: string | null;
  notes: string | null;
  file: File | null;
}

async function uploadFile(companyId: string, documentId: string, file: File) {
  const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase();
  const path = `${companyId}/${documentId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(COMPANY_DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
  if (error) throw new Error('Không tải được tệp lên. Kiểm tra mạng rồi thử lại.');
  const { error: e2 } = await supabase
    .from('company_documents')
    .update({ file_path: path, file_name: file.name })
    .eq('id', documentId);
  if (e2) throw e2;
}

export function useCreateCompanyDocument() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, CompanyDocumentInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('company_documents')
        .insert({
          company_id: input.companyId,
          category: input.category,
          title: input.title,
          document_number: input.documentNumber,
          issuer: input.issuer,
          issued_date: input.issuedDate,
          expiry_date: input.expiryDate,
          ...(input.fiscalYear !== null ? { fiscal_year: input.fiscalYear } : {}),
          responsible_user_id: input.responsibleUserId,
          notes: input.notes,
        })
        .select('id')
        .single();
      if (error) throw error;
      const id = (data as { id: string }).id;
      if (input.file) await uploadFile(input.companyId, id, input.file);
      return id;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['company_documents'] }),
  });
}

/** Gia hạn: ngày hết hạn mới (+ bản chụp mới nếu có). Hệ thống nhắc lại từ đầu. */
export function useRenewCompanyDocument() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; companyId: string; expiryDate: string | null; file: File | null }
  >({
    mutationFn: async ({ id, companyId, expiryDate, file }) => {
      const { error } = await supabase
        .from('company_documents')
        .update({ expiry_date: expiryDate })
        .eq('id', id);
      if (error) throw error;
      if (file) await uploadFile(companyId, id, file);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['company_documents'] }),
  });
}

export async function companyDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(COMPANY_DOCS_BUCKET)
    .createSignedUrl(path, 3600);
  if (error || !data) throw new Error('Không mở được tệp.');
  return data.signedUrl;
}

/** Tình trạng hạn: hết hạn luôn báo; «sắp hết» chỉ khi đã cấu hình số ngày nhắc trước. */
export function expiryState(
  expiry: string | null,
  remindDays: number | null,
  today: string = toNvgDateInput(new Date()),
): { kind: 'none' | 'ok' | 'soon' | 'expired'; days: number | null } {
  if (!expiry) return { kind: 'none', days: null };
  const days = Math.round(
    (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (days < 0) return { kind: 'expired', days };
  if (remindDays !== null && days <= remindDays) return { kind: 'soon', days };
  return { kind: 'ok', days };
}

/** Người dùng mở được tệp báo cáo tài chính (Mẫu D — 0208) hay không. */
export function useSeesFinancialStatements() {
  return useQuery<boolean, Error>({
    queryKey: ['rls_sees_financial_statements'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rls_sees_financial_statements');
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    staleTime: 300_000,
  });
}

/** Mở tệp báo cáo tài chính: hàm kiểm quyền + ghi nhật ký truy cập, rồi mới ký đường dẫn. */
export async function openFinancialStatementUrl(documentId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_financial_statement', {
    p_document_id: documentId,
  });
  if (error) throw error;
  return companyDocumentUrl(data as string);
}
