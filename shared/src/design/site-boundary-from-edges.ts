/**
 * Dựng ranh giới thửa đất từ một danh sách CẠNH có cấu trúc (chiều dài + góc quay) — bước
 * tất định đứng sau kết quả Gemini đọc ảnh trích lục/sổ đỏ (`SiteBoundaryExtraction`,
 * `contracts/site-boundary-extraction.schema.json`).
 *
 * ## Vì sao tệp này tồn tại — nguyên tắc bất biến số 2 (CLAUDE.md 8.2)
 *
 * "Mô hình ngôn ngữ không bao giờ sinh toạ độ hay kích thước. Nó sinh CẤU TRÚC; bộ giải gán
 * số." Gemini đọc ảnh ra danh sách cạnh (chiều dài đọc/đo được, góc quay nếu ảnh có ghi) —
 * KHÔNG được trả thẳng mảng `[x, y]`. Hàm THUẦN, TẤT ĐỊNH này mới là chỗ gán toạ độ: đi bộ
 * theo từng cạnh, cùng một danh sách cạnh luôn ra đúng một ranh giới.
 *
 * ## Vì sao được phép nằm ở `shared/` (Worker), không vi phạm "vị từ hình học chỉ cài
 * Container" (CLAUDE.md 8.7)
 *
 * Giống hệt lý lẽ đã ghi trong doc-comment của `site-geometry.ts`: hàm này không đánh giá
 * quy tắc/ngưỡng quy chuẩn nào ("cạnh này có đủ dài không") — nó chỉ gán toạ độ tất định từ
 * một cấu trúc đã cho. Vị từ hình học (đủ mặt thoáng, đủ khoảng lùi…) vẫn cài đúng một nơi:
 * Container.
 *
 * ## Góc thiếu — dự phòng có căn cứ, không phải đoán mù
 *
 * Ảnh trích lục thật thường KHÔNG ghi số đo góc, chỉ ghi chiều dài cạnh. Góc thiếu
 * (`turnDeg: null`) chia đều phần dư `(360 − Σ góc đã biết) / số góc thiếu`. Khi MỌI góc đều
 * thiếu, phép chia đó tự nhiên rơi về đa giác đều `360/n` — không cần một nhánh code riêng
 * cho trường hợp "ảnh vẽ tay không ghi góc".
 *
 * ## Không tự sửa khi các góc đã biết mâu thuẫn nhau
 *
 * Nếu tổng các góc ĐÃ BIẾT (không phải góc suy ra) đã lệch 360°, hàm KHÔNG tự nắn lại — âm
 * thầm sửa số liệu người dùng có thể đối chiếu với thực địa là sai nguyên tắc. Nó chỉ trả
 * `closureErrorM`/`closureErrorDeg` để lớp gọi cảnh báo.
 */

import { signedArea, type Point } from './site-geometry';

export interface EdgeSpec {
  /** Chiều dài cạnh, mét. Phải dương. */
  readonly lengthM: number;
  /** Góc quay NGOÀI sang cạnh kế tiếp, độ, dương = quay trái. `null` = chưa biết. */
  readonly turnDeg: number | null;
}

export interface PolygonFromEdgesResult {
  /** Ranh giới đã chuẩn hoá CCW, làm tròn milimét — dùng thẳng cho `site.boundary_m`. */
  readonly boundaryM: Point[];
  /** Chỉ số các cạnh dùng góc SUY RA (chia đều phần dư), không phải góc đọc được từ ảnh. */
  readonly assumedAngleIndices: number[];
  /** Khoảng cách từ điểm cuối phép đi bộ tới điểm đầu, trước khi bỏ đỉnh cuối trùng lặp. */
  readonly closureErrorM: number;
  /** `|360 − tổng góc quay đã gán|`, độ. */
  readonly closureErrorDeg: number;
}

export class PolygonFromEdgesError extends Error {
  readonly retryable = false;
}

/** Làm tròn về milimét — cùng độ chính xác với `site-geometry.ts`, giữ kết quả tất định. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Đi bộ theo danh sách cạnh, đặt cạnh 0 dọc trục +x tại gốc (đúng quy ước "x dọc mặt tiền"
 * của `site-geometry.ts`), trả về ranh giới đã chuẩn hoá CCW.
 */
export function polygonFromEdges(edges: readonly EdgeSpec[]): PolygonFromEdgesResult {
  if (edges.length < 3) {
    throw new PolygonFromEdgesError('Cần ít nhất ba cạnh để dựng được ranh giới thửa đất.');
  }
  if (edges.length > 24) {
    throw new PolygonFromEdgesError('Không dựng được ranh giới quá 24 cạnh.');
  }
  for (const edge of edges) {
    if (!(edge.lengthM > 0)) {
      throw new PolygonFromEdgesError('Có cạnh khai chiều dài không dương — kiểm tra lại số đo.');
    }
  }

  const knownTurns = edges.map((e) => e.turnDeg).filter((t): t is number => t !== null);
  const knownSum = knownTurns.reduce((s, t) => s + t, 0);
  const nullCount = edges.length - knownTurns.length;
  const fallbackTurn = nullCount > 0 ? (360 - knownSum) / nullCount : 0;

  const assumedAngleIndices: number[] = [];
  const points: Point[] = [];
  let x = 0;
  let y = 0;
  let heading = 0; // độ, 0 = dọc trục +x

  for (let i = 0; i < edges.length; i++) {
    points.push([round(x), round(y)]);
    const edge = edges[i]!;
    const rad = (heading * Math.PI) / 180;
    x += edge.lengthM * Math.cos(rad);
    y += edge.lengthM * Math.sin(rad);
    if (edge.turnDeg === null) assumedAngleIndices.push(i);
    heading += edge.turnDeg ?? fallbackTurn;
  }

  const closureErrorM = round(Math.hypot(x - points[0]![0], y - points[0]![1]));
  const closureErrorDeg = round(Math.abs(360 - (knownSum + nullCount * fallbackTurn)));

  const boundaryM = signedArea(points) < 0 ? [...points].reverse() : points;

  return { boundaryM, assumedAngleIndices, closureErrorM, closureErrorDeg };
}
