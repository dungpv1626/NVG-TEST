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
  /** Trung bình tiền MỘT lượt gọi mô hình — để tính trần khi phải gọi lại nhiều lượt sửa. */
  perCallUsd?: number | null;
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
  for (const run of runs) {
    if (!run.units || run.units <= 0) continue;
    const mine = billedCalls(callsOfRun(run, calls, purposes));
    if (mine.length === 0) continue;
    // Lượt gọi chưa ghi token thì không biết nó tốn bao nhiêu — bỏ cả lượt chạy, không coi là 0.
    if (mine.some((call) => call.inputTokens == null || call.outputTokens == null)) continue;
    const usd = mine.reduce(
      (sum, call) => sum + usdOf(call.inputTokens ?? 0, call.outputTokens ?? 0),
      0,
    );
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
): number | null {
  if (!estimate?.perCallUsd || !callsMax || callsMax < 1) return null;
  return estimate.perCallUsd * callsMax * units;
}

/** Số phương án một lượt xếp mặt bằng đã yêu cầu — đọc từ kết quả đã ghi (`plans` + `failed`). */
export function planRunUnits(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as { plans?: unknown; failed?: unknown };
  const plans = Array.isArray(r.plans) ? r.plans.length : 0;
  const failed = Array.isArray(r.failed) ? r.failed.length : 0;
  return plans + failed > 0 ? plans + failed : null;
}

/** Lượt sửa theo yêu cầu kỹ sư (T53) — một bản sửa mỗi lượt. */
export function editRunUnits(result: unknown): number | null {
  return result && typeof result === 'object' ? 1 : null;
}
