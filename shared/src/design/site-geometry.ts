/**
 * Hình học thửa đất — từ kích thước khai trong đầu bài ra ranh giới và ô đất xây được.
 *
 * ## Vì sao tệp này tồn tại
 *
 * Đầu bài trước 29/08/2026 mô tả thửa đất bằng đúng hai số: rộng và sâu. Điều đó ngầm khẳng
 * định mọi thửa là hình chữ nhật, và nó sai với phần lớn thửa đất thật — tứ giác có mặt tiền
 * rộng hơn mặt hậu là dạng phổ biến, chưa kể ngũ giác ở lô góc. Hậu quả không nổ ra thành lỗi:
 * bộ giải nhận một khu đất RỘNG HƠN thực tế, xếp phòng kín ô chữ nhật ảo đó, và bản vẽ ra
 * trông hợp lệ cho tới lúc ai đó chồng nó lên trích lục.
 *
 * ## Hệ toạ độ
 *
 * Cục bộ, không phải toạ độ địa chính: **x chạy dọc mặt tiền, y đi vào chiều sâu**, gốc ở góc
 * trước-trái, đường nằm ở `y = 0`. Đây cũng là hệ mà bộ giải CP-SAT làm việc.
 *
 * ## Ranh giới cài đặt — đọc trước khi thêm hàm
 *
 * CLAUDE.md 8.7: "Vị từ hình học chỉ cài đặt MỘT nơi: Container." Tệp này KHÔNG vi phạm điều
 * đó, và lý do đáng ghi lại:
 *
 *  · Nó không đánh giá quy tắc nào ("hành lang này có đủ 0,9 m không") — đó vẫn là việc của
 *    Container.
 *  · Nó suy ra **đầu vào** của bộ giải: ô chữ nhật xây được. Worker tính một lần rồi gửi
 *    `site: { width_m, depth_m }` sang Container y như trước, nên Container KHÔNG bao giờ
 *    nhìn thấy đa giác và không có bản cài đặt thứ hai nào để lệch.
 *
 * Đổi lại là một giới hạn phải nói thẳng: **bộ giải vẫn làm việc trên hình chữ nhật.** Phần
 * đất ngoài hình chữ nhật nội tiếp không được xếp phòng. `unusedM2` đo đúng phần đó để giao
 * diện nói ra, thay vì để người dùng tự phát hiện.
 */

import type { DesignBrief } from './design-brief.generated';

export type SiteShape = 'chu_nhat' | 'hinh_thang' | 'da_giac';

export type Point = readonly [number, number];

export interface BuildableRect {
  /** Góc trái-trước của ô chữ nhật, trong hệ toạ độ của thửa. */
  readonly xM: number;
  readonly yM: number;
  readonly widthM: number;
  readonly depthM: number;
}

export interface SiteGeometry {
  readonly shape: SiteShape;
  /** Ranh giới thửa, đi ngược chiều kim đồng hồ, không lặp đỉnh đầu ở cuối. */
  readonly boundary: Point[];
  /** Diện tích THẬT của thửa (công thức dây giày) — không phải diện tích hình bao. */
  readonly areaM2: number;
  /** Hình bao chữ nhật của thửa. */
  readonly bboxWidthM: number;
  readonly bboxDepthM: number;
  /** Chiều rộng mặt tiền — cạnh giáp đường. */
  readonly frontageM: number;
  /** Ô chữ nhật lớn nhất nằm gọn trong thửa; bộ giải làm việc trên đúng ô này. */
  readonly buildable: BuildableRect;
  /** Phần đất nằm ngoài ô chữ nhật đó. `0` với thửa hình chữ nhật. */
  readonly unusedM2: number;
  /**
   * `true` khi ô chữ nhật là lớn nhất một cách CHẮC CHẮN (chữ nhật, hình thang).
   *
   * Với đa giác bất kỳ, phép tìm chỉ xét các cạnh cắt qua đỉnh nên kết quả **luôn nằm gọn
   * trong thửa** nhưng có thể nhỏ hơn ô lớn nhất thật. Sai về phía an toàn là sai đúng
   * hướng: không bao giờ hứa nhiều đất hơn thực có.
   */
  readonly exact: boolean;
}

export class SiteGeometryError extends Error {
  readonly retryable = false;
}

const EPSILON = 1e-9;

/** Làm tròn về milimét — đủ cho mọi phép đo trên thực địa, và giữ kết quả tất định. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Diện tích có dấu theo công thức dây giày. Dương = đỉnh đi ngược chiều kim đồng hồ. */
export function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function polygonArea(points: readonly Point[]): number {
  return Math.abs(signedArea(points));
}

/** Điểm nằm trong hay trên biên đa giác — phép bắn tia, có xử lý điểm nằm đúng trên cạnh. */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;

    // Nằm đúng trên cạnh thì tính là TRONG: ô chữ nhật chạm biên thửa là hợp lệ, và đẩy nó
    // ra ngoài sẽ khiến thửa hình chữ nhật không tìm được ô nào bằng chính nó.
    const cross = (xj - xi) * (py - yi) - (yj - yi) * (px - xi);
    const withinX = px >= Math.min(xi, xj) - EPSILON && px <= Math.max(xi, xj) + EPSILON;
    const withinY = py >= Math.min(yi, yj) - EPSILON && py <= Math.max(yi, yj) + EPSILON;
    if (Math.abs(cross) < 1e-7 && withinX && withinY) return true;

    if (yi > py !== yj > py) {
      const x = ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

/** Hai đoạn thẳng có cắt nhau ở phần trong của cả hai không (chạm đầu mút không tính). */
function segmentsCrossStrictly(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = d(a1, a2, b1);
  const d2 = d(a1, a2, b2);
  const d3 = d(b1, b2, a1);
  const d4 = d(b1, b2, a2);
  return (
    ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
    ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
  );
}

/**
 * Hình chữ nhật có nằm gọn trong đa giác không.
 *
 * BA điều kiện, và điều kiện thứ ba là chỗ dễ bỏ sót nhất — nó đã bị bỏ sót thật trong bản
 * đầu của tệp này. Lấy một hình chữ nhật bị khoét một rãnh hình chữ V ở giữa cạnh trên:
 *
 *  · Bốn góc của ô chữ nhật lớn nhất **đều** nằm trong đa giác (chúng là đỉnh của nó).
 *  · Không cạnh nào của đa giác **cắt ngang** cạnh nào của ô: hai cạnh rãnh chỉ CHẠM cạnh
 *    trên rồi đi vào trong, mà chạm thì không phải cắt.
 *
 * Nên hai phép kiểm đầu đều nói "nằm gọn", trong khi cả cái rãnh nằm ngoài thửa. Thứ phát
 * hiện được nó là **đỉnh lõm nằm hẳn bên trong ô** — đây chính là mũi rãnh.
 */
function rectInsidePolygon(rect: BuildableRect, polygon: readonly Point[]): boolean {
  const { xM: x, yM: y, widthM: w, depthM: d } = rect;
  const corners: Point[] = [
    [x, y],
    [x + w, y],
    [x + w, y + d],
    [x, y + d],
  ];
  if (!corners.every((c) => pointInPolygon(c, polygon))) return false;
  if (!pointInPolygon([x + w / 2, y + d / 2], polygon)) return false;

  // (1) Không đỉnh nào của đa giác nằm hẳn trong lòng ô. Đỉnh nằm trên biên ô thì được —
  // thửa hình chữ nhật có đủ bốn đỉnh nằm trên biên ô lớn nhất của chính nó.
  for (const [px, py] of polygon) {
    if (px > x + EPSILON && px < x + w - EPSILON && py > y + EPSILON && py < y + d - EPSILON) {
      return false;
    }
  }

  // (2) Không cạnh nào của đa giác cắt ngang cạnh nào của ô — bắt trường hợp một cạnh xuyên
  // thẳng qua ô mà không để lại đỉnh nào bên trong.
  for (let i = 0; i < polygon.length; i++) {
    const e1 = polygon[i]!;
    const e2 = polygon[(i + 1) % polygon.length]!;
    for (let k = 0; k < 4; k++) {
      if (segmentsCrossStrictly(corners[k]!, corners[(k + 1) % 4]!, e1, e2)) return false;
    }
  }
  return true;
}

/**
 * Ô chữ nhật (song song trục) lớn nhất nằm trong đa giác.
 *
 * Ứng viên cho mỗi cạnh lấy từ toạ độ các đỉnh: bài toán tổng quát không giải được bằng công
 * thức đóng, và một lưới mịn thì vừa chậm vừa cho kết quả đổi theo độ mịn — mà mã băm artifact
 * đòi cùng đầu vào phải ra cùng kết quả. Ứng viên theo đỉnh giữ được tính tất định đó.
 *
 * Số đỉnh bị hợp đồng chặn ở 24 nên số ô phải thử tối đa ~ (24²/2)² ≈ 83 nghìn, mỗi ô kiểm
 * với ≤ 24 cạnh. Chạy vài mili giây, và không phụ thuộc kích thước thửa.
 */
export function largestInscribedRect(polygon: readonly Point[]): BuildableRect {
  const xs = [...new Set(polygon.map((p) => p[0]))].sort((a, b) => a - b);
  const ys = [...new Set(polygon.map((p) => p[1]))].sort((a, b) => a - b);

  let best: BuildableRect = { xM: 0, yM: 0, widthM: 0, depthM: 0 };
  let bestArea = 0;

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const width = xs[j]! - xs[i]!;
      if (width <= EPSILON) continue;
      for (let k = 0; k < ys.length - 1; k++) {
        for (let l = k + 1; l < ys.length; l++) {
          const depth = ys[l]! - ys[k]!;
          if (depth <= EPSILON || width * depth <= bestArea) continue;
          const rect: BuildableRect = { xM: xs[i]!, yM: ys[k]!, widthM: width, depthM: depth };
          if (rectInsidePolygon(rect, polygon)) {
            best = rect;
            bestArea = width * depth;
          }
        }
      }
    }
  }
  return best;
}

/** Ranh giới suy ra từ ba dạng khai báo. Luôn đi ngược chiều kim đồng hồ. */
function boundaryOf(site: DesignBrief['site'], shape: SiteShape): Point[] {
  const width = site.width_m;
  const depth = site.depth_m;

  if (shape === 'da_giac') {
    const raw = site.boundary_m;
    if (!raw || raw.length < 3) {
      throw new SiteGeometryError(
        'Thửa đất khai là đa giác nhưng chưa có ranh giới. Nhập ít nhất ba đỉnh, hoặc chọn lại hình thửa.',
      );
    }
    const points: Point[] = raw.map((p) => [p[0]!, p[1]!] as Point);
    if (polygonArea(points) <= EPSILON) {
      throw new SiteGeometryError(
        'Ranh giới thửa đất không tạo thành một hình có diện tích. Kiểm tra lại toạ độ các đỉnh.',
      );
    }
    // Chuẩn hoá chiều đi để `signedArea` dương — mọi phép sau đó không phải quan tâm chiều nữa.
    return signedArea(points) < 0 ? [...points].reverse() : points;
  }

  if (shape === 'hinh_thang') {
    const rear = site.rear_width_m ?? width;
    // Hai cạnh bên đối xứng qua trục giữa. Đây là GIẢ ĐỊNH, ghi rõ trong hợp đồng: thửa lệch
    // hẳn một bên thì khai bằng `da_giac`, không phải cố ép vào đây.
    const offset = (width - rear) / 2;
    return [
      [0, 0],
      [width, 0],
      [width - offset, depth],
      [offset, depth],
    ];
  }

  return [
    [0, 0],
    [width, 0],
    [width, depth],
    [0, depth],
  ];
}

/**
 * Mọi thứ suy ra được từ phần `site` của đầu bài.
 *
 * Hàm THUẦN và tất định: cùng đầu bài luôn ra cùng kết quả, điều kiện để mã băm artifact có
 * nghĩa. Ném `SiteGeometryError` khi khai báo tự mâu thuẫn — sai ở đây phải dừng, vì mọi con
 * số phía sau đều dựng trên nó.
 */
export function siteGeometry(site: DesignBrief['site']): SiteGeometry {
  const shape: SiteShape = (site.shape as SiteShape | null | undefined) ?? 'chu_nhat';
  const boundary = boundaryOf(site, shape);

  const xs = boundary.map((p) => p[0]);
  const ys = boundary.map((p) => p[1]);
  const bboxWidthM = round(Math.max(...xs) - Math.min(...xs));
  const bboxDepthM = round(Math.max(...ys) - Math.min(...ys));

  const areaM2 = round(polygonArea(boundary));

  // Mặt tiền: với đa giác là cạnh đỉnh 0 → đỉnh 1 (hợp đồng khai vậy), với hai dạng còn lại
  // đúng bằng `width_m`. Không đọc `width_m` cho đa giác — hai nguồn nói khác nhau thì con
  // số hiện trên màn hình sẽ không khớp hình vẽ.
  const frontageM =
    shape === 'da_giac'
      ? round(Math.hypot(boundary[1]![0] - boundary[0]![0], boundary[1]![1] - boundary[0]![1]))
      : round(site.width_m);

  let buildable: BuildableRect;
  let exact: boolean;
  if (shape === 'chu_nhat') {
    buildable = { xM: 0, yM: 0, widthM: round(site.width_m), depthM: round(site.depth_m) };
    exact = true;
  } else if (shape === 'hinh_thang') {
    // Ô lớn nhất của một hình thang cân song song trục: rộng bằng cạnh NGẮN hơn, sâu hết thửa.
    // Đây là kết quả đóng, không cần dò — nên `exact`.
    const rear = site.rear_width_m ?? site.width_m;
    const narrow = Math.min(site.width_m, rear);
    buildable = {
      xM: round((site.width_m - narrow) / 2),
      yM: 0,
      widthM: round(narrow),
      depthM: round(site.depth_m),
    };
    exact = true;
  } else {
    const found = largestInscribedRect(boundary);
    buildable = {
      xM: round(found.xM),
      yM: round(found.yM),
      widthM: round(found.widthM),
      depthM: round(found.depthM),
    };
    exact = false;
  }

  if (buildable.widthM <= 0 || buildable.depthM <= 0) {
    throw new SiteGeometryError(
      'Không tìm được phần đất hình chữ nhật nào bên trong ranh giới đã khai. Kiểm tra lại toạ độ các đỉnh.',
    );
  }

  return {
    shape,
    boundary,
    areaM2,
    bboxWidthM,
    bboxDepthM,
    frontageM,
    buildable,
    unusedM2: round(Math.max(0, areaM2 - buildable.widthM * buildable.depthM)),
    exact,
  };
}
