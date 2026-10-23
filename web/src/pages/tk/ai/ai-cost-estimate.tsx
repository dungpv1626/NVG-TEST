/**
 * Dòng «Chi phí ước tính» đặt NGAY dưới nút tốn tiền (Đợt 5B). Cách tính và vì sao không nhân giá
 * token với một số token tự đặt: xem `run-cost-estimate.ts`.
 *
 * 23/10/2026 (lượt chạy thật): chưa có lượt nào bằng mô hình đang chọn thì không dừng ở «Chưa đủ dữ
 * liệu» nữa — ước tính theo BẢNG GIÁ niêm yết của mô hình này nhân số token đo được ở lượt trước bằng
 * mô hình khác, và câu chữ nói rõ đó là ước tính theo bảng giá.
 */

import { useMemo } from 'react';
import { useAiCostHistory, type AiModelOption } from '@/hooks/use-ai-design';
import {
  editRunUnits,
  estimateFromPricing,
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
  /** Mô hình đang chọn — giá niêm yết của nó dùng khi chưa có lượt nào bằng chính nó. */
  option?: AiModelOption | null,
): { estimate: CostEstimate | null; loading: boolean } {
  const history = useAiCostHistory('plan', PURPOSES[kind]);
  const inputPrice = option?.route === route ? option?.inputPer1mUsd : undefined;
  const outputPrice = option?.route === route ? option?.outputPer1mUsd : undefined;
  const estimate = useMemo(() => {
    if (!route || !history.data) return null;
    const units = kind === 'plan' ? planRunUnits : editRunUnits;
    const runs = history.data.runs.map((run) => ({
      id: run.id,
      projectId: run.project_id,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      units: units(run.result),
    }));
    const calls = history.data.calls.map((call) => ({
      projectId: call.project_id,
      createdAt: call.created_at,
      route: call.route,
      purpose: call.purpose,
      status: call.status,
      inputTokens: call.input_tokens,
      outputTokens: call.output_tokens,
      costUsd: call.cost_usd === null ? null : Number(call.cost_usd),
    }));
    return (
      estimateRunCost(runs, calls, { route, purposes: PURPOSES[kind] }) ??
      estimateFromPricing(runs, calls, {
        purposes: PURPOSES[kind],
        inputPer1mUsd: inputPrice,
        outputPer1mUsd: outputPrice,
      })
    );
  }, [history.data, kind, route, inputPrice, outputPrice]);
  return { estimate, loading: history.isLoading };
}

/** Chữ ngắn gắn lên nút: «≈ 0,24 USD». Rỗng khi chưa có số — nút không mang chữ «Chưa đủ dữ liệu». */
export function costOnButton(estimate: CostEstimate | null, units: number): string {
  return estimate ? ` · ≈ ${formatUsd(estimate.perUnitUsd * units)}` : '';
}

/** Câu nói số ước tính lấy từ đâu — dùng chung cho dòng dưới nút và hộp hỏi lại trước khi chạy. */
export function estimateSource(estimate: CostEstimate): string {
  return estimate.basis === 'pricing'
    ? `ước tính theo bảng giá niêm yết của mô hình này, với số token đo được ở ${estimate.samples} lượt trước bằng mô hình khác — mỗi mô hình nghĩ một lượng token khác nhau, nên số thật có thể lệch nhiều`
    : `trung bình ${estimate.samples} lượt trước bằng mô hình này, theo giá niêm yết, chưa gồm thuế`;
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
          {units > 1 && ` (${formatUsd(estimate.perUnitUsd)} mỗi ${unitLabel})`} —{' '}
          {estimateSource(estimate)}.
          {option?.billed === false && ' Khoá gói miễn phí: tiền thật bằng 0.'}
        </>
      ) : (
        'Chưa đủ dữ liệu — chưa có lượt nào ghi số token, hoặc mô hình này chưa khai giá niêm yết.'
      )}
    </p>
  );
}
