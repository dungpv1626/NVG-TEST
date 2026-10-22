/**
 * Đợt 4 — Mua hàng và Kho: gom đề nghị (4A), bảng so giá (4B), đơn sắp trễ (4C), tồn tối thiểu (4D).
 *
 * Tách khỏi `use-purchasing.ts` cho gọn; mọi hàm đọc qua RLS (Mẫu A + Mẫu E) hoặc hàm CSDL có kiểm
 * quyền giá vốn — trình duyệt không tự lọc phạm vi.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchaseRequestStage, PurchaseUrgency } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

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
