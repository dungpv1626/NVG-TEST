/**
 * Hình học phẳng dùng chung cho bộ vẽ và bộ kiểm — toạ độ XĂNG-TI-MÉT THẬT, chưa đổi sang
 * giấy (hợp đồng `ai-floor-plan`: gốc góc trước-trái, x sang phải, y vào sâu).
 *
 * Cố ý đơn giản: chữ nhật cùng phương trục và đoạn thẳng, không có phép toán boolean đa giác.
 * Phòng ở phiên bản này là chữ nhật (phòng chữ L khai thành hai phòng của chương trình), nên
 * mọi thứ bộ vẽ cần đều nằm trong vài phép trên khoảng và trên hình chiếu.
 */

export type Pt = [number, number];

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Điểm của hợp đồng (`[x, y]`) đưa về bộ đôi.
 *
 * Thiếu toạ độ thì lấy 0 thay vì ném: schema đã bảo đảm đủ hai số, và một tờ vẽ lệch về gốc
 * toạ độ vẫn nói được nhiều hơn một lỗi máy chủ. Đây là chỗ duy nhất trong bộ vẽ đọc mảng thô.
 */
export function toPt(values: readonly number[]): Pt {
  return [values[0] ?? 0, values[1] ?? 0];
}

/** Chữ nhật của hợp đồng (`[x0, y0, x1, y1]`) đưa về dạng đã sắp: x0 < x1, y0 < y1. */
export function toRect(values: readonly number[]): Rect {
  const a = values[0] ?? 0;
  const b = values[1] ?? 0;
  const c = values[2] ?? 0;
  const d = values[3] ?? 0;
  return { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
}

export function rectWidth(r: Rect): number {
  return r.x1 - r.x0;
}

export function rectHeight(r: Rect): number {
  return r.y1 - r.y0;
}

export function rectArea(r: Rect): number {
  return rectWidth(r) * rectHeight(r);
}

export function rectCentre(r: Rect): Pt {
  return [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
}

/** Diện tích phần giao nhau. 0 khi chỉ chạm nhau theo cạnh — chạm không phải chồng. */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

export function rectContainsRect(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return (
    inner.x0 >= outer.x0 - tolerance &&
    inner.y0 >= outer.y0 - tolerance &&
    inner.x1 <= outer.x1 + tolerance &&
    inner.y1 <= outer.y1 + tolerance
  );
}

export function bboxOfPoints(points: readonly Pt[]): Rect {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Điểm nằm trong đa giác kín — phép bắn tia, biên tính là TRONG trong phạm vi dung sai. */
export function pointInPolygon(point: Pt, polygon: readonly Pt[], tolerance = 0): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const here = polygon[i] ?? [0, 0];
    const previous = polygon[j] ?? [0, 0];
    const [xi, yi] = here;
    const [xj, yj] = previous;
    if (distanceToSegment(point, here, previous) <= tolerance) return true;
    const crosses = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Véc-tơ đơn vị dọc đoạn `a → b`. Đoạn suy biến trả `[1, 0]` để không sinh NaN vào tờ vẽ. */
export function unitAlong(a: Pt, b: Pt): Pt {
  const length = distance(a, b);
  if (length === 0) return [1, 0];
  return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
}

/** Pháp tuyến trái của véc-tơ đơn vị (quay 90° theo chiều +x → +y). */
export function normalOf(unit: Pt): Pt {
  return [-unit[1], unit[0]];
}

export function along(origin: Pt, unit: Pt, distanceCm: number): Pt {
  return [origin[0] + unit[0] * distanceCm, origin[1] + unit[1] * distanceCm];
}

export function addVec(p: Pt, v: Pt, factor = 1): Pt {
  return [p[0] + v[0] * factor, p[1] + v[1] * factor];
}

export interface Interval {
  from: number;
  to: number;
}

/**
 * Phần còn lại của `[0, total]` sau khi trừ các khoảng `holes` — cách cắt lỗ mở khỏi tường.
 *
 * Trừ trên KHOẢNG chứ không trừ đa giác: tường là chữ nhật dọc tim, lỗ mở là một dải cắt ngang
 * hết bề dày, nên bài toán chỉ có một chiều. Phép trừ đa giác cho cùng kết quả với gấp mấy
 * chục lần lượng mã và một lớp lỗi mới (số học dấu phẩy động ở đỉnh chung).
 *
 * Khoan dung theo đúng nghĩa của bộ vẽ: khoảng lòi ra ngoài bị kẹp, khoảng lộn đầu được sắp
 * lại. Dữ liệu đã qua schema thì không bao giờ làm hàm này ném.
 */
export function subtractIntervals(total: number, holes: readonly Interval[]): Interval[] {
  const clipped = holes
    .map(({ from, to }) => ({
      from: Math.max(0, Math.min(total, Math.min(from, to))),
      to: Math.max(0, Math.min(total, Math.max(from, to))),
    }))
    .filter((h) => h.to > h.from)
    .sort((a, b) => a.from - b.from);

  const out: Interval[] = [];
  let cursor = 0;
  for (const hole of clipped) {
    if (hole.from > cursor) out.push({ from: cursor, to: hole.from });
    cursor = Math.max(cursor, hole.to);
  }
  if (cursor < total) out.push({ from: cursor, to: total });
  return out;
}

/** Hai khoảng có phần chung dài hơn `tolerance` hay không. */
export function intervalsOverlap(a: Interval, b: Interval, tolerance = 0): boolean {
  return Math.min(a.to, b.to) - Math.max(a.from, b.from) > tolerance;
}

/**
 * Phần đoạn thẳng `a→b` NẰM TRONG một tứ giác lồi, trả về theo tham số t ∈ [0, 1].
 *
 * Dùng để xoá nét: chỗ mặt tường này chạy xuyên vào ruột bức tường kia thì không được vẽ, nếu
 * không mỗi ngã ba sẽ có hai gạch nhỏ đâm qua mặt bức chính. Đây là khác biệt giữa một bản vẽ
 * và một hình ghép từ các hộp chữ nhật.
 *
 * Thuật toán Cyrus–Beck: cắt dần đoạn bằng bốn nửa mặt phẳng của tứ giác. `eps` co tứ giác vào
 * một chút, nên hai mặt tường TRÙNG NHAU (vách mỏng ăn vào tường dày cùng một mặt phẳng) không
 * bị coi là nằm trong nhau — đó là nét thật, phải giữ.
 *
 * `null` khi đoạn không có phần nào bên trong.
 */
export function clipSegmentByQuad(a: Pt, b: Pt, quad: readonly Pt[], eps = 0): Interval | null {
  if (quad.length < 3) return null;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return null;

  // Tâm để suy chiều pháp tuyến NGOÀI của từng cạnh — không giả định thứ tự đỉnh cùng chiều
  // kim đồng hồ hay ngược, vì tứ giác tường dựng từ pháp tuyến trái và có thể lật cả hai chiều.
  let cx = 0;
  let cy = 0;
  for (const point of quad) {
    cx += point[0] / quad.length;
    cy += point[1] / quad.length;
  }

  let enter = 0;
  let exit = 1;
  for (let i = 0; i < quad.length; i += 1) {
    const p1 = quad[i]!;
    const p2 = quad[(i + 1) % quad.length]!;
    let nx = -(p2[1] - p1[1]);
    let ny = p2[0] - p1[0];
    const length = Math.hypot(nx, ny);
    if (length === 0) continue;
    nx /= length;
    ny /= length;
    // Lật cho pháp tuyến chỉ ra NGOÀI (ra xa tâm).
    if (nx * (cx - p1[0]) + ny * (cy - p1[1]) > 0) {
      nx = -nx;
      ny = -ny;
    }
    const denom = nx * dx + ny * dy;
    const numer = nx * (a[0] - p1[0]) + ny * (a[1] - p1[1]) + eps;
    if (Math.abs(denom) < 1e-12) {
      if (numer > 0) return null; // song song và nằm hẳn ngoài cạnh này
      continue;
    }
    const t = -numer / denom;
    if (denom > 0) exit = Math.min(exit, t);
    else enter = Math.max(enter, t);
    if (enter >= exit) return null;
  }
  if (enter >= exit) return null;
  return { from: enter, to: exit };
}
