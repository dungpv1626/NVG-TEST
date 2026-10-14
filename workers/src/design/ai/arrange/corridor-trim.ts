/**
 * Thu hẹp hành lang quá rộng (T104, Haan chấm lượt b1543b8c: «phần giao thông đang tốn quá nhiều diện tích, hoàn
 * toàn có thể giảm độ rộng phần giao thông và tăng diện tích các phòng còn lại» — chọn hướng (a): phần dư chia cho
 * các phòng bên kia hành lang, ô thang giữ nguyên).
 *
 * Vì sao: lưới bản phác ~1 m mỗi ô, hành lang tối thiểu làm tròn lên 2 ô ≈ 2 m; chương trình giữ nguyên bề dày ấy.
 * Ở đây hành lang là một phần của chuỗi cắt cùng trục chạy NGANG bề rộng của nó: bề rộng vượt `maxCentre` thì dời
 * vách chung với cụm kề KHÔNG chứa ô cố định (thang, thang máy, giếng trời) — cụm ấy giãn ra, mọi vách bên trong
 * nó giãn theo tỉ lệ. Cả hai cụm kề đều tự do thì cụm ở đầu toạ độ nhỏ nhận. Hàm THUẦN.
 */

import type { Rect } from '../draw/geometry';
import { chain, leaves, MODULE_CM, type Axis, type Placed } from './placed';

export interface CorridorTrimInput {
  isCorridor: (id: string) => boolean;
  /** Ô cố định (thang, thang máy, giếng trời) — cụm chứa nó không nhận phần dư. */
  isFixed: (id: string) => boolean;
  /** Bề rộng tối đa của hành lang theo tim tường, cm. */
  maxCentre: number;
  /** Đoạn vách chung tối thiểu để mở cửa giữa hành lang và một phòng, cm. */
  doorContact: (hallId: string, otherId: string) => number;
  /** Diện tích tối đa của nghề cho một lá, m² — bên nhận phần dư không được vượt (T160). Vắng = không xét. */
  maxAreaM2?: (id: string) => number | null;
}

/** Hành lang chỉ thu hẹp khi là một DẢI: dài ít nhất chừng này lần bề rộng mới (mẩu sảnh thì không đụng). */
export const CORRIDOR_STRIP_RATIO = 3;
const STRIP_RATIO = CORRIDOR_STRIP_RATIO;

const lo = (r: Rect, axis: Axis) => (axis === 'x' ? r.x0 : r.y0);
const hi = (r: Rect, axis: Axis) => (axis === 'x' ? r.x1 : r.y1);
const along = (r: Rect, axis: Axis) => hi(r, axis) - lo(r, axis);
const across = (r: Rect, axis: Axis) => (axis === 'x' ? r.y1 - r.y0 : r.x1 - r.x0);

/** Giãn một cây con theo trục từ [from, to] sang [nFrom, nTo]; vách bên trong dời theo tỉ lệ, làm tròn mô-đun. */
export function stretch(
  node: Placed,
  axis: Axis,
  from: number,
  to: number,
  nFrom: number,
  nTo: number,
): Placed {
  const map = (v: number) => {
    if (v === from) return nFrom;
    if (v === to) return nTo;
    const t = nFrom + ((v - from) * (nTo - nFrom)) / Math.max(1, to - from);
    return Math.round(t / MODULE_CM) * MODULE_CM;
  };
  const rect = (r: Rect): Rect =>
    axis === 'x' ? { ...r, x0: map(r.x0), x1: map(r.x1) } : { ...r, y0: map(r.y0), y1: map(r.y1) };
  if (node.kind === 'leaf') return { ...node, rect: rect(node.rect) };
  return {
    ...node,
    rect: rect(node.rect),
    at: node.axis === axis ? map(node.at) : node.at,
    a: stretch(node.a, axis, from, to, nFrom, nTo),
    b: stretch(node.b, axis, from, to, nFrom, nTo),
  };
}

export function trimCorridors(
  placed: Placed,
  input: CorridorTrimInput,
): { placed: Placed; trimmed: { id: string; from: number; to: number }[] } {
  const trimmed: { id: string; from: number; to: number }[] = [];
  const flat = (node: Placed, axis: Axis): Placed[] =>
    node.kind === 'cut' && node.axis === axis
      ? [...flat(node.a, axis), ...flat(node.b, axis)]
      : [node];
  const free = (node: Placed) => !leaves(node).some((cell) => input.isFixed(cell.id));
  const all = leaves(placed);
  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  /**
   * Một hành lang: một lá hành lang, hoặc (T160) một chồng lá hành lang nối tiếp nhau dọc chiều dài — cắt theo trục kia.
   * Phương án d084a46e tầng 1: mô hình vẽ hành lang 1,84 m thành hai ô `circulation_4` + `circulation_1` nên bước thu
   * hẹp không nhận ra dải.
   */
  const isHall = (node: Placed, axis: Axis): boolean =>
    node.kind === 'leaf'
      ? input.isCorridor(node.id)
      : node.axis !== axis && leaves(node).every((cell) => input.isCorridor(cell.id));
  const hallIds = (node: Placed) => new Set(leaves(node).map((cell) => cell.id));
  const hallName = (node: Placed) =>
    leaves(node)
      .map((cell) => cell.id)
      .join('+');
  /** Phòng chạm ĐẦU NGẮN của hành lang còn đủ chỗ mở cửa sau khi hành lang còn [n0, n1] theo trục. */
  const endsKept = (hall: Placed, axis: Axis, n0: number, n1: number) => {
    const r = hall.rect;
    const own = hallIds(hall);
    const first = leaves(hall)[0]!.id;
    return all.every((cell) => {
      if (own.has(cell.id)) return true;
      const o = cell.rect;
      const atEnd =
        axis === 'x'
          ? Math.abs(o.y1 - r.y0) <= 1 || Math.abs(o.y0 - r.y1) <= 1
          : Math.abs(o.x1 - r.x0) <= 1 || Math.abs(o.x0 - r.x1) <= 1;
      if (!atEnd) return true;
      const [c0, c1] = axis === 'x' ? [o.x0, o.x1] : [o.y0, o.y1];
      const need = input.doorContact(first, cell.id);
      const before = overlap(lo(r, axis), hi(r, axis), c0, c1);
      return before < need || overlap(n0, n1, c0, c1) >= need;
    });
  };

  /** Tổng chiều dài cạnh của các ô NGOÀI khối `box` nằm trên đường `coord` (trục `axis`) và chạm khối — vách nối dài. */
  const continued = (box: Rect, axis: Axis, coord: number): number => {
    let total = 0;
    for (const cell of all) {
      const o = cell.rect;
      const inside =
        o.x0 >= box.x0 - 1 && o.x1 <= box.x1 + 1 && o.y0 >= box.y0 - 1 && o.y1 <= box.y1 + 1;
      if (inside) continue;
      const onLine = Math.abs(lo(o, axis) - coord) <= 15 || Math.abs(hi(o, axis) - coord) <= 15;
      const touches =
        axis === 'x'
          ? Math.abs(o.y1 - box.y0) <= 15 || Math.abs(o.y0 - box.y1) <= 15
          : Math.abs(o.x1 - box.x0) <= 15 || Math.abs(o.x0 - box.x1) <= 15;
      if (onLine && touches) total += across(o, axis);
    }
    return total;
  };

  const overflows = (neighbour: Placed, axis: Axis, delta: number): boolean => {
    if (neighbour.kind !== 'leaf') return false;
    const max = input.maxAreaM2?.(neighbour.id) ?? null;
    if (max === null) return false;
    return ((along(neighbour.rect, axis) + delta) * across(neighbour.rect, axis)) / 10_000 > max;
  };

  const walk = (node: Placed): Placed => {
    if (node.kind === 'leaf') return node;
    const axis = node.axis;
    const original = flat(node, axis);
    const parts = original.map(walk);
    let changed = parts.some((part, i) => part !== original[i]);
    for (let i = 0; i < parts.length; i += 1) {
      const hall = parts[i]!;
      if (!isHall(hall, axis)) continue;
      const width = along(hall.rect, axis);
      // Hành lang chạy NGANG trục chuỗi (cạnh dài theo trục kia) và rộng quá mức.
      if (width <= input.maxCentre || width >= across(hall.rect, axis)) continue;
      const delta = Math.floor((width - input.maxCentre) / MODULE_CM) * MODULE_CM;
      if (delta <= 0 || across(hall.rect, axis) < STRIP_RATIO * (width - delta)) continue;
      const h0 = lo(hall.rect, axis);
      const h1 = hi(hall.rect, axis);
      const before =
        i > 0 && free(parts[i - 1]!) && endsKept(hall, axis, h0 + delta, h1) ? i - 1 : -1;
      const after =
        i + 1 < parts.length && free(parts[i + 1]!) && endsKept(hall, axis, h0, h1 - delta)
          ? i + 1
          : -1;
      // Cả hai bên nhận được: chọn bên mà vách bị dời ít nối thẳng hàng với vách ngoài khối nhất (T160 — d084a46e tầng 1:
      // trả cho cột phòng ngủ làm vách lệch 30 cm so với vách gara / phòng ngủ phía trước, trả cho kho thì không).
      // Phòng nhận mà vượt diện tích tối đa của nghề thì thôi (kho 8,75 → 10,2 m² > 10).
      const fits = (k: number) => !overflows(parts[k]!, axis, delta);
      const pick =
        before >= 0 && after >= 0
          ? continued(node.rect, axis, h1) < continued(node.rect, axis, h0) && fits(after)
            ? after
            : before
          : before >= 0
            ? before
            : after;
      if (pick < 0) continue;
      const neighbour = parts[pick]!;
      const r = neighbour.rect;
      if (pick < i) {
        parts[pick] = stretch(
          neighbour,
          axis,
          lo(r, axis),
          hi(r, axis),
          lo(r, axis),
          hi(r, axis) + delta,
        );
        parts[i] = stretch(hall, axis, h0, h1, h0 + delta, h1);
      } else {
        parts[pick] = stretch(
          neighbour,
          axis,
          lo(r, axis),
          hi(r, axis),
          lo(r, axis) - delta,
          hi(r, axis),
        );
        parts[i] = stretch(hall, axis, h0, h1, h0, h1 - delta);
      }
      trimmed.push({ id: hallName(hall), from: width, to: width - delta });
      changed = true;
    }
    return changed ? chain(node.rect, axis, parts) : node;
  };
  return { placed: walk(placed), trimmed };
}
