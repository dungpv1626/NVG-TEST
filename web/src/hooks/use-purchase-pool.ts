/**
 * Đợt 4 — Mua hàng và Kho: gom đề nghị (4A), bảng so giá (4B), đơn sắp trễ (4C), tồn tối thiểu (4D).
 *
 * Tách khỏi `use-purchasing.ts` cho gọn; mọi hàm đọc qua RLS (Mẫu A + Mẫu E) hoặc hàm CSDL có kiểm
 * quyền giá vốn — trình duyệt không tự lọc phạm vi.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PurchaseRequestStage,
  PurchaseUrgency,
  QuotationStatus,
  SupplierClass,
} from '@nvg/shared';
import { supabase } from '@/lib/supabase';

/* -------------------------------------------------------------------------- *
 * 4B — bảng so giá đặt cạnh nhau
 * -------------------------------------------------------------------------- */

export const QUOTATION_FILE_BUCKET = 'quotation-files';

export interface BoardQuotation {
  quotation_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_class: SupplierClass;
  status: QuotationStatus;
  quoted_date: string | null;
  valid_until: string | null;
  goods_subtotal: number;
  wastage_amount: number;
  tax_amount: number;
  tax_rate_bp: number;
  wastage_rate_bp: number;
  shipping_fee: number;
  landed_total: number;
  /** Rỗng khi báo giá chưa đủ mặt hàng hoặc chưa có giá — không đem xếp hạng. */
  cost_rank: number | null;
  cost_gap_vs_lowest: number | null;
  missing_items: number;
  delivery_days: number | null;
  payment_term_days: number | null;
  warranty_months: number | null;
  /** `null` = chưa hỏi nhà cung cấp — khác «không». */
  has_vat_invoice: boolean | null;
  notes: string | null;
  document_path: string | null;
  selection_reason: string | null;
}

export interface BoardLine {
  request_item_id: string;
  item_code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  quantity: number;
  estimated_unit_price: number;
  /** `quotation_id` → đơn giá (đồng). */
  prices: Record<string, number>;
  last_purchase: {
    unit_price: number;
    order_date: string | null;
    order_code: string | null;
    supplier_name: string;
  } | null;
}

export interface QuotationBoard {
  quotations: BoardQuotation[];
  lines: BoardLine[];
}

/**
 * Bảng so giá — trả lỗi khi vai trò không được xem giá vốn (NEN-07); màn hình hiện lời giải thích
 * thay cho bảng, không đoán trước bằng vai trò ở trình duyệt.
 */
export function useQuotationBoard(requestId: string | undefined, enabled = true) {
  return useQuery<QuotationBoard, Error>({
    queryKey: ['quotation-board', requestId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('quotation_board', { p_request_id: requestId! });
      if (error) throw new Error(error.message);
      return data as QuotationBoard;
    },
    enabled: Boolean(requestId) && enabled,
    retry: false,
  });
}

export interface SaveQuotationInput {
  requestId: string;
  supplierId: string;
  header: {
    quoted_date: string | null;
    valid_until: string | null;
    tax_rate_bp: number;
    wastage_rate_bp: number;
    shipping_fee: string;
    delivery_days: number | null;
    payment_term_days: number | null;
    warranty_months: number | null;
    has_vat_invoice: boolean | null;
    notes: string | null;
  };
  /** `request_item_id` → đơn giá; rỗng = nhà cung cấp không báo mặt hàng này. */
  prices: Record<string, string>;
  /** Tệp báo giá mới (ảnh / PDF, hoặc bản quét) — tải lên trước khi lưu. */
  file?: File | null;
}

export function useSaveQuotationBoard() {
  const queryClient = useQueryClient();
  return useMutation<string, Error, SaveQuotationInput>({
    mutationFn: async ({ requestId, supplierId, header, prices, file }) => {
      let documentPath: string | null = null;
      if (file) {
        const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'pdf';
        documentPath = `${requestId}/${crypto.randomUUID()}.${ext}`;
        const { error: upError } = await supabase.storage
          .from(QUOTATION_FILE_BUCKET)
          .upload(documentPath, file, { contentType: file.type || 'application/pdf' });
        if (upError) throw upError;
      }
      const { data, error } = await supabase.rpc('save_quotation', {
        p_request_id: requestId,
        p_supplier_id: supplierId,
        p_header: { ...header, document_path: documentPath },
        p_prices: Object.fromEntries(
          Object.entries(prices).map(([k, v]) => [k, v && v !== '0' ? v : null]),
        ),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidatePurchasing(queryClient),
  });
}

/** Mở tệp báo giá bằng đường dẫn có hạn 5 phút — kho riêng tư. */
export async function quotationFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(QUOTATION_FILE_BUCKET)
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/* -------------------------------------------------------------------------- *
 * 4A — gom đề nghị mua
 * -------------------------------------------------------------------------- */

export interface PoolSource {
  item_id: string;
  request_id: string;
  request_code: string | null;
  request_title: string;
  stage: PurchaseRequestStage;
  urgency: PurchaseUrgency;
  needed_date: string | null;
  quantity: number | string;
  site_id: string | null;
  site_code: string | null;
  site_name: string | null;
  delivery_location: string | null;
  requester_name: string | null;
}

export interface PoolGroup {
  group_key: string;
  company_id: string;
  company_code: string;
  item_code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  total_quantity: number | string;
  earliest_needed: string | null;
  has_urgent: boolean;
  source_count: number;
  request_count: number;
  sources: PoolSource[];
}

export function usePurchasePool() {
  return useQuery<PoolGroup[], Error>({
    queryKey: ['mh-purchase-pool'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mh_purchase_pool');
      if (error) throw new Error(error.message);
      return (data ?? []) as PoolGroup[];
    },
  });
}

function invalidatePurchasing(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['mh-purchase-pool'] });
  void queryClient.invalidateQueries({ queryKey: ['quotations'] });
  void queryClient.invalidateQueries({ queryKey: ['quotation-items'] });
  void queryClient.invalidateQueries({ queryKey: ['quotation-comparison'] });
  void queryClient.invalidateQueries({ queryKey: ['quotation-board'] });
}

export function useRequestGroupQuotation() {
  const queryClient = useQueryClient();
  return useMutation<number, Error, { itemIds: string[]; supplierId: string }>({
    mutationFn: async ({ itemIds, supplierId }) => {
      const { data, error } = await supabase.rpc('request_group_quotation', {
        p_item_ids: itemIds,
        p_supplier_id: supplierId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => invalidatePurchasing(queryClient),
  });
}

export function useSetGroupQuotationPrice() {
  const queryClient = useQueryClient();
  return useMutation<
    number,
    Error,
    { itemIds: string[]; supplierId: string; unitPrice: string; deliveryDays: number | null }
  >({
    mutationFn: async ({ itemIds, supplierId, unitPrice, deliveryDays }) => {
      const { data, error } = await supabase.rpc('set_group_quotation_price', {
        p_item_ids: itemIds,
        p_supplier_id: supplierId,
        p_unit_price: unitPrice,
        p_delivery_days: deliveryDays,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => invalidatePurchasing(queryClient),
  });
}
