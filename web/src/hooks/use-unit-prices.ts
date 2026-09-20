/**
 * Cơ sở dữ liệu đơn giá và định mức dùng chung (DA-05).
 *
 * ⚠️ Toàn bộ bảng này là GIÁ VỐN. RLS chỉ trả dòng cho vai trò được xem giá vốn, nên vai trò
 * khác nhận danh sách rỗng — đó là hành vi đúng, không phải lỗi tải dữ liệu.
 *
 * PRD NEN-07 yêu cầu ghi nhật ký mỗi lượt xem dữ liệu nhạy cảm. Với một DANH MỤC TRA CỨU,
 * ghi một dòng nhật ký cho mỗi dòng đơn giá hiển thị là vô nghĩa; ghi ở mức MỞ MÀN HÌNH mới
 * trả lời đúng câu hỏi "ai đã xem bảng giá vốn, lúc nào".
 */

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CostGroup, MoneyValue, UnitPriceSource } from '@nvg/shared';
import { useCompanyScope, withCompanyScope } from '@/lib/company-scope';
import { useCompanyStore } from '@/lib/company-store';
import { supabase } from '@/lib/supabase';

export interface UnitPriceRecord {
  id: string;
  company_id: string;
  item_code: string;
  name: string;
  unit: string;
  cost_group: CostGroup;
  price: MoneyValue;
  source: UnitPriceSource;
  supplier_name: string | null;
  effective_date: string;
  applied_project_ref: string | null;
  notes: string | null;
}

export function useUnitPrices() {
  const scope = useCompanyScope();

  return useQuery<UnitPriceRecord[], Error>({
    queryKey: ['unit_prices', scope.companyId],
    queryFn: async () => {
      const { data, error } = await withCompanyScope(
        supabase
          .from('unit_prices')
          .select(
            'id, company_id, item_code, name, unit, cost_group, price, source, supplier_name, ' +
              'effective_date, applied_project_ref, notes',
          ),
        scope,
      )
        .is('deleted_at', null)
        .order('effective_date', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as UnitPriceRecord[];
    },
    enabled: scope.isReady,
  });
}

/** Ghi nhật ký một lượt mở màn hình dữ liệu nhạy cảm (NEN-07). */
export function useLogSensitiveView(entityType: string, enabled: boolean) {
  const companyId = useCompanyStore((s) => s.selectedCompanyId);

  useEffect(() => {
    if (!enabled || !companyId) return;
    void supabase.rpc('log_sensitive_access', {
      p_kind: 'cost',
      p_entity_type: entityType,
      p_entity_id: null,
      p_action: 'view',
      p_company_id: companyId,
    });
  }, [entityType, enabled, companyId]);
}

export interface NewUnitPriceInput {
  companyId: string;
  itemCode: string;
  name: string;
  unit: string;
  costGroup: CostGroup;
  price: string;
  source: UnitPriceSource;
  supplierName: string | null;
  effectiveDate: string;
  notes: string | null;
}

export function useCreateUnitPrice() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, NewUnitPriceInput>({
    mutationFn: async (input) => {
      const { error } = await supabase
        .from('unit_prices')
        .insert({
          company_id: input.companyId,
          item_code: input.itemCode,
          name: input.name,
          unit: input.unit,
          cost_group: input.costGroup,
          price: input.price,
          source: input.source,
          supplier_name: input.supplierName,
          effective_date: input.effectiveDate,
          notes: input.notes,
        })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['unit_prices'] });
    },
  });
}
