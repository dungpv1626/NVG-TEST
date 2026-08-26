/**
 * Dự toán và bảng khối lượng (Module DA).
 *
 * ⚠️ Dữ liệu giá vốn KHÔNG đọc thẳng từ bảng `estimates`: quyền đọc các cột chi phí đã bị
 * thu hồi ở tầng CSDL, và chỉ hàm `estimate_cost_breakdown` mở ra — vì mỗi lượt xem phải
 * được ghi nhật ký (PRD NEN-07). Vì vậy màn hình luôn tách làm hai lượt gọi: phần chung của
 * bản dự toán, và phần cấu thành giá vốn.
 *
 * Hệ quả khi viết truy vấn: KHÔNG dùng `select('*')` trên `estimates` — sẽ bị từ chối vì
 * trong đó có cột không được cấp quyền.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CostGroup, MoneyValue, StatusGroup } from '@nvg/shared';
import { supabase } from '@/lib/supabase';

export interface EstimateRecord {
  id: string;
  code: string;
  version: number;
  is_current_version: boolean;
  status: StatusGroup;
  bid_price: MoneyValue | null;
  basis_notes: string | null;
  approved_at: string | null;
  created_at: string;
  prepared: { full_name: string } | null;
}

const ESTIMATE_SELECT =
  'id, code, version, is_current_version, status, bid_price, basis_notes, approved_at, ' +
  'created_at, prepared:users!estimates_prepared_by_users_id_fk(full_name)';

/** Toàn bộ phiên bản dự toán của một gói thầu, mới nhất lên đầu (DA-07). */
export function useEstimates(projectId: string | undefined) {
  return useQuery<EstimateRecord[], Error>({
    queryKey: ['estimates', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estimates')
        .select(ESTIMATE_SELECT)
        .eq('bidding_project_id', projectId!)
        .is('deleted_at', null)
        .order('version', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EstimateRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export interface CostBreakdown {
  direct_cost: MoneyValue | null;
  overhead_cost: MoneyValue | null;
  contingency_cost: MoneyValue | null;
  finance_cost: MoneyValue | null;
  tax_amount: MoneyValue | null;
  profit_amount: MoneyValue | null;
  profit_margin_percent: string | null;
}

/**
 * Cấu thành giá vốn — MỖI LẦN GỌI LÀ MỘT DÒNG NHẬT KÝ (NEN-07).
 *
 * `enabled` do nơi gọi quyết định: chỉ nạp khi người dùng thực sự mở phần giá vốn, không nạp
 * sẵn cùng trang. Nạp sẵn nghĩa là nhật ký đầy những lượt "xem" mà người dùng chưa hề nhìn.
 */
export function useCostBreakdown(estimateId: string | undefined, enabled: boolean) {
  return useQuery<CostBreakdown | null, Error>({
    queryKey: ['estimates', 'costs', estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('estimate_cost_breakdown', {
        p_estimate_id: estimateId!,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CostBreakdown[];
      return rows[0] ?? null;
    },
    enabled: Boolean(estimateId) && enabled,
    // Không giữ lâu trong bộ nhớ đệm: đây là dữ liệu nhạy cảm, và mỗi lần xem lại nên là một
    // lượt được ghi nhận thật.
    staleTime: 0,
    gcTime: 0,
  });
}

export interface EstimateItemRecord {
  id: string;
  position: string;
  cost_group: CostGroup;
  description: string;
  unit: string | null;
  quantity: string;
  unit_price: MoneyValue;
  amount: MoneyValue;
}

export function useEstimateItems(estimateId: string | undefined, enabled: boolean) {
  return useQuery<EstimateItemRecord[], Error>({
    queryKey: ['estimate_items', estimateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estimate_items')
        .select('id, position, cost_group, description, unit, quantity, unit_price, amount')
        .eq('estimate_id', estimateId!)
        .is('deleted_at', null)
        .order('position');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as EstimateItemRecord[];
    },
    enabled: Boolean(estimateId) && enabled,
  });
}

/** Lập một phiên bản dự toán mới. Số phiên bản và mã do CSDL cấp (DA-07). */
export function useCreateEstimate() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string },
    Error,
    { projectId: string; companyId: string; code: string; preparedBy: string | null }
  >({
    mutationFn: async ({ projectId, companyId, code, preparedBy }) => {
      const { data, error } = await supabase
        .from('estimates')
        .insert({
          code,
          company_id: companyId,
          bidding_project_id: projectId,
          prepared_by: preparedBy,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['estimates'] });
    },
  });
}

export function useUpdateEstimate() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { id: string; changes: Partial<{ bid_price: string | null; basis_notes: string | null }> }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase
        .from('estimates')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['estimates'] });
    },
  });
}

export interface CostInput {
  directCost: string;
  overheadCost: string;
  contingencyCost: string;
  financeCost: string;
  taxAmount: string;
  profitAmount: string;
  profitMarginPercent: string;
}

/** Ghi cấu thành giá vốn — qua hàm để lượt sửa cũng vào nhật ký (NEN-07). */
export function useSaveCosts() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { estimateId: string; costs: CostInput }>({
    mutationFn: async ({ estimateId, costs }) => {
      const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
      const { error } = await supabase.rpc('save_estimate_costs', {
        p_estimate_id: estimateId,
        p_direct_cost: num(costs.directCost),
        p_overhead_cost: num(costs.overheadCost),
        p_contingency_cost: num(costs.contingencyCost),
        p_finance_cost: num(costs.financeCost),
        p_tax_amount: num(costs.taxAmount),
        p_profit_amount: num(costs.profitAmount),
        p_profit_margin_percent: num(costs.profitMarginPercent),
      });
      if (error) throw error;
    },
    onSuccess: (_r, { estimateId }) => {
      void queryClient.invalidateQueries({ queryKey: ['estimates', 'costs', estimateId] });
      void queryClient.invalidateQueries({ queryKey: ['estimates'] });
    },
  });
}

export interface EstimateItemInput {
  cost_group: CostGroup;
  description: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  boq_item_id?: string | null;
}

/**
 * Ghi lại TOÀN BỘ dòng chi tiết trong một lượt.
 *
 * Thành tiền do CSDL tự tính từ khối lượng và đơn giá — không gửi lên, để bảng dự toán không
 * bao giờ cộng ra hai kết quả khác nhau ở hai nơi.
 */
export function useSaveEstimateItems() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, { estimateId: string; items: EstimateItemInput[] }>({
    mutationFn: async ({ estimateId, items }) => {
      const { data, error } = await supabase.rpc('save_estimate_items', {
        p_estimate_id: estimateId,
        p_items: items.map((item, index) => ({ ...item, position: index + 1 })),
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: (_r, { estimateId }) => {
      void queryClient.invalidateQueries({ queryKey: ['estimate_items', estimateId] });
      void queryClient.invalidateQueries({ queryKey: ['estimates', 'costs', estimateId] });
    },
  });
}

/** Trình duyệt giá dự thầu (DA-07) — hồ sơ vào thẳng Hộp thư Phê duyệt chung. */
export function useRequestEstimateApproval() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { estimateId: string }>({
    mutationFn: async ({ estimateId }) => {
      const { data, error } = await supabase.rpc('request_estimate_approval', {
        p_estimate_id: estimateId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['estimates'] });
      void queryClient.invalidateQueries({ queryKey: ['bidding_projects'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export interface BoqItemRecord {
  id: string;
  position: string;
  item_code: string | null;
  name: string;
  unit: string;
  quantity: string;
  drawing_ref: string | null;
  drawing_version_id: string | null;
  notes: string | null;
  /**
   * Phiên bản bản vẽ đã dùng để bóc. `is_current_version = false` nghĩa là bản vẽ nguồn đã
   * có bản mới hơn — đúng tình huống DA-04 yêu cầu cảnh báo.
   */
  drawing_version: { version: number; is_current_version: boolean } | null;
}

export function useBoqItems(projectId: string | undefined) {
  return useQuery<BoqItemRecord[], Error>({
    queryKey: ['boq_items', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boq_items')
        .select(
          'id, position, item_code, name, unit, quantity, drawing_ref, drawing_version_id, notes, ' +
            'drawing_version:document_versions!boq_items_drawing_version_id_document_versions_id_fk(version, is_current_version)',
        )
        .eq('bidding_project_id', projectId!)
        .is('deleted_at', null)
        .order('position');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BoqItemRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export function useCreateBoqItem() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      projectId: string;
      companyId: string;
      item: {
        item_code: string | null;
        name: string;
        unit: string;
        quantity: number;
        drawing_ref: string | null;
        position: number;
      };
    }
  >({
    mutationFn: async ({ projectId, companyId, item }) => {
      const { error } = await supabase
        .from('boq_items')
        .insert({ ...item, bidding_project_id: projectId, company_id: companyId })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['boq_items'] });
    },
  });
}

export interface BidDocumentRecord {
  id: string;
  category: string;
  name: string;
  is_required: boolean;
  submitted_at: string | null;
  notes: string | null;
}

export function useBidDocuments(projectId: string | undefined) {
  return useQuery<BidDocumentRecord[], Error>({
    queryKey: ['bid_documents', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bid_documents')
        .select('id, category, name, is_required, submitted_at, notes')
        .eq('bidding_project_id', projectId!)
        .is('deleted_at', null)
        .order('category');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as BidDocumentRecord[];
    },
    enabled: Boolean(projectId),
  });
}

export function useSaveBidDocument() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    | { mode: 'create'; projectId: string; companyId: string; category: string; name: string; isRequired: boolean }
    | { mode: 'toggle'; id: string; submitted: boolean }
  >({
    mutationFn: async (input) => {
      if (input.mode === 'create') {
        const { error } = await supabase
          .from('bid_documents')
          .insert({
            bidding_project_id: input.projectId,
            company_id: input.companyId,
            category: input.category,
            name: input.name,
            is_required: input.isRequired,
          })
          .select('id')
          .single();
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('bid_documents')
        .update({ submitted_at: input.submitted ? new Date().toISOString() : null })
        .eq('id', input.id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bid_documents'] });
    },
  });
}
