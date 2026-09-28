/**
 * Quy đổi diện tích lọt lòng ↔ số ô bản phác (T73).
 *
 * Nguyên nhân gốc của lượt đo 011b4adc (24/09/2026): đầu bài «phòng khách tối thiểu 45 m²», mô hình khai
 * đúng mục tiêu 45 m² nhưng VẼ 28 ô — vì lời dẫn 8.3.0 bảo nó «đừng đếm ô, chương trình căn vách theo
 * diện tích». Chương trình chỉ căn vách được TRONG khung dải mô hình vẽ, nên phòng vẽ thiếu ô thì hụt
 * mức đầu bài dù căn thế nào. Tệp này là một nguồn duy nhất cho cả hai phía: số ô tối thiểu gửi mô hình
 * và phép kiểm bản phác trước khi xếp.
 *
 * Bản phác vẽ theo tim tường, nên một phòng a × b m trên lưới có lọt lòng ≈ (a − t)(b − t), t = một bề
 * dày tường. Đo trên lượt ấy: 28 ô (7 × 4 m) ra 26,8 m² — t ≈ 0,11 m, đúng tường ngăn.
 */

import type { ConstructionNorms } from '../kb/construction';

/** Lọt lòng của một chữ nhật vẽ theo tim tường, m². */
export function clearAreaM2(widthCm: number, depthCm: number, wallCm: number): number {
  return (Math.max(0, widthCm - wallCm) * Math.max(0, depthCm - wallCm)) / 10_000;
}

/**
 * Tỉ lệ dài/rộng giả định khi tính số ô tối thiểu gửi mô hình. Phòng dài hơn thì mất nhiều diện tích cho
 * tường hơn; lấy 2 (phòng khách, phòng ngủ thường dưới mức này) để số ô gửi đi không thiếu.
 */
const ASSUMED_ASPECT = 2;

/**
 * Số ô tối thiểu để một phòng đạt `areaM2` lọt lòng: phòng tỉ lệ `ASSUMED_ASPECT`, mỗi chiều cộng một
 * bề dày tường `wallM`, chia diện tích một ô. Ví dụ 45 m², ô 1 m, tường 0,22 m → 49 ô.
 */
export function minSketchCells(areaM2: number, cellM: number, wallM: number): number {
  const long = Math.sqrt(areaM2 * ASSUMED_ASPECT) + wallM;
  const short = Math.sqrt(areaM2 / ASSUMED_ASPECT) + wallM;
  return Math.ceil((long * short) / (cellM * cellM) - 1e-9);
}

/**
 * Bề ngang tối thiểu của hành lang trên bản phác, tính bằng ô (T73, lượt đo 0c86c0b1). Mô hình vẽ hành
 * lang MỘT ô 1 m trong khi hành lang cần `circulation.corridor_clear_m` lọt lòng; bộ xếp nới hành lang
 * và lấy phần thiếu từ dải phòng bên cạnh — phòng ngủ 1 vẽ 24 ô chỉ còn 19,08 m² (< 20), bản phác tầng
 * 1 bị bỏ, ô thang bị dời. Lấy bề ngang theo tim tường của hành lang áp tường bao (lọt lòng + tường
 * ngoài + nửa tường ngăn) — trường hợp rộng nhất, cùng công thức bộ xếp dùng (`corridorWidth.edge`).
 */
export function corridorMinCells(construction: ConstructionNorms, cellM: number): number {
  const clear =
    construction.circulation?.corridor_clear_m ?? construction.openings.door?.width_m ?? 0.9;
  const width = clear + construction.walls.exterior_m + construction.walls.partition_m / 2;
  return Math.ceil(width / cellM - 1e-9);
}
