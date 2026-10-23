/**
 * Mức chi phí tối đa của MỘT lượt AI Design — chặn thật (T164 điểm 1, anh Dũng 23/10/2026).
 *
 * Lượt chạy thật đầu tiên (hồ sơ NVO-TK-2026-THU5) tốn ≈ 0,74 USD cho hai lượt «Xếp mặt bằng» mà không
 * ra phương án nào: vòng sửa cứ gọi lại mô hình tới hết `houseRevisionsMax`. Trần T163 chỉ là con số để
 * HỎI trước khi bấm; ở đây nó thành hạn mức: trước MỖI lời gọi sửa kế tiếp, cộng tiền đã tiêu của lượt
 * với ước tính một lời gọi nữa, vượt mức thì dừng.
 *
 * Mức nằm ở `design_setting.ai_run_cost_cap_usd` theo tenant (migration 0219 khai khoá với giá trị
 * `null`). TRỐNG = không giới hạn — NVG chưa quyết con số (CLAUDE.md 5.2); bản demo đặt 0,5 USD qua kịch
 * bản `mac-dinh`, ghi rõ DEMO.
 *
 * Tệp này là hàm thuần + một hàm đọc cấu hình; không import `cloudflare:*`, để kiểm thử được.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Khoá cấu hình trong `design_setting`. */
export const RUN_COST_CAP_KEY = 'ai_run_cost_cap_usd';

/**
 * Đọc giá trị cấu hình thành số USD. Trống (`null`, chuỗi rỗng), không phải số, hoặc không dương →
 * `null` = không giới hạn. Nhận cả số lẫn chuỗi số («0.5», «0,5») vì cột là `jsonb`.
 */
export function parseCostCap(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value.trim().replace(',', '.'))
        : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Mức của tenant; lỗi đọc hay chưa khai → `null` (không giới hạn — đúng nghĩa «để trống»). */
export async function readRunCostCap(db: SupabaseClient, tenantId: string): Promise<number | null> {
  const { data, error } = await db
    .from('design_setting')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', RUN_COST_CAP_KEY)
    .maybeSingle();
  if (error || !data) return null;
  return parseCostCap((data as { value: unknown }).value);
}

/** Lượt bị dừng vì chạm mức — đi kèm kết quả phương án hỏng để màn hình nói ra. */
export interface CostCapStop {
  capUsd: number;
  /** Tiền (giá niêm yết) các lời gọi mô hình của lượt đã tiêu tới lúc dừng. */
  spentUsd: number;
  /** Ước tính một lời gọi nữa; `null` khi không tính được giá lượt trước. */
  nextUsd: number | null;
  /** `unpriced` = có lời gọi không tính được tiền, nên không bảo đảm được mức. */
  reason: 'over' | 'unpriced';
}

/**
 * Có gọi thêm MỘT lời gọi mô hình nữa không.
 *
 * `callCosts` là tiền từng lời gọi ĐÃ xong của lượt (mọi phương án), `null` = không tính được (tuyến
 * thiếu giá hoặc nhà cung cấp không trả token). Ước tính lời gọi kế = trung bình các lời gọi đã có — số
 * thật của chính lượt này, không đặt số nào.
 *
 * Trả `null` = được gọi tiếp. Mức trống → luôn `null`. Chưa có lời gọi nào → `null` (lời gọi đầu không
 * bị chặn: chưa có số để ước tính, và không gọi thì lượt không có gì).
 */
export function costCapDecision(
  capUsd: number | null,
  callCosts: readonly (number | null)[],
): CostCapStop | null {
  if (capUsd === null) return null;
  if (callCosts.length === 0) return null;
  const known = callCosts.filter((cost): cost is number => cost !== null);
  const spentUsd = round6(known.reduce((sum, cost) => sum + cost, 0));
  // Không biết một lời gọi tốn bao nhiêu thì không bảo đảm được mức đã đặt — dừng, không đoán.
  if (known.length < callCosts.length) {
    return { capUsd, spentUsd, nextUsd: null, reason: 'unpriced' };
  }
  const nextUsd = round6(spentUsd / known.length);
  if (spentUsd + nextUsd > capUsd) return { capUsd, spentUsd, nextUsd, reason: 'over' };
  return null;
}

/** USD kiểu Việt Nam: dấu phẩy thập phân (CGD 4.3), hai chữ số — ba khi dưới 0,1. */
export function formatUsdVi(value: number): string {
  const digits = value > 0 && value < 0.1 ? 3 : 2;
  return `${value.toFixed(digits).replace('.', ',')} USD`;
}

/** Câu hiện cho người dùng khi lượt dừng vì mức chi phí. */
export function costCapMessage(stop: CostCapStop): string {
  if (stop.reason === 'unpriced') {
    return `Đã dừng vì không tính được chi phí lời gọi trước của mô hình này, trong khi lượt có mức chi phí ${formatUsdVi(stop.capUsd)} (đã tiêu ${formatUsdVi(stop.spentUsd)}).`;
  }
  return `Đã dừng vì chạm mức chi phí ${formatUsdVi(stop.capUsd)} (đã tiêu ${formatUsdVi(stop.spentUsd)}).`;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
