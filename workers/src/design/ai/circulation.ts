/**
 * Đường đi trong nhà: mấy cửa, mấy mét (T48, 16/09/2026).
 *
 * Bộ chấm cũ chỉ biết «có tới được không» (`reachableFrom`) và «mấy phòng trung gian» (`roomsBetween`).
 * Haan chấm lượt đo 58d9ff66: «từ phòng khách mà đi vệ sinh thì phải đi vòng vèo mới đến được». Câu ấy
 * cần một con số, và con số ấy là quãng đường thật — tâm phòng → cửa → tâm phòng, cộng dồn.
 *
 * Dùng chung ĐÚNG đồ thị của bộ kiểm (`planGraph`): một bản thực thi, nên «tới được» và «đi mấy mét»
 * không bao giờ nói ngược nhau. Hàm THUẦN, tất định — hàng đợi sắp theo (mét, mã phòng).
 */

import type { PlanGraph } from './plan-check';

export interface RouteInfo {
  /** Số cửa phải mở trên đường ngắn nhất. */
  doors: number;
  /** Quãng đường đi bộ, mét — tâm phòng tới tâm phòng, vòng qua từng cửa. */
  metres: number;
  /** Các phòng đi qua, kể cả hai đầu. */
  via: string[];
}

export interface RouteOptions {
  /** Phòng KHÔNG được đi qua (gara, sảnh ngoài). Phòng ở hai đầu vẫn tính. */
  forbidden?: ReadonlySet<string>;
}

/** Quãng đường quy đổi khi lên một tầng — chiều dài một vế thang thường gặp, m. */
const STOREY_WALK_M = 6;

/**
 * Đường ngắn nhất theo MÉT từ một tập phòng xuất phát tới mọi phòng khác.
 *
 * Thang nối hai tầng cộng thêm chiều dài một vế — cầu thang là quãng đường thật, và không cộng thì một
 * WC ở tầng trên trông gần hơn WC cùng tầng.
 */
export function routesFrom(
  graph: PlanGraph,
  from: readonly string[],
  options: RouteOptions = {},
): Map<string, RouteInfo> {
  const forbidden = options.forbidden ?? new Set<string>();
  const best = new Map<string, RouteInfo>();
  const queue: { room: string; info: RouteInfo }[] = [];
  for (const room of [...from].sort()) {
    if (forbidden.has(room)) continue;
    queue.push({ room, info: { doors: 0, metres: 0, via: [room] } });
  }

  const edges = edgeLengths(graph);
  while (queue.length) {
    queue.sort((p, q) => p.info.metres - q.info.metres || p.room.localeCompare(q.room));
    const current = queue.shift()!;
    const seen = best.get(current.room);
    if (seen && seen.metres <= current.info.metres) continue;
    best.set(current.room, current.info);
    for (const next of [...(graph.neighbours.get(current.room) ?? [])].sort()) {
      if (forbidden.has(next)) continue;
      const step = edges.get(edgeKey(current.room, next));
      if (step === undefined) continue;
      const info: RouteInfo = {
        doors: current.info.doors + 1,
        metres: current.info.metres + step,
        via: [...current.info.via, next],
      };
      const known = best.get(next);
      if (!known || known.metres > info.metres) queue.push({ room: next, info });
    }
  }
  return best;
}

/** Quãng đường qua từng cạnh của đồ thị, mét. */
function edgeLengths(graph: PlanGraph): Map<string, number> {
  const out = new Map<string, number>();
  const put = (a: string, b: string, metres: number): void => {
    const key = edgeKey(a, b);
    const known = out.get(key);
    if (known === undefined || known > metres) out.set(key, metres);
  };
  for (const door of graph.doors) {
    for (const a of door.rooms) {
      for (const b of door.rooms) {
        if (a === b) continue;
        const from = graph.centres.get(a);
        const to = graph.centres.get(b);
        if (!from || !to) continue;
        put(a, b, (distance(from, door.at) + distance(door.at, to)) / 100);
      }
    }
  }
  // Cạnh còn lại của đồ thị là nối hai tầng qua ô thang: cộng thêm một vế thang.
  for (const [room, neighbours] of graph.neighbours) {
    for (const next of neighbours) {
      const key = edgeKey(room, next);
      if (out.has(key)) continue;
      const here = graph.rooms.get(room);
      const there = graph.rooms.get(next);
      const climb = here && there ? Math.abs(here.level - there.level) : 1;
      const from = graph.centres.get(room);
      const to = graph.centres.get(next);
      const flat = from && to ? distance(from, to) / 100 : 0;
      out.set(key, flat + climb * STOREY_WALK_M);
    }
  }
  return out;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function distance(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
