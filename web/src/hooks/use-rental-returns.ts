/**
 * Biên bản thu hồi giàn giáo ký hai bên, đối soát và tất toán với Kế toán — migration 0145.
 *
 * Mỗi đợt khách trả (`return_rental_agreement`) sinh một biên bản `…-BBTH-…` chờ ký. Hai bên ký
 * trên màn hình (hai ảnh chữ ký) hoặc chụp biên bản giấy đã ký; `sign_rental_return` khoá biên
 * bản và sinh một khoản phải thu bên Kế toán. Khi khách trả hết và mọi biên bản đã ký, Kế toán
 * tất toán (`settle_rental_agreement`): cọc cấn trừ vào phần còn phải thu, cọc thừa thành
 * khoản phải trả hoàn cọc.
 *
 * Tệp nằm trong bucket riêng tư `rental-return-docs`, đường dẫn `<id biên bản>/<loại>/<uuid>`.
 * Tải tệp TRƯỚC, gọi hàm ký SAU — hàm ký kiểm tệp có thật.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RentalAgreementStatus } from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';
import { invalidateRentalQueries } from '@/hooks/use-sx';

export const RENTAL_RETURN_DOC_BUCKET = 'rental-return-docs';

/** Khớp `allowed_mime_types` của bucket. */
export const RENTAL_RETURN_SCAN_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

const SIGNED_URL_SECONDS = 3600;

export interface RentalReturnLine {
  id: string;
  material_id: string;
  quantity_ok: string;
  quantity_damaged: string;
  quantity_lost: string;
  rental_days: number;
  daily_rate: string;
  revenue: string;
  compensation_amount: string;
  note: string | null;
  material: { code: string; name: string; unit: string } | null;
}

export interface RentalReturnRecord {
  id: string;
  code: string;
  rental_agreement_id: string;
  return_date: string;
  revenue: string;
  compensation: string;
  customer_representative: string | null;
  customer_signature_path: string | null;
  nvg_signature_path: string | null;
  paper_scan_path: string | null;
  signed_at: string | null;
  receivable_id: string | null;
  created_at: string;
  signer: { full_name: string } | null;
  creator: { full_name: string } | null;
  lines: RentalReturnLine[];
}

const RENTAL_RETURN_SELECT =
  'id, code, rental_agreement_id, return_date, revenue, compensation, customer_representative, ' +
  'customer_signature_path, nvg_signature_path, paper_scan_path, signed_at, receivable_id, created_at, ' +
  'signer:users!rental_returns_signed_by_fkey(full_name), ' +
  'creator:users!rental_returns_created_by_fkey(full_name), ' +
  'lines:rental_return_items(id, material_id, quantity_ok, quantity_damaged, quantity_lost, ' +
  'rental_days, daily_rate, revenue, compensation_amount, note, ' +
  'material:materials!rental_return_items_material_id_fkey(code, name, unit))';

export function useRentalReturns(agreementId: string | undefined) {
  return useQuery<RentalReturnRecord[], Error>({
    queryKey: ['rental-returns', agreementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_returns')
        .select(RENTAL_RETURN_SELECT)
        .eq('rental_agreement_id', agreementId!)
        .order('return_date')
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RentalReturnRecord[];
    },
    enabled: Boolean(agreementId),
  });
}

/** URL ký cho chữ ký / ảnh biên bản; đường dẫn không ký được thì bỏ qua. */
export function useRentalDocUrls(paths: readonly string[]) {
  return useQuery<Record<string, string>, Error>({
    queryKey: ['rental-return-docs', ...paths],
    queryFn: async () => {
      const { data } = await supabase.storage
        .from(RENTAL_RETURN_DOC_BUCKET)
        .createSignedUrls([...paths], SIGNED_URL_SECONDS);
      const byPath: Record<string, string> = {};
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) byPath[item.path] = item.signedUrl;
      }
      return byPath;
    },
    enabled: paths.length > 0,
    staleTime: (SIGNED_URL_SECONDS / 2) * 1000,
  });
}

function extensionOf(file: Blob & { name?: string }): string {
  const fromName = file.name?.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return file.type.split('/').pop() ?? 'png';
}

async function uploadDoc(
  rentalReturnId: string,
  kind: 'chu-ky-khach' | 'chu-ky-nvg' | 'bien-ban-giay',
  file: Blob & { name?: string },
): Promise<string> {
  const path = `${rentalReturnId}/${kind}/${crypto.randomUUID()}.${extensionOf(file)}`;
  const { error } = await supabase.storage
    .from(RENTAL_RETURN_DOC_BUCKET)
    .upload(path, file, { contentType: file.type || 'image/png', upsert: false });
  if (error) {
    throw new Error(
      'Không tải được chữ ký hoặc ảnh biên bản. Kiểm tra lại mạng và dung lượng tệp (tối đa 20 MB), rồi thử lại.',
    );
  }
  return path;
}

export type SignRentalReturnInput =
  | {
      rentalReturnId: string;
      customerRepresentative: string;
      method: 'man_hinh';
      customerSignature: Blob;
      nvgSignature: Blob;
    }
  | {
      rentalReturnId: string;
      customerRepresentative: string;
      method: 'anh_giay';
      paperScan: File;
    };

export function useSignRentalReturn() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SignRentalReturnInput>({
    mutationFn: async (input) => {
      let customerPath: string | null = null;
      let nvgPath: string | null = null;
      let scanPath: string | null = null;
      if (input.method === 'man_hinh') {
        customerPath = await uploadDoc(
          input.rentalReturnId,
          'chu-ky-khach',
          input.customerSignature,
        );
        nvgPath = await uploadDoc(input.rentalReturnId, 'chu-ky-nvg', input.nvgSignature);
      } else {
        scanPath = await uploadDoc(input.rentalReturnId, 'bien-ban-giay', input.paperScan);
      }
      const { error } = await supabase.rpc('sign_rental_return', {
        p_rental_return_id: input.rentalReturnId,
        p_customer_representative: input.customerRepresentative,
        p_customer_signature_path: customerPath,
        p_nvg_signature_path: nvgPath,
        p_paper_scan_path: scanPath,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRentalQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      void queryClient.invalidateQueries({ queryKey: ['rental-settlements'] });
    },
  });
}

/* ========================================================================== *
 * Đối soát và tất toán — phía Kế toán
 * ========================================================================== */

export interface RentalSettlementReceivable {
  id: string;
  direction: 'phai_thu' | 'phai_tra';
  amount: string;
  settled_amount: string;
  due_date: string | null;
  reconciled_at: string | null;
  rental_return_id: string | null;
  description: string | null;
}

export interface RentalSettlementRow {
  id: string;
  code: string;
  company_id: string;
  status: RentalAgreementStatus;
  start_date: string;
  actual_return_date: string | null;
  deposit_amount: string;
  total_revenue: string | null;
  total_compensation: string | null;
  settled_at: string | null;
  settlement_deposit_offset: string | null;
  settlement_refund: string | null;
  customer: { code: string; name: string } | null;
  returns: {
    id: string;
    code: string;
    return_date: string;
    revenue: string;
    compensation: string;
    signed_at: string | null;
  }[];
  receivables: RentalSettlementReceivable[];
}

export function useRentalSettlements() {
  const scope = useCompanyScope();

  return useQuery<RentalSettlementRow[], Error>({
    queryKey: ['rental-settlements', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('rental_agreements')
          .select(
            'id, code, company_id, status, start_date, actual_return_date, deposit_amount, ' +
              'total_revenue, total_compensation, settled_at, settlement_deposit_offset, settlement_refund, ' +
              'customer:customers!rental_agreements_customer_id_customers_id_fk(code, name), ' +
              'returns:rental_returns!rental_returns_rental_agreement_id_fkey(id, code, return_date, revenue, compensation, signed_at), ' +
              'receivables:receivables_payables!receivables_payables_rental_agreement_id_fkey(id, direction, amount, ' +
              'settled_amount, due_date, reconciled_at, rental_return_id, description)',
          ),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RentalSettlementRow[];
    },
    enabled: scope.isReady,
  });
}

export function useSettleRentalAgreement() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { rentalAgreementId: string }>({
    mutationFn: async ({ rentalAgreementId }) => {
      const { error } = await supabase.rpc('settle_rental_agreement', {
        p_rental_agreement_id: rentalAgreementId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRentalQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      void queryClient.invalidateQueries({ queryKey: ['rental-settlements'] });
    },
  });
}
