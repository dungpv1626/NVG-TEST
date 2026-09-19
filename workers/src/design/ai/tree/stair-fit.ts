/**
 * Thang dựng từ tham số — MỘT nơi suy số bậc, số vế và chiều dài ô thang cần (Q-45d, 15/09/2026).
 *
 * Tài liệu bàn giao `ai-architectural-floorplan` mục «Stairs»: thang không do mô hình vẽ, mà suy từ cao
 * tầng, cao bậc, bề sâu bậc và bề rộng ra số bậc, chiều dài vế, chiếu nghỉ. Trước đây chương trình chỉ
 * suy số bậc; một ô thang ngắn hơn số bậc ấy vẫn qua cổng và bộ vẽ ép dẹt bậc lại.
 *
 * Quy ước hình học (cùng quy ước với `draw/stairs.ts`):
 *  · một vế: đi thẳng dọc chiều `up`, `treads` bậc cao tức `treads − 1` mặt bậc;
 *  · hai vế (chữ U): hai vế song song dọc chiều `up`, quay đầu ở chiếu nghỉ cuối ô; chiếu nghỉ sâu ít
 *    nhất bằng bề rộng một vế — vế hẹp nhất xây được (nửa ngưỡng hai vế), vì đây là điều kiện dựng.
 *
 * Đơn vị: cm. Hàm THUẦN.
 */

import type { ConstructionNorms } from '../../kb/construction';

/** Số bậc cao của một tầng cao `storeyCm` — trần 40, sàn 2, như bộ vẽ đọc. */
export function stairTreads(construction: ConstructionNorms, storeyCm: number): number {
  return Math.min(40, Math.max(2, Math.round(storeyCm / (construction.stairs.riser_m * 100))));
}

/** Ô thang rộng ngang từ ngưỡng hai vế thì hai vế (chữ U), hẹp hơn thì một vế. */
export function stairFlights(construction: ConstructionNorms, acrossCm: number): 1 | 2 {
  return acrossCm >= construction.stairs.two_flights_min_width_m * 100 ? 2 : 1;
}

/**
 * Chiều dài lọt lòng ô thang cần DỌC chiều đi lên, cm — `null` khi quy cách không có bề sâu bậc (không
 * kiểm).
 */
export function stairRunNeedCm(
  construction: ConstructionNorms,
  stair: { flights: number; treads: number; acrossCm: number },
): number | null {
  const going = construction.stairs.going_m;
  if (going === undefined) return null;
  const goingCm = going * 100;
  if (stair.flights <= 1) return Math.ceil((stair.treads - 1) * goingCm);
  const perFlight = Math.ceil(stair.treads / 2);
  // Chiếu nghỉ sâu bằng bề rộng một vế; vế hẹp nhất xây được là nửa ngưỡng hai vế. Đây là mức DỰNG
  // ĐƯỢC, không phải mức đẹp: ô thang rộng hơn thì kiến trúc sư được chọn vế hẹp và chừa khe giữa.
  const landing = Math.min(
    stair.acrossCm / 2,
    (construction.stairs.two_flights_min_width_m * 100) / 2,
  );
  return Math.ceil((perFlight - 1) * goingCm + landing);
}

/** Ô thang theo hình chữ nhật lọt lòng `rect` và chiều `up` có đủ dài không; `null` = đủ hoặc không kiểm. */
export function stairShortfall(
  construction: ConstructionNorms,
  stair: { rect: readonly number[]; up: string; flights: number; treads: number },
): { needCm: number; haveCm: number } | null {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = stair.rect;
  const alongY = stair.up.endsWith('y');
  const haveCm = alongY ? y1 - y0 : x1 - x0;
  const acrossCm = alongY ? x1 - x0 : y1 - y0;
  const needCm = stairRunNeedCm(construction, {
    flights: stair.flights,
    treads: stair.treads,
    acrossCm,
  });
  return needCm !== null && haveCm + 0.5 < needCm ? { needCm, haveCm } : null;
}
