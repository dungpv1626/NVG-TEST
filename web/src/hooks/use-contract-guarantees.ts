/**
 * Bảo lãnh hợp đồng và tiền giữ lại bảo hành (G3, migration 0248).
 *
 * Bảo lãnh tạm ứng / thực hiện / bảo hành, cả hai chiều: NVG phát hành cho chủ đầu tư, đối tác (thầu phụ, nhà
 * cung cấp) phát hành cho NVG — chiều do CSDL suy từ loại hợp đồng. Trạng thái chỉ đổi qua
 * `close_contract_guarantee` (thu hồi / giải toả) và quét đêm (hết hạn). Bản quét ở kho `guarantee-docs`,
 * thư mục đầu = hợp đồng.
 *
 * Tiền giữ lại là khoản phải thu `receivable_kind = 'giu_lai'` sinh lúc «Ghi công nợ» hồ sơ thanh toán.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyValue } from '@nvg/shared';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export const GUARANTEE_DOCS_BUCKET = 'guarantee-docs';

export type GuaranteeType = 'tam_ung' | 'thuc_hien' | 'bao_hanh';
export type GuaranteeStatus = 'dang_hieu_luc' | 'da_thu_hoi' | 'da_giai_toa' | 'het_han';
export type GuaranteeDirection = 'nvg_phat_hanh' | 'doi_tac_phat_hanh';

export const GUARANTEE_TYPE_LABELS: Record<GuaranteeType, string> = {
  tam_ung: 'Bảo lãnh tạm ứng',
  thuc_hien: 'Bảo lãnh thực hiện hợp đồng',
  bao_hanh: 'Bảo lãnh bảo hành',
};

export const GUARANTEE_STATUS_LABELS: Record<GuaranteeStatus, string> = {
  dang_hieu_luc: 'Đang hiệu lực',
  da_thu_hoi: 'Đã thu hồi',
  da_giai_toa: 'Đã giải toả',
  het_han: 'Hết hạn',
};

export const GUARANTEE_DIRECTION_LABELS: Record<GuaranteeDirection, string> = {
  nvg_phat_hanh: 'NVG phát hành cho bên giao thầu',
  doi_tac_phat_hanh: 'Đối tác phát hành cho NVG',
};

export interface ContractGuaranteeRecord {
  id: string;
  company_id: string;
  contract_id: string;
  direction: GuaranteeDirection;
  guarantee_type: GuaranteeType;
  bank_name: string;
  guarantee_number: string | null;
  amount: MoneyValue;
  valid_from: string | null;
  valid_to: string;
  scan_path: string | null;
  status: GuaranteeStatus;
  closed_date: string | null;
  close_note: string | null;
  notes: string | null;
  contract?: { code: string; contract_number: string | null; title: string; stage: string } | null;
  company?: { code: string } | null;
}

const SELECT =
  'id, company_id, contract_id, direction, guarantee_type, bank_name, guarantee_number, amount, valid_from, ' +
  'valid_to, scan_path, status, closed_date, close_note, notes';

export function useContractGuarantees(contractId: string | undefined) {
  return useQuery<ContractGuaranteeRecord[], Error>({
    queryKey: ['contract-guarantees', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_guarantees')
        .select(SELECT)
        .eq('contract_id', contractId!)
        .order('valid_to');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractGuaranteeRecord[];
    },
    enabled: Boolean(contractId),
  });
}

/** Mọi bảo lãnh trong phạm vi pháp nhân đang chọn — trang Kế toán. */
export function useAllContractGuarantees() {
  const scope = useCompanyScope();
  return useQuery<ContractGuaranteeRecord[], Error>({
    queryKey: ['contract-guarantees', 'all', scope.companyId],
    queryFn: async () => {
      let q = supabase
        .from('contract_guarantees')
        .select(
          SELECT +
            ', contract:contracts(code, contract_number, title, stage), company:companies(code)',
        );
      if (!scope.isAggregate && scope.companyId) q = q.eq('company_id', scope.companyId);
      const { data, error } = await q.order('valid_to');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractGuaranteeRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface GuaranteeInput {
  contractId: string;
  guaranteeType: GuaranteeType;
  bankName: string;
  guaranteeNumber: string | null;
  /** Chuỗi chữ số thô từ `MoneyInput`. */
  amount: string;
  validFrom: string | null;
  validTo: string;
  file: File | null;
}

async function uploadScan(contractId: string, file: File): Promise<string> {
  const ext = file.type === 'application/pdf' ? 'pdf' : (file.name.split('.').pop() ?? 'bin');
  const path = `${contractId}/bao-lanh-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(GUARANTEE_DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
  if (error) throw new Error('Không tải được bản quét bảo lãnh lên. Kiểm tra mạng rồi thử lại.');
  return path;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['contract-guarantees'] });
  void queryClient.invalidateQueries({ queryKey: ['contract-open-retention'] });
}

export function useCreateGuarantee() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, GuaranteeInput>({
    mutationFn: async (input) => {
      const scanPath = input.file ? await uploadScan(input.contractId, input.file) : null;
      const { error } = await supabase
        .from('contract_guarantees')
        .insert({
          contract_id: input.contractId,
          guarantee_type: input.guaranteeType,
          bank_name: input.bankName.trim(),
          guarantee_number: input.guaranteeNumber?.trim() || null,
          amount: input.amount,
          valid_from: input.validFrom || null,
          valid_to: input.validTo,
          scan_path: scanPath,
        })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

/** Gia hạn (đổi ngày hết hiệu lực) — nhắc lại theo hạn mới. */
export function useExtendGuarantee() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; validTo: string }>({
    mutationFn: async ({ id, validTo }) => {
      const { error } = await supabase
        .from('contract_guarantees')
        .update({ valid_to: validTo })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCloseGuarantee() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { id: string; status: 'da_thu_hoi' | 'da_giai_toa'; date: string; note: string | null }
  >({
    mutationFn: async ({ id, status, date, note }) => {
      const { error } = await supabase.rpc('close_contract_guarantee', {
        p_id: id,
        p_status: status,
        p_closed_date: date,
        p_note: note,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export async function guaranteeScanUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(GUARANTEE_DOCS_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export interface OpenRetentionGuarantees {
  retention_outstanding: MoneyValue;
  retention_items: {
    id: string;
    description: string | null;
    amount: MoneyValue;
    settled_amount: MoneyValue;
    due_date: string | null;
  }[];
  /**
   * 0253: đợt thanh toán «giữ lại bảo hành» của hợp đồng chưa thu — tiền giữ lại chỉ ghi ở đây (hồ sơ
   * thanh toán không trừ thêm). `due` = đã tới hạn thu. Bản CSDL cũ hơn 0253: không có.
   */
  retention_terms?: {
    id: string;
    description: string;
    amount: MoneyValue | null;
    due_date: string | null;
    due: boolean;
  }[];
  open_guarantees: {
    id: string;
    guarantee_type: GuaranteeType;
    direction: GuaranteeDirection;
    bank_name: string;
    guarantee_number: string | null;
    amount: MoneyValue;
    valid_to: string;
    status: GuaranteeStatus;
  }[];
}

/** Tiền giữ lại còn phải thu + bảo lãnh chưa thu hồi / giải toả của một hợp đồng (khối thanh lý). */
export function useContractOpenRetention(contractId: string | undefined) {
  return useQuery<OpenRetentionGuarantees | null, Error>({
    queryKey: ['contract-open-retention', contractId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contract_open_retention_guarantees', {
        p_contract_id: contractId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? null) as OpenRetentionGuarantees | null;
    },
    enabled: Boolean(contractId),
  });
}

export interface RetentionReceivableRecord {
  id: string;
  company_id: string;
  code: string | null;
  description: string | null;
  party_name: string | null;
  amount: MoneyValue;
  settled_amount: MoneyValue;
  due_date: string | null;
  contract: { id: string; code: string; contract_number: string | null; stage: string } | null;
  site: { code: string; name: string; stage: string } | null;
  company: { code: string } | null;
}

/** Các khoản tiền giữ lại bảo hành — trang Kế toán. */
export function useRetentionReceivables() {
  const scope = useCompanyScope();
  return useQuery<RetentionReceivableRecord[], Error>({
    queryKey: ['receivables', 'retention', scope.companyId],
    queryFn: async () => {
      let q = supabase
        .from('receivables_payables')
        .select(
          'id, company_id, code, description, party_name, amount, settled_amount, due_date, ' +
            'contract:contracts(id, code, contract_number, stage), ' +
            'site:construction_sites(code, name, stage), company:companies(code)',
        )
        .eq('receivable_kind', 'giu_lai');
      if (!scope.isAggregate && scope.companyId) q = q.eq('company_id', scope.companyId);
      const { data, error } = await q.order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RetentionReceivableRecord[];
    },
    enabled: scope.isReady,
  });
}
