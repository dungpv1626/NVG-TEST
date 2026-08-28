/**
 * Module BC mức đầy đủ — báo cáo lãi/lỗ theo công trình (PRD BC-02).
 *
 * Nguồn: `db/migrations/0056_bc_profit_loss.sql`. KHÔNG có bảng riêng — hàm đọc trực tiếp
 * `project_budgets` + `contracts`, CSDL tự lọc theo pháp nhân người dùng được xem VÀ theo
 * quyền `profit` (Mẫu D: chỉ TGĐ/CFO/BGĐ/ADMIN — xem `rls_sees_sensitive`). Vai trò khác gọi
 * hàm này nhận lỗi rõ ràng, không phải một bảng trống.
 */

import { useQuery } from '@tanstack/react-query';
import type {
  BiddingOutcomeRow,
  BiddingStage,
  BudgetHealth,
  MoneyValue,
  OpportunityFunnelRow,
  OpportunityStage,
  SiteStage,
} from '@nvg/shared';
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

/**
 * Module BC mức đầy đủ — BC-05 phần "vượt ngân sách" (PRD Mục 7, BC-05).
 *
 * Nguồn: `db/migrations/0058_bc_over_budget.sql`, sửa Mẫu D ở `0071_fix_sites_budget_status_cost_leak.sql`.
 * Trả về TOÀN BỘ công trình pháp nhân người dùng xem được, kèm `health` đã tính sẵn ở CSDL
 * (đúng công thức `summarizeBudget()`, `shared/src/tc.ts`) — dùng thẳng cột này, KHÔNG tự
 * tính lại từ ba cột tiền: ba cột đó (`budgeted_cost`/`actual_cost`/`committed_cost`) là
 * `null` với vai trò không xem được giá vốn (Mẫu D — chỉ vai trò xem giá vốn hoặc chính Thi
 * công mới nhận số thật), nên tự tính từ ba cột đó sẽ ra sai cho phần lớn vai trò. `health`
 * thì hiện cho MỌI vai trò xem được BC, đúng ý đồ gốc của BC-05. Vẫn dùng cache mặc định của
 * TanStack Query (không `staleTime: 0` như báo cáo lãi/lỗ) vì phần hiện rộng (`health`) không
 * phải dữ liệu nhạy cảm; riêng lượt gọi của vai trò xem được giá vốn thì CSDL tự ghi
 * `sensitive_access_logs` một lần cho cả đợt gọi.
 */
export function useSitesBudgetStatus(enabled = true) {
  const scope = useCompanyScope();

  return useQuery<SiteBudgetStatusRow[], Error>({
    queryKey: ['reports', 'sites-budget-status', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sites_budget_status', {
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw error;
      return (data ?? []) as unknown as SiteBudgetStatusRow[];
    },
    enabled: scope.isReady && enabled,
  });
}

export interface SiteBudgetStatusRow {
  construction_site_id: string;
  company_id: string;
  site_code: string;
  site_name: string;
  stage: SiteStage;
  /** `null` với vai trò không xem được giá vốn — dùng `health`, không tự tính lại (Mẫu D, 0071). */
  budgeted_cost: MoneyValue | null;
  actual_cost: MoneyValue | null;
  committed_cost: MoneyValue | null;
  health: BudgetHealth;
}

/**
 * Module BC mức đầy đủ — BC-03 phần "nguồn khách" + "phễu bán hàng" (PRD Mục 7, BC-03).
 *
 * Nguồn: `db/migrations/0059_bc_sales_effectiveness.sql`. Trả về dòng thô gộp theo (nguồn
 * khách, giai đoạn pipeline hiện tại) — màn hình tự pivot bằng `summarizeOpportunitiesBySource`
 * và `summarizeOpportunityFunnel` (shared/src/bc.ts), không tính hai lần ở hai nơi.
 */
export function useOpportunityFunnelBySource(enabled = true) {
  const scope = useCompanyScope();

  return useQuery<OpportunityFunnelRow[], Error>({
    queryKey: ['reports', 'opportunity-funnel-by-source', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('opportunity_funnel_by_source', {
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw error;
      return (
        (data ?? []) as {
          company_id: string;
          source: string;
          stage: OpportunityStage;
          opportunity_count: number | string;
          estimated_value: MoneyValue;
        }[]
      ).map((r) => ({
        companyId: r.company_id,
        source: r.source,
        stage: r.stage,
        opportunityCount: Number(r.opportunity_count),
        estimatedValue: r.estimated_value,
      }));
    },
    enabled: scope.isReady && enabled,
  });
}

/**
 * Module BC mức đầy đủ — BC-03 phần "tỷ lệ trúng thầu và nguyên nhân trượt thầu" (PRD Mục 7,
 * BC-03).
 *
 * Nguồn: `db/migrations/0059_bc_sales_effectiveness.sql`. Trả về dòng thô — màn hình tự tính
 * bằng `summarizeBiddingOutcomes` (shared/src/bc.ts).
 */
export function useBiddingOutcomes(enabled = true) {
  const scope = useCompanyScope();

  return useQuery<BiddingOutcomeRow[], Error>({
    queryKey: ['reports', 'bidding-outcomes', scope.companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bidding_outcomes', {
        p_company_id: scope.isAggregate ? null : (scope.companyId ?? null),
      });
      if (error) throw error;
      return (
        (data ?? []) as {
          company_id: string;
          stage: BiddingStage;
          lost_reason: string | null;
          bidding_count: number | string;
        }[]
      ).map((r) => ({
        companyId: r.company_id,
        stage: r.stage,
        lostReason: r.lost_reason,
        biddingCount: Number(r.bidding_count),
      }));
    },
    enabled: scope.isReady && enabled,
  });
}
