/**
 * Truy vấn và thao tác của Module MH — Mua hàng và Vật tư.
 *
 * Nguồn: PRD MH-01 → MH-08, Backend Schema 4.7, Webapp Flow 3.5.
 *
 * Ranh giới giữa hai lớp (CLAUDE.md Mục 3.1) chạy đúng ở đây:
 *  - Đọc danh sách, soạn bản nháp, nhập báo giá → gọi thẳng Supabase, RLS lo phân quyền.
 *  - Sáu thao tác đi qua hàm CSDL vì mỗi cái có điều kiện mà trình duyệt không được bỏ qua:
 *    gửi phê duyệt (chốt giá trị + mã chi phí), hủy đề nghị, so sánh báo giá (kiểm quyền xem
 *    giá vốn + ghi nhật ký truy cập), chọn nhà cung cấp (bắt buộc căn cứ nếu không rẻ nhất),
 *    lập đơn hàng (phải đã duyệt, và cộng cam kết vào ngân sách), ghi giao nhận (không nhận
 *    vượt số đã đặt, chuyển cam kết sang chi phí thực tế).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CostGroup,
  DeliveryIssueType,
  MoneyValue,
  PurchaseOrderStage,
  PurchaseRequestStage,
  PurchaseUrgency,
  QuotationStatus,
  SupplierClass,
} from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

/* ========================================================================== *
 * Nhà cung cấp — MH-03
 * ========================================================================== */

export interface SupplierRecord {
  id: string;
  code: string;
  name: string;
  category: string | null;
  supplier_class: SupplierClass;
  tax_code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  default_payment_term_days: number | null;
  rating_spec_conformity: number | null;
  rating_quality_stability: number | null;
  rating_price: number | null;
  rating_delivery: number | null;
  rating_payment_terms: number | null;
  rating_documents: number | null;
  rating_warranty: number | null;
  rating_reputation: number | null;
  rating_notes: string | null;
  rated_at: string | null;
  suspended_reason: string | null;
  notes: string | null;
  created_at: string;
}

const SUPPLIER_SELECT =
  'id, code, name, category, supplier_class, tax_code, contact_person, phone, email, address, ' +
  'default_payment_term_days, rating_spec_conformity, rating_quality_stability, rating_price, ' +
  'rating_delivery, rating_payment_terms, rating_documents, rating_warranty, rating_reputation, ' +
  'rating_notes, rated_at, suspended_reason, notes, created_at';

/**
 * Danh mục nhà cung cấp — bảng DÙNG CHUNG giữa ba pháp nhân, KHÔNG lọc theo pháp nhân.
 *
 * Lọc ở đây sẽ tái tạo đúng vấn đề MH-03 sinh ra để giải: cùng một nhà cung cấp bị nhập ba
 * lần với ba mã khác nhau, và lịch sử giá MH-05 vỡ làm ba mảnh.
 */
export function useSuppliers() {
  return useQuery<SupplierRecord[], Error>({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select(SUPPLIER_SELECT)
        .is('deleted_at', null)
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SupplierRecord[];
    },
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery<SupplierRecord | null, Error>({
    queryKey: ['suppliers', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select(SUPPLIER_SELECT)
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as SupplierRecord | null;
    },
    enabled: Boolean(id),
  });
}

export function useSaveSupplier() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id?: string; values: Partial<SupplierRecord> }>({
    mutationFn: async ({ id, values }) => {
      const query = id
        ? supabase.from('suppliers').update(values).eq('id', id)
        : supabase.from('suppliers').insert(values);
      // `.select().single()` bắt buộc: thiếu nó thì RLS chặn mà PostgREST vẫn báo thành công.
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

/**
 * Lịch sử giao dịch với một nhà cung cấp — MH-03.
 *
 * Đọc từ đơn đặt hàng chứ không từ một bảng "lịch sử" riêng: mỗi đơn hàng đã là một lần
 * giao dịch có mã, có giá trị, có ngày. Bảng thứ hai chỉ là chỗ để hai con số lệch nhau.
 */
export function useOrdersOfSupplier(supplierId: string | undefined) {
  return useQuery<PurchaseOrderRecord[], Error>({
    queryKey: ['purchase-orders', 'of-supplier', supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(ORDER_SELECT)
        .eq('supplier_id', supplierId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PurchaseOrderRecord[];
    },
    enabled: Boolean(supplierId),
  });
}

/* ========================================================================== *
 * Đề nghị mua — MH-01, MH-02
 * ========================================================================== */

export interface PurchaseRequestRecord {
  id: string;
  code: string | null;
  company_id: string;
  title: string;
  stage: PurchaseRequestStage;
  urgency: PurchaseUrgency;
  needed_date: string | null;
  estimated_value: string;
  construction_site_id: string | null;
  cost_code: string | null;
  cost_group: CostGroup;
  requested_by: string | null;
  created_at: string;
  requester: { full_name: string } | null;
  /** Công trình gửi đề nghị — rỗng khi là nhu cầu văn phòng. */
  site?: { code: string } | null;
}

/**
 * Cột chung của danh sách và chi tiết — KHÔNG gồm công trình: mỗi bên nhúng `site` với tập cột
 * riêng. Nhúng cùng một bảng hai lần trong một truy vấn thì PostgREST từ chối cả truy vấn
 * («table name … specified more than once») — lỗi thật 30/09/2026: mọi trang chi tiết đề nghị
 * mua hỏng sau khi danh sách thêm cột «Công trình».
 */
const REQUEST_BASE_SELECT =
  'id, code, company_id, title, stage, urgency, needed_date, estimated_value, ' +
  'construction_site_id, cost_code, cost_group, requested_by, created_at, ' +
  'requester:users!purchase_requests_requested_by_users_id_fk(full_name)';

const SITE_EMBED =
  'site:construction_sites!purchase_requests_construction_site_id_construction_sites_id_fk';

export const REQUEST_LIST_SELECT = `${REQUEST_BASE_SELECT}, ${SITE_EMBED}(code)`;

export const REQUEST_DETAIL_SELECT =
  `${REQUEST_BASE_SELECT}, bidding_project_id, delivery_location, submitted_at, approved_at, ` +
  `closed_reason, notes, updated_at, ${SITE_EMBED}(id, code, name)`;

export function usePurchaseRequests(options: { enabled?: boolean } = {}) {
  const scope = useCompanyScope();

  return useQuery<PurchaseRequestRecord[], Error>({
    queryKey: ['purchase-requests', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('purchase_requests').select(REQUEST_LIST_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PurchaseRequestRecord[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export interface PurchaseRequestDetailRecord extends PurchaseRequestRecord {
  bidding_project_id: string | null;
  delivery_location: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  closed_reason: string | null;
  notes: string | null;
  updated_at: string;
  site: { id: string; code: string; name: string } | null;
}

export function usePurchaseRequest(id: string | undefined) {
  return useQuery<PurchaseRequestDetailRecord | null, Error>({
    queryKey: ['purchase-requests', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_requests')
        .select(REQUEST_DETAIL_SELECT)
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as PurchaseRequestDetailRecord | null;
    },
    enabled: Boolean(id),
  });
}

/** Đề nghị mua phát sinh từ một công trình — tab "Đề nghị mua" của Chi tiết Công trình (TC-03). */
export function useRequestsOfSite(siteId: string | undefined) {
  return useQuery<PurchaseRequestRecord[], Error>({
    queryKey: ['purchase-requests', 'of-site', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_requests')
        .select(REQUEST_LIST_SELECT)
        .eq('construction_site_id', siteId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PurchaseRequestRecord[];
    },
    enabled: Boolean(siteId),
  });
}

export interface NewPurchaseRequestInput {
  companyId: string;
  title: string;
  constructionSiteId?: string | null;
  costCode?: string | null;
  costGroup?: CostGroup;
  urgency?: PurchaseUrgency;
  neededDate?: string | null;
  deliveryLocation?: string | null;
  notes?: string | null;
}

/**
 * Tạo đề nghị mua.
 *
 * KHÔNG truyền `requested_by`: CSDL đóng dấu người đề nghị từ phiên đăng nhập. Gửi từ đây
 * thì cột đó nhận giá trị của trình duyệt, và một đề nghị mang tên đồng nghiệp sẽ không bao
 * giờ sửa lại được (trigger đóng băng cột này sau khi ghi).
 */
export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, NewPurchaseRequestInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('purchase_requests')
        .insert({
          company_id: input.companyId,
          title: input.title.trim(),
          construction_site_id: input.constructionSiteId ?? null,
          cost_code: input.costCode?.trim() || null,
          cost_group: input.costGroup ?? 'vat_tu',
          urgency: input.urgency ?? 'thuong',
          needed_date: input.neededDate || null,
          delivery_location: input.deliveryLocation?.trim() || null,
          notes: input.notes?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    },
  });
}

/** Sửa nội dung bản nháp. `stage`, `estimated_value` không có ở đây — CSDL cũng từ chối. */
export function useUpdatePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        title: string;
        cost_code: string | null;
        cost_group: CostGroup;
        urgency: PurchaseUrgency;
        needed_date: string | null;
        delivery_location: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase
        .from('purchase_requests')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
    },
  });
}

export function useSubmitPurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { requestId: string }>({
    mutationFn: async ({ requestId }) => {
      const { data, error } = await supabase.rpc('submit_purchase_request_approval', {
        p_request_id: requestId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useCancelPurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { requestId: string; reason: string }>({
    mutationFn: async ({ requestId, reason }) => {
      const { error } = await supabase.rpc('cancel_purchase_request', {
        p_request_id: requestId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/* --- Dòng mặt hàng của đề nghị --- */

export interface PurchaseRequestItemRecord {
  id: string;
  position: string;
  item_code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  quantity: string;
  estimated_unit_price: string;
  notes: string | null;
}

export function usePurchaseRequestItems(requestId: string | undefined) {
  return useQuery<PurchaseRequestItemRecord[], Error>({
    queryKey: ['purchase-requests', 'items', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_request_items')
        .select(
          'id, position, item_code, name, specification, unit, quantity, estimated_unit_price, notes',
        )
        .eq('purchase_request_id', requestId!)
        .order('position');
      if (error) throw new Error(error.message);
      return (data ?? []) as PurchaseRequestItemRecord[];
    },
    enabled: Boolean(requestId),
  });
}

export function useSavePurchaseRequestItem() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id?: string;
      requestId: string;
      values: {
        position?: number;
        item_code?: string | null;
        name: string;
        specification?: string | null;
        unit: string;
        quantity: number;
        estimated_unit_price: MoneyValue;
        notes?: string | null;
      };
    }
  >({
    mutationFn: async ({ id, requestId, values }) => {
      const payload = { ...values, estimated_unit_price: String(values.estimated_unit_price) };
      const query = id
        ? supabase.from('purchase_request_items').update(payload).eq('id', id)
        : supabase
            .from('purchase_request_items')
            .insert({ ...payload, purchase_request_id: requestId });
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['purchase-requests', 'items', variables.requestId],
      });
    },
  });
}

export function useDeletePurchaseRequestItem() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; requestId: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('purchase_request_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['purchase-requests', 'items', variables.requestId],
      });
    },
  });
}

/**
 * Danh sách mã chi phí của một công trình — chỉ mã và tên, KHÔNG kèm số tiền.
 *
 * Dùng cho ô chọn mã chi phí ở biểu mẫu đề nghị mua. Cố ý KHÔNG dùng `useSiteBudgetStatus`:
 * hàm đó là màn hình ngân sách TC-05 và chỉ mở cho vai trò xem được phân hệ Thi công, nên
 * Phòng Mua hàng sẽ nhận danh sách rỗng rồi không gửi phê duyệt được. Ở đây cần đúng một
 * danh sách mã để chọn, không cần con số nào.
 */
export interface SiteCostCodeRow {
  cost_code: string;
  name: string;
  cost_group: CostGroup;
}

export function useSiteCostCodes(siteId: string | undefined) {
  return useQuery<SiteCostCodeRow[], Error>({
    queryKey: ['site-cost-codes', siteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_cost_codes', { p_site_id: siteId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as SiteCostCodeRow[];
    },
    enabled: Boolean(siteId),
    retry: false,
  });
}

/* ========================================================================== *
 * Báo giá và bảng so sánh — MH-04
 * ========================================================================== */

export interface QuotationRecord {
  id: string;
  supplier_id: string;
  status: QuotationStatus;
  quoted_date: string | null;
  valid_until: string | null;
  tax_rate_bp: number;
  wastage_rate_bp: number;
  shipping_fee: string;
  delivery_days: number | null;
  payment_term_days: number | null;
  warranty_months: number | null;
  selection_reason: string | null;
  notes: string | null;
  supplier: { id: string; name: string; supplier_class: SupplierClass } | null;
}

export function useQuotations(requestId: string | undefined) {
  return useQuery<QuotationRecord[], Error>({
    queryKey: ['quotations', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select(
          'id, supplier_id, status, quoted_date, valid_until, tax_rate_bp, wastage_rate_bp, ' +
            'shipping_fee, delivery_days, payment_term_days, warranty_months, selection_reason, notes, ' +
            'supplier:suppliers!quotations_supplier_id_suppliers_id_fk(id, name, supplier_class)',
        )
        .eq('purchase_request_id', requestId!)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as QuotationRecord[];
    },
    enabled: Boolean(requestId),
  });
}

export interface QuotationItemRecord {
  id: string;
  quotation_id: string;
  purchase_request_item_id: string | null;
  item_code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  quantity: string;
  unit_price: string;
}

export function useQuotationItems(quotationIds: string[]) {
  const key = [...quotationIds].sort().join(',');

  return useQuery<QuotationItemRecord[], Error>({
    queryKey: ['quotation-items', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotation_items')
        .select(
          'id, quotation_id, purchase_request_item_id, item_code, name, specification, unit, quantity, unit_price',
        )
        .in('quotation_id', quotationIds)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as QuotationItemRecord[];
    },
    enabled: quotationIds.length > 0,
  });
}

/**
 * Nhập một báo giá kèm đơn giá từng mặt hàng.
 *
 * Hai lệnh ghi liên tiếp chứ không phải một giao dịch: nếu dòng hàng lỗi thì phần đầu vẫn
 * còn, và người dùng nhập lại dòng hàng chứ không mất cả báo giá. Ràng buộc thật nằm ở chỗ
 * khác — `select_quotation` từ chối báo giá chưa có dòng nào.
 */
export function useSaveQuotation() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      requestId: string;
      companyId: string;
      supplierId: string;
      quotedDate?: string | null;
      validUntil?: string | null;
      taxRateBp?: number;
      wastageRateBp?: number;
      shippingFee?: MoneyValue;
      deliveryDays?: number | null;
      paymentTermDays?: number | null;
      warrantyMonths?: number | null;
      notes?: string | null;
      items: {
        purchaseRequestItemId?: string | null;
        itemCode?: string | null;
        name: string;
        specification?: string | null;
        unit: string;
        quantity: number;
        unitPrice: MoneyValue;
      }[];
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('quotations')
        .insert({
          company_id: input.companyId,
          purchase_request_id: input.requestId,
          supplier_id: input.supplierId,
          status: 'da_nhan',
          quoted_date: input.quotedDate || new Date().toISOString().slice(0, 10),
          valid_until: input.validUntil || null,
          tax_rate_bp: input.taxRateBp ?? 0,
          wastage_rate_bp: input.wastageRateBp ?? 0,
          shipping_fee: String(input.shippingFee ?? 0),
          delivery_days: input.deliveryDays ?? null,
          payment_term_days: input.paymentTermDays ?? null,
          warranty_months: input.warrantyMonths ?? null,
          notes: input.notes?.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      const quotationId = (data as { id: string }).id;

      if (input.items.length > 0) {
        const { error: itemError } = await supabase.from('quotation_items').insert(
          input.items.map((item) => ({
            quotation_id: quotationId,
            purchase_request_item_id: item.purchaseRequestItemId ?? null,
            item_code: item.itemCode?.trim() || null,
            name: item.name.trim(),
            specification: item.specification?.trim() || null,
            unit: item.unit.trim(),
            quantity: item.quantity,
            unit_price: String(item.unitPrice),
          })),
        );
        if (itemError) throw itemError;
      }
      return quotationId;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['quotations', variables.requestId] });
      void queryClient.invalidateQueries({ queryKey: ['quotation-items'] });
      void queryClient.invalidateQueries({ queryKey: ['quotation-comparison'] });
    },
  });
}

export interface QuotationComparisonRow {
  quotation_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_class: SupplierClass;
  status: QuotationStatus;
  quoted_date: string | null;
  goods_subtotal: string;
  wastage_amount: string;
  tax_amount: string;
  shipping_fee: string;
  landed_total: string;
  cost_rank: number;
  cost_gap_vs_lowest: string;
  delivery_days: number | null;
  payment_term_days: number | null;
  warranty_months: number | null;
}

/**
 * Bảng so sánh chuẩn hóa — MH-04.
 *
 * Trả lỗi khi vai trò hiện tại không được xem giá vốn, và đó là hành vi đúng: bảng này chứa
 * báo giá của các nhà cung cấp không được chọn, tức nội dung thương thảo (NEN-07). Màn hình
 * bắt lỗi đó và hiện thông điệp thay vì bảng, không cố đoán trước bằng vai trò ở trình duyệt.
 */
export function useQuotationComparison(requestId: string | undefined, enabled = true) {
  return useQuery<QuotationComparisonRow[], Error>({
    queryKey: ['quotation-comparison', requestId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('compare_quotations', {
        p_request_id: requestId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as QuotationComparisonRow[];
    },
    enabled: Boolean(requestId) && enabled,
    retry: false,
  });
}

export function useSelectQuotation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { quotationId: string; requestId: string; reason?: string }>({
    mutationFn: async ({ quotationId, reason }) => {
      const { error } = await supabase.rpc('select_quotation', {
        p_quotation_id: quotationId,
        p_reason: reason?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['quotations', variables.requestId] });
      void queryClient.invalidateQueries({ queryKey: ['quotation-comparison'] });
    },
  });
}

/* ========================================================================== *
 * Đơn đặt hàng và giao nhận — MH-06, MH-07
 * ========================================================================== */

export interface PurchaseOrderRecord {
  id: string;
  code: string | null;
  company_id: string;
  purchase_request_id: string;
  supplier_id: string;
  stage: PurchaseOrderStage;
  order_date: string | null;
  promised_date: string | null;
  total_value: string;
  contract_number: string | null;
  created_at: string;
  supplier: { name: string } | null;
  request: { id: string; code: string | null; title: string } | null;
}

const ORDER_SELECT =
  'id, code, company_id, purchase_request_id, supplier_id, stage, order_date, promised_date, ' +
  'total_value, contract_number, created_at, ' +
  'supplier:suppliers!purchase_orders_supplier_id_suppliers_id_fk(name), ' +
  'request:purchase_requests!purchase_orders_purchase_request_id_purchase_requests_id_fk(id, code, title)';

export function usePurchaseOrders(options: { enabled?: boolean } = {}) {
  const scope = useCompanyScope();

  return useQuery<PurchaseOrderRecord[], Error>({
    queryKey: ['purchase-orders', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('purchase_orders').select(ORDER_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PurchaseOrderRecord[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export interface PurchaseOrderDetailRecord extends PurchaseOrderRecord {
  quotation_id: string | null;
  committed_to_budget: string;
  closed_reason: string | null;
  notes: string | null;
  updated_at: string;
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery<PurchaseOrderDetailRecord | null, Error>({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(
          `${ORDER_SELECT}, quotation_id, committed_to_budget, closed_reason, notes, updated_at`,
        )
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as PurchaseOrderDetailRecord | null;
    },
    enabled: Boolean(id),
  });
}

/** Đơn hàng của một đề nghị — tab Đơn hàng ở Chi tiết Đề nghị mua. */
export function useOrdersOfRequest(requestId: string | undefined) {
  return useQuery<PurchaseOrderRecord[], Error>({
    queryKey: ['purchase-orders', 'of-request', requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(ORDER_SELECT)
        .eq('purchase_request_id', requestId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PurchaseOrderRecord[];
    },
    enabled: Boolean(requestId),
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      quotationId: string;
      requestId: string;
      promisedDate?: string | null;
      contractNumber?: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('create_purchase_order', {
        p_quotation_id: input.quotationId,
        p_promised_date: input.promisedDate || null,
        p_contract_number: input.contractNumber?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['site-budget'] });
    },
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { orderId: string; reason: string }>({
    mutationFn: async ({ orderId, reason }) => {
      const { error } = await supabase.rpc('cancel_purchase_order', {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['site-budget'] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      id: string;
      changes: Partial<{
        promised_date: string | null;
        contract_number: string | null;
        notes: string | null;
      }>;
    }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export interface PurchaseOrderItemRecord {
  id: string;
  position: string;
  item_code: string | null;
  name: string;
  specification: string | null;
  unit: string;
  quantity: string;
  unit_price: string;
  delivered_quantity: string;
}

export function usePurchaseOrderItems(orderId: string | undefined) {
  return useQuery<PurchaseOrderItemRecord[], Error>({
    queryKey: ['purchase-orders', 'items', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(
          'id, position, item_code, name, specification, unit, quantity, unit_price, delivered_quantity',
        )
        .eq('purchase_order_id', orderId!)
        .order('position');
      if (error) throw new Error(error.message);
      return (data ?? []) as PurchaseOrderItemRecord[];
    },
    enabled: Boolean(orderId),
  });
}

export interface DeliveryRecord {
  id: string;
  code: string | null;
  delivered_date: string;
  delivered_by_name: string | null;
  delivery_note_number: string | null;
  invoice_number: string | null;
  has_quality_certificate: boolean;
  notes: string | null;
  created_at: string;
  receiver: { full_name: string } | null;
  items: {
    id: string;
    purchase_order_item_id: string;
    quantity_ok: string;
    quantity_issue: string;
    issue_type: DeliveryIssueType | null;
    issue_note: string | null;
  }[];
  /** Phiếu kho gắn với đợt giao; lọc `movement_type = 'nhap'` và chưa xoá ở nơi dùng. */
  stock_ins: { code: string | null; movement_type: string; deleted_at: string | null }[] | null;
}

export function useDeliveries(orderId: string | undefined) {
  return useQuery<DeliveryRecord[], Error>({
    queryKey: ['deliveries', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select(
          'id, code, delivered_date, delivered_by_name, delivery_note_number, invoice_number, ' +
            'has_quality_certificate, notes, created_at, ' +
            'receiver:users!deliveries_received_by_users_id_fk(full_name), ' +
            'items:delivery_items(id, purchase_order_item_id, quantity_ok, quantity_issue, issue_type, issue_note), ' +
            // Phiếu nhập kho đã lập từ đợt giao này — có rồi thì không mời bấm «Nhập kho» nữa.
            'stock_ins:stock_movements!stock_movements_delivery_id_deliveries_id_fk(code, movement_type, deleted_at)',
        )
        .eq('purchase_order_id', orderId!)
        .is('deleted_at', null)
        .order('delivered_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DeliveryRecord[];
    },
    enabled: Boolean(orderId),
  });
}

export interface RecordDeliveryInput {
  orderId: string;
  deliveredDate: string;
  items: {
    purchase_order_item_id: string;
    quantity_ok: number;
    quantity_issue?: number;
    issue_type?: DeliveryIssueType | null;
    issue_note?: string | null;
  }[];
  deliveredByName?: string;
  deliveryNoteNumber?: string;
  invoiceNumber?: string;
  hasQualityCertificate?: boolean;
  notes?: string;
}

export function useRecordDelivery() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, RecordDeliveryInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('record_delivery', {
        p_purchase_order_id: input.orderId,
        p_delivered_date: input.deliveredDate,
        p_items: input.items,
        p_delivered_by_name: input.deliveredByName?.trim() || null,
        p_delivery_note_number: input.deliveryNoteNumber?.trim() || null,
        p_invoice_number: input.invoiceNumber?.trim() || null,
        p_has_quality_certificate: input.hasQualityCertificate ?? false,
        p_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['deliveries', variables.orderId] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['site-budget'] });
    },
  });
}

/* ========================================================================== *
 * Lịch sử giá — MH-05
 * ========================================================================== */

export interface PriceHistoryRow {
  quotation_item_id: string;
  item_code: string;
  name: string;
  specification: string | null;
  unit: string;
  unit_price: string;
  quoted_date: string | null;
  supplier_id: string;
  supplier_name: string;
  was_selected: boolean;
  purchase_request_code: string | null;
  company_id: string;
}

/**
 * Lịch sử giá theo mã vật tư (MH-05) — dữ liệu tham khảo khi lập dự toán (DA-05).
 *
 * CỐ Ý chỉ đọc: PRD Mục 2.3 xếp giá bán và tỷ lệ lợi nhuận vào nhóm phần mềm không được tự
 * quyết, nên đơn giá dự toán không tự cập nhật theo lần mua gần nhất. Người lập dự toán nhìn
 * lịch sử rồi tự chọn con số.
 */
export function usePurchasePriceHistory(itemCode: string | undefined) {
  return useQuery<PriceHistoryRow[], Error>({
    queryKey: ['purchase-price-history', itemCode],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('purchase_price_history', {
        p_item_code: itemCode!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as PriceHistoryRow[];
    },
    enabled: Boolean(itemCode),
    retry: false,
  });
}
