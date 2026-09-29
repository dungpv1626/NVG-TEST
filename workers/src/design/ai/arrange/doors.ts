/**
 * Cửa, phòng ghép và thang cho cây bộ giải vừa dựng — TÔPÔ, không toạ độ (T43).
 *
 * `ai/tree/openings.ts` vẫn là nơi đặt cửa lên vách (bề rộng, vị trí, chiều mở, cửa sổ) và vẫn là lưới
 * an toàn. Tệp này chỉ quyết CỬA NỐI PHÒNG NÀO VỚI PHÒNG NÀO, theo đúng luật đi xuyên
 * (`kb/room_vocabulary.yaml` mục `passage`):
 *
 *  1. cửa chính ở phòng mô hình chọn (`entry_room`), cửa xe ở chỗ để xe;
 *  2. các phòng đi xuyên được (hành lang, thang, khách, ăn) nối với nhau thành một cây khung, xuất
 *     phát từ cửa chính (tầng 1) hoặc ô thang (tầng trên);
 *  3. mỗi phòng ngõ cụt đúng MỘT lối vào, từ phòng kề đã tới được: phòng đi xuyên được, hoặc loại mà
 *     `served_from` cho phép (kho mở từ bếp) — theo thứ tự `door_hosts`, ưu tiên cặp ý định khai
 *     «cạnh nhau»;
 *  4. phòng khép kín mở vào phòng mẹ; ban công mở từ phòng mẹ hoặc phòng kề.
 *
 * Phòng không có lối vào hợp lệ nào thì KHÔNG bịa cửa đi xuyên phòng riêng — nó thành lý do
 * `arrange_no_hub_wall`, và ứng viên đứng sau những ứng viên không có lý do nào.
 */

import { opensFromStair } from '../../kb/vocabulary';
import type { AiPlanTree } from '@nvg/shared/design';
import type { Rect } from '../draw/geometry';
import type { PlanIssue } from '../plan-check';
import { arrangeIssue } from './issues';
import type { LevelIntent } from './intent';
import type { PackLeaf } from './pack';
import { sharedEdge } from './placed';

type Door = AiPlanTree['doors'][number];
type StairUp = NonNullable<AiPlanTree['stair']>['up'];

export interface DoorsInput {
  level: number;
  isTop: boolean;
  cells: readonly { id: string; rect: Rect }[];
  leafById: ReadonlyMap<string, PackLeaf>;
  intent: LevelIntent;
  /** Loại phòng được mở thêm cửa vào, theo thứ tự ưu tiên (`door_hosts`). */
  doorHosts: readonly string[];
  doorShared: (a: PackLeaf, b: PackLeaf) => number;
  /** Tầng 1: đầu bài có khai mặt lối vào chính không — cần cửa người đi khi cửa chính là gara. */
  mainEntranceDeclared: boolean;
  /** Chiều đi lên của thang tầng dưới (tầng trên dùng lại). */
  stairUp: StairUp | null;
  stairIds: ReadonlySet<string>;
  /** Loại phòng thuộc nhóm giao thông — hai phòng cùng nhóm nối nhau bằng ô thông, không cánh. */
  circulation: ReadonlySet<string>;
  /**
   * Hai phòng cùng nhóm này kề nhau thì ô thông chạy SUỐT vách chung — không vẽ vách ngăn giữa phòng
   * khách và lối đi (`passage.open_flow`, T96). Vắng = chỉ ô thông rộng cửa như trước.
   */
  openFlow?: ReadonlySet<string> | null;
  /** Loại phòng ĐƯỢC mở cửa thẳng từ ô thang (`passage.stair_opens_to`, T74). `null` = không kiểm. */
  stairOpensTo: ReadonlySet<string> | null;
  /**
   * Tầng 1: hình bao và cạnh của mặt lối vào chính. Phòng mang cửa chính không chạm cạnh ấy mà một sảnh
   * ngoài kề nó chạm thì cửa chính mở ở sảnh (lượt 58688ead: bản phác vẽ sảnh suốt trước phòng khách).
   */
  mainSide?: { footprint: Rect; side: 'x0' | 'x1' | 'y0' | 'y1' } | null;
}

export interface DoorsResult {
  doors: Door[];
  also: AiPlanTree['also'];
  stair: AiPlanTree['stair'];
  reasons: PlanIssue[];
}

export function deriveDoors(input: DoorsInput): DoorsResult {
  const { intent, leafById } = input;
  const where = `tầng ${input.level}`;
  const rect = new Map(input.cells.map((cell) => [cell.id, cell.rect]));
  const ids = input.cells.map((cell) => cell.id).filter((id) => leafById.has(id));
  const doors: Door[] = [];
  const seen = new Set<string>();
  const reasons: PlanIssue[] = [];
  const reached = new Set<string>();

  const add = (a: string, b: string, kind: Door['kind'], full = false) => {
    const key = b === 'outside' ? `${a}|outside` : [a, b].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    doors.push({ a, b, kind, ...(full ? { full: true } : {}) });
  };
  const shared = (a: string, b: string) => {
    const ra = rect.get(a);
    const rb = rect.get(b);
    const la = leafById.get(a);
    const lb = leafById.get(b);
    if (!ra || !rb || !la || !lb) return false;
    return sharedEdge(ra, rb) >= input.doorShared(la, lb);
  };
  const neighbours = (id: string) =>
    ids
      .filter((other) => other !== id && shared(id, other))
      .sort(
        (p, q) =>
          sharedEdge(rect.get(q)!, rect.get(id)!) - sharedEdge(rect.get(p)!, rect.get(id)!) ||
          p.localeCompare(q),
      );
  const isHub = (id: string) => leafById.get(id)?.role === 'hub';
  const hostRank = (id: string) => {
    const types = leafById.get(id)?.types ?? [];
    const ranks = types.map((type) => input.doorHosts.indexOf(type)).filter((r) => r >= 0);
    return ranks.length ? Math.min(...ranks) : input.doorHosts.length;
  };
  const related = (a: string, b: string, kind: 'adjacent' | 'near') =>
    intent.relations.some(
      (rel) => rel.kind === kind && ((rel.a === a && rel.b === b) || (rel.a === b && rel.b === a)),
    );
  /** Sảnh ngoài kề phòng mang cửa chính, chạm mặt lối vào khi chính phòng ấy không chạm — hoặc `null`. */
  const frontPorch = (entry: string): string | null => {
    const main = input.mainSide;
    const entryRect = rect.get(entry);
    if (!main || !entryRect || entryRect[main.side] === main.footprint[main.side]) return null;
    return (
      ids.find(
        (id) =>
          id !== entry &&
          leafById.get(id)!.types.includes('porch') &&
          rect.get(id)![main.side] === main.footprint[main.side] &&
          shared(id, entry),
      ) ?? null
    );
  };
  /** Hai phòng cùng nhóm giao thông: một đường đi bị vách cắt ngang, nối bằng ô thông (18/09/2026). */
  const bothCirculation = (a: string, b: string) =>
    (leafById.get(a)?.types ?? []).some((type) => input.circulation.has(type)) &&
    (leafById.get(b)?.types ?? []).some((type) => input.circulation.has(type));
  /** Khách / ăn kề lối đi: một không gian, ô thông suốt vách, không vách ngăn (T96). */
  const bothOpenFlow = (a: string, b: string) =>
    !!input.openFlow &&
    (leafById.get(a)?.types ?? []).some((type) => input.openFlow!.has(type)) &&
    (leafById.get(b)?.types ?? []).some((type) => input.openFlow!.has(type));
  /** Ô thang chỉ mở cửa sang giao thông, khu chung (`passage.stair_opens_to`, T74). */
  const mayOpenFromStair = (host: string, room: string) =>
    !input.stairIds.has(host) ||
    opensFromStair(input.stairOpensTo, leafById.get(room)?.types ?? []);
  const isOpening = (a: string, b: string) =>
    intent.openings.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

  // ── 1. Cửa ra ngoài, và điểm xuất phát ─────────────────────────────────────────────────────
  const starts: string[] = [];
  if (input.level === 1) {
    const entry = intent.entryRoom;
    if (entry && leafById.has(entry)) {
      const entryLeaf = leafById.get(entry)!;
      if (entry === intent.garageRoom) {
        add(entry, 'outside', 'garage');
        if (input.mainEntranceDeclared) add(entry, 'outside', 'single');
      } else {
        const porch = frontPorch(entry);
        if (porch) {
          add(porch, 'outside', 'double');
          add(porch, entry, 'double');
          starts.push(porch);
        } else {
          add(
            entry,
            'outside',
            entryLeaf.role === 'hub' || entryLeaf.types.includes('porch') ? 'double' : 'single',
          );
        }
      }
      starts.push(entry);
    }
    if (intent.garageRoom && intent.garageRoom !== entry && leafById.has(intent.garageRoom)) {
      add(intent.garageRoom, 'outside', 'garage');
    }
  } else {
    const stair = ids.find((id) => input.stairIds.has(id));
    if (stair) starts.push(stair);
  }
  for (const start of starts) reached.add(start);

  // ── 2. Cây khung các phòng đi xuyên được ──────────────────────────────────────────────────
  const queue = [...starts];
  while (queue.length) {
    const current = queue.shift()!;
    const currentIsHub = isHub(current);
    for (const next of neighbours(current)
      .filter((id) => isHub(id) && !reached.has(id))
      .sort(
        (p, q) =>
          Number(isOpening(current, q)) - Number(isOpening(current, p)) ||
          hostRank(p) - hostRank(q) ||
          p.localeCompare(q),
      )) {
      // Từ chỗ để xe / sảnh ngoài chỉ vào được phòng đi xuyên được — `passage.entry_through`.
      add(
        current,
        next,
        currentIsHub ? 'opening' : 'single',
        currentIsHub && bothOpenFlow(current, next),
      );
      reached.add(next);
      queue.push(next);
    }
  }

  // Ô thông mô hình khai giữa hai phòng đã tới được mà chưa có cửa.
  for (const [a, b] of intent.openings) {
    if (shared(a, b) && reached.has(a) && reached.has(b)) add(a, b, 'opening');
  }

  // ── 3. Phòng ngõ cụt: đúng một lối vào ────────────────────────────────────────────────────
  const deadEnds = ids.filter((id) => {
    const l = leafById.get(id)!;
    return l.role === 'room' && !l.parent && !reached.has(id);
  });
  let progress = true;
  while (progress) {
    progress = false;
    for (const room of deadEnds) {
      if (reached.has(room)) continue;
      const leaf = leafById.get(room)!;
      const hosts = neighbours(room)
        .filter((id) => reached.has(id) && id !== room)
        .filter((id) => {
          const host = leafById.get(id)!;
          if (host.parent) return false;
          if (!mayOpenFromStair(id, room)) return false;
          if (host.role === 'hub') return true;
          return leaf.hostTypes !== null && host.types.some((type) => leaf.hostTypes!.has(type));
        })
        .sort(
          (p, q) =>
            Number(related(room, q, 'adjacent')) - Number(related(room, p, 'adjacent')) ||
            hostRank(p) - hostRank(q) ||
            sharedEdge(rect.get(q)!, rect.get(room)!) - sharedEdge(rect.get(p)!, rect.get(room)!) ||
            p.localeCompare(q),
        );
      const host = hosts[0];
      if (!host) continue;
      add(host, room, bothCirculation(host, room) ? 'opening' : 'single');
      reached.add(room);
      progress = true;
    }
  }
  for (const room of deadEnds) {
    if (reached.has(room)) continue;
    const touching = neighbours(room);
    // Chỉ còn ô thang (đã tới được) là chỗ mở cửa, mà loại phòng này không được lấy cửa từ ô thang (T74):
    // chỗ sai là bố cục mô hình vẽ — báo bằng mã NGỮ NGHĨA để lượt sửa gửi mô hình kê phòng sát hành lang,
    // thay vì lỗi hình học làm lượt chạy dừng (lượt đo 4a521f52: giặt phơi, WC tầng 2 chỉ giáp ô thang).
    const stair = touching.find(
      (id) => reached.has(id) && input.stairIds.has(id) && !mayOpenFromStair(id, room),
    );
    if (stair) {
      reasons.push({
        code: 'door_from_stair',
        level: 'blocking',
        message: `Phòng "${room}" ở ${where} chỉ giáp ô thang "${stair}" — ô thang là vế bậc, phòng phải vào từ hành lang hay khu sinh hoạt chung.`,
        params: { room, stair },
        ref: room,
      });
      continue;
    }
    reasons.push(
      arrangeIssue(
        'arrange_no_hub_wall',
        `Phòng "${room}" ở ${where} không giáp phòng giao thông hay sinh hoạt chung nào đi tới được để mở cửa (đang giáp: ${touching.join(', ') || 'không phòng nào'}).`,
        { room, zone: leafById.get(room)!.zone, hubs: touching.join(', ') || 'nothing' },
        room,
      ),
    );
  }

  // ── 4. Phòng khép kín, ban công ────────────────────────────────────────────────────────────
  for (const id of ids) {
    const l = leafById.get(id)!;
    if (l.parent) {
      if (shared(id, l.parent)) add(l.parent, id, l.role === 'open' ? 'sliding' : 'single');
      else if (l.role !== 'open' || l.needsOpenFace) {
        reasons.push(
          arrangeIssue(
            'arrange_no_hub_wall',
            `Phòng khép kín "${id}" ở ${where} không chung vách với phòng mẹ "${l.parent}".`,
            { room: id, zone: l.zone, hubs: l.parent },
            id,
          ),
        );
      }
      continue;
    }
    if (l.role === 'open' && l.needsOpenFace && id !== intent.entryRoom) {
      const host = neighbours(id)
        .filter((other) => reached.has(other) && leafById.get(other)!.role !== 'open')
        .sort((p, q) => hostRank(p) - hostRank(q) || p.localeCompare(q))[0];
      if (host) add(host, id, 'sliding');
    }
  }

  const also = intent.leaves
    .filter((leaf) => leaf.merged.length > 0 && leafById.has(leaf.id))
    .map((leaf) => ({ room: leaf.id, with: leaf.merged.slice(0, 2) }));

  const stairId = ids.find((id) => input.stairIds.has(id)) ?? null;
  const stair =
    stairId && !input.isTop
      ? { room: stairId, up: input.stairUp ?? stairDirection(stairId, rect, doors) }
      : null;

  return { doors, also, stair, reasons };
}

/**
 * Chiều đi lên của vế đầu: dọc cạnh DÀI của ô thang, xuất phát từ phía giáp phòng mở cửa vào thang.
 * Không đoán được phía nào thì đi theo chiều dương.
 */
function stairDirection(
  id: string,
  rect: ReadonlyMap<string, Rect>,
  doors: readonly Door[],
): StairUp {
  const r = rect.get(id)!;
  const alongY = r.y1 - r.y0 >= r.x1 - r.x0;
  const host = doors.find((door) => door.a === id || door.b === id);
  const other = host ? rect.get(host.a === id ? host.b : host.a) : undefined;
  if (alongY) return other && other.y0 >= r.y1 ? '-y' : '+y';
  return other && other.x0 >= r.x1 ? '-x' : '+x';
}
