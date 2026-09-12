/**
 * Thuộc tính MẶT cho từng cạnh hình bao của một tầng — `levels[].outline_faces`.
 *
 * Vì sao cần: hợp đồng mặt bằng chỉ phân biệt `walls[].k ∈ {e, p, r}`, trong đó `e` gộp cả
 * tường giáp ngoài trời lẫn tường nằm trên ranh đất. Nên phép đối chiếu mặt thoáng đếm một
 * cửa sổ trên tường ranh là mặt thoáng hợp lệ — một cửa sổ không thể tồn tại — và nó hỏng IM
 * LẶNG: không lỗi, không cảnh báo, chỉ một mặt bằng có phòng ngủ tối trông như đã đạt.
 *
 * Vì sao ở đây mà không hỏi mô hình: hiện trạng bốn phía là KHẢO SÁT (`site.adjacent` +
 * `kb/site_context.yaml`), tức dữ liệu đã có trước lượt gọi đầu tiên. Hỏi mô hình là trả tiền
 * để nó đoán lại thứ ta đã biết, và thêm một cách sai mới.
 *
 * ── Phép suy, và giới hạn của nó ────────────────────────────────────────────────────
 *
 * Mỗi cạnh được xếp về một trong bốn mặt của THỬA theo PHÁP TUYẾN NGOÀI của nó, không theo
 * khoảng cách tới biên thửa: có khoảng lùi thì mặt tiền nhà nằm cách biên vài mét mà vẫn là
 * mặt tiền. Cạnh không song song với trục nào thì trả `unknown` — thà nói không biết hơn là
 * xếp một cạnh vát vào một mặt rồi kết luận về ánh sáng trên đó.
 *
 * Giới hạn đã biết và chấp nhận: phép này KHÔNG xét khoảng lùi còn lại rộng bao nhiêu. Một
 * mặt giáp nhà hàng xóm qua khe lùi 1 m vẫn ra `boundary`, và một mặt giáp ngõ 2 m vẫn ra
 * `open` — đúng theo `kb/site_context.yaml`, nơi câu hỏi "mặt này có lấy được sáng không" đã
 * được trả lời bằng dữ liệu. Lượng sáng thật thì bộ đo trên hồ sơ thật xếp vào mục KHÔNG ĐO
 * ĐƯỢC (phụ thuộc hướng, chiều cao cửa, che chắn).
 *
 * `boundary` cố ý KHÔNG nói tường chung hay tường riêng: Haan chốt 12/09/2026 rằng đó là
 * quyết định của kỹ sư cho từng khách hàng, nên nó không suy được từ hiện trạng.
 */

import type { Face } from '../kb/site-context';
import { distanceToSegment, polygonArea, type Pt } from './draw/geometry';

export type OutlineFace = 'open' | 'boundary' | 'unknown';

/** Cạnh lệch trục quá mức này thì coi là cạnh vát — không xếp về mặt nào. */
const AXIS_TOLERANCE_CM = 1;

/**
 * Mặt của từng cạnh hình bao, cùng thứ tự với `outline`: cạnh i nối điểm i với điểm i+1, cạnh
 * cuối nối về điểm đầu.
 *
 * `openFaces` là kết quả của `siteFaces()` — danh sách mặt thửa lấy được sáng.
 */
export function outlineFaces(outline: readonly Pt[], openFaces: readonly Face[]): OutlineFace[] {
  const winding = polygonArea(outline) >= 0 ? 1 : -1;
  const open = new Set(openFaces);

  return outline.map((from, index) => {
    const to = outline[(index + 1) % outline.length];
    if (!to) return 'unknown';
    const face = faceOf([to[0] - from[0], to[1] - from[1]], winding);
    if (!face) return 'unknown';
    return open.has(face) ? 'open' : 'boundary';
  });
}

/**
 * Mặt thửa mà một cạnh hướng ra, suy từ pháp tuyến ngoài.
 *
 * Đa giác quay ngược chiều kim đồng hồ (diện tích có dấu dương) thì pháp tuyến ngoài của cạnh
 * `d = (dx, dy)` là `(dy, −dx)`; quay xuôi thì đổi dấu. Trục `y` chạy VÀO SÂU thửa, nên pháp
 * tuyến âm theo `y` là hướng ra mặt tiền.
 */
function faceOf(d: Pt, winding: number): Face | null {
  const nx = winding * d[1];
  const ny = winding * -d[0];
  const horizontal = Math.abs(d[1]) <= AXIS_TOLERANCE_CM;
  const vertical = Math.abs(d[0]) <= AXIS_TOLERANCE_CM;
  if (horizontal === vertical) return null; // cạnh vát, hoặc cạnh suy biến
  if (horizontal) return ny < 0 ? 'front' : 'back';
  return nx < 0 ? 'left' : 'right';
}

/**
 * Mặt của cạnh hình bao mà một điểm NẰM TRÊN — `null` khi điểm không thuộc cạnh nào.
 *
 * Dùng để hỏi «bức tường mang cửa sổ này có nằm trên ranh đất không». Điểm đưa vào là điểm
 * giữa ô cửa sổ trên TIM tường, nên `maxDistanceCm` phải là nửa bề dày tường cộng một chút:
 * tim tường bao dày 22 nằm cách biên 11 cm.
 *
 * Quan trọng là nó trả `null` thay vì mặt gần nhất: một bức tường bao quanh giếng trời ở giữa
 * nhà không nằm trên cạnh nào của hình bao, và xếp nó vào cạnh sau gần nhất sẽ biến một cửa sổ
 * giếng trời hợp lệ thành cửa sổ trên tường ranh.
 */
export function faceAtPoint(
  point: Pt,
  outline: readonly Pt[],
  faces: readonly OutlineFace[],
  maxDistanceCm: number,
): OutlineFace | null {
  let best: { distance: number; face: OutlineFace } | null = null;

  for (let index = 0; index < outline.length; index += 1) {
    const from = outline[index];
    const to = outline[(index + 1) % outline.length];
    const face = faces[index];
    if (!from || !to || !face) continue;
    const distance = distanceToSegment(point, from, to);
    if (distance > maxDistanceCm) continue;
    if (!best || distance < best.distance) best = { distance, face };
  }
  return best ? best.face : null;
}
