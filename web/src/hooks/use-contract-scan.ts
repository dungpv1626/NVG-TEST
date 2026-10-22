/**
 * Bản hợp đồng đã ký (0187, 0189): tải bản quét lên kho, bổ sung sau khi ký, link xem có hạn cho
 * khách. Quyền nằm ở CSDL — `attach_signed_scan`, `rls_contract_scan_sharer`; ở đây chỉ gọi.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_BUCKET } from '@/hooks/use-contract-templates';
import { supabase } from '@/lib/supabase';

/** Tải bản đã ký vào thư mục của hợp đồng; trả đường dẫn trong kho. */
export async function uploadSignedScan(contractId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${contractId}/da-ky-${crypto.randomUUID()}.${ext || 'pdf'}`;
  const up = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/pdf' });
  if (up.error) throw up.error;
  return path;
}

/** Đường dẫn ký ngắn hạn để mở / chia sẻ tệp từ máy người dùng. */
export async function signedScanUrl(path: string, seconds = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(path, seconds);
  if (error || !data) throw error ?? new Error('Không mở được tệp.');
  return data.signedUrl;
}

export function useAttachSignedScan() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { contractId: string; file: File; reason?: string }>({
    mutationFn: async ({ contractId, file, reason }) => {
      const path = await uploadSignedScan(contractId, file);
      const { error } = await supabase.rpc('attach_signed_scan', {
        p_contract_id: contractId,
        p_path: path,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contracts'] }),
  });
}

export interface ContractScanShare {
  id: string;
  token: string;
  note: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  creator: { full_name: string } | null;
  views: { viewed_at: string }[];
}

export function useContractScanShares(contractId: string | undefined) {
  return useQuery<ContractScanShare[], Error>({
    queryKey: ['contract-scan-shares', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_scan_shares')
        .select(
          'id, token, note, expires_at, revoked_at, created_at, ' +
            'creator:users!contract_scan_shares_created_by_fkey(full_name), ' +
            'views:contract_scan_share_views(viewed_at)',
        )
        .eq('contract_id', contractId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ContractScanShare[];
    },
    enabled: Boolean(contractId),
  });
}

export function useCreateScanShare() {
  const queryClient = useQueryClient();
  return useMutation<
    { id: string; token: string },
    Error,
    { contractId: string; companyId: string; expiresAt: string; note: string | null }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('contract_scan_shares')
        .insert({
          contract_id: input.contractId,
          // Trigger đặt lại theo hợp đồng — gửi đúng để khỏi phụ thuộc vào điều đó.
          company_id: input.companyId,
          expires_at: input.expiresAt,
          note: input.note,
        })
        .select('id, token')
        .single();
      if (error) throw error;
      return data as { id: string; token: string };
    },
    onSuccess: (_, v) =>
      void queryClient.invalidateQueries({ queryKey: ['contract-scan-shares', v.contractId] }),
  });
}

export function useRevokeScanShare() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; contractId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase
        .from('contract_scan_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: (_, v) =>
      void queryClient.invalidateQueries({ queryKey: ['contract-scan-shares', v.contractId] }),
  });
}

/** Địa chỉ trang khách xem — cùng tên miền với ứng dụng, không cần đăng nhập. */
export function scanShareUrl(token: string): string {
  return `${window.location.origin}/xem-ban-ky/${token}`;
}
