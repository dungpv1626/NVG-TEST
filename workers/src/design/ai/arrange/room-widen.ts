/**
 * Nới phòng hẹp hơn mức nghề (T113, Haan chấm lượt 182665ea; mục 3 của phương án nâng điểm đã duyệt 03/10/2026).
 *
 * Vì sao: lưới bản phác ~1 m mỗi ô, nên mô hình vẽ WC một ô — lọt lòng 0,92–0,98 m, dưới mức kinh nghiệm 1,25 m
 * (`rules/nvg-experience.yaml`). Bộ xếp giữ nguyên bề ngang ấy, nên phương án nào cũng mất trọn B1. Đối xứng với
 * `corridor-trim.ts`: phòng là một phần của chuỗi cắt cùng trục chạy NGANG bề hẹp của nó; bề hẹp dưới mức thì dời
 * vách chung với cụm kề KHÔNG chứa ô cố định (thang, thang máy, giếng trời) — cụm ấy co lại, mọi vách bên trong nó
 * co theo tỉ lệ — miễn mọi phòng trong cụm ấy vẫn còn ít nhất mức NGHỀ của nó theo trục ấy (không thì một phòng hẹp
 * mới thay cho phòng cũ). Cụm ở đầu toạ độ nhỏ được thử trước. Hàm THUẦN.
 */

import { stretch } from './corridor-trim';
import { chain, leaves, MODULE_CM, type Axis, type Placed } from './placed';
import type { Rect } from '../draw/geometry';

export interface RoomWidenInput {
  /** Bề hẹp tối thiểu theo tim tường của phòng, cm; `null` = loại phòng không có mức. */
  minCentre: (id: string) => number | null;
  /** Ô cố định (thang, thang máy, giếng trời) — cụm chứa nó không nhường. */
  isFixed: (id: string) => boolean;
}

const lo = (r: Rect, axis: Axis) => (axis === 'x' ? r.x0 : r.y0);
const hi = (r: Rect, axis: Axis) => (axis === 'x' ? r.x1 : r.y1);
const along = (r: Rect, axis: Axis) => hi(r, axis) - lo(r, axis);
const across = (r: Rect, axis: Axis) => (axis === 'x' ? r.y1 - r.y0 : r.x1 - r.x0);

export function widenRooms(
  placed: Placed,
  input: RoomWidenInput,
): { placed: Placed; widened: { id: string; from: number; to: number }[] } {
  const widened: { id: string; from: number; to: number }[] = [];
  const flat = (node: Placed, axis: Axis): Placed[] =>
    node.kind === 'cut' && node.axis === axis
      ? [...flat(node.a, axis), ...flat(node.b, axis)]
      : [node];
  /** Cụm co từ [from, to] về [nFrom, nTo] mà mọi phòng trong nó còn đủ mức theo trục — trả cụm đã co. */
  const shrunk = (node: Placed, axis: Axis, nFrom: number, nTo: number): Placed | null => {
    if (leaves(node).some((cell) => input.isFixed(cell.id))) return null;
    const next = stretch(node, axis, lo(node.rect, axis), hi(node.rect, axis), nFrom, nTo);
    const ok = leaves(next).every((cell) => {
      const need = input.minCentre(cell.id);
      const size = along(cell.rect, axis);
      // Chỉ xét phòng mà trục này là bề HẸP — bề dài co một chút không làm phòng hẹp đi.
      return need === null || size >= across(cell.rect, axis) || size >= need;
    });
    return ok ? next : null;
  };

  const walk = (node: Placed): Placed => {
    if (node.kind === 'leaf') return node;
    const axis = node.axis;
    const original = flat(node, axis);
    const parts = original.map(walk);
    let changed = parts.some((part, i) => part !== original[i]);
    for (let i = 0; i < parts.length; i += 1) {
      const room = parts[i]!;
      if (room.kind !== 'leaf') continue;
      const need = input.minCentre(room.id);
      const width = along(room.rect, axis);
      // Phòng có bề HẸP chạy theo trục chuỗi và hẹp hơn mức.
      if (need === null || width >= need || width > across(room.rect, axis)) continue;
      const delta = Math.ceil((need - width) / MODULE_CM) * MODULE_CM;
      for (const pick of [i - 1, i + 1]) {
        if (pick < 0 || pick >= parts.length) continue;
        const neighbour = parts[pick]!;
        const r = neighbour.rect;
        const next =
          pick < i
            ? shrunk(neighbour, axis, lo(r, axis), hi(r, axis) - delta)
            : shrunk(neighbour, axis, lo(r, axis) + delta, hi(r, axis));
        if (!next) continue;
        parts[pick] = next;
        parts[i] = {
          ...room,
          rect:
            pick < i
              ? axis === 'x'
                ? { ...room.rect, x0: room.rect.x0 - delta }
                : { ...room.rect, y0: room.rect.y0 - delta }
              : axis === 'x'
                ? { ...room.rect, x1: room.rect.x1 + delta }
                : { ...room.rect, y1: room.rect.y1 + delta },
        };
        widened.push({ id: room.id, from: width, to: width + delta });
        changed = true;
        break;
      }
    }
    return changed ? chain(node.rect, axis, parts) : node;
  };
  return { placed: walk(placed), widened };
}
