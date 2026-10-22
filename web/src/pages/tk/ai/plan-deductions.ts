/**
 * Ba lý do trừ điểm lớn nhất của một phương án (Đợt 5B) — đọc thẳng thước chấm ĐÃ LƯU trong artifact
 * (`score.criteria`), không chấm lại, không thêm luật.
 *
 * Điểm mất của một tiêu chí = (1 − điểm tiêu chí) × trọng số tuyệt đối của nó (`weight` đã là phần của
 * 100 — `workers/src/design/ai/plan-score.ts`). Tiêu chí KHÔNG chấm được (cổng đã bảo đảm, thiếu đầu
 * vào) không phải «bị trừ» — bỏ ra, không tính là mất trọn trọng số (CLAUDE.md 5.2).
 */

import type { AiPlanScoreCriterion, AiPlanScoreView } from '@/hooks/use-ai-design';

export interface PlanDeduction {
  code: string;
  /** Tên tiêu chí, tiếng Việt. */
  label: string;
  /** Câu giải thích tiêu chí (nếu thước có). */
  explain: string | null;
  /** Số điểm mất, trên thang điểm của phương án. */
  lost: number;
  /** Mã phòng bị trừ điểm (nếu bộ đo nêu được). */
  refs: string[];
}

/** Dưới mức này coi như không mất điểm — tránh nêu «mất 0,00 điểm» do làm tròn. */
const EPSILON = 0.005;

export function topDeductions(score: AiPlanScoreView | null, count = 3): PlanDeduction[] {
  if (!score) return [];
  return score.criteria
    .filter(
      (c): c is AiPlanScoreCriterion & { score: number } =>
        c.notScored === null && c.score !== null && c.weight > 0,
    )
    .map((c) => ({
      code: c.code,
      label: c.vi,
      explain: c.giaiThich,
      lost: (1 - c.score) * c.weight,
      refs: c.refs,
    }))
    .filter((d) => d.lost > EPSILON)
    .sort((a, b) => b.lost - a.lost || a.code.localeCompare(b.code))
    .slice(0, count);
}

/** Mã phòng → «Phòng khách (living_1)» theo nhãn máy chủ trả; mã lạ giữ nguyên. */
export function roomName(id: string, labels: Record<string, string>): string {
  const match = /^(.*)_(\d+)$/.exec(id);
  const label = labels[match?.[1] ?? id];
  return label ? `${label} (${id})` : id;
}
