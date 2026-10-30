/**
 * Chi phí ƯỚC TÍNH một tấm ảnh phòng (B3b) — hiện trên nút «Vẽ ảnh phòng» trước khi bấm.
 *
 * Cùng nguyên tắc với `run-cost-estimate.ts`: ưu tiên TIỀN ĐÃ TRẢ THẬT của các lượt trước bằng chính tuyến
 * mô hình này (`design_ai_call`, `purpose = room_image`, chỉ lượt «ok» có giá); chưa có lượt nào thì giá
 * niêm yết MỖI ẢNH của tuyến (`config/models.yaml` `pricing.image_usd`) — ảnh tính theo tấm nên số này
 * không phải đoán token. Không có cả hai thì `null` → «Chưa đủ dữ liệu» (CLAUDE.md 5.2).
 */

export interface RoomImageCallRow {
  route: string;
  status: 'ok' | 'rejected' | 'failed';
  cost_usd: number | null;
}

export interface RoomImageEstimate {
  perImageUsd: number;
  basis: 'history' | 'pricing';
  /** Số lượt trước đã dùng (chỉ với `history`). */
  samples: number;
}

export function roomImageEstimate(
  calls: readonly RoomImageCallRow[],
  route: string | null,
  /** Giá niêm yết mỗi ảnh của tuyến đang chọn; `null` = tuyến chưa khai giá. */
  imageUsd: number | null | undefined,
): RoomImageEstimate | null {
  if (!route) return null;
  const priced = calls.filter(
    (call) => call.route === route && call.status === 'ok' && typeof call.cost_usd === 'number',
  );
  if (priced.length > 0) {
    const total = priced.reduce((sum, call) => sum + Number(call.cost_usd), 0);
    return { perImageUsd: total / priced.length, basis: 'history', samples: priced.length };
  }
  if (typeof imageUsd === 'number') return { perImageUsd: imageUsd, basis: 'pricing', samples: 0 };
  return null;
}
