/**
 * Dòng «Chi phí ước tính» đặt NGAY dưới nút tốn tiền (Đợt 5B). Cách tính và vì sao không nhân giá
 * token với một số token tự đặt: xem `run-cost-estimate.ts`.
 */

import { useMemo } from 'react';
import { useAiCostHistory, type AiModelOption } from '@/hooks/use-ai-design';
import {
  editRunUnits,
  estimateRunCost,
  planRunUnits,
  type CostEstimate,
} from './run-cost-estimate';
import { formatUsd } from './ai-usage';

export type CostKind = 'plan' | 'plan_edit';

const PURPOSES: Record<CostKind, readonly string[]> = {
  plan: ['plan_house', 'plan_house_revise'],
  plan_edit: ['plan_house_edit'],
};

export function useCostEstimate(
  kind: CostKind,
  route: string | null,
): { estimate: CostEstimate | null; loading: boolean } {
  const history = useAiCostHistory('plan', PURPOSES[kind]);
  const estimate = useMemo(() => {
    if (!route || !history.data) return null;
    const units = kind === 'plan' ? planRunUnits : editRunUnits;
    return estimateRunCost(
      history.data.runs.map((run) => ({
        id: run.id,
        projectId: run.project_id,
        createdAt: run.created_at,
        updatedAt: run.updated_at,
        units: units(run.result),
      })),
      history.data.calls.map((call) => ({
        projectId: call.project_id,
        createdAt: call.created_at,
        route: call.route,
        purpose: call.purpose,
        status: call.status,
        inputTokens: call.input_tokens,
        outputTokens: call.output_tokens,
        costUsd: call.cost_usd === null ? null : Number(call.cost_usd),
      })),
      { route, purposes: PURPOSES[kind] },
    );
  }, [history.data, kind, route]);
  return { estimate, loading: history.isLoading };
}

/** Chữ ngắn gắn lên nút: «≈ 0,24 USD». Rỗng khi chưa có số — nút không mang chữ «Chưa đủ dữ liệu». */
export function costOnButton(estimate: CostEstimate | null, units: number): string {
  return estimate ? ` · ≈ ${formatUsd(estimate.perUnitUsd * units)}` : '';
}

export function CostEstimateLine({
  estimate,
  loading,
  units,
  unitLabel,
  option,
}: {
  estimate: CostEstimate | null;
  loading: boolean;
  units: number;
  /** «phương án», «lượt sửa». */
  unitLabel: string;
  option: AiModelOption | null | undefined;
}): React.ReactElement {
  return (
    <p className="text-sm text-fg-subtle" data-testid="cost-estimate">
      <span className="font-medium text-fg">Chi phí ước tính: </span>
      {loading ? (
        'đang tính…'
      ) : estimate ? (
        <>
          ≈ {formatUsd(estimate.perUnitUsd * units)}
          {units > 1 && ` (${formatUsd(estimate.perUnitUsd)} mỗi ${unitLabel})`} — trung bình{' '}
          {estimate.samples} lượt trước bằng mô hình này, theo giá niêm yết, chưa gồm thuế.
          {option?.billed === false && ' Khoá gói miễn phí: tiền thật bằng 0.'}
        </>
      ) : (
        'Chưa đủ dữ liệu — chưa có lượt nào bằng mô hình này có giá niêm yết.'
      )}
    </p>
  );
}
