/**
 * Biên bản nghiệm thu ký hai bên → Kế toán (Đợt 2 — 2D, migration 0192).
 *
 * Kho `acceptance-docs`, đường dẫn `<công trình>/<biên bản>/<loại>-<uuid>.<đuôi>`: tải lên chỉ
 * khi biên bản chưa ký và người tải ghi được công trình; đọc được khi xem được công trình, hoặc
 * là Kế toán của pháp nhân và biên bản đã ký (`rls_acceptance_readable`). Tệp tải TRƯỚC, ký SAU
 * — hàm ký kiểm tệp có thật trong đúng thư mục.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcceptanceType, MoneyValue } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export const ACCEPTANCE_DOCS_BUCKET = 'acceptance-docs';

async function upload(siteId: string, acceptanceId: string, kind: string, blob: Blob) {
  const type = blob.type || 'image/png';
  const ext = type === 'application/pdf' ? 'pdf' : (type.split('/')[1] ?? 'png');
  const path = `${siteId}/${acceptanceId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(ACCEPTANCE_DOCS_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (error) throw new Error('Không tải được chữ ký / bản giấy lên. Kiểm tra mạng rồi thử lại.');
  return path;
}

export type AcceptanceSignInput = {
  siteId: string;
  acceptanceId: string;
  counterpartName: string;
  counterpartTitle: string | null;
} & (
  | { method: 'man_hinh'; nvgSignature: Blob; counterpartSignature: Blob }
  | { method: 'ban_giay'; paperScan: File }
);

export function useSignAcceptance() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, AcceptanceSignInput>({
    mutationFn: async (input) => {
      const { siteId, acceptanceId } = input;
      let nvg: string | null = null;
      let counterpart: string | null = null;
      let paper: string | null = null;
      if (input.method === 'man_hinh') {
        nvg = await upload(siteId, acceptanceId, 'chu-ky-nvg', input.nvgSignature);
        counterpart = await upload(
          siteId,
          acceptanceId,
          'chu-ky-ben-kia',
          input.counterpartSignature,
        );
      } else {
        paper = await upload(siteId, acceptanceId, 'ban-giay', input.paperScan);
      }
      const { error } = await supabase.rpc('sign_acceptance_record', {
        p_acceptance_id: acceptanceId,
        p_counterpart_name: input.counterpartName,
        p_counterpart_title: input.counterpartTitle,
        p_nvg_signature_path: nvg,
        p_counterpart_signature_path: counterpart,
        p_paper_scan_path: paper,
      });
      if (error) throw error;
    },
    onSuccess: (_v, { siteId, acceptanceId }) => {
      void queryClient.invalidateQueries({
        queryKey: ['construction-sites', siteId, 'acceptances'],
      });
      void queryClient.invalidateQueries({ queryKey: ['acceptance-document', acceptanceId] });
    },
  });
}

export interface AcceptanceDocument {
  id: string;
  code: string | null;
  acceptance_type: AcceptanceType;
  status: string;
  stage_name: string;
  scope: string | null;
  value: MoneyValue | null;
  accepted_date: string | null;
  outstanding_issues: string | null;
  counterpart_signed_by: string | null;
  counterpart_signer_name: string | null;
  counterpart_signer_title: string | null;
  nvg_signature_path: string | null;
  counterpart_signature_path: string | null;
  paper_scan_path: string | null;
  signed_at: string | null;
  signer_name: string | null;
  accepted_by_name: string | null;
  billing_recorded_at: string | null;
  billing_note: string | null;
  site: { id: string; code: string; name: string; address: string | null };
  company: { code: string; name: string };
  subcontractor_name: string | null;
  checklist: {
    label: string;
    result: 'dat' | 'khong_dat' | 'khong_ap_dung';
    note: string | null;
    photos: number;
  }[];
}

/** Nội dung biên bản (cho in / xem) — kèm URL ký 1 giờ của chữ ký và bản giấy. */
export async function fetchAcceptanceDocument(
  acceptanceId: string,
): Promise<{ doc: AcceptanceDocument; urls: Record<string, string> }> {
  const { data, error } = await supabase.rpc('acceptance_document', {
    p_acceptance_id: acceptanceId,
  });
  if (error) throw error;
  const doc = data as AcceptanceDocument;
  const paths = [
    doc.nvg_signature_path,
    doc.counterpart_signature_path,
    doc.paper_scan_path,
  ].filter((p): p is string => Boolean(p));
  const urls: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(ACCEPTANCE_DOCS_BUCKET)
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl;
  }
  return { doc, urls };
}

export interface KtAcceptanceRow {
  id: string;
  company_id: string;
  code: string | null;
  acceptance_type: AcceptanceType;
  stage_name: string;
  value: MoneyValue | null;
  accepted_date: string | null;
  signed_at: string;
  counterpart_name: string | null;
  site_id: string;
  site_code: string;
  site_name: string;
  subcontractor_name: string | null;
  billing_recorded_at: string | null;
  billing_recorded_by_name: string | null;
  billing_note: string | null;
}

/** Biên bản đã ký là căn cứ thu / trả tiền — danh sách của Kế toán. */
export function useKtSignedAcceptances() {
  return useQuery<KtAcceptanceRow[], Error>({
    queryKey: ['kt-signed-acceptances'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kt_signed_acceptances');
      if (error) throw new Error(error.message);
      return (data ?? []) as KtAcceptanceRow[];
    },
  });
}

export function useMarkAcceptanceBilled() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { acceptanceId: string; note: string | null }>({
    mutationFn: async ({ acceptanceId, note }) => {
      const { error } = await supabase.rpc('mark_acceptance_billed', {
        p_acceptance_id: acceptanceId,
        p_note: note,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['kt-signed-acceptances'] }),
  });
}
