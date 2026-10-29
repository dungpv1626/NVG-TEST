/**
 * Chi phí ƯỚC TÍNH của một lượt sắp chạy — hiện TRÊN nút trước khi bấm (Đợt 5B, vấn đề 7 của chủ dự án:
 * «có giá ước tính trước khi chạy»).
 *
 * Không đoán từ bảng giá token: số token của một lượt xếp mặt bằng phụ thuộc số tầng, số lượt sửa ý
 * định và phần suy nghĩ ẩn của mô hình — nhân giá niêm yết với một con số token tự đặt là bịa số
 * (CLAUDE.md 5.2). Thay vào đó lấy TIỀN ĐÃ TRẢ THẬT của các lượt chạy trước bằng cùng tuyến mô hình:
 *
 *  · Một lượt chạy (`design_ai_run`, đã xong) gom các dòng `design_ai_call` cùng hồ sơ, cùng nhóm
 *    mục đích, nằm trong khoảng thời gian của lượt — đúng cách `useRunCalls` cộng tiền một lượt.
 *  · Tuyến của lượt = tuyến của lượt gọi ĐẦU TIÊN trong lượt (vòng sửa có thể chạy tuyến khác —
 *    `revise_route` — và tiền của nó vẫn tính vào lượt, vì người bấm nút trả cả phần ấy).
 *  · Chia cho số đơn vị của lượt (số phương án đã yêu cầu ở bước mặt bằng; 1 với lượt sửa).
 *  · Lượt có dòng chưa có giá niêm yết thì BỎ, không coi là 0.
 *
 * Chưa có lượt nào đủ điều kiện → `null`; khi ấy màn hình thử `estimateFromPricing` (bảng giá niêm yết
 * × số token đo được bằng mô hình khác, ghi rõ là ước tính theo bảng giá), không có nữa mới «Chưa đủ dữ liệu».
 */

import { callBudget } from '@nvg/shared/design';

export interface CostRunRow {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  /** Số đơn vị của lượt (vd số phương án); `null` = không đọc được, lượt bị bỏ. */
  units: number | null;
}

export interface CostCallRow {
  projectId: string;
  createdAt: string;
  route: string;
  purpose: string;
  status: 'ok' | 'rejected' | 'failed';
  inputTokens: number | null;
  outputTokens: number | null;
  /** Giá niêm yết của lượt gọi, USD. `null` = tuyến chưa khai giá. */
  costUsd: number | null;
}

export interface CostEstimate {
  /** Trung bình tiền (giá niêm yết) cho MỘT đơn vị. */
  perUnitUsd: number;
  /** Số lượt chạy trước đã dùng để tính. */
  samples: number;
  /**
   * `history` = tiền thật các lượt trước bằng CHÍNH mô hình này; `pricing` = chưa có lượt nào bằng mô
   * hình này, nhân bảng giá niêm yết của nó với số token ĐO ĐƯỢC ở các lượt trước bằng mô hình khác.
   * Vắng = `history` (bản trước 23/10/2026).
   */
  basis?: 'history' | 'pricing';
  /** Trung bình tiền MỘT lượt gọi mô hình. */
  perCallUsd?: number | null;
  /**
   * Lượt gọi ĐẮT NHẤT đã gặp — trần khi phải gọi lại hết lượt sửa tính bằng số này, không bằng trung bình:
   * lượt thật 29/10/2026 (9272) báo trần 0,461 USD (trung bình × 5) mà trả 0,577 USD, vì lời gọi đầu
   * (phác cả nhà) đắt gấp rưỡi một lời gọi sửa.
   */
  maxCallUsd?: number | null;
}

/** Dòng cuối của một lượt có thể ghi sau mốc cập nhật trạng thái vài giây — cùng biên với `useRunCalls`. */
const TAIL_MS = 60_000;

export function estimateRunCost(
  runs: readonly CostRunRow[],
  calls: readonly CostCallRow[],
  options: { route: string; purposes: readonly string[] },
): CostEstimate | null {
  const purposes = new Set(options.purposes);
  const perUnit: number[] = [];
  let callTotal = 0;
  let callCount = 0;
  let callMax = 0;
  for (const run of runs) {
    if (!run.units || run.units <= 0) continue;
    const from = Date.parse(run.createdAt);
    const to = Date.parse(run.updatedAt) + TAIL_MS;
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const mine = calls
      .filter((call) => {
        if (call.projectId !== run.projectId || !purposes.has(call.purpose)) return false;
        const t = Date.parse(call.createdAt);
        return t >= from && t <= to;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (mine.length === 0 || mine[0]!.route !== options.route) continue;
    let total = 0;
    let priced = true;
    for (const call of mine) {
      // Lượt LỖI không trả token nào thì không tốn tiền (cùng quy ước `useRunCalls`).
      if (
        call.status === 'failed' &&
        call.costUsd === null &&
        !call.inputTokens &&
        !call.outputTokens
      ) {
        continue;
      }
      if (call.costUsd === null) {
        priced = false;
        break;
      }
      total += call.costUsd;
      callMax = Math.max(callMax, call.costUsd);
    }
    if (!priced) continue;
    perUnit.push(total / run.units);
    callTotal += total;
    callCount += billedCalls(mine).length;
  }
  if (perUnit.length === 0) return null;
  return {
    perUnitUsd: perUnit.reduce((a, b) => a + b, 0) / perUnit.length,
    samples: perUnit.length,
    basis: 'history',
    perCallUsd: callCount > 0 ? callTotal / callCount : null,
    maxCallUsd: callMax > 0 ? callMax : null,
  };
}

/** Lượt LỖI không trả token nào thì không tốn tiền (cùng quy ước `useRunCalls`). */
function billedCalls(calls: readonly CostCallRow[]): CostCallRow[] {
  return calls.filter(
    (call) =>
      !(
        call.status === 'failed' &&
        call.costUsd === null &&
        !call.inputTokens &&
        !call.outputTokens
      ),
  );
}

/** Các lượt gọi của một lượt chạy: cùng hồ sơ, cùng nhóm mục đích, trong khoảng thời gian của lượt. */
function callsOfRun(
  run: CostRunRow,
  calls: readonly CostCallRow[],
  purposes: ReadonlySet<string>,
): CostCallRow[] {
  const from = Date.parse(run.createdAt);
  const to = Date.parse(run.updatedAt) + TAIL_MS;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  return calls
    .filter((call) => {
      if (call.projectId !== run.projectId || !purposes.has(call.purpose)) return false;
      const t = Date.parse(call.createdAt);
      return t >= from && t <= to;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Lần đầu dùng một mô hình (23/10/2026, lượt chạy thật: «Chưa đủ dữ liệu» trơn ngay trên nút tốn
 * 0,4 USD): chưa có tiền thật của mô hình này, nhưng có SỐ TOKEN ĐO ĐƯỢC của các lượt trước bằng mô hình
 * khác, và có bảng giá niêm yết của mô hình này (`config/models.yaml`). Nhân hai thứ đó — cả hai đều là số
 * thật, không tự đặt con số token nào. Màn hình phải ghi rõ đây là ước tính theo bảng giá: mỗi mô hình
 * nghĩ một lượng token khác nhau, nên số thật có thể lệch nhiều.
 *
 * Không có lượt nào ghi token, hoặc mô hình chưa khai giá → `null` («Chưa đủ dữ liệu»).
 */
export function estimateFromPricing(
  runs: readonly CostRunRow[],
  calls: readonly CostCallRow[],
  options: {
    purposes: readonly string[];
    inputPer1mUsd: number | null | undefined;
    outputPer1mUsd: number | null | undefined;
  },
): CostEstimate | null {
  const { inputPer1mUsd: inPrice, outputPer1mUsd: outPrice } = options;
  if (inPrice == null || outPrice == null) return null;
  const purposes = new Set(options.purposes);
  const usdOf = (input: number, output: number) => (input * inPrice + output * outPrice) / 1e6;
  const perUnit: number[] = [];
  let tokenUsd = 0;
  let callCount = 0;
  let callMax = 0;
  for (const run of runs) {
    if (!run.units || run.units <= 0) continue;
    const mine = billedCalls(callsOfRun(run, calls, purposes));
    if (mine.length === 0) continue;
    // Lượt gọi chưa ghi token thì không biết nó tốn bao nhiêu — bỏ cả lượt chạy, không coi là 0.
    if (mine.some((call) => call.inputTokens == null || call.outputTokens == null)) continue;
    const each = mine.map((call) => usdOf(call.inputTokens ?? 0, call.outputTokens ?? 0));
    const usd = each.reduce((sum, value) => sum + value, 0);
    callMax = Math.max(callMax, ...each);
    perUnit.push(usd / run.units);
    tokenUsd += usd;
    callCount += mine.length;
  }
  if (perUnit.length === 0) return null;
  return {
    perUnitUsd: perUnit.reduce((a, b) => a + b, 0) / perUnit.length,
    samples: perUnit.length,
    basis: 'pricing',
    perCallUsd: callCount > 0 ? tokenUsd / callCount : null,
    maxCallUsd: callMax > 0 ? callMax : null,
  };
}

/**
 * Trần chi phí của lượt sắp chạy: mỗi đơn vị gọi mô hình tối đa `callsMax` lượt (lượt đầu + lượt sửa).
 * `null` khi chưa biết giá một lượt gọi hoặc chưa biết trần số lượt.
 */
export function costCeiling(
  estimate: CostEstimate | null,
  callsMax: number | null | undefined,
  units: number,
  capUsd?: number | null,
): number | null {
  // Lời gọi đắt nhất đã gặp (29/10/2026); số cũ chỉ có trung bình thì dùng trung bình.
  const perCall = estimate?.maxCallUsd ?? estimate?.perCallUsd;
  if (!perCall || !callsMax || callsMax < 1) return null;
  const ceiling = perCall * callsMax * units;
  // Mức chặn thật của lượt (T164) — chương trình dừng trước lời gọi vượt nó, nên trần không cao hơn.
  return typeof capUsd === 'number' && capUsd > 0 ? Math.min(ceiling, capUsd) : ceiling;
}

/** Số phương án một lượt xếp mặt bằng đã yêu cầu — đọc từ kết quả đã ghi (`plans` + `failed`). */
export function planRunUnits(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as { plans?: unknown; failed?: unknown };
  const plans = Array.isArray(r.plans) ? r.plans.length : 0;
  const failed = Array.isArray(r.failed) ? r.failed.length : 0;
  return plans + failed > 0 ? plans + failed : null;
}

/**
 * Tiền TRUNG BÌNH một lời gọi đã trả thật (T184): cho lượt «Sửa lại», mỗi lời gọi là một `plan_house_edit` đứng riêng, nên không
 * cần gom theo lượt chạy — lượt sửa hỏng (không ghi kết quả) vẫn có lời gọi đã trả tiền thật. Cùng tuyến mô hình; lời gọi lỗi
 * không trả token thì bỏ (không tốn tiền); dòng chưa có giá niêm yết thì bỏ, không coi là 0. Chưa có dòng nào → `null`.
 */
export function estimateFromCalls(
  calls: readonly CostCallRow[],
  options: { route: string; purposes: readonly string[] },
): CostEstimate | null {
  const purposes = new Set(options.purposes);
  const priced = billedCalls(
    calls.filter((call) => call.route === options.route && purposes.has(call.purpose)),
  ).filter((call) => call.costUsd !== null);
  if (priced.length === 0) return null;
  const avg = priced.reduce((sum, call) => sum + (call.costUsd ?? 0), 0) / priced.length;
  return { perUnitUsd: avg, samples: priced.length, basis: 'history', perCallUsd: avg };
}

/** Lượt sửa theo yêu cầu kỹ sư (T53) — một bản sửa mỗi lượt. */
export function editRunUnits(result: unknown): number | null {
  return result && typeof result === 'object' ? 1 : null;
}

/** Token vào LỚN NHẤT đã đo ở các lượt gọi trước (mọi mô hình, cùng nhóm mục đích) — `null` = chưa có dòng nào. */
export function maxMeasuredInputTokens(
  calls: readonly CostCallRow[],
  purposes: readonly string[],
): number | null {
  const wanted = new Set(purposes);
  let max: number | null = null;
  for (const call of calls) {
    if (!wanted.has(call.purpose) || call.inputTokens == null) continue;
    if (max === null || call.inputTokens > max) max = call.inputTokens;
  }
  return max;
}

export interface MaxCallCost {
  /** Tiền TỐI ĐA một lời gọi có thể tiêu, USD (giá niêm yết). */
  usd: number;
  /** `true` = giới hạn token ra bị hạ cho vừa mức chi phí của lượt (trần từng lời gọi, T176). */
  lowered: boolean;
  /** `false` = chưa có số token vào đo được — con số chỉ gồm phần token ra. */
  inputKnown: boolean;
  /** Giới hạn token ra dùng để tính. */
  outputTokens: number;
}

/**
 * Chi phí TỐI ĐA của lời gọi ĐẦU (T176) — cùng hàm `callBudget` mà Worker dùng để hạ giới hạn token ra, nên
 * hộp hỏi và lượt chạy không lệch nhau. Token vào lấy số đo lớn nhất của các lượt trước (không đoán theo ký tự:
 * màn hình không có lời dẫn). `null` = tuyến chưa khai giá hoặc không đặt giới hạn token ra mà lượt không có mức.
 */
export function maxCallCost(options: {
  inputPer1mUsd: number | null | undefined;
  outputPer1mUsd: number | null | undefined;
  maxOutputTokens: number | null | undefined;
  inputTokens: number | null;
  capUsd: number | null | undefined;
  minOutputTokens: number | null | undefined;
}): MaxCallCost | null {
  const { inputPer1mUsd, outputPer1mUsd } = options;
  if (inputPer1mUsd == null || outputPer1mUsd == null) return null;
  const decision = callBudget({
    capUsd: options.capUsd ?? null,
    spentUsd: 0,
    inputTokens: options.inputTokens ?? 0,
    routeOutputTokens: options.maxOutputTokens ?? null,
    prices: { inputPer1mUsd, outputPer1mUsd },
    // Màn hình không chặn — chỉ cần số tối thiểu để phân biệt «dừng»; vắng thì 1.
    minOutputTokens: options.minOutputTokens ?? 1,
  });
  if (decision.outputTokens === null || decision.maxCallUsd === null) return null;
  return {
    usd: decision.maxCallUsd,
    lowered: decision.kind === 'stop' || decision.lowered,
    inputKnown: options.inputTokens !== null,
    outputTokens: decision.outputTokens,
  };
}
