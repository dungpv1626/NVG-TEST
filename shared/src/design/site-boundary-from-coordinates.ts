/**
 * Dựng ranh giới thửa đất từ một bảng TOẠ ĐỘ ĐỈNH đã chép nguyên văn — bước tất định đứng sau
 * kết quả Gemini đọc ảnh trích lục/sổ đỏ (`SiteBoundaryExtraction.vertex_coordinates`,
 * `contracts/site-boundary-extraction.schema.json`).
 *
 * ## Vì sao tách khỏi `polygonFromEdges` (`site-boundary-from-edges.ts`)
 *
 * Nhiều trích lục/sổ đỏ in kèm một bảng "BẢNG KÊ TOẠ ĐỘ" — số liệu đo đạc chính xác cho từng
 * đỉnh, khác hẳn hình vẽ sơ đồ (chỉ minh hoạ, thường không đúng tỷ lệ). Khi bảng này có mặt,
 * Gemini chỉ cần CHÉP NGUYÊN VĂN từng số — một việc đọc chữ số, không phải ước lượng hình học.
 * Đi qua `polygonFromEdges` (chiều dài + góc quay, góc thiếu chia đều) vẫn đúng nguyên tắc bất
 * biến 2 nhưng làm mất thông tin: từ toạ độ ta có VỊ TRÍ TUYỆT ĐỐI của từng đỉnh, quy về
 * chiều dài/góc rồi lại suy ngược ra toạ độ là một vòng chuyển đổi thừa, và với hình LÕM (góc
 * quay âm xen giữa các góc dương) mà bảng không ghi số đo góc, bước chia đều ở
 * `polygonFromEdges` sẽ phá đúng chỗ lõm đó. Hàm này dùng thẳng toạ độ đã có — không có bước
 * nào phải suy đoán.
 *
 * ## Vì sao được phép nằm ở `shared/` (Worker), không vi phạm "vị từ hình học chỉ cài
 * Container" (CLAUDE.md 8.7)
 *
 * Cùng lý lẽ với `site-boundary-from-edges.ts`: không đánh giá quy tắc/ngưỡng quy chuẩn nào,
 * chỉ tịnh tiến một tập toạ độ đã cho về gốc cục bộ.
 */

import { signedArea, type Point } from './site-geometry';
import type { PolygonFromEdgesResult } from './site-boundary-from-edges';

export interface VertexCoordinateSpec {
  /** Số hiệu góc thửa đúng như ghi trong bảng — quyết định thứ tự đi vòng ranh giới. */
  readonly index: number;
  readonly x: number;
  readonly y: number;
}

export class PolygonFromCoordinatesError extends Error {
  readonly retryable = false;
}

/** Làm tròn về milimét — cùng độ chính xác với `site-boundary-from-edges.ts`. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Đỉnh cuối trùng đỉnh đầu (bảng tự khép vòng, ví dụ hàng 11 chép lại hàng 1) coi là một. */
const CLOSING_DUPLICATE_EPSILON_M = 0.05;

/**
 * Dựng ranh giới thửa đất trực tiếp từ bảng toạ độ đã chép — sắp theo `index`, tịnh tiến đỉnh
 * đầu về gốc, chuẩn hoá chiều CCW. Không có khái niệm "góc suy ra": kết quả luôn khớp tuyệt
 * đối với bảng số đã cho, nên `assumedAngleIndices` luôn rỗng và độ lệch khép kín luôn bằng 0.
 */
export function polygonFromCoordinates(
  vertices: readonly VertexCoordinateSpec[],
): PolygonFromEdgesResult {
  if (vertices.length < 3) {
    throw new PolygonFromCoordinatesError('Cần ít nhất ba đỉnh để dựng được ranh giới thửa đất.');
  }

  const sorted = [...vertices].sort((a, b) => a.index - b.index);

  let points: Point[] = sorted.map((v) => [v.x, v.y]);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (Math.hypot(last[0] - first[0], last[1] - first[1]) < CLOSING_DUPLICATE_EPSILON_M) {
    points = points.slice(0, -1);
  }

  if (points.length < 3) {
    throw new PolygonFromCoordinatesError('Cần ít nhất ba đỉnh để dựng được ranh giới thửa đất.');
  }
  if (points.length > 24) {
    throw new PolygonFromCoordinatesError('Không dựng được ranh giới quá 24 đỉnh.');
  }

  const [ox, oy] = points[0]!;
  const translated: Point[] = points.map(([x, y]) => [round(x - ox), round(y - oy)]);

  const boundaryM = signedArea(translated) < 0 ? [...translated].reverse() : translated;

  return { boundaryM, assumedAngleIndices: [], closureErrorM: 0, closureErrorDeg: 0 };
}
