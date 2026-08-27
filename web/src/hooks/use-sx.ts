/**
 * Truy vấn và thao tác của Module SX — Sản xuất và Cho thuê giàn giáo (NVS).
 *
 * Nguồn: PRD SX-01 → SX-03, Backend Schema 4.12.
 *
 * Cho thuê giàn giáo (SX-03) đi qua hai hàm CSDL (`create_rental_agreement`,
 * `return_rental_agreement`) vì mỗi lần di chuyển đúng lô `scaffolding_assets` phải toàn vẹn
 * cùng lúc với việc ghi hồ sơ hợp đồng — CLAUDE.md 3.1(b). Lệnh sản xuất (SX-01, cần xác
 * nhận thêm) chỉ là CRUD thường nên gọi thẳng Supabase, dùng lại `useEntityList`/`useCreateEntity`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductionOrderStatus, RentalAgreementStatus } from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

/* ========================================================================== *
 * Cho thuê giàn giáo — SX-03
 * ========================================================================== */

export interface RentalAgreementRecord {
  id: string;
  code: string;
  company_id: string;
  customer_id: string;
  construction_site_id: string | null;
  site_address: string | null;
  start_date: string;
  expected_end_date: string | null;
  actual_return_date: string | null;
  status: RentalAgreementStatus;
  deposit_amount: string;
  total_revenue: string | null;
  total_compensation: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer: { code: string; name: string } | null;
  site: { code: string; name: string } | null;
  creator: { full_name: string } | null;
}

const RENTAL_AGREEMENT_SELECT =
  'id, code, company_id, customer_id, construction_site_id, site_address, start_date, ' +
  'expected_end_date, actual_return_date, status, deposit_amount, total_revenue, ' +
  'total_compensation, notes, created_at, updated_at, ' +
  'customer:customers!rental_agreements_customer_id_customers_id_fk(code, name), ' +
  'site:construction_sites!rental_agreements_construction_site_id_construction_sites_id_fk(code, name), ' +
  'creator:users!rental_agreements_created_by_users_id_fk(full_name)';

export function useRentalAgreements(options: { enabled?: boolean } = {}) {
  const scope = useCompanyScope();

  return useQuery<RentalAgreementRecord[], Error>({
    queryKey: ['rental-agreements', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('rental_agreements').select(RENTAL_AGREEMENT_SELECT),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RentalAgreementRecord[];
    },
    enabled: scope.isReady && (options.enabled ?? true),
  });
}

export function useRentalAgreement(id: string | undefined) {
  return useQuery<RentalAgreementRecord | null, Error>({
    queryKey: ['rental-agreements', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_agreements')
        .select(RENTAL_AGREEMENT_SELECT)
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as unknown as RentalAgreementRecord | null;
    },
    enabled: Boolean(id),
  });
}

export interface RentalAgreementItemRecord {
  id: string;
  material_id: string;
  quantity_out: string;
  daily_rate: string;
  quantity_returned_ok: string;
  quantity_damaged: string;
  quantity_lost: string;
  compensation_amount: string;
  note: string | null;
  material: { code: string; name: string; unit: string } | null;
}

export function useRentalAgreementItems(agreementId: string | undefined) {
  return useQuery<RentalAgreementItemRecord[], Error>({
    queryKey: ['rental-agreement-items', agreementId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rental_agreement_items')
        .select(
          'id, material_id, quantity_out, daily_rate, quantity_returned_ok, quantity_damaged, ' +
            'quantity_lost, compensation_amount, note, ' +
            'material:materials!rental_agreement_items_material_id_materials_id_fk(code, name, unit)',
        )
        .eq('rental_agreement_id', agreementId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RentalAgreementItemRecord[];
    },
    enabled: Boolean(agreementId),
  });
}

function invalidateRentalQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['rental-agreements'] });
  void queryClient.invalidateQueries({ queryKey: ['rental-agreement-items'] });
  // Xuất/thu hồi di chuyển lô giàn giáo — màn hình Kho phải thấy tồn mới ngay.
  void queryClient.invalidateQueries({ queryKey: ['scaffolding-assets'] });
}

export interface RentalItemInput {
  material_id: string;
  quantity: number;
  daily_rate: number;
}

export function useCreateRentalAgreement() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    {
      companyId: string;
      customerId: string;
      constructionSiteId: string | null;
      siteAddress: string | null;
      startDate: string;
      expectedEndDate: string | null;
      depositAmount: number;
      notes: string;
      items: RentalItemInput[];
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('create_rental_agreement', {
        p_company_id: input.companyId,
        p_customer_id: input.customerId,
        p_construction_site_id: input.constructionSiteId,
        p_site_address: input.siteAddress,
        p_start_date: input.startDate,
        p_expected_end_date: input.expectedEndDate,
        p_deposit_amount: input.depositAmount,
        p_notes: input.notes,
        p_items: input.items,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateRentalQueries(queryClient),
  });
}

export interface RentalReturnItemInput {
  material_id: string;
  quantity_ok: number;
  quantity_damaged: number;
  quantity_lost: number;
  compensation_amount: number;
  note?: string;
}

export function useReturnRentalAgreement() {
  const queryClient = useQueryClient();

  return useMutation<
    string,
    Error,
    { rentalAgreementId: string; actualReturnDate: string; items: RentalReturnItemInput[] }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('return_rental_agreement', {
        p_rental_agreement_id: input.rentalAgreementId,
        p_actual_return_date: input.actualReturnDate,
        p_items: input.items,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateRentalQueries(queryClient),
  });
}

/** Sửa ghi chú/địa chỉ/ngày dự kiến trả — trạng thái và số tiền chốt chỉ đổi qua hai hàm trên. */
export function useUpdateRentalAgreement() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; changes: Record<string, unknown> }>({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase.from('rental_agreements').update(changes).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRentalQueries(queryClient),
  });
}

/* ========================================================================== *
 * Lệnh sản xuất — SX-01 (cần xác nhận thêm)
 * ========================================================================== */

export interface ProductionOrderRecord {
  id: string;
  company_id: string;
  code: string;
  product: string;
  unit: string | null;
  quantity: string;
  status: ProductionOrderStatus;
  planned_start_date: string | null;
  planned_end_date: string | null;
  notes: string | null;
  created_at: string;
}

export function useProductionOrders() {
  const scope = useCompanyScope();

  return useQuery<ProductionOrderRecord[], Error>({
    queryKey: ['production-orders', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase.from('production_orders').select('*'),
        scope,
      )
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductionOrderRecord[];
    },
    enabled: scope.isReady,
  });
}

export function useProductionOrder(id: string | undefined) {
  return useQuery<ProductionOrderRecord | null, Error>({
    queryKey: ['production-orders', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_orders')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as ProductionOrderRecord | null;
    },
    enabled: Boolean(id),
  });
}

export function useCreateProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation<
    ProductionOrderRecord,
    Error,
    {
      companyId: string;
      code: string;
      product: string;
      unit: string;
      quantity: number;
      plannedStartDate: string | null;
      plannedEndDate: string | null;
      notes: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('production_orders')
        .insert({
          company_id: input.companyId,
          code: input.code,
          product: input.product,
          unit: input.unit || null,
          quantity: input.quantity,
          planned_start_date: input.plannedStartDate,
          planned_end_date: input.plannedEndDate,
          notes: input.notes || null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as ProductionOrderRecord;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    },
  });
}

export function useUpdateProductionOrder() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { id: string; changes: Record<string, unknown> }>({
    mutationFn: async ({ id, changes }) => {
      const { error } = await supabase.from('production_orders').update(changes).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    },
  });
}

export interface MaterialConsumptionRecord {
  id: string;
  material_id: string;
  quantity: string;
  note: string | null;
  material: { code: string; name: string; unit: string } | null;
}

export function useMaterialConsumption(orderId: string | undefined) {
  return useQuery<MaterialConsumptionRecord[], Error>({
    queryKey: ['material-consumption', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('material_consumption')
        .select(
          'id, material_id, quantity, note, ' +
            'material:materials!material_consumption_material_id_materials_id_fk(code, name, unit)',
        )
        .eq('production_order_id', orderId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MaterialConsumptionRecord[];
    },
    enabled: Boolean(orderId),
  });
}

export function useAddMaterialConsumption() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    { productionOrderId: string; materialId: string; quantity: number; note?: string }
  >({
    mutationFn: async (input) => {
      const { error } = await supabase.from('material_consumption').insert({
        production_order_id: input.productionOrderId,
        material_id: input.materialId,
        quantity: input.quantity,
        note: input.note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: ['material-consumption', vars.productionOrderId],
      });
    },
  });
}
