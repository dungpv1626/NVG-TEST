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
import { stairFits, stairNeed, type StairParams } from '../stair-geometry';

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

/**
 * Thông số thang theo LOẠI của lượt này (T105) — `null` khi lượt không mang loại thang (dữ liệu, phép thử cũ) hay kho
 * không có bảng loại: khi ấy mọi hàm dưới đi nhánh cũ (vế thẳng song song theo `two_flights_min_width_m`).
 */
export function stairParamsOf(construction: ConstructionNorms, treads: number): StairParams | null {
  const shape = construction.stairs.shape;
  const spec = shape ? construction.stairs.shapes?.[shape] : undefined;
  const going = construction.stairs.going_m;
  if (!shape || !spec || going === undefined) return null;
  return {
    shape,
    risers: treads,
    going: going * 100,
    flightWidth: spec.flight_width_m * 100,
    landing: spec.landing_m * 100,
    gap: (spec.gap_m ?? 0) * 100,
  };
}

/**
 * Ô thang nhỏ nhất (lọt lòng, cm) cho tầng thường: `long` × `short` — cạnh dài và cạnh ngắn, không kể chiều nào là
 * vế đầu (thang L, ba vế gần vuông; bản phác chưa nói thang đi lên hướng nào). `null` khi không kiểm.
 */
export function stairMinCm(
  construction: ConstructionNorms,
): { long: number; short: number } | null {
  const treads = stairTreads(construction, Math.round(construction.levels.storey_height_m * 100));
  const params = stairParamsOf(construction, treads);
  if (params) {
    const need = stairNeed(params);
    return { long: Math.max(need.along, need.across), short: Math.min(need.along, need.across) };
  }
  const width = construction.stairs.two_flights_min_width_m * 100;
  const run = stairRunNeedCm(construction, { flights: 2, treads, acrossCm: width });
  return run === null ? null : { long: Math.max(run, width), short: Math.min(run, width) };
}

/** Ô thang `w × h` (lọt lòng) đặt được loại thang của lượt theo ít nhất một chiều — `null` = không có loại. */
export function stairFitsEither(
  construction: ConstructionNorms,
  treads: number,
  w: number,
  h: number,
): { fits: boolean; up: '+x' | '+y'; needAlong: number; needAcross: number } | null {
  const params = stairParamsOf(construction, treads);
  if (!params) return null;
  const need = stairNeed(params);
  if (stairFits(params, h, w))
    return { fits: true, up: '+y', needAlong: need.along, needAcross: need.across };
  if (stairFits(params, w, h))
    return { fits: true, up: '+x', needAlong: need.along, needAcross: need.across };
  return { fits: false, up: h >= w ? '+y' : '+x', needAlong: need.along, needAcross: need.across };
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
  // Thang theo loại (T105): đủ DÀI dọc vế đầu và đủ RỘNG ngang — thiếu chiều nào báo chiều ấy.
  const params = stairParamsOf(construction, stair.treads);
  if (params) {
    const need = stairNeed(params);
    if (haveCm + 1 < need.along) return { needCm: need.along, haveCm };
    if (acrossCm + 1 < need.across) return { needCm: need.across, haveCm: acrossCm };
    return null;
  }
  const needCm = stairRunNeedCm(construction, {
    flights: stair.flights,
    treads: stair.treads,
    acrossCm,
  });
  return needCm !== null && haveCm + 0.5 < needCm ? { needCm, haveCm } : null;
}
