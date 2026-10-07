/**
 * Chi phí TƯƠNG ĐỐI của một lượt chạy đang chạy (Haan, 07/10/2026: «khi chạy, phải hiện số tiền real time»).
 *
 * Nhật ký `design_ai_call` chỉ có dòng khi một lượt gọi XONG, nên trong lúc mô hình đang nghĩ / viết (có
 * khi vài phút) con số từ nhật ký đứng yên. Worker có gửi sẵn trong `run.progress.partial.live`: các lượt
 * đã xong (kèm giá) và các lượt đang chạy (số ký tự đã sinh). Ước tính = tiền thật của lượt đã xong +
 * phần đang chạy: ký tự đã sinh quy ra token × giá token ra, cộng token vào lấy theo lượt trước × giá
 * token vào.
 *
 * Đây là ƯỚC TÍNH, thường THẤP hơn thật: phần suy nghĩ ẩn của mô hình (không trả ký tự về) không đếm
 * được. Màn hình ghi rõ «ước tính»; xong lượt thì thay bằng tiền thật trong nhật ký.
 */

/** Khoảng ký tự một token, cho chữ Việt lẫn JSON — chỉ để ước lượng. */
export const CHARS_PER_TOKEN = 3.5;

export interface LiveProgress {
  active?: { outputChars: number; thinkingChars: number | null }[];
  done?: { inputTokens: number | null; costUsd: number | null }[];
}

export interface RoutePrice {
  inputPer1mUsd?: number | null;
  outputPer1mUsd?: number | null;
}

/** `null` khi không có gì để ước (không có dữ liệu trực tiếp). */
export function estimateLiveCost(
  live: LiveProgress | null | undefined,
  price: RoutePrice | null | undefined,
): number | null {
  if (!live) return null;
  const done = live.done ?? [];
  const active = live.active ?? [];
  if (done.length === 0 && active.length === 0) return null;
  const doneCost = done.reduce((sum, d) => sum + (d.costUsd ?? 0), 0);
  const inputs = done.map((d) => d.inputTokens).filter((n): n is number => n !== null && n > 0);
  const avgInput = inputs.length ? inputs.reduce((a, b) => a + b, 0) / inputs.length : 0;
  const inPrice = price?.inputPer1mUsd ?? 0;
  const outPrice = price?.outputPer1mUsd ?? 0;
  const activeCost = active.reduce((sum, a) => {
    const outTokens = (a.outputChars + (a.thinkingChars ?? 0)) / CHARS_PER_TOKEN;
    return sum + (avgInput * inPrice + outTokens * outPrice) / 1_000_000;
  }, 0);
  return doneCost + activeCost;
}
