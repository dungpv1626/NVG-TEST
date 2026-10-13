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

import { stairArrival, stairFits, type StairParams } from '../stair-geometry';
import { mergeKey, opensFromStair } from '../../kb/vocabulary';
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
  /** Gara mang lối vào chính được kèm cửa đi (nhà phố — `ArrangeInput.garageEntry`). Vắng = chỉ cửa cuốn. */
  garageEntry?: boolean;
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
  /**
   * Cặp loại phòng gia chủ muốn TÁCH (khoá `a|b`, T103): nối bằng cửa đi, không ô thông, không bỏ vách.
   */
  openForbidden?: ReadonlySet<string> | null;
  /** Loại phòng ĐƯỢC mở cửa thẳng từ ô thang (`passage.stair_opens_to`, T74). `null` = không kiểm. */
  stairOpensTo: ReadonlySet<string> | null;
  /**
   * Tầng 1: hình bao và cạnh của mặt lối vào chính. Phòng mang cửa chính không chạm cạnh ấy mà một sảnh
   * ngoài kề nó chạm thì cửa chính mở ở sảnh (lượt 58688ead: bản phác vẽ sảnh suốt trước phòng khách).
   */
  mainSide?: { footprint: Rect; side: 'x0' | 'x1' | 'y0' | 'y1' } | null;
  /**
   * Loại thang của lượt và thông số (T105). Có thì lối vào là cạnh sau lưng bậc 1 mà từ đó ô thang đủ chỗ cho loại
   * thang ấy, và ở tầng trên lối ra là phía thang «tới» (`stairArrival`). Vắng = cách cũ (thang U theo cạnh dài).
   */
  stairParams?: StairParams | null;
  /**
   * Tầng 1: cạnh ô thang KHÔNG nên làm lối vào (T161) — bước quay lui của `evaluateHouse` khi tầng trên bị chặn đầu
   * bước ra. Cạnh ấy xếp cuối danh sách thử, không bị cấm: không cạnh nào khác hợp thì vẫn dùng nó.
   */
  stairEntryAvoid?: StairSide | null;
  /** Cạnh phòng thờ bàn thờ dựa lưng (T106) — không mở cửa phòng thờ ở cạnh ấy. Vắng = không ràng buộc. */
  altarBackSide?: StairSide | null;
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

  const add = (
    a: string,
    b: string,
    kind: Door['kind'],
    full = false,
    place: Door['place'] = null,
  ) => {
    // Cửa xe và cửa người ra ngoài của cùng một phòng là hai cửa: gara mang lối vào chính có cả hai (nhánh
    // `entry === garageRoom` bên dưới). Khoá chung từng nuốt cửa đi (lượt e34f8f58, nhà ống 04/10/2026).
    const key =
      b === 'outside'
        ? `${a}|outside|${kind === 'garage' || kind === 'gate' ? 'xe' : 'nguoi'}`
        : [a, b].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    doors.push({ a, b, kind, ...(full ? { full: true } : {}), ...(place ? { place } : {}) });
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
  /** Hai phòng mang cặp loại gia chủ muốn tách (T103). */
  const kept = (a: string, b: string) =>
    !!input.openForbidden &&
    (leafById.get(a)?.types ?? []).some((ta) =>
      (leafById.get(b)?.types ?? []).some((tb) => input.openForbidden!.has(mergeKey(ta, tb))),
    );
  /** Khách / ăn kề lối đi: một không gian, ô thông suốt vách, không vách ngăn (T96). */
  const bothOpenFlow = (a: string, b: string) =>
    !kept(a, b) &&
    !!input.openFlow &&
    (leafById.get(a)?.types ?? []).some((type) => input.openFlow!.has(type)) &&
    (leafById.get(b)?.types ?? []).some((type) => input.openFlow!.has(type));
  /** Ô thang chỉ mở cửa sang giao thông, khu chung (`passage.stair_opens_to`, T74). */
  const mayOpenFromStair = (host: string, room: string) =>
    !input.stairIds.has(host) ||
    opensFromStair(input.stairOpensTo, leafById.get(room)?.types ?? []);
  const isOpening = (a: string, b: string) =>
    intent.openings.some(([p, q]) => (p === a && q === b) || (p === b && q === a));

  /**
   * Thứ tự chọn lối ra của ô thang ở tầng trên (T105): đầu ngắn nơi vế tới trước (cùng đầu với bậc 1 của thang
   * hai vế, theo chiều lên tầng dưới), rồi đầu ngắn kia, rồi cạnh dài; cùng hạng thì cạnh chung dài hơn.
   */
  const stairExitRank = (host: string): number => {
    const stair = [...input.stairIds].find((id) => rect.has(id));
    const r = stair ? rect.get(stair) : undefined;
    const h = rect.get(host);
    if (!r || !h) return 99;
    const side = sideOf(r, h);
    const alongY = r.y1 - r.y0 >= r.x1 - r.x0;
    const shortSides: StairSide[] = alongY ? ['y0', 'y1'] : ['x0', 'x1'];
    const startSide: StairSide | null = input.stairUp
      ? input.stairParams
        ? arrivalSide(input.stairUp, stairArrival(input.stairParams.shape))
        : START_SIDE[input.stairUp]
      : null;
    const tier = side === null ? 3 : side === startSide ? 0 : shortSides.includes(side) ? 1 : 2;
    return tier * 1e6 - sharedEdge(r, h);
  };

  // ── 1. Cửa ra ngoài, và điểm xuất phát ─────────────────────────────────────────────────────
  const starts: string[] = [];
  if (input.level === 1) {
    const entry = intent.entryRoom;
    if (entry && leafById.has(entry)) {
      const entryLeaf = leafById.get(entry)!;
      if (entry === intent.garageRoom) {
        // Gara mang lối vào chính (nhà ống, Haan 04/10/2026 — người vào cạnh xe): cửa cuốn sát một đầu vách,
        // cửa đi sát đầu kia. Đặt giữa thì mặt tiền 5 m còn ~1 m mỗi bên, không bên nào đủ cửa đi.
        const both = input.mainEntranceDeclared && input.garageEntry === true;
        add(entry, 'outside', 'garage', false, both ? 'start' : null);
        if (both) add(entry, 'outside', 'single', false, 'end');
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
    // Ô thang là vế bậc, không phải lối đi (T105, Haan chấm lượt 25fdc90c: «từ thang đi sang phòng giặt phơi
    // kiểu gì?»). Ở sàn tầng, phần ô thang ngoài đầu bậc là vế đang lên cao hay chiếu nghỉ lưng chừng — không
    // bước ngang sang phòng bên kia được. Nên ô thang chỉ là ĐIỂM CUỐI: tới được từ một phòng giao thông, không
    // loang tiếp; ở tầng trên (xuất phát từ thang) chỉ mở MỘT ô, ở đầu vế tới.
    if (input.stairIds.has(current) && !starts.includes(current)) continue;
    let nexts = neighbours(current)
      .filter((id) => isHub(id) && !reached.has(id))
      .sort(
        (p, q) =>
          Number(isOpening(current, q)) - Number(isOpening(current, p)) ||
          hostRank(p) - hostRank(q) ||
          p.localeCompare(q),
      );
    if (input.stairIds.has(current)) {
      nexts = nexts
        .slice()
        .sort((p, q) => stairExitRank(p) - stairExitRank(q))
        .slice(0, 1);
    }
    for (const next of nexts) {
      // Từ chỗ để xe / sảnh ngoài chỉ vào được phòng đi xuyên được — `passage.entry_through`.
      add(
        current,
        next,
        currentIsHub && !kept(current, next) ? 'opening' : 'single',
        currentIsHub && bothOpenFlow(current, next),
      );
      reached.add(next);
      queue.push(next);
    }
  }

  // Ô thông mô hình khai giữa hai phòng đã tới được mà chưa có cửa.
  for (const [a, b] of intent.openings) {
    // Ô thang có đúng một lối vào (T105) — ô thông mô hình khai không mở thêm lối thứ hai.
    if (input.stairIds.has(a) || input.stairIds.has(b)) continue;
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
      // Phòng thờ (T106, sửa T116 — Haan 04/10/2026): ưu tiên phòng chủ KHÔNG nằm ở vách bàn thờ dựa lưng theo hướng
      // gia chủ chọn. Chỉ còn phòng chủ ở vách ấy thì vẫn mở cửa ở đó và bàn thờ chuyển sang một vách đặc khác — CHẶN
      // chỉ khi có cửa / lối đi trên chính vách sau lưng bàn thờ, mà vách bàn thờ là vách chương trình chọn, không cố
      // định. Hướng lệch hướng gia chủ chọn chỉ trừ điểm (chưa có tiêu chí chấm — T116 ghi việc còn mở).
      const altarBack =
        input.altarBackSide && leaf.types.includes('altar_room') ? input.altarBackSide : null;
      const front = altarBack
        ? hosts.filter((id) => sideOf(rect.get(room)!, rect.get(id)!) !== altarBack)
        : hosts;
      const allowed = front.length ? front : hosts;
      const host = allowed[0];
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

  // Phòng giao thông / sinh hoạt chung không tới được (T105): trước đây im lặng, rồi bước dựng cửa mở thêm lối
  // xuyên ô thang để «nối» nó — lượt 25fdc90c, hành lang sau tầng 2 chỉ tới được qua vế bậc. Báo ra để bộ xếp
  // bỏ cây này và thử cây có đường đi thật.
  for (const id of ids) {
    const l = leafById.get(id)!;
    if (l.role !== 'hub' || l.parent || reached.has(id) || input.stairIds.has(id)) continue;
    const touching = neighbours(id);
    reasons.push(
      arrangeIssue(
        'arrange_no_hub_wall',
        `Phòng "${id}" ở ${where} không nối được về lối vào tầng mà không đi xuyên ô thang (đang giáp: ${touching.join(', ') || 'không phòng nào'}).`,
        { room: id, zone: l.zone, hubs: touching.join(', ') || 'nothing' },
        id,
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
  let up: StairUp | null = null;
  if (stairId && !input.isTop) {
    if (input.stairUp) up = input.stairUp;
    else {
      const entry = input.stairParams
        ? shapedStairEntry(
            stairId,
            rect,
            doors,
            reached,
            isHub,
            shared,
            input.stairParams,
            input.stairEntryAvoid ?? null,
          )
        : stairEntry(stairId, rect, doors, reached, isHub, shared);
      up = entry ? entry.up : stairDirection(stairId, rect, doors);
      // Không đầu ngắn nào giáp lối đi: bước ngang vào vế đang lên — bộ xếp bỏ cây này (T105).
      if (entry?.longSide) {
        reasons.push(
          arrangeIssue(
            'stair_entry_long_side',
            `Ô thang "${stairId}" ở ${where} chỉ vào được từ cạnh dài (qua "${entry.longSide}"), ngang vế bậc đang lên — đầu ngắn chỗ bậc 1 không giáp hành lang hay khu chung nào.`,
            { stair: stairId, host: entry.longSide },
            stairId,
          ),
        );
      }
    }
  }
  const stair = stairId && up ? { room: stairId, up } : null;

  // Tầng trên: lối ra của ô thang phải ở ĐẦU người từ tầng dưới bước ra (`stairArrival`). Mở ở cạnh dài là mở ngang vế
  // bậc — lối ra nằm giữa thang, không bước ra được (T157, Haan 11/10/2026, phương án 6 hồ sơ c815a6e6: «vách quây kín
  // 3 góc, một góc mở thì ko thể đi lại qua đó vì nằm ở giữa thang»). Trước đó `stairExitRank` chỉ ƯU TIÊN đầu ấy,
  // không có thì lặng lẽ mở cạnh dài.
  // Chỉ khi có thông số loại thang: bản chạy thật luôn có (`chooseStairShape` lùi về chữ U). Vắng là mô hình thang CŨ
  // (lượt ghi trước T105 — thang U vào theo cạnh dài), áp đầu bước ra thì bác oan (5aba737d, 2ddf782a — rà soát 11/10).
  if (stairId && input.level > 1 && input.stairUp && input.stairParams) {
    const r = rect.get(stairId);
    const need = arrivalSide(input.stairUp, stairArrival(input.stairParams.shape));
    const exits = doors
      .filter((door) => door.a === stairId || door.b === stairId)
      .map((door) => (door.a === stairId ? door.b : door.a))
      .filter((other) => other !== 'outside' && rect.has(other));
    if (r && !exits.some((other) => sideOf(r, rect.get(other)!) === need)) {
      const touching = neighbours(stairId).filter((id) => {
        const other = rect.get(id);
        return !!other && sideOf(r, other) === need;
      });
      reasons.push(
        arrangeIssue(
          'stair_arrival_blocked',
          `Ô thang "${stairId}" ở ${where}: đầu người từ tầng dưới bước ra (${SIDE_VI[need]}) không giáp hành lang hay khu chung nào${touching.length ? ` — chỉ giáp ${touching.join(', ')}` : ''}; mở ở cạnh dài là mở ngang vế bậc, không bước ra được.`,
          { stair: stairId, end: SIDE_EN[need], touching: touching.join(', ') || 'nothing' },
          stairId,
        ),
      );
    }
  }

  // Thang chữ U, tầng trên: lỗ mở ra ở đầu bước ra phải nằm trên VẾ TỚI, không giữa cạnh. Vế đầu cùng đầu ấy, ở tầng
  // trên là khoảng thông xuống chân thang — lỗ giữa cạnh (2,57 m trên ô 4,67 m) chỉ trùng vế tới ~1 m, phần còn lại mở
  // ra khoảng trống (T158, lượt e1c432f4). Tầng 1 đã căn theo vế đầu (`shapedStairEntry`); ở đây căn phía ngược lại.
  if (
    stairId &&
    input.level > 1 &&
    input.stairUp &&
    input.stairParams &&
    U_SHAPES.has(input.stairParams.shape)
  ) {
    const r = rect.get(stairId);
    const need = arrivalSide(input.stairUp, stairArrival(input.stairParams.shape));
    const index = doors.findIndex((door) => {
      const other = door.a === stairId ? door.b : door.b === stairId ? door.a : null;
      return !!other && !!r && rect.has(other) && sideOf(r, rect.get(other)!) === need;
    });
    if (index >= 0) {
      doors[index] = {
        ...doors[index]!,
        place: firstFlightAtLowEnd(input.stairUp) ? 'end' : 'start',
      };
    }
  }

  return { doors, also, stair, reasons };
}

/** Thang hai vế song song: vế tới ở tầng trên nằm cạnh vế đầu, cùng đầu ngắn. */
const U_SHAPES: ReadonlySet<string> = new Set(['chu_u', 'chu_u_rong']);

/**
 * Vế đầu nằm ở đầu có toạ độ NHỎ của cạnh ngắn (theo trục ngang vế) — tờ vẽ cho vế đầu xuất phát ở góc cố định theo
 * `up`, đi ngang theo `across = [−up.y, up.x]`. `place: 'start'` của cửa là đầu toạ độ nhỏ của vách.
 */
function firstFlightAtLowEnd(up: StairUp): boolean {
  const alongX = up.endsWith('x');
  const across: [number, number] = alongX ? [0, up === '+x' ? 1 : -1] : [up === '+y' ? -1 : 1, 0];
  return alongX ? across[1] > 0 : across[0] > 0;
}

export type StairSide = 'x0' | 'x1' | 'y0' | 'y1';

/** Tên cạnh ô thang trong câu báo (tiếng Việt) và câu nhắc (tiếng Anh, theo hướng nhìn từ đường). */
const SIDE_VI: Record<StairSide, string> = {
  y0: 'đầu phía mặt tiền',
  y1: 'đầu phía sau nhà',
  x0: 'cạnh bên trái',
  x1: 'cạnh bên phải',
};
const SIDE_EN: Record<StairSide, string> = { y0: 'street', y1: 'back', x0: 'left', x1: 'right' };

/** Phía của ô thang mà phòng `other` nằm ngay bên kia; `null` khi không chung cạnh. */
function sideOf(r: Rect, other: Rect): StairSide | null {
  if (sharedEdge(r, other) <= 0) return null;
  if (Math.abs(other.x1 - r.x0) <= 1) return 'x0';
  if (Math.abs(other.x0 - r.x1) <= 1) return 'x1';
  if (Math.abs(other.y1 - r.y0) <= 1) return 'y0';
  if (Math.abs(other.y0 - r.y1) <= 1) return 'y1';
  return null;
}

/** Đầu ngắn chứa bậc 1 theo chiều lên (góc xuất phát của `draw/stairs.ts`) — thang hai vế tới cùng đầu ấy. */
const START_SIDE: Record<StairUp, StairSide> = { '+x': 'x0', '-x': 'x1', '+y': 'y0', '-y': 'y1' };

/** Cạnh lối vào ô thang ở tầng 1 theo chiều lên — cạnh chứa bậc 1 (T161, bước quay lui của `evaluateHouse`). */
export function stairEntrySide(up: StairUp): StairSide {
  return START_SIDE[up];
}

/** Chiều đi lên của vế đầu khi lối vào ở cạnh `side`: vế đầu đi thẳng vào ô, xa cạnh ấy. */
const UP_FROM_SIDE: Record<StairSide, StairUp> = { x0: '+x', x1: '-x', y0: '+y', y1: '-y' };

/** Cạnh người bước ra ở tầng trên (T105): cạnh bậc 1, cạnh đối diện, hay cạnh xa theo trục ngang (thang L). */
function arrivalSide(up: StairUp, arrival: 'start' | 'end' | 'across'): StairSide {
  if (arrival === 'start') return START_SIDE[up];
  if (arrival === 'end') return START_SIDE[flip(up)];
  // Trục ngang `across = [−up.y, up.x]`: +y → −x (cạnh x0), −y → +x (x1), +x → +y (y1), −x → −y (y0).
  return ({ '+y': 'x0', '-y': 'x1', '+x': 'y1', '-x': 'y0' } as const)[up];
}

function flip(up: StairUp): StairUp {
  return ({ '+x': '-x', '-x': '+x', '+y': '-y', '-y': '+y' } as const)[up];
}

/**
 * Lối vào thang cho một tầng đã có sẵn chữ nhật và cửa (đường dải v6, T116): cùng logic T103 / T105 của bộ xếp — ô mở ở
 * đầu ngắn, sát bậc 1, chiều lên khớp lối vào. Trước đó đường dải gán cứng `up: '+y'` nên bậc 1 có thể quay vào tường
 * (Haan chấm lượt a68c50bb: «ngay bậc một là tường chắn thì đi lên kiểu gì»). Sửa `doors` tại chỗ; `null` khi ô thang chưa
 * có lối vào nào.
 */
export function placeStairEntry(
  id: string,
  rect: ReadonlyMap<string, Rect>,
  doors: Door[],
  isHub: (id: string) => boolean,
  params: StairParams | null,
): { up: StairUp; longSide: string | null } | null {
  const reached = new Set(rect.keys());
  const shared = (a: string, b: string) => sharedEdge(rect.get(a)!, rect.get(b)!) > 0;
  return params
    ? shapedStairEntry(id, rect, doors, reached, isHub, shared, params)
    : stairEntry(id, rect, doors, reached, isHub, shared);
}

/**
 * Các đầu của ô thang phải giáp lối đi ở một tầng TRÊN, khi mọi tầng chung chiều lên `up` của tầng 1: đầu bậc 1 (đi lên
 * tiếp) và đầu người từ tầng dưới bước ra (`stairArrival`: U — cùng đầu bậc 1; thẳng — đầu đối diện; L — cạnh ngang).
 */
export function stairSidesNeeded(up: StairUp, params: StairParams | null): StairSide[] {
  const arrival = params ? stairArrival(params.shape) : 'start';
  return [...new Set([START_SIDE[up], arrivalSide(up, arrival)])];
}

/** Chiều lên của vế đầu khi bậc 1 ở cạnh `side` — cho đường dải. */
export function stairUpFromSide(side: StairSide): StairUp {
  return UP_FROM_SIDE[side];
}

/** Phía của ô thang `r` mà phòng `other` kề vào (`null` khi không chung cạnh) — cho đường dải. */
export function stairSideOf(r: Rect, other: Rect): StairSide | null {
  return sideOf(r, other);
}

/**
 * Lối vào thang theo LOẠI (T105): thử cạnh đang mang cửa rồi các phòng giao thông đã tới được khác chung vách với ô
 * thang; nhận cạnh đầu tiên mà vế đầu đi ngược lên từ đó thì ô đủ chỗ cho loại thang (U, thẳng: cạnh ngắn; L, ba vế:
 * cạnh hợp chiều). Ô mở đặt ở đầu vách phía dải vế đầu — sát bậc 1. Không cạnh nào hợp → giữ cửa cũ, báo `longSide`.
 */
function shapedStairEntry(
  id: string,
  rect: ReadonlyMap<string, Rect>,
  doors: Door[],
  reached: ReadonlySet<string>,
  isHub: (id: string) => boolean,
  shared: (a: string, b: string) => boolean,
  params: StairParams,
  avoid: StairSide | null = null,
): { up: StairUp; longSide: string | null } | null {
  const r = rect.get(id)!;
  const index = doors.findIndex((door) => door.a === id || door.b === id);
  if (index < 0) return null;
  const current = doors[index]!;
  const host = current.a === id ? current.b : current.a;
  const others = [...reached]
    .filter((other) => other !== id && other !== host && isHub(other) && shared(id, other))
    .sort(
      (p, q) => sharedEdge(rect.get(q)!, r) - sharedEdge(rect.get(p)!, r) || p.localeCompare(q),
    );
  const avoided = (candidate: string) => {
    const other = rect.get(candidate);
    return avoid !== null && !!other && sideOf(r, other) === avoid;
  };
  const order = [host, ...others];
  for (const candidate of [...order.filter((c) => !avoided(c)), ...order.filter(avoided)]) {
    const other = rect.get(candidate);
    const side = other ? sideOf(r, other) : null;
    if (!side) continue;
    const up = UP_FROM_SIDE[side];
    const alongX = up.endsWith('x');
    const along = alongX ? r.x1 - r.x0 : r.y1 - r.y0;
    const across = alongX ? r.y1 - r.y0 : r.x1 - r.x0;
    if (!stairFits(params, along, across)) continue;
    // Gốc vế đầu: đi theo `across = [−up.y, up.x]` từ gốc vẫn ở trong ô, nên gốc nằm ở cạnh ngược chiều across.
    const lowEnd = firstFlightAtLowEnd(up);
    doors[index] = { a: candidate, b: id, kind: current.kind, place: lowEnd ? 'start' : 'end' };
    return { up, longSide: null };
  }
  return { up: stairDirection(id, rect, doors), longSide: host };
}

/**
 * Chiều lên và đầu vách đặt ô mở, theo phía của lối vào, sao cho ô mở nằm đúng ở GÓC BẬC 1 (T103, Haan chấm
 * lượt b1543b8c: «chỗ ghi lối lên thì bị bít bởi tường»). Tờ vẽ (`draw/stairs.ts`) cho vế đầu xuất phát ở góc
 * cố định theo `up`: +x → (x0, y0), −x → (x1, y1), +y → (x1, y0), −y → (x0, y1).
 */
const ENTRY_BY_SIDE: Record<
  'x' | 'y',
  Record<StairSide, { up: StairUp; place: 'start' | 'end' }>
> = {
  // Thang nằm ngang (vế chạy theo x).
  x: {
    x0: { up: '+x', place: 'start' },
    x1: { up: '-x', place: 'end' },
    y0: { up: '+x', place: 'start' },
    y1: { up: '-x', place: 'end' },
  },
  // Thang nằm dọc (vế chạy theo y).
  y: {
    y0: { up: '+y', place: 'end' },
    y1: { up: '-y', place: 'start' },
    x1: { up: '+y', place: 'start' },
    x0: { up: '-y', place: 'end' },
  },
};

/**
 * Lối vào thang (T103): ô mở ưu tiên ở ĐẦU NGẮN của ô thang — người bước thẳng vào bậc 1 — khi có phòng
 * giao thông đã tới được nằm ở đó; không có thì giữ lối vào đã chọn. Rồi đặt chiều lên và đầu vách của ô mở
 * cho khớp nhau. Sửa `doors` tại chỗ; `null` khi thang chưa có lối vào.
 */
function stairEntry(
  id: string,
  rect: ReadonlyMap<string, Rect>,
  doors: Door[],
  reached: ReadonlySet<string>,
  isHub: (id: string) => boolean,
  shared: (a: string, b: string) => boolean,
): { up: StairUp; longSide: string | null } | null {
  const r = rect.get(id)!;
  const axis: 'x' | 'y' = r.y1 - r.y0 >= r.x1 - r.x0 ? 'y' : 'x';
  const shortSides: StairSide[] = axis === 'x' ? ['x0', 'x1'] : ['y0', 'y1'];
  const index = doors.findIndex((door) => door.a === id || door.b === id);
  if (index < 0) return null;
  const current = doors[index]!;
  let host = current.a === id ? current.b : current.a;
  let side = rect.get(host) ? sideOf(r, rect.get(host)!) : null;
  if (!side) return null;
  if (!shortSides.includes(side)) {
    const better = [...reached]
      .filter((other) => other !== id && other !== host && isHub(other) && shared(id, other))
      .filter(
        (other) =>
          !doors.some(
            (door) => (door.a === id && door.b === other) || (door.b === id && door.a === other),
          ),
      )
      .map((other) => ({ other, side: sideOf(r, rect.get(other)!) }))
      .filter(
        (c): c is { other: string; side: StairSide } =>
          c.side !== null && shortSides.includes(c.side),
      )
      .sort(
        (p, q) =>
          sharedEdge(rect.get(q.other)!, r) - sharedEdge(rect.get(p.other)!, r) ||
          p.other.localeCompare(q.other),
      )[0];
    if (better) {
      host = better.other;
      side = better.side;
      doors[index] = { a: host, b: id, kind: current.kind };
    }
  }
  const entry = ENTRY_BY_SIDE[axis][side];
  doors[index] = { ...doors[index]!, place: entry.place };
  return { up: entry.up, longSide: shortSides.includes(side) ? null : host };
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
