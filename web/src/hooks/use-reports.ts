/**
 * Module BC mức đầy đủ — báo cáo lãi/lỗ theo công trình (PRD BC-02).
 *
 * Nguồn: `db/migrations/0056_bc_profit_loss.sql`. KHÔNG có bảng riêng — hàm đọc trực tiếp
 * `project_budgets` + `contracts`, CSDL tự lọc theo pháp nhân người dùng được xem VÀ theo
 * quyền `profit` (Mẫu D: chỉ TGĐ/CFO/BGĐ/ADMIN — xem `rls_sees_sensitive`). Vai trò khác gọi
 * hàm này nhận lỗi rõ ràng, không phải một bảng trống.
 */

import { useQuery } from '@tanstack/react-query';
import type { MoneyValue, SiteStage } from '@nvg/shared';
import { useCompanyScope } from '@/lib/company-scope';
import { supabase } from '@/lib/supabase';

export interface ProfitLossRow {
  construction_site_id: string;
  company_id: string;
  site_code: string;
  site_name: string;
  stage: SiteStage;
  contract_id: string | null;
  contract_value: MoneyValue | null;
  collected_amount: MoneyValue;
  budgeted_cost: MoneyValue;
  actual_cost: MoneyValue;
  committed_cost: MoneyValue;
  target_profit: MoneyValue;
  profit_actual: MoneyValue | null;
  profit_forecast: MoneyValue | null;
}

/**
 * `enabled` do màn hình quyết định — chỉ gọi khi người dùng thực sự mở báo cáo, không nạp sẵn
 * cùng trang khác: mỗi lượt gọi là một dòng nhật ký truy cập dữ liệu nhạy cảm (NEN-07), và
 * `staleTime: 0`/`gcTime: 0` để lần mở lại sau vẫn ghi nhận một lượt xem mới, không phải đọc
 * lại bộ nhớ đệm im lặng.
 */
export function useProfitLossReport(enabled = true) {
  const scope = useCompanyScope();

  return useQuery<ProfitLossRow[], Error>({
    queryKey: ['reports', 'profit-loss', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('project_profit_loss', {
        // "Toàn NVG" bỏ hẳn điều kiện lọc và để RLS quyết định phạm vi (CLAUDE.md 3.5).
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw error;
      return (data ?? []) as unknown as ProfitLossRow[];
    },
    enabled: scope.isReady && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}
