/**
 * Truy vấn và thao tác trên cơ hội kinh doanh (Module CRM).
 *
 * Chuyển giai đoạn gọi hàm `move_opportunity_stage` của CSDL thay vì UPDATE trực tiếp:
 * hàm đó ghi lịch sử trong CÙNG giao dịch, nên không thể có cơ hội đổi giai đoạn mà
 * thiếu vết (NEN-03).
 */
import type { OpportunityStage } from '@nvg/shared';
export interface OpportunityRecord {
    id: string;
    code: string;
    name: string;
    stage: OpportunityStage;
    classification: string | null;
    estimated_value: string | null;
    project_type: string | null;
    due_date: string | null;
    handed_over_at: string | null;
    created_at: string;
    customer: {
        id: string;
        name: string;
    } | null;
    owner: {
        full_name: string;
    } | null;
}
export declare function useOpportunities(): import("@tanstack/react-query").UseQueryResult<OpportunityRecord[], Error>;
export interface OpportunityDetailRecord extends OpportunityRecord {
    notes: string | null;
    lost_reason: string | null;
    expected_start_date: string | null;
    updated_at: string;
}
export declare function useOpportunity(id: string | undefined): import("@tanstack/react-query").UseQueryResult<OpportunityDetailRecord | null, Error>;
export interface StageHistoryRecord {
    id: string;
    from_stage: OpportunityStage | null;
    to_stage: OpportunityStage;
    note: string | null;
    changed_at: string;
    changed_by_user: {
        full_name: string;
    } | null;
}
export declare function useOpportunityStageHistory(opportunityId: string | undefined): import("@tanstack/react-query").UseQueryResult<StageHistoryRecord[], Error>;
/** Chuyển giai đoạn pipeline — luôn qua hàm CSDL để lịch sử và trạng thái đi liền nhau. */
export declare function useMoveStage(): import("@tanstack/react-query").UseMutationResult<void, Error, {
    opportunityId: string;
    toStage: OpportunityStage;
    note?: string;
    lostReason?: string;
}, unknown>;
//# sourceMappingURL=use-opportunities.d.ts.map