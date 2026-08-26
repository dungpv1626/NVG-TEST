/**
 * Truy vấn và thao tác của Module KHO — Quản lý Kho.
 *
 * Nguồn: PRD KHO-01 → KHO-09, Backend Schema 4.8, Webapp Flow 3.6 và 4.7.
 *
 * Ranh giới hai lớp (CLAUDE.md 3.1): danh mục vật tư và danh mục kho là CRUD thường nên gọi
 * thẳng Supabase; còn mọi thứ ĐỘNG TỚI SỔ KHO đều đi qua hàm CSDL, vì mỗi lần con số tồn đổi
 * phải có một phiếu đứng sau nó và phải kiểm được tồn trước khi trừ.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CostGroup,
  MoneyValue,
  ScaffoldingCondition,
  ScaffoldingEventType,
  StockIssueReason,
  StockMovementType,
  StocktakeStatus,
  WarehouseType,
} from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

/* ========================================================================== *
 * Danh mục vật tư — KHO-02
 * ========================================================================== */

export interface MaterialRecord {
  id: string;
  code: string;
  group_code: string;
  name: string;
  specification: string | null;
  unit: string;
  cost_group: CostGroup;
  is_scaffolding: boolean;
  barcode: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

const MATERIAL_SELECT =
  'id, code, group_code, name, specification, unit, cost_group, is_scaffolding, barcode, ' +
  'is_active, notes, created_at';

/**
 * Danh mục vật tư — bảng DÙNG CHUNG ba pháp nhân, KHÔNG lọc theo pháp nhân.
 *
 * KHO-02 yêu cầu "một vật tư chỉ dùng một mã duy nhất". Lọc theo pháp nhân ở đây thì cùng
 * một cây thép có ba mã, và điều chuyển giữa các kho (KHO-05) lẫn lịch sử giá (MH-05) đứt.
 */
export function useMaterials() {
  return useQuery<MaterialRecord[], Error>({
    queryKey: ['materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select(MATERIAL_SELECT)
        .is('deleted_at', null)
        .order('group_code')
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MaterialRecord[];
    },
  });
}

export function useSaveMaterial() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id?: string; values: Partial<MaterialRecord> }>({
    mutationFn: async ({ id, values }) => {
      const query = id
        ? supabase.from('materials').update(values).eq('id', id)
        : supabase.from('materials').insert(values);
      // `.select().single()` bắt buộc: thiếu nó thì RLS chặn mà PostgREST vẫn báo thành công.
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
  });
}

/* ========================================================================== *
 * Danh mục kho — KHO-01
 * ========================================================================== */

export interface WarehouseRecord {
  id: string;
  company_id: string;
  code: string;
  name: string;
  warehouse_type: WarehouseType;
  construction_site_id: string | null;
  address: string | null;
  manager_user_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  manager: { full_name: string } | null;
}

const WAREHOUSE_SELECT =
  'id, company_id, code, name, warehouse_type, construction_site_id, address, ' +
  'manager_user_id, is_active, notes, created_at, ' +
  'manager:users!warehouses_manager_user_id_users_id_fk(full_name)';

export function useWarehouses(options: { enabled?: boolean } = {}) {
  const scope = useCompanyScope();

  return useQuery<WarehouseRecord[], Error>({
    queryKey: ['warehouses', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('warehouses').select(WAREHOUSE_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as WarehouseRecord[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export function useSaveWarehouse() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id?: string; values: Partial<WarehouseRecord> }>({
    mutationFn: async ({ id, values }) => {
      const query = id
        ? supabase.from('warehouses').update(values).eq('id', id)
        : supabase.from('warehouses').insert(values);
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });
}

/* ========================================================================== *
 * Tồn kho — KHO-02, KHO-08
 * ========================================================================== */

export interface InventoryRow {
  id: string;
  warehouse_id: string;
  material_id: string;
  quantity_on_hand: string;
  min_quantity: string | null;
  average_cost: string;
  last_movement_at: string | null;
  location: string | null;
  material: {
    code: string;
    name: string;
    specification: string | null;
    unit: string;
    is_scaffolding: boolean;
  } | null;
  warehouse: { code: string; name: string } | null;
}

export function useInventory(warehouseId?: string) {
  const scope = useCompanyScope();

  return useQuery<InventoryRow[], Error>({
    queryKey: ['inventory', scope.companyId, warehouseId ?? 'all'],
    queryFn: async () => {
      let query = withCompanyScope(
        supabase
          .from('inventory_items')
          .select(
            'id, warehouse_id, material_id, quantity_on_hand, min_quantity, average_cost, ' +
              'last_movement_at, location, ' +
              'material:materials!inventory_items_material_id_materials_id_fk(code, name, specification, unit, is_scaffolding), ' +
              'warehouse:warehouses!inventory_items_warehouse_id_warehouses_id_fk(code, name)',
          ),
        scope,
      );
      if (warehouseId) query = query.eq('warehouse_id', warehouseId);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as InventoryRow[];
    },
    enabled: scope.isReady,
  });
}

/** Mức tồn tối thiểu là dữ liệu mô tả, không phải sổ kho — sửa thẳng được (KHO-08). */
export function useUpdateInventorySettings() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { id: string; changes: { min_quantity?: string | null; location?: string | null } }
  >({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase
        .from('inventory_items')
        .update(changes)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export interface ScanResultRow {
  material_id: string;
  material_code: string;
  name: string;
  specification: string | null;
  unit: string;
  is_scaffolding: boolean;
  warehouse_id: string;
  warehouse_name: string;
  quantity_on_hand: string;
  min_quantity: string | null;
  last_movement_at: string | null;
}

/**
 * Quét mã vạch hoặc gõ mã vật tư — KHO-09.
 *
 * `retry: false` có chủ đích: "không tìm thấy mã" là câu trả lời, không phải sự cố mạng.
 * Thử lại ba lần chỉ làm người đứng ở kho chờ thêm ba giây để nhận cùng một câu.
 */
export function useScanMaterial(code: string | undefined) {
  return useQuery<ScanResultRow[], Error>({
    queryKey: ['scan-material', code],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('scan_material', { p_code: code! });
      if (error) throw new Error(error.message);
      return (data ?? []) as ScanResultRow[];
    },
    enabled: Boolean(code && code.trim()),
    retry: false,
  });
}

/* ========================================================================== *
 * Phiếu kho — KHO-03, KHO-04, KHO-05
 * ========================================================================== */

export interface StockMovementRecord {
  id: string;
  code: string | null;
  company_id: string;
  movement_type: StockMovementType;
  warehouse_id: string;
  target_warehouse_id: string | null;
  movement_date: string;
  issue_reason: StockIssueReason | null;
  construction_site_id: string | null;
  delivery_id: string | null;
  purchase_order_id: string | null;
  counterpart_name: string | null;
  notes: string | null;
  created_at: string;
  warehouse: { code: string; name: string } | null;
  target: { code: string; name: string } | null;
  performer: { full_name: string } | null;
  items: {
    id: string;
    material_id: string;
    quantity: string;
    unit_cost: string;
    condition_note: string | null;
    material: { code: string; name: string; unit: string } | null;
  }[];
}

const MOVEMENT_SELECT =
  'id, code, company_id, movement_type, warehouse_id, target_warehouse_id, movement_date, ' +
  'issue_reason, construction_site_id, delivery_id, purchase_order_id, counterpart_name, ' +
  'notes, created_at, ' +
  'warehouse:warehouses!stock_movements_warehouse_id_warehouses_id_fk(code, name), ' +
  'target:warehouses!stock_movements_target_warehouse_id_warehouses_id_fk(code, name), ' +
  'performer:users!stock_movements_performed_by_users_id_fk(full_name), ' +
  'items:stock_movement_items(id, material_id, quantity, unit_cost, condition_note, ' +
  'material:materials!stock_movement_items_material_id_materials_id_fk(code, name, unit))';

export function useStockMovements(filter: { warehouseId?: string; type?: StockMovementType } = {}) {
  const scope = useCompanyScope();

  return useQuery<StockMovementRecord[], Error>({
    queryKey: [
      'stock-movements',
      scope.companyId,
      filter.warehouseId ?? 'all',
      filter.type ?? 'all',
    ],
    queryFn: async () => {
      let query = withCompanyScope(
        supabase.from('stock_movements').select(MOVEMENT_SELECT),
        scope,
      ).is('deleted_at', null);
      if (filter.warehouseId) query = query.eq('warehouse_id', filter.warehouseId);
      if (filter.type) query = query.eq('movement_type', filter.type);

      const { data, error } = await query
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as StockMovementRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface MovementLineInput {
  material_id: string;
  quantity: number;
  unit_cost?: MoneyValue;
  condition_note?: string | null;
}

function invalidateStock(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['inventory'] });
  void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
  void queryClient.invalidateQueries({ queryKey: ['scan-material'] });
}

/**
 * Mã chống ghi trùng cho một lần lập phiếu — KHO-09.
 *
 * Sinh MỘT lần khi mở biểu mẫu, không sinh lúc bấm gửi: mất sóng giữa chừng rồi bấm gửi lại
 * phải là CÙNG một mã, nếu không thì lần gửi lại tạo phiếu thứ hai và tồn kho cộng đôi.
 */
export function newClientMovementId(): string {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useReceiveStock() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      warehouseId: string;
      items: MovementLineInput[];
      movementDate?: string;
      counterpartName?: string;
      clientGeneratedId?: string;
      notes?: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('receive_stock', {
        p_warehouse_id: input.warehouseId,
        p_items: input.items,
        p_movement_date: input.movementDate || null,
        p_counterpart_name: input.counterpartName?.trim() || null,
        p_client_generated_id: input.clientGeneratedId ?? null,
        p_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateStock(queryClient),
  });
}

export function useIssueStock() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      warehouseId: string;
      items: MovementLineInput[];
      issueReason: StockIssueReason;
      constructionSiteId?: string | null;
      movementDate?: string;
      counterpartName?: string;
      clientGeneratedId?: string;
      notes?: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('issue_stock', {
        p_warehouse_id: input.warehouseId,
        p_items: input.items,
        p_issue_reason: input.issueReason,
        p_construction_site_id: input.constructionSiteId ?? null,
        p_movement_date: input.movementDate || null,
        p_counterpart_name: input.counterpartName?.trim() || null,
        p_client_generated_id: input.clientGeneratedId ?? null,
        p_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateStock(queryClient),
  });
}

export function useTransferStock() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      fromWarehouseId: string;
      toWarehouseId: string;
      items: MovementLineInput[];
      movementDate?: string;
      counterpartName?: string;
      clientGeneratedId?: string;
      notes?: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('transfer_stock', {
        p_from_warehouse_id: input.fromWarehouseId,
        p_to_warehouse_id: input.toWarehouseId,
        p_items: input.items,
        p_movement_date: input.movementDate || null,
        p_counterpart_name: input.counterpartName?.trim() || null,
        p_client_generated_id: input.clientGeneratedId ?? null,
        p_notes: input.notes?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateStock(queryClient),
  });
}

/** Nhập kho thẳng từ phiếu giao nhận của Mua hàng — KHO-03 ↔ MH-07, không nhập lại số liệu. */
export function useReceiveFromDelivery() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { deliveryId: string; warehouseId: string }>({
    mutationFn: async ({ deliveryId, warehouseId }) => {
      const { data, error } = await supabase.rpc('receive_from_delivery', {
        p_delivery_id: deliveryId,
        p_warehouse_id: warehouseId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      invalidateStock(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });
}

/* ========================================================================== *
 * Kiểm kê — KHO-07
 * ========================================================================== */

export interface StocktakeRecord {
  id: string;
  code: string | null;
  warehouse_id: string;
  status: StocktakeStatus;
  started_at: string;
  counted_at: string | null;
  adjusted_at: string | null;
  variance_reason: string | null;
  closed_reason: string | null;
  warehouse: { code: string; name: string } | null;
  performer: { full_name: string } | null;
}

const STOCKTAKE_SELECT =
  'id, code, warehouse_id, status, started_at, counted_at, adjusted_at, variance_reason, ' +
  'closed_reason, ' +
  'warehouse:warehouses!stocktakes_warehouse_id_warehouses_id_fk(code, name), ' +
  'performer:users!stocktakes_performed_by_users_id_fk(full_name)';

export function useStocktakes() {
  const scope = useCompanyScope();

  return useQuery<StocktakeRecord[], Error>({
    queryKey: ['stocktakes', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('stocktakes').select(STOCKTAKE_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('started_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as StocktakeRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface StocktakeItemRow {
  id: string;
  material_id: string;
  book_quantity: string;
  counted_quantity: string | null;
  variance_note: string | null;
  material: { code: string; name: string; unit: string } | null;
}

export function useStocktakeItems(stocktakeId: string | undefined) {
  return useQuery<StocktakeItemRow[], Error>({
    queryKey: ['stocktakes', 'items', stocktakeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stocktake_items')
        .select(
          'id, material_id, book_quantity, counted_quantity, variance_note, ' +
            'material:materials!stocktake_items_material_id_materials_id_fk(code, name, unit)',
        )
        .eq('stocktake_id', stocktakeId!)
        .order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as StocktakeItemRow[];
    },
    enabled: Boolean(stocktakeId),
  });
}

export function useStartStocktake() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { warehouseId: string }>({
    mutationFn: async ({ warehouseId }) => {
      const { data, error } = await supabase.rpc('start_stocktake', {
        p_warehouse_id: warehouseId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stocktakes'] });
    },
  });
}

export function useSaveStocktakeCount() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      stocktakeId: string;
      items: { material_id: string; counted_quantity: number | null; variance_note?: string }[];
    }
  >({
    mutationFn: async ({ stocktakeId, items }) => {
      const { error } = await supabase.rpc('save_stocktake_count', {
        p_stocktake_id: stocktakeId,
        p_items: items,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['stocktakes', 'items', variables.stocktakeId],
      });
      void queryClient.invalidateQueries({ queryKey: ['stocktakes'] });
    },
  });
}

export function useSubmitStocktake() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, { stocktakeId: string; varianceReason: string }>({
    mutationFn: async ({ stocktakeId, varianceReason }) => {
      const { data, error } = await supabase.rpc('submit_stocktake_approval', {
        p_stocktake_id: stocktakeId,
        p_variance_reason: varianceReason,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stocktakes'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/**
 * Đóng đợt kiểm kê khi số đếm khớp sổ ở mọi vật tư.
 *
 * Sổ kho không đổi — không có gì để điều chỉnh. Cần một đường riêng vì đường phê duyệt từ
 * chối chênh lệch bằng 0, mà kho thì bị tạm dừng nhập xuất suốt thời gian đợt kiểm còn mở:
 * thiếu hàm này, một lần kiểm đúng lại khoá cứng kho (KHO-07).
 */
export function useCloseStocktake() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { stocktakeId: string }>({
    mutationFn: async ({ stocktakeId }) => {
      const { error } = await supabase.rpc('close_stocktake', {
        p_stocktake_id: stocktakeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stocktakes'] });
      // Kho vừa được mở lại nhập xuất — danh sách tồn và phiếu phải đọc lại.
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useCancelStocktake() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { stocktakeId: string; reason: string }>({
    mutationFn: async ({ stocktakeId, reason }) => {
      const { error } = await supabase.rpc('cancel_stocktake', {
        p_stocktake_id: stocktakeId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stocktakes'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/* ========================================================================== *
 * Giàn giáo — KHO-06
 * ========================================================================== */

export interface ScaffoldingAssetRecord {
  id: string;
  company_id: string;
  asset_code: string;
  material_id: string;
  quantity: string;
  condition: ScaffoldingCondition;
  location_type: 'kho' | 'cong_trinh' | 'khach_thue';
  warehouse_id: string | null;
  construction_site_id: string | null;
  renter_name: string | null;
  purchase_date: string | null;
  notes: string | null;
  created_at: string;
  material: { code: string; name: string; unit: string } | null;
  warehouse: { name: string } | null;
  site: { code: string; name: string } | null;
}

export function useScaffoldingAssets() {
  const scope = useCompanyScope();

  return useQuery<ScaffoldingAssetRecord[], Error>({
    queryKey: ['scaffolding-assets', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('scaffolding_assets')
          .select(
            'id, company_id, asset_code, material_id, quantity, condition, location_type, ' +
              'warehouse_id, construction_site_id, renter_name, purchase_date, notes, created_at, ' +
              'material:materials!scaffolding_assets_material_id_materials_id_fk(code, name, unit), ' +
              'warehouse:warehouses!scaffolding_assets_warehouse_id_warehouses_id_fk(name), ' +
              'site:construction_sites!scaffolding_assets_construction_site_id_construction_sites_id_fk(code, name)',
          ),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ScaffoldingAssetRecord[];
    },
    enabled: scope.isReady,
  });
}

export interface ScaffoldingEventRecord {
  id: string;
  event_type: ScaffoldingEventType;
  event_date: string;
  quantity: string;
  result_condition: ScaffoldingCondition | null;
  amount: string;
  responsible_party: string | null;
  reason: string;
  recorder: { full_name: string } | null;
}

export function useScaffoldingEvents(assetId: string | undefined) {
  return useQuery<ScaffoldingEventRecord[], Error>({
    queryKey: ['scaffolding-events', assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scaffolding_events')
        .select(
          'id, event_type, event_date, quantity, result_condition, amount, responsible_party, ' +
            'reason, recorder:users!scaffolding_events_recorded_by_users_id_fk(full_name)',
        )
        .eq('scaffolding_asset_id', assetId!)
        .order('event_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ScaffoldingEventRecord[];
    },
    enabled: Boolean(assetId),
  });
}

export function useSaveScaffoldingAsset() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id?: string; values: Partial<ScaffoldingAssetRecord> }>({
    mutationFn: async ({ id, values }) => {
      const query = id
        ? supabase.from('scaffolding_assets').update(values).eq('id', id)
        : supabase.from('scaffolding_assets').insert(values);
      const { error } = await query.select('id').single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scaffolding-assets'] });
    },
  });
}

export function useRecordScaffoldingEvent() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      assetId: string;
      eventType: ScaffoldingEventType;
      quantity: number;
      reason: string;
      resultCondition?: ScaffoldingCondition | null;
      eventDate?: string;
      amount?: MoneyValue;
      responsibleParty?: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('record_scaffolding_event', {
        p_asset_id: input.assetId,
        p_event_type: input.eventType,
        p_quantity: input.quantity,
        p_reason: input.reason,
        p_result_condition: input.resultCondition ?? null,
        p_event_date: input.eventDate || null,
        p_amount: String(input.amount ?? 0),
        p_responsible_party: input.responsibleParty?.trim() || null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['scaffolding-assets'] });
      void queryClient.invalidateQueries({ queryKey: ['scaffolding-events', variables.assetId] });
    },
  });
}
