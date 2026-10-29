/**
 * Giá vốn và lợi nhuận của báo giá / dự toán (migration 0244, gói G1).
 *
 * Giá vốn là Mẫu D (CLAUDE.md 3.4): KHÔNG đọc bảng `quote_item_costs` (trình duyệt không có quyền nào trên
 * bảng ấy). Mọi lượt đọc / ghi đi qua hàm CSDL — mỗi lượt một dòng `sensitive_access_logs` — nên chỉ nạp
 * khi khối giá vốn thật sự hiện, và không giữ trong bộ nhớ đệm (cùng cách `useCostBreakdown`).
 *
 * Ai xem được giá vốn do CSDL quyết (`rls_sees_sensitive('cost')`); giao diện hỏi lại đúng hàm ấy, không
 * chép danh sách vai trò.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyValue } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

/** Vai trò hiện tại có xem / nhập được giá vốn không. Hỏi không được thì coi như không. */
export function useSeesCost() {
  return useQuery<boolean, Error>({
    queryKey: ['sensitive-access', 'cost'],
    queryFn: async () => {
      const { data } = await supabase.rpc('rls_sees_sensitive', { kind: 'cost' });
      return data === true;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface QuoteCostLine {
  quote_item_id: string;
  unit_cost: MoneyValue | null;
  cost_amount: MoneyValue | null;
}

/** Đơn giá vốn từng hạng mục — chỉ gọi khi người dùng xem được giá vốn và mở khối «Giá vốn». */
export function useQuoteCostLines(quoteId: string | undefined, enabled: boolean) {
  return useQuery<QuoteCostLine[], Error>({
    queryKey: ['quotes', 'cost-lines', quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('quote_cost_lines', { p_quote_id: quoteId! });
      if (error) throw error;
      return (data ?? []) as unknown as QuoteCostLine[];
    },
    enabled: Boolean(quoteId) && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export interface CostEstimateOption {
  estimate_id: string;
  code: string;
  version: number;
  source_label: string;
  total_cost: MoneyValue | null;
}

/** Dự toán đã duyệt của gói thầu / hồ sơ thiết kế thuộc cơ hội — lấy làm giá vốn thay cho từng dòng. */
export function useQuoteCostEstimateOptions(quoteId: string | undefined, enabled: boolean) {
  return useQuery<CostEstimateOption[], Error>({
    queryKey: ['quotes', 'cost-estimates', quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('quote_cost_estimate_options', {
        p_quote_id: quoteId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CostEstimateOption[];
    },
    enabled: Boolean(quoteId) && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export interface SaveQuoteCostsInput {
  quoteId: string;
  /** Đơn giá vốn từng hạng mục (chuỗi chữ số đồng; rỗng = xoá giá vốn dòng ấy). */
  items: { quoteItemId: string; unitCost: string | null }[];
  /** Có giá trị = lấy giá vốn từ dự toán này, bỏ qua từng dòng. */
  estimateId: string | null;
}

export function useSaveQuoteCosts() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, SaveQuoteCostsInput>({
    mutationFn: async ({ quoteId, items, estimateId }) => {
      const { error } = await supabase.rpc('save_quote_costs', {
        p_quote_id: quoteId,
        p_items: items.map((i) => ({ quote_item_id: i.quoteItemId, unit_cost: i.unitCost })),
        p_estimate_id: estimateId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['price-margin'] });
      // Giá vốn nhập lúc chờ duyệt có thể đổi người duyệt (dưới / đạt mức tối thiểu).
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/** Một dòng của `price_margin_brief` — giá vốn / lợi nhuận rỗng với vai trò không xem được giá vốn. */
export interface PriceMarginBrief {
  entity_type: 'quotes' | 'estimates';
  scope_kind: string | null;
  /** Doanh thu trước thuế (đồng). */
  revenue: MoneyValue | null;
  vat_amount: MoneyValue | null;
  discount_amount: MoneyValue | null;
  sees_cost: boolean;
  cost: MoneyValue | null;
  profit: MoneyValue | null;
  /** PostgREST trả `numeric` dạng số. */
  margin_percent: number | string | null;
  cost_complete: boolean;
  cost_source: 'hang_muc' | 'du_toan' | null;
  min_margin: number | string | null;
  needs_ceo: boolean | null;
  /** Hồ sơ duyệt đang mở đã chuyển Tổng Giám đốc (loại `low_margin_price`). */
  routed_to_ceo: boolean;
  risk_note: string | null;
  /** Câu «Điều kiện thanh toán» đã sửa trên văn bản báo giá; rỗng = câu mặc định. */
  payment_terms: string | null;
}

export function usePriceMarginBrief(
  entityType: 'quotes' | 'estimates',
  entityId: string | undefined,
  enabled = true,
) {
  return useQuery<PriceMarginBrief | null, Error>({
    queryKey: ['price-margin', entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('price_margin_brief', {
        p_entity_type: entityType,
        p_entity_id: entityId!,
      });
      if (error) throw error;
      return ((data ?? []) as unknown as PriceMarginBrief[])[0] ?? null;
    },
    enabled: Boolean(entityId) && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}
