/**
 * Chứng từ đính kèm đề nghị thanh toán (0228) — kho `payment-files/{đề nghị}/…`, bảng `payment_request_files`.
 * Quyền ở CSDL: thêm / gỡ khi đề nghị còn Nháp / bị trả về; đã duyệt / đã chi thì Kế toán chỉ thêm chứng từ chi.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const PAYMENT_FILES_BUCKET = 'payment-files';

export type PaymentFileKind = 'hoa_don' | 'chung_tu' | 'chi' | 'khac';

export const PAYMENT_FILE_KIND_LABELS: Readonly<Record<PaymentFileKind, string>> = {
  hoa_don: 'Hóa đơn',
  chung_tu: 'Biên bản, phiếu giao hàng, bảng kê',
  chi: 'Chứng từ chi (ủy nhiệm chi, phiếu chi)',
  khac: 'Tệp khác',
};

export const PAYMENT_FILE_ACCEPT = 'image/*,application/pdf,.xls,.xlsx,.doc,.docx,.xml';

/** Giới hạn của kho (0228). */
const MAX_BYTES = 25 * 1024 * 1024;

export interface PaymentFile {
  id: string;
  storage_path: string;
  kind: PaymentFileKind;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
  creator: { full_name: string } | null;
}

export function usePaymentFiles(requestId: string | undefined) {
  return useQuery<PaymentFile[], Error>({
    queryKey: ['payment_request_files', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_request_files')
        .select(
          'id, storage_path, kind, file_name, mime_type, size_bytes, created_at, ' +
            'creator:users!payment_request_files_created_by_fkey(full_name)',
        )
        .eq('payment_request_id', requestId!)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PaymentFile[];
    },
    enabled: Boolean(requestId),
  });
}

/** Tên trong kho: chỉ chữ không dấu, số, gạch — tên tiếng Việt có dấu hỏng đường dẫn. */
function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext =
    dot > 0
      ? name
          .slice(dot)
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, '')
      : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'tep'}${ext}`;
}

export function useUploadPaymentFiles() {
  const queryClient = useQueryClient();
  return useMutation<
    { uploaded: number; skipped: string[] },
    Error,
    { requestId: string; files: File[]; kind: PaymentFileKind }
  >({
    mutationFn: async ({ requestId, files, kind }) => {
      const skipped: string[] = [];
      let uploaded = 0;
      for (const file of files) {
        if (file.size > MAX_BYTES) {
          skipped.push(file.name);
          continue;
        }
        const path = `${requestId}/${Date.now()}-${safeName(file.name)}`;
        const mime = file.type || 'application/octet-stream';
        const up = await supabase.storage
          .from(PAYMENT_FILES_BUCKET)
          .upload(path, file, { contentType: mime });
        if (up.error) throw up.error;
        const { error } = await supabase.from('payment_request_files').insert({
          payment_request_id: requestId,
          storage_path: path,
          kind,
          file_name: file.name.slice(0, 255),
          mime_type: mime,
          size_bytes: file.size,
        });
        if (error) throw error;
        uploaded++;
      }
      return { uploaded, skipped };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['payment_request_files'] }),
  });
}

export function useDeletePaymentFile() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, PaymentFile>({
    mutationFn: async (file) => {
      const { error } = await supabase.from('payment_request_files').delete().eq('id', file.id);
      if (error) throw error;
      await supabase.storage.from(PAYMENT_FILES_BUCKET).remove([file.storage_path]);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['payment_request_files'] }),
  });
}

export async function paymentFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PAYMENT_FILES_BUCKET)
    .createSignedUrl(path, 600);
  if (error || !data) throw new Error('Không mở được tệp. Tải lại trang rồi thử lại.');
  return data.signedUrl;
}
