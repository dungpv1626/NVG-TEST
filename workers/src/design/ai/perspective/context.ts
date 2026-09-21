/**
 * Ngữ cảnh gửi kèm lời dẫn phối cảnh — TẬP TRƯỜNG TRẮNG rút từ đầu bài và phương án (T67).
 *
 * ── Vì sao có tệp này, thay vì nhét thẳng `digest` vào lời dẫn ─────────────────────────────
 * Đầu bài đã lược danh tính vẫn còn danh sách phòng từng tầng, nhân khẩu, nhu cầu công năng,
 * ưu tiên và ba đoạn chữ tự do. Không một chữ nào trong số đó đổi được VẺ NGOÀI ngôi nhà, mà
 * chúng thì dài — gửi đi là trả tiền token cho nhiễu, và nhiễu trong lời dẫn ảnh không ra lỗi,
 * nó ra một tấm ảnh hơi khác ý mà không ai chỉ được tại chỗ nào.
 *
 * Nên hàm này rút ra ĐÚNG những gì một người vẽ phối cảnh cần: hình khối, lối vào, hiện trạng
 * bốn phía, hướng nắng, số xe. Trường nào không có trong kiểu trả về thì không có đường nào đi
 * tới lời dẫn — chặn bằng CẤU TRÚC, không bằng lời nhắc. `perspective-fields.test.ts` canh thêm
 * chiều ngược lại: những cụm cấm không bao giờ xuất hiện trong chuỗi đã ghép.
 *
 * Tệp thuần: không `fetch`, không kho, không CSDL.
 */

import type { AiBriefDigest, AiFacadeConcept, AiFloorPlan } from '@nvg/shared/design';
import { toPt } from '../draw/geometry';

/** Lối vào nằm đâu trên mặt tiền, nhìn từ ngoài đường vào. */
export type Side = 'left' | 'centre' | 'right';

/** Nắng chiếu vào nhà từ phía nào, so với người đứng ngoài đường nhìn vào. */
export type SunFrom = 'front' | 'left' | 'right' | 'back' | 'unknown';

/** Giờ chụp của một góc — quyết định mặt trời đứng ở đâu. */
export type SunTime = 'morning' | 'midday' | 'afternoon';

export interface PerspectiveContext {
  /** Mã loại công trình của đầu bài — `nha_pho`, `biet_thu`, `nha_vuon`. */
  buildingType: string;
  storeys: number;
  /** Bề rộng mặt tiền khối xây, mét, một chữ số thập phân. */
  frontWidthM: number;
  /** Chiều sâu nhà đo từ mặt tiền vào trong, mét. */
  depthM: number;
  /** Chiều cao từ vỉa hè tới đỉnh tường chắn mái, mét. */
  heightM: number;
  mainDoorSide: Side | null;
  garageSide: Side | null;
  /** Bề rộng cửa chính, mét. Gara 2,4 m và gara 5 m không được ra cùng một câu (T68). */
  mainDoorWidthM: number | null;
  garageWidthM: number | null;
  /** Ban công trên mặt tiền: bề rộng thật và tầng nào — rỗng là không có. */
  balconies: Array<{ widthM: number; level: number }>;
  /** Chiều cao lan can, mét. Có trong `elevation.railing_h_cm` nhưng trước T68 không ai đọc. */
  railingHM: number | null;
  /** Chiều cao thông thuỷ từng tầng, mét, từ dưới lên. Tổng đã có ở `heightM`. */
  levelHeightsM: number[];
  /** Cốt sàn tầng 1 cao hơn vỉa hè bao nhiêu mét — chiều cao bậc tam cấp. */
  stepUpM: number;
  /** Kích thước thửa đất, mét. Đầu bài không khai đủ thì `null`. */
  lot: { widthM: number; depthM: number } | null;
  /**
   * Khoảng sân bốn mặt, mét, đo từ ranh đất tới mặt ngoài khối nhà.
   *
   * Đo THẲNG từ toạ độ mặt bằng: `siteGeometry` đặt gốc thửa tại (0,0) và `buildableFromDigest`
   * mới cộng khoảng lùi vào, nên toạ độ trong `plan` là toạ độ thửa tuyệt đối. Trước T68 con số
   * này bị `facade/frame.ts` thu thành một bit `frontYard`, và lượt chạy thật 20/09/2026 vẽ sân
   * trước 8–10 m trong khi đầu bài khai 3 m.
   */
  yard: { frontM: number; backM: number; leftM: number; rightM: number } | null;
  /** Hiện trạng hai bên và phía sau, mã của `kb/site_context.yaml`. Không khai thì `null`. */
  neighbours: { left: string | null; right: string | null; back: string | null };
  /**
   * Mã hướng nhà của đầu bài (`B`, `BD`, `D`…) — giữ NGUYÊN, không quy sẵn ra hướng nắng.
   *
   * Nắng đến từ đâu phụ thuộc GIỜ CHỤP, mà mỗi góc chụp một giờ khác nhau: cùng một ngôi nhà
   * hướng nam thì ảnh buổi sáng nắng bên phải còn ảnh cận cảnh buổi chiều nắng bên trái. Quy sẵn
   * một lần ở đây là đóng đinh một giờ cho cả bộ và dựng bóng đổ sai ở ba góc.
   */
  orientation: string | null;
  cars: number | null;
  motorbikes: number | null;
}

/** Một mét bằng bao nhiêu centimet — hợp đồng đo bằng cm, lời dẫn nói bằng mét. */
const CM_PER_M = 100;

/**
 * Rút ngữ cảnh. `plan` cho chiều sâu (tờ mặt đứng không có), `concept` cho lối vào và chiều cao,
 * `digest` cho hiện trạng thửa đất và số xe.
 */
export function perspectiveContext(
  digest: AiBriefDigest,
  plan: AiFloorPlan,
  concept: AiFacadeConcept,
): PerspectiveContext {
  const elevation = concept.elevation;
  const levels = [...elevation.levels].sort((a, b) => a.level - b.level);
  const top = levels[levels.length - 1];
  // Đỉnh tường chắn mái so với vỉa hè. `ground_z` âm (vỉa hè thấp hơn sàn tầng 1), nên trừ đi là
  // CỘNG thêm phần bậc tam cấp — đúng chiều người đứng ngoài đường nhìn lên.
  const roofZ = top ? top.z + top.h : 0;
  const heightCm = roofZ + (elevation.parapet ?? 0) - elevation.ground_z;
  const door = widestOf(concept, 'door');
  const garage = widestOf(concept, 'garage');
  const lot =
    typeof digest.site.width_m === 'number' && typeof digest.site.depth_m === 'number'
      ? { widthM: round1(digest.site.width_m), depthM: round1(digest.site.depth_m) }
      : null;

  return {
    buildingType: digest.building_type,
    storeys: levels.length,
    frontWidthM: round1(elevation.width / CM_PER_M),
    depthM: round1(planDepthCm(plan) / CM_PER_M),
    heightM: round1(heightCm / CM_PER_M),
    mainDoorSide: sideOf(door, elevation.width),
    garageSide: sideOf(garage, elevation.width),
    mainDoorWidthM: door ? round1(door.w / CM_PER_M) : null,
    garageWidthM: garage ? round1(garage.w / CM_PER_M) : null,
    balconies: (concept.balconies ?? []).map((b) => ({
      widthM: round1(Math.abs(b.x1 - b.x0) / CM_PER_M),
      level: b.level,
    })),
    railingHM:
      typeof elevation.railing_h_cm === 'number' ? round1(elevation.railing_h_cm / CM_PER_M) : null,
    levelHeightsM: levels.map((l) => round1(l.h / CM_PER_M)),
    // `ground_z` âm khi vỉa hè thấp hơn sàn tầng 1, nên đổi dấu là ra chiều cao bậc tam cấp.
    stepUpM: round1(Math.max(0, -elevation.ground_z) / CM_PER_M),
    lot,
    yard: yardOf(plan, lot),
    neighbours: {
      left: digest.site.adjacent?.left ?? null,
      right: digest.site.adjacent?.right ?? null,
      back: digest.site.adjacent?.back ?? null,
    },
    orientation: digest.site.orientation ?? null,
    cars: digest.parking?.cars ?? null,
    motorbikes: digest.parking?.motorbikes ?? null,
  };
}

/**
 * Chiều sâu nhà = khoảng cách từ mép trước tới mép sau của hình bao, hợp mọi tầng.
 *
 * Đường nằm ở phía `y` nhỏ (hợp đồng `design-brief`), nên đây là hiệu `y` lớn nhất trừ `y` nhỏ
 * nhất. Lấy hợp mọi tầng chứ không riêng tầng 1: nhà có tầng lửng lùi vào hay tầng trên đua ra
 * thì chiều sâu nhìn từ trên cao là của khối lớn nhất.
 */
function planBboxCm(plan: AiFloorPlan): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const level of plan.levels) {
    for (const point of level.outline) {
      const [x, y] = toPt(point);
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return Number.isFinite(x0) && Number.isFinite(y1) ? { x0, y0, x1, y1 } : null;
}

/**
 * Khoảng sân bốn mặt, đo từ ranh thửa tới mặt ngoài khối nhà.
 *
 * Gốc toạ độ mặt bằng là góc TRƯỚC-TRÁI thửa (hợp đồng `ai_floor_plan`), đường ở phía `y` nhỏ.
 * Nên sân trước = `y0` của hình bao, sân trái = `x0`, còn hai mặt kia phải biết thửa rộng và sâu
 * bao nhiêu — không khai thì trả `null` cả cụm chứ không điền 0. Một số 0 bịa ở đây thành «nhà
 * xây sát ranh sau» trong ảnh trên cao, sai theo kiểu không ai kiểm lại được.
 *
 * `Math.max(0, …)` giữ số không âm: khối nhà đua ra ngoài ranh là dữ liệu hỏng ở bước trước, và
 * một khoảng sân âm in vào lời dẫn thì mô hình đọc thành chữ vô nghĩa.
 */
function yardOf(
  plan: AiFloorPlan,
  lot: { widthM: number; depthM: number } | null,
): { frontM: number; backM: number; leftM: number; rightM: number } | null {
  const box = planBboxCm(plan);
  if (!box || !lot) return null;
  return {
    frontM: round1(Math.max(0, box.y0) / CM_PER_M),
    leftM: round1(Math.max(0, box.x0) / CM_PER_M),
    backM: round1(Math.max(0, lot.depthM * CM_PER_M - box.y1) / CM_PER_M),
    rightM: round1(Math.max(0, lot.widthM * CM_PER_M - box.x1) / CM_PER_M),
  };
}

function planDepthCm(plan: AiFloorPlan): number {
  let min = Infinity;
  let max = -Infinity;
  for (const level of plan.levels) {
    for (const point of level.outline) {
      const [, y] = toPt(point);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
}

/** Lỗ mở rộng nhất thuộc một loại, ở tầng thấp nhất có loại ấy — cùng phép chọn với `mainDoorOf`. */
function widestOf(
  concept: AiFacadeConcept,
  kind: 'door' | 'garage',
): AiFacadeConcept['openings_front'][number] | null {
  const all = concept.openings_front.filter((o) => o.kind === kind);
  if (!all.length) return null;
  const lowest = Math.min(...all.map((o) => o.level));
  return all.filter((o) => o.level === lowest).sort((a, b) => b.w - a.w || a.x - b.x)[0] ?? null;
}

/**
 * Lỗ mở nằm bên trái, giữa hay bên phải mặt tiền — chia mặt tiền làm ba phần bằng nhau theo TÂM
 * lỗ mở.
 *
 * Chia theo tâm chứ không theo mép trái: một cửa để xe rộng 3,6 m trên mặt tiền 5 m có mép trái ở
 * phần bên trái mà thực tế chiếm gần hết mặt tiền, và gọi nó là «bên trái» thì ảnh vẽ ra một
 * khoảng tường không tồn tại ở bên phải.
 */
function sideOf(
  opening: AiFacadeConcept['openings_front'][number] | null,
  width: number,
): Side | null {
  if (!opening || width <= 0) return null;
  const ratio = (opening.x + opening.w / 2) / width;
  if (ratio < 1 / 3) return 'left';
  if (ratio > 2 / 3) return 'right';
  return 'centre';
}

/** Góc phương vị của mặt tiền, độ, tính theo chiều kim đồng hồ từ hướng bắc. */
const FACADE_AZIMUTH: Record<string, number> = {
  B: 0,
  BD: 45,
  D: 90,
  DN: 135,
  N: 180,
  TN: 225,
  T: 270,
  TB: 315,
};

/** Góc phương vị của mặt trời theo giờ chụp. Trưa ở Việt Nam mặt trời gần đỉnh, hơi chếch nam. */
const SUN_AZIMUTH: Record<SunTime, number> = {
  morning: 90,
  midday: 180,
  afternoon: 270,
};

/**
 * Hướng nhà + giờ chụp → nắng đến từ phía nào, nói theo mắt NGƯỜI ĐỨNG NGOÀI ĐƯỜNG nhìn vào.
 *
 * Phép suy, viết ra vì rất dễ nhầm chiều: người xem quay lưng ra đường, nhìn theo hướng ngược với
 * hướng nhà. Tay phải của người ấy chỉ về phương vị `hướng_nhà − 90°`. Nắng nằm bên phải khi mặt
 * trời lệch khỏi phương ấy dưới 45°, bên trái khi lệch trên 135°, còn lại thì nắng ở trước hay sau
 * mặt tiền tuỳ mặt trời cùng phía hay ngược phía với pháp tuyến mặt tiền.
 *
 * Thử lại bằng tay cho nhà hướng nam chụp buổi sáng: người xem nhìn về phía bắc, tay phải chỉ
 * hướng đông, mặt trời buổi sáng ở đông → nắng bên PHẢI. Cùng ngôi nhà ấy chụp buổi chiều thì mặt
 * trời ở tây → nắng bên TRÁI. Đó chính là chỗ một bảng tra cố định sẽ sai.
 *
 * `null` (đầu bài không khai hướng) trả `unknown`: lời dẫn nói ánh sáng chung, KHÔNG đoán một
 * hướng nắng rồi dựng bóng đổ sai suốt cả bộ năm ảnh.
 */
export function sunFrom(orientation: string | null, time: SunTime): SunFrom {
  const facade = orientation === null ? undefined : FACADE_AZIMUTH[orientation];
  if (facade === undefined) return 'unknown';
  const sun = SUN_AZIMUTH[time];

  // Mặt trời so với PHÁP TUYẾN mặt tiền: gần 0° là nắng chiếu thẳng vào mặt, gần 180° là mặt tiền
  // nằm trong bóng.
  const toNormal = Math.abs(signed(sun - facade));
  if (toNormal <= 45) return 'front';
  if (toNormal >= 135) return 'back';

  // Còn lại là nắng xiên — hỏi tiếp nó xiên từ bên nào, bằng cách so với tay phải người xem.
  return Math.abs(signed(sun - (facade - 90))) < 90 ? 'right' : 'left';
}

/** Đưa một góc về khoảng (−180, 180]. */
function signed(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Một chữ số thập phân — cùng cách hồ sơ NVG ghi số đo. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
