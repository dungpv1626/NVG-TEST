/**
 * Cửa, cửa sổ và đường đi trong một tầng — CHƯƠNG TRÌNH đặt, mô hình chỉ khai tôpô (T37, T40).
 *
 * Mô hình nói «phòng khách nối bếp bằng ô thông», chương trình tìm bức vách chung, chọn bề rộng theo
 * quy cách NVG (`kb/construction_norms.yaml`), đặt giữa đoạn vách, và suy chiều mở. Lượt chạy thật
 * 13/09/2026 cho thấy vì sao: khi mô hình phải tự tính `at` trên một cạnh nó vừa tự đặt, cái thang
 * không có cửa vào và cả tầng 2 (11 phòng) thành ốc đảo.
 *
 * Cửa sổ thì mô hình không khai gì cả — chỉ được TỪ CHỐI một phòng qua `no_window`. Mọi phòng trong
 * nhà có cạnh giáp mặt thoáng đều được một ô cửa sổ, nên tiêu chí mặt thoáng (D1) đo ý đồ bố cục
 * (phòng nào được đặt ra mặt thoáng), không đo chuyện mô hình có nhớ khai cửa sổ hay không.
 *
 * Kết quả đổ ra đúng hình dạng `ai-plan-rooms` (lỗ mở neo vào CẠNH PHÒNG), để `plan-geometry.ts`
 * neo lên tường như mọi khi — không có đường neo thứ hai.
 */

import type { AiPlanRoomsDoor, AiPlanRoomsWindow, AiPlanTree } from '@nvg/shared/design';
import type { ConstructionNorms, OpeningNorm } from '../../kb/construction';
import type { Face } from '../../kb/site-context';
import type { Interval, Rect } from '../draw/geometry';
import { DrawNotes } from '../draw/notes';
import type { PlanIssue } from '../plan-check';
import type { Cell } from './cells';
import { neighboursAcross, type Side } from './insets';
import { treeIssue } from './issues';
import {
  everydayRouteViolations,
  mayEnter,
  passageViolations,
  properlyReached,
  type PassageInput,
} from './passage';
import type { PassageRules } from '../../kb/vocabulary';

type Edge = AiPlanRoomsDoor['edge'];

const SIDE_TO_EDGE: Record<Side, Edge> = { x0: 'left', x1: 'right', y0: 'front', y1: 'back' };
const SIDES: readonly Side[] = ['y0', 'x1', 'y1', 'x0'];

/** Mặt thửa mà một cạnh ô nhìn ra — cùng quy tắc pháp tuyến với `outline-faces.ts`. */
const SIDE_TO_FACE: Record<Side, Face> = { x0: 'left', x1: 'right', y0: 'front', y1: 'back' };

export const OUTSIDE = 'outside';

const FACE_VI: Record<Face, string> = {
  front: 'mặt trước',
  back: 'mặt sau',
  left: 'bên trái',
  right: 'bên phải',
};

export interface OpeningsInput {
  level: number;
  cells: readonly Cell[];
  inner: ReadonlyMap<string, Rect>;
  /** Mã phòng → loại phòng, chỉ phòng của tầng này. */
  typeOf: ReadonlyMap<string, string>;
  /** Mã phòng của chương trình (kể cả mã chỉ nằm trong `also`) → mã lá chứa nó. */
  hostOf: ReadonlyMap<string, string>;
  ensuiteOf: ReadonlyMap<string, string>;
  tree: Pick<AiPlanTree, 'doors' | 'no_window'>;
  construction: ConstructionNorms;
  openFaces: readonly Face[];
  accessFaces: readonly Face[];
  groups: {
    outdoor: ReadonlySet<string>;
    vertical: ReadonlySet<string>;
    noDoorRequired: ReadonlySet<string>;
    habitable: ReadonlySet<string>;
    /**
     * Loại phòng chương trình được mở THÊM cửa vào, theo thứ tự ưu tiên, để nối một phòng mô hình
     * quên khai lối vào (`kb/room_vocabulary.yaml` nhóm `door_hosts`). Rỗng = không tự nối.
     */
    doorHosts?: readonly string[];
    /** Phòng nào được đi xuyên (`kb/room_vocabulary.yaml` mục `passage`). Vắng = không kiểm. */
    passage?: PassageRules | null;
  };
  /** Mã lá → mọi loại phòng lá ấy mang, kể cả loại ghép qua `also`. */
  typesOfLeaf: ReadonlyMap<string, ReadonlySet<string>>;
  /** Phòng xuất phát của đường đi: cửa ngoài ở tầng 1, ô thang ở tầng trên. */
  stairRoom: string | null;
  /** Mã lỗi hạ xuống ghi chú cho lượt này — lượt sửa của kỹ sư trên bản vẽ có trước luật. */
  relax?: ReadonlySet<string>;
  /**
   * Mặt đặt lối vào chính và lối xe mà ĐẦU BÀI đã khai (13/09/2026). `null` = chưa quyết, chương
   * trình tự chọn theo mặt tiếp cận. Đã khai thì là ràng buộc: cửa ra ngoài đặt lệch mặt là lỗi cổng.
   */
  entrances: { main: Face | null; vehicle: Face | null };
}

export interface OpeningsResult {
  doors: AiPlanRoomsDoor[];
  windows: AiPlanRoomsWindow[];
  issues: PlanIssue[];
  notes: DrawNotes;
}

interface Slot {
  room: string;
  side: Side;
  /** Đoạn dùng được, toạ độ tuyệt đối dọc cạnh, theo mặt trong phòng. */
  from: number;
  to: number;
}

export function placeOpenings(input: OpeningsInput): OpeningsResult {
  const where = `tầng ${input.level}`;
  const issues: PlanIssue[] = [];
  const notes = new DrawNotes();
  const cellById = new Map(input.cells.map((cell) => [cell.id, cell]));
  const rules = input.construction.openingRules;
  const margin = Math.round(rules.door_margin_m * 100);
  const wcTypes = new Set(rules.wc_door_types);
  /** Loại phòng dùng cửa đi HẸP (cửa vệ sinh): WC cộng phòng nhỏ không ở người. */
  const narrowDoorTypes = new Set([...rules.wc_door_types, ...rules.narrow_door_types]);

  /** Lỗ đã đặt trên mỗi cạnh phòng, toạ độ tuyệt đối. */
  const taken = new Map<string, Interval[]>();
  const slotKey = (room: string, side: Side) => `${room}:${side}`;

  const innerSpan = (room: string, side: Side): [number, number] => {
    const r = input.inner.get(room)!;
    return side === 'x0' || side === 'x1' ? [r.y0, r.y1] : [r.x0, r.x1];
  };

  /** Đoạn vách chung giữa hai phòng, theo mặt trong — `null` khi không kề nhau. */
  const sharedSlot = (a: string, b: string): { slot: Slot; other: Side } | null => {
    const cell = cellById.get(a);
    if (!cell) return null;
    let best: { slot: Slot; other: Side } | null = null;
    for (const side of SIDES) {
      for (const n of neighboursAcross(cell, side, input.cells)) {
        if (n.cell.id !== b) continue;
        const [alo, ahi] = innerSpan(a, side);
        const other = opposite(side);
        const [blo, bhi] = innerSpan(b, other);
        const from = Math.max(alo, blo);
        const to = Math.min(ahi, bhi);
        if (to - from <= 0) continue;
        if (!best || to - from > best.slot.to - best.slot.from) {
          best = { slot: { room: a, side, from, to }, other };
        }
      }
    }
    return best;
  };

  /** Đoạn cạnh phòng giáp NGOÀI khối xây (footprint hoặc ô unbuilt), kèm mặt thửa. */
  const exteriorSlots = (room: string): (Slot & { face: Face })[] => {
    const cell = cellById.get(room);
    if (!cell) return [];
    const out: (Slot & { face: Face })[] = [];
    for (const side of SIDES) {
      const [lo, hi] = innerSpan(room, side);
      const face = SIDE_TO_FACE[side];
      if (cell.from[side] === null) {
        out.push({ room, side, from: lo, to: hi, face });
        continue;
      }
      for (const n of neighboursAcross(cell, side, input.cells)) {
        if (n.cell.kind !== 'unbuilt') continue;
        const from = Math.max(lo, n.from);
        const to = Math.min(hi, n.to);
        if (to - from > 0) out.push({ room, side, from, to, face });
      }
    }
    return out;
  };

  /** Chỗ trống lớn nhất của một đoạn sau khi trừ lỗ đã đặt trên cả hai mặt vách. */
  const freeGap = (slot: Slot, alsoKey: string | null): Interval | null => {
    const holes = [
      ...(taken.get(slotKey(slot.room, slot.side)) ?? []),
      ...(alsoKey ? (taken.get(alsoKey) ?? []) : []),
    ].sort((p, q) => p.from - q.from);
    let cursor = slot.from;
    let best: Interval | null = null;
    const consider = (from: number, to: number) => {
      if (to - from > 0 && (!best || to - from > best.to - best.from)) best = { from, to };
    };
    for (const hole of holes) {
      if (hole.to <= cursor || hole.from >= slot.to) continue;
      consider(cursor, Math.max(cursor, hole.from));
      cursor = Math.max(cursor, hole.to);
    }
    consider(cursor, slot.to);
    return best;
  };

  const record = (key: string, from: number, w: number) => {
    taken.set(key, [...(taken.get(key) ?? []), { from, to: from + w }]);
  };

  // ── Cửa ────────────────────────────────────────────────────────────────────────────────
  const doors: AiPlanRoomsDoor[] = [];
  const links: [string, string][] = [];
  const outsideRooms: string[] = [];
  const outsideFaces: { room: string; kind: string; face: Face }[] = [];
  const doorCount = new Map<string, string[]>();

  // Tôpô cửa mô hình khai được SỬA tất định trước khi đặt (V-26, 13/09/2026). Lượt thật hôm ấy:
  // cây tầng 1 hợp lý, chỉ thiếu cửa cho cái kho — bác cả phương án rồi bắt mô hình xếp lại từ đầu
  // là vứt đi cây gần đạt, và lượt xếp lại sai nhiều hơn. Chỉ những chỗ chương trình KHÔNG sửa
  // được mà không đổi ý đồ bố cục (phòng không giáp phòng nào đi vào được) mới còn là lỗi cổng.
  const planned = normaliseDoors(input, sharedSlot, notes, where);

  for (const declared of planned) {
    const { a, b } = declared;
    const isOutside = b === OUTSIDE;

    const typeA = input.typeOf.get(a) ?? '';
    const typeB = isOutside ? '' : (input.typeOf.get(b) ?? '');
    const norm = doorNorm(declared.kind, typeA, typeB, narrowDoorTypes, input.construction);
    const minWidth = Math.round(
      ((narrowDoorTypes.has(typeA) || narrowDoorTypes.has(typeB)
        ? input.construction.openings.wc_door?.width_m
        : input.construction.openings.door?.width_m) ?? 0.75) * 100,
    );

    let slot: Slot | null = null;
    let alsoKey: string | null = null;
    if (isOutside) {
      const candidates = exteriorSlots(a);
      const open = candidates.filter((c) => input.openFaces.includes(c.face));
      if (open.length === 0) {
        issues.push(
          candidates.length
            ? treeIssue(
                'door_outside_on_boundary',
                `Cửa ra ngoài của "${a}" ở ${where} chỉ đặt được trên cạnh giáp nhà hàng xóm hoặc ranh đất — không đi ra được.`,
                { room: a },
                a,
              )
            : treeIssue(
                'door_no_outside_edge',
                `Phòng "${a}" ở ${where} không có cạnh nào giáp ngoài khối nhà, nên không đặt được cửa ra ngoài.`,
                { room: a },
                a,
              ),
        );
        continue;
      }
      const vehicular = declared.kind === 'garage' || declared.kind === 'gate';
      const wanted = vehicular ? input.entrances.vehicle : input.entrances.main;
      const ranked = [...open].sort(
        (p, q) =>
          Number(q.face === wanted) - Number(p.face === wanted) ||
          Number(input.accessFaces.includes(q.face)) - Number(input.accessFaces.includes(p.face)) ||
          q.to - q.from - (p.to - p.from),
      );
      slot = ranked[0]!;
      outsideFaces.push({ room: a, kind: declared.kind, face: ranked[0]!.face });
    } else {
      // `normaliseDoors` đã gạt mọi cặp không kề nhau, nên ở đây luôn có vách chung.
      const shared = sharedSlot(a, b)!;
      slot = shared.slot;
      alsoKey = slotKey(b, shared.other);
    }

    // Kỹ sư yêu cầu bỏ vách (T53): ô thông chạy suốt cạnh chung, chỉ chừa hai má.
    const fullWall = !isOutside && declared.kind === 'opening' && declared.full === true;
    const placed = putDoor(declared, slot, alsoKey, norm, minWidth, fullWall);
    if (placed) {
      issues.push(placed);
      continue;
    }
    if (isOutside) outsideRooms.push(a);
  }

  /** Đặt một cửa lên đoạn vách; trả lỗi `door_wall_too_short` khi vách không đủ chỗ. */
  function putDoor(
    declared: PlannedDoor,
    slot: Slot,
    alsoKey: string | null,
    norm: OpeningNorm,
    minWidth: number,
    fullWall = false,
  ): PlanIssue | null {
    const { a, b } = declared;
    const isOutside = b === OUTSIDE;
    const gap = freeGap(slot, alsoKey);
    const room = gap ? gap.to - gap.from - 2 * margin : 0;
    const desired = fullWall ? slot.to - slot.from : desiredWidth(norm, slot.to - slot.from);
    const w = Math.min(desired, room);
    if (!gap || w < minWidth) {
      return treeIssue(
        'door_wall_too_short',
        `Cửa "${a}–${b}" ở ${where} cần ít nhất ${minWidth + 2 * margin} cm vách trống, chỉ còn ${Math.max(0, Math.round(gap ? gap.to - gap.from : 0))} cm.`,
        { a, b, cm: minWidth + 2 * margin },
        a,
      );
    }
    const width = Math.floor(w);
    // Kỹ sư chọn đầu vách (T53): sát má ở đầu ấy; vắng thì giữa khoảng trống như trước.
    const start =
      declared.place === 'start'
        ? half(gap.from + margin)
        : declared.place === 'end'
          ? half(gap.to - margin - width)
          : half((gap.from + gap.to) / 2 - width / 2);
    record(slotKey(slot.room, slot.side), start, width);
    if (alsoKey) record(alsoKey, start, width);

    const edgeStart = innerSpan(slot.room, slot.side)[0];
    const edgeEnd = innerSpan(slot.room, slot.side)[1];
    const swingable = declared.kind === 'single' || declared.kind === 'double';
    const intoA = isOutside || sweepsIntoFirst(a, b, input);
    doors.push({
      id: `d${input.level}_${doors.length + 1}`,
      room: slot.room,
      edge: SIDE_TO_EDGE[slot.side],
      at: half(start - edgeStart),
      w: width,
      kind: declared.kind,
      hinge: swingable ? (start - edgeStart <= edgeEnd - (start + width) ? 'near' : 'far') : null,
      swing: swingable ? (intoA ? 'in' : 'out') : null,
    });
    if (!isOutside) links.push([a, b]);
    for (const id of isOutside ? [a] : [a, b]) {
      doorCount.set(id, [...(doorCount.get(id) ?? []), isOutside ? OUTSIDE : id === a ? b : a]);
    }
    return null;
  }

  /**
   * Cửa trong nhà do CHƯƠNG TRÌNH thêm — quy cách như cửa mô hình khai loại `single`.
   *
   * Hai phòng CÙNG thuộc nhóm giao thông (hành lang – hành lang, hành lang – thang) thì không lắp
   * cánh: chúng là một đường đi bị vách ngăn cắt ngang, nên nối bằng ô thông suốt (Haan 18/09/2026,
   * chấm lượt 78be09b4 «không cần cửa giữa 2 khu vực đều là hành lang giao thông»).
   */
  const tryProgramDoor = (a: string, b: string): boolean => {
    const shared = sharedSlot(a, b);
    if (!shared) return false;
    const typeA = input.typeOf.get(a) ?? '';
    const typeB = input.typeOf.get(b) ?? '';
    const bothCirculation = input.groups.vertical.has(typeA) && input.groups.vertical.has(typeB);
    const kind = bothCirculation ? 'opening' : 'single';
    const norm = doorNorm(kind, typeA, typeB, narrowDoorTypes, input.construction);
    const minWidth = Math.round(
      ((narrowDoorTypes.has(typeA) || narrowDoorTypes.has(typeB)
        ? input.construction.openings.wc_door?.width_m
        : input.construction.openings.door?.width_m) ?? 0.75) * 100,
    );
    return (
      putDoor(
        { a, b, kind, ...(bothCirculation ? { full: true } : {}) },
        shared.slot,
        slotKey(b, shared.other),
        norm,
        minWidth,
      ) === null
    );
  };

  // ── Nối phòng chưa đi tới được vào phòng giao thông / sinh hoạt chung kề bên ────────────────
  const starts =
    input.level === 1 ? outsideRooms : input.stairRoom ? [input.stairRoom] : ([] as string[]);
  const hosts = input.groups.doorHosts ?? [];
  const isEnsuite = new Set(
    [...input.ensuiteOf.keys()].map((id) => input.hostOf.get(id)).filter(Boolean),
  );
  const parentOf = new Map<string, string>();
  for (const [child, parent] of input.ensuiteOf) {
    const c = input.hostOf.get(child);
    const p = input.hostOf.get(parent);
    if (c && p && c !== p) parentOf.set(c, p);
  }
  const passage = input.groups.passage ?? null;
  const passageInput = (): PassageInput | null =>
    passage
      ? {
          starts,
          entries: new Set(outsideRooms),
          links,
          typesOf: input.typesOfLeaf,
          parentOf,
          noDoorRequired: input.groups.noDoorRequired,
          rules: passage,
        }
      : null;
  if (starts.length > 0 && hosts.length > 0) {
    for (;;) {
      const rules = passageInput();
      // Có luật đi xuyên thì chương trình chỉ nối vào phòng ĐÃ tới hợp lệ, bằng một bước hợp lệ —
      // không bao giờ tự mở một lối đi xuyên WC hay phòng ngủ để lấp chỗ mô hình quên (V-27).
      const reached = rules ? properlyReached(rules) : reach(starts, links);
      const options: { host: string; room: string; rank: number; length: number }[] = [];
      for (const [room, type] of input.typeOf) {
        if (reached.has(room) || isEnsuite.has(room) || input.groups.noDoorRequired.has(type)) {
          continue;
        }
        if (reach(starts, links).has(room)) continue; // đã có đường; đi xuyên là lỗi cổng bên dưới
        for (const neighbour of neighbourRooms(room, cellById, input.cells)) {
          const rank = hosts.indexOf(input.typeOf.get(neighbour) ?? '');
          if (rank < 0 || !reached.has(neighbour)) continue;
          if (rules && !mayEnter(rules, neighbour, room)) continue;
          // Không tự mở cửa từ ô thang vào phòng ở / thờ (Haan 18/09/2026): thà để lỗi cổng nói ra
          // còn hơn thêm một cái cửa mà kiến trúc sư phải xoá.
          if (
            passage?.stairNotFor?.size &&
            neighbour === input.stairRoom &&
            [...(input.typesOfLeaf.get(room) ?? [])].some((t) => passage.stairNotFor.has(t))
          ) {
            continue;
          }
          const shared = sharedSlot(neighbour, room);
          if (!shared) continue;
          options.push({ host: neighbour, room, rank, length: shared.slot.to - shared.slot.from });
        }
      }
      options.sort(
        (p, q) =>
          p.rank - q.rank ||
          q.length - p.length ||
          p.room.localeCompare(q.room) ||
          p.host.localeCompare(q.host),
      );
      const added = options.find((option) => tryProgramDoor(option.host, option.room));
      if (!added) break;
      notes.add(
        'door_added',
        `Chương trình thêm cửa "${added.host}–${added.room}" ở ${where}: mô hình không khai lối vào "${added.room}".`,
      );
    }
  }

  // ── Lối vào chính và lối xe đúng mặt đầu bài khai ────────────────────────────────────────
  if (input.level === 1 && outsideFaces.length) {
    const main = input.entrances.main;
    const people = outsideFaces.filter((d) => d.kind !== 'garage' && d.kind !== 'gate');
    if (main && !people.some((d) => d.face === main)) {
      issues.push(
        treeIssue(
          'entrance_wrong_side',
          `Đầu bài đặt lối vào chính ở ${FACE_VI[main]}, nhưng tầng 1 không có cửa ra ngoài nào (trừ cửa xe) ở mặt đó.`,
          { side: main },
        ),
      );
    }
    const vehicle = input.entrances.vehicle;
    for (const door of outsideFaces.filter((d) => d.kind === 'garage' || d.kind === 'gate')) {
      if (vehicle && door.face !== vehicle) {
        issues.push(
          treeIssue(
            'vehicle_door_wrong_side',
            `Đầu bài đặt lối xe ở ${FACE_VI[vehicle]}, nhưng cửa xe của "${door.room}" chỉ đặt được ở ${FACE_VI[door.face]}.`,
            { side: vehicle, room: door.room },
            door.room,
          ),
        );
      }
    }
  }

  // ── Mọi phòng có cửa, phòng khép kín chỉ mở vào phòng mẹ ────────────────────────────────
  for (const [room, type] of input.typeOf) {
    if (input.groups.noDoorRequired.has(type)) continue;
    if (!doorCount.has(room)) {
      const next = neighbourRooms(room, cellById, input.cells);
      const hostNext = next.filter((id) => hosts.includes(input.typeOf.get(id) ?? ''));
      issues.push(
        treeIssue(
          'room_without_door',
          hostNext.length
            ? `Phòng "${room}" ở ${where} không có cửa: vách chung với ${hostNext.join(', ')} quá ngắn để đặt cửa, hoặc phòng ấy chưa đi tới được (đang giáp: ${next.join(', ')}).`
            : `Phòng "${room}" ở ${where} không có cửa, và không giáp phòng giao thông hay sinh hoạt chung nào để mở cửa vào (đang giáp: ${next.join(', ') || 'không phòng nào'}).`,
          { room, neighbours: next.join(', ') || 'nothing' },
          room,
        ),
      );
    }
  }
  for (const [room, parent] of input.ensuiteOf) {
    const host = input.hostOf.get(room);
    const parentHost = input.hostOf.get(parent);
    if (!host || !parentHost) continue;
    const via = doorCount.get(host) ?? [];
    if (via.length !== 1 || via[0] !== parentHost) {
      issues.push(
        treeIssue(
          'ensuite_door_wrong',
          `"${room}" là phòng khép kín của "${parent}" nhưng không chung vách với "${parent}", nên không mở cửa vào phòng mẹ được.`,
          { room, parent },
          room,
        ),
      );
    }
  }

  // ── Đi tới được ────────────────────────────────────────────────────────────────────────
  if (input.level === 1 && starts.length === 0) {
    issues.push(
      treeIssue(
        'level_no_entrance',
        `Tầng 1 không có cửa nào nối với "${OUTSIDE}" — nhà không có lối vào.`,
        {},
      ),
    );
  } else if (starts.length > 0) {
    const reached = reach(starts, links);
    for (const [room, type] of input.typeOf) {
      if (reached.has(room) || input.groups.noDoorRequired.has(type)) continue;
      if (!doorCount.has(room)) continue; // đã báo `room_without_door`
      issues.push(
        treeIssue(
          'room_unreachable_on_level',
          input.level === 1
            ? `Phòng "${room}" ở tầng 1 không đi tới được từ cửa ngoài nhà.`
            : `Phòng "${room}" ở ${where} không đi tới được từ ô thang "${starts[0]}".`,
          { room, from: starts[0] ?? OUTSIDE },
          room,
        ),
      );
    }
    const rules = passageInput();
    // Đường đi HẰNG NGÀY không được xuyên gara hay sảnh ngoài (T48). Chặn, và nằm trong nhóm lỗi gửi
    // mô hình sửa: chỗ sai là bố cục mô hình vẽ, không phải cách chương trình chia ô.
    for (const { room, via } of rules && passage
      ? everydayRouteViolations({ ...rules, shared: passage.everydayFrom })
      : []) {
      issues.push(
        treeIssue(
          'route_through_service',
          `Ở ${where}, từ khu sinh hoạt chung chỉ tới được "${room}" bằng cách đi xuyên "${via}" — đường đi hằng ngày không đi qua chỗ để xe hay sảnh ngoài nhà.`,
          { room, via },
          room,
        ),
      );
    }
    // Ô thang chỉ mở cửa sang phòng giao thông hay khu sinh hoạt chung (`passage.stair_opens_to`,
    // Haan 18/09/2026). Cửa phòng thờ mở thẳng vào vế bậc là chỗ Haan chấm «bất hợp lý» ở lượt
    // 78be09b4. Chặn và gửi mô hình sửa: chỗ sai là bố cục — phòng ấy phải kề hành lang.
    const stairNotFor = passage?.stairNotFor;
    if (input.stairRoom && stairNotFor && stairNotFor.size > 0) {
      const stair = input.stairRoom;
      for (const room of [
        ...new Set(links.flatMap(([a, b]) => (a === stair ? [b] : b === stair ? [a] : []))),
      ].sort()) {
        if (room === OUTSIDE) continue;
        const types = input.typesOfLeaf.get(room) ?? new Set<string>();
        if (![...types].some((type) => stairNotFor.has(type))) continue;
        const message = `Phòng "${room}" ở ${where} lấy cửa thẳng từ ô thang "${stair}" — ô thang là vế bậc, phòng phải vào từ hành lang hay khu sinh hoạt chung.`;
        if (input.relax?.has('door_from_stair')) {
          notes.add('door_from_stair_kept', message);
          continue;
        }
        issues.push(
          treeIssue(
            'door_from_stair',
            message,
            { room, stair, blocked: [...stairNotFor].join(', ') },
            room,
          ),
        );
      }
    }
    for (const { room, via } of rules ? passageViolations(rules) : []) {
      issues.push(
        treeIssue(
          'room_through_private',
          `Phòng "${room}" ở ${where} chỉ vào được bằng cách đi xuyên "${via}", và không giáp phòng giao thông hay sinh hoạt chung nào được phép mở cửa vào nó.`,
          { room, via, through: [...(passage?.through ?? [])].join(', ') },
          room,
        ),
      );
    }
  }

  // ── Cửa sổ ─────────────────────────────────────────────────────────────────────────────
  const windows: AiPlanRoomsWindow[] = [];
  const declined = new Set(
    input.tree.no_window.map((id) => input.hostOf.get(id)).filter((id): id is string => !!id),
  );
  const noWindow = new Set(input.construction.no_window_types);

  for (const [room, type] of input.typeOf) {
    if (
      declined.has(room) ||
      noWindow.has(type) ||
      input.groups.outdoor.has(type) ||
      input.groups.vertical.has(type)
    ) {
      continue;
    }
    const candidates = windowSlots(room, input, exteriorSlots, cellById, innerSpan);
    if (candidates.length === 0) {
      if (input.groups.habitable.has(type)) {
        notes.add(
          'window_none',
          `Phòng "${room}" ở ${where} không có cạnh nào giáp mặt thoáng — không đặt được cửa sổ.`,
        );
      }
      continue;
    }
    const isWc = wcTypes.has(type);
    const norm =
      (isWc ? input.construction.openings.wc_window : input.construction.openings.window) ?? {};
    const minimum = Math.round((norm.min_width_m ?? norm.width_m ?? 0.6) * 100);
    // Thử LẦN LƯỢT mọi cạnh theo thứ tự ưu tiên, không dừng ở cạnh dài nhất: lượt thật 13/09/2026
    // phòng ngủ 4 mất cửa sổ vì cạnh dài nhất đã kín cửa ban công, trong khi cạnh ngoài nhà còn trống.
    let chosen: { slot: Slot; alsoKey: string | null; gap: Interval; w: number } | null = null;
    for (const candidate of candidates) {
      const gap = freeGap(candidate.slot, candidate.alsoKey);
      const available = gap ? gap.to - gap.from - 2 * margin : 0;
      const desired = isWc
        ? Math.round((norm.width_m ?? 0.6) * 100)
        : desiredWidth(norm, candidate.slot.to - candidate.slot.from);
      const w = Math.floor(Math.min(desired, available));
      if (gap && w >= minimum) {
        chosen = { ...candidate, gap, w };
        break;
      }
    }
    if (!chosen) {
      notes.add(
        'window_skipped',
        `Phòng "${room}" ở ${where}: mọi cạnh giáp mặt thoáng đã kín cửa đi, không còn chỗ cho cửa sổ.`,
      );
      continue;
    }
    const { slot, alsoKey, gap, w } = chosen;
    const start = half((gap.from + gap.to) / 2 - w / 2);
    record(slotKey(room, slot.side), start, w);
    if (alsoKey) record(alsoKey, start, w);
    windows.push({
      id: `w${input.level}_${windows.length + 1}`,
      room,
      edge: SIDE_TO_EDGE[slot.side],
      at: half(start - innerSpan(room, slot.side)[0]),
      w,
      sill: Math.round((norm.sill_m ?? 0.9) * 100),
      h: Math.round((norm.height_m ?? 1.6) * 100),
    });
  }

  return { doors, windows, issues, notes };
}

/**
 * Mọi cạnh đặt được cửa sổ, theo `window_priority` (mặt thoáng của khối nhà trước, rồi phòng ngoài
 * trời), trong cùng một nguồn thì cạnh dài trước.
 */
function windowSlots(
  room: string,
  input: OpeningsInput,
  exteriorSlots: (room: string) => (Slot & { face: Face })[],
  cellById: ReadonlyMap<string, Cell>,
  innerSpan: (room: string, side: Side) => [number, number],
): { slot: Slot; alsoKey: string | null }[] {
  const cell = cellById.get(room);
  if (!cell) return [];
  const all: { slot: Slot; alsoKey: string | null }[] = [];
  for (const source of input.construction.openingRules.window_priority) {
    const found: { slot: Slot; alsoKey: string | null }[] = [];
    if (source === 'outline') {
      for (const slot of exteriorSlots(room)) {
        if (input.openFaces.includes(slot.face)) found.push({ slot, alsoKey: null });
      }
    } else {
      for (const side of SIDES) {
        for (const n of neighboursAcross(cell, side, input.cells)) {
          if (n.cell.kind !== 'room' || input.typeOf.get(n.cell.id) !== source) continue;
          const [lo, hi] = innerSpan(room, side);
          const [olo, ohi] = innerSpan(n.cell.id, opposite(side));
          const from = Math.max(lo, olo);
          const to = Math.min(hi, ohi);
          if (to - from > 0) {
            found.push({
              slot: { room, side, from, to },
              alsoKey: `${n.cell.id}:${opposite(side)}`,
            });
          }
        }
      }
    }
    all.push(...found.sort((p, q) => q.slot.to - q.slot.from - (p.slot.to - p.slot.from)));
  }
  return all;
}

function doorNorm(
  kind: string,
  typeA: string,
  typeB: string,
  wcTypes: ReadonlySet<string>,
  construction: ConstructionNorms,
): OpeningNorm {
  const wc = kind === 'single' && (wcTypes.has(typeA) || wcTypes.has(typeB));
  const name = wc ? 'wc_door' : (construction.openingRules.door_by_kind[kind] ?? 'door');
  return construction.openings[name] ?? {};
}

/** Bề rộng mong muốn: theo tỉ lệ đoạn vách khi quy cách khai tỉ lệ, kẹp giữa hai cận. */
function desiredWidth(norm: OpeningNorm, length: number): number {
  const base = Math.round((norm.width_m ?? norm.min_width_m ?? 0.9) * 100);
  if (norm.share_of_wall === undefined) return base;
  const max = Math.round((norm.max_width_m ?? norm.width_m ?? 0.9) * 100);
  const min = Math.round((norm.min_width_m ?? norm.width_m ?? 0.6) * 100);
  return Math.max(min, Math.min(max, Math.round(norm.share_of_wall * length)));
}

/**
 * Cánh cửa quét vào phòng nào: không quét ra giao thông hay ngoài trời, và giữa hai phòng trong nhà
 * thì quét vào phòng NHỎ hơn — phòng ngủ từ phòng khách, WC từ phòng ngủ. Tất định, không hỏi mô hình.
 */
function sweepsIntoFirst(a: string, b: string, input: OpeningsInput): boolean {
  const passive = (id: string) => {
    const type = input.typeOf.get(id) ?? '';
    return input.groups.vertical.has(type) || input.groups.outdoor.has(type);
  };
  if (passive(a) !== passive(b)) return passive(b);
  const area = (id: string) => {
    const r = input.inner.get(id);
    return r ? (r.x1 - r.x0) * (r.y1 - r.y0) : 0;
  };
  return area(a) <= area(b);
}

interface PlannedDoor {
  /** Mã LÁ (đã tra `hostOf`), không phải mã phòng mô hình viết. */
  a: string;
  b: string;
  kind: AiPlanTree['doors'][number]['kind'];
  /** Ô thông suốt vách chung (T53). */
  full?: boolean | null;
  /** Đầu vách đặt cửa (T53). */
  place?: 'start' | 'middle' | 'end' | null;
}

/**
 * Sửa tôpô cửa mô hình khai, trước khi đặt — chỉ những sửa KHÔNG đổi ý đồ bố cục:
 *
 *  - cửa nhắc phòng không có ở tầng này, cửa trùng, cửa nối hai phòng không chung vách → bỏ;
 *  - phòng khép kín (WC trong phòng ngủ) giáp phòng mẹ → đúng một cửa, mở vào phòng mẹ.
 *
 * Mọi chỗ bỏ hay thêm đều để lại ghi chú — tờ vẽ không được khác lời mô hình mà im lặng.
 */
function normaliseDoors(
  input: OpeningsInput,
  adjacent: (a: string, b: string) => unknown,
  notes: DrawNotes,
  where: string,
): PlannedDoor[] {
  let out: PlannedDoor[] = [];
  const seen = new Set<string>();
  for (const declared of input.tree.doors) {
    const isOutside = declared.b === OUTSIDE;
    const a = input.hostOf.get(declared.a);
    const b = isOutside ? OUTSIDE : input.hostOf.get(declared.b);
    if (!a || !b) {
      const missing = !a ? declared.a : declared.b;
      notes.add(
        'door_dropped',
        `Bỏ cửa "${declared.a}–${declared.b}" ở ${where}: "${missing}" không phải phòng của tầng này.`,
      );
      continue;
    }
    const pair = isOutside ? `${a}|${OUTSIDE}` : [a, b].sort().join('|');
    if (a === b || seen.has(pair)) continue;
    if (!isOutside && !adjacent(a, b)) {
      notes.add(
        'door_dropped',
        `Bỏ cửa "${a}–${b}" ở ${where}: hai phòng không chung bức vách nào.`,
      );
      continue;
    }
    seen.add(pair);
    out.push({
      a,
      b,
      kind: declared.kind,
      full: declared.full ?? null,
      place: declared.place ?? null,
    });
  }

  for (const [child, parent] of input.ensuiteOf) {
    const c = input.hostOf.get(child);
    const p = input.hostOf.get(parent);
    if (!c || !p || c === p || !adjacent(c, p)) continue; // không giáp phòng mẹ: lỗi cổng thật
    const touching = out.filter((door) => door.a === c || door.b === c);
    const toParent = touching.find((door) => door.a === p || door.b === p);
    const extra = touching.filter((door) => door !== toParent);
    if (extra.length) {
      out = out.filter((door) => !extra.includes(door));
      notes.add(
        'door_dropped',
        `Bỏ cửa ${extra.map((door) => `"${door.a}–${door.b}"`).join(', ')} ở ${where}: "${c}" là phòng khép kín của "${p}", chỉ mở vào "${p}".`,
      );
    }
    if (!toParent) {
      out.push({ a: p, b: c, kind: 'single' });
      notes.add(
        'door_added',
        `Chương trình thêm cửa "${p}–${c}" ở ${where}: phòng khép kín phải mở vào phòng mẹ.`,
      );
    }
  }
  return rerouteThroughRooms(input, out, adjacent, notes, where);
}

/**
 * Phòng chỉ vào được bằng cách đi xuyên phòng riêng (kho qua WC) mà lại GIÁP một phòng giao thông /
 * sinh hoạt chung đã tới hợp lệ → chương trình mở cửa từ phòng ấy và BỎ cửa đi xuyên (V-27).
 *
 * Không đổi ý đồ bố cục: phòng vẫn ở đúng ô mô hình đặt, chỉ đổi bức vách mang cửa. Phòng không giáp
 * phòng nào như vậy thì để nguyên — đó là lỗi bố cục, cổng nêu ra và lượt sửa phải dời phòng.
 */
function rerouteThroughRooms(
  input: OpeningsInput,
  planned: PlannedDoor[],
  adjacent: (a: string, b: string) => unknown,
  notes: DrawNotes,
  where: string,
): PlannedDoor[] {
  const rules = input.groups.passage;
  const hosts = input.groups.doorHosts ?? [];
  if (!rules || hosts.length === 0) return planned;
  const parentOf = new Map<string, string>();
  for (const [child, parent] of input.ensuiteOf) {
    const c = input.hostOf.get(child);
    const p = input.hostOf.get(parent);
    if (c && p && c !== p) parentOf.set(c, p);
  }
  const cellById = new Map(input.cells.map((cell) => [cell.id, cell]));
  let out = [...planned];

  for (;;) {
    const entries = new Set(out.filter((d) => d.b === OUTSIDE).map((d) => d.a));
    const starts =
      input.level === 1 ? [...entries] : input.stairRoom ? [input.stairRoom] : ([] as string[]);
    const passage: PassageInput = {
      starts,
      entries,
      links: out.filter((d) => d.b !== OUTSIDE).map((d) => [d.a, d.b] as const),
      typesOf: input.typesOfLeaf,
      parentOf,
      noDoorRequired: input.groups.noDoorRequired,
      rules,
    };
    const proper = properlyReached(passage);
    const fix = passageViolations(passage)
      .map(({ room }) => {
        const host = neighbourRooms(room, cellById, input.cells)
          .filter(
            (id) =>
              proper.has(id) &&
              hosts.includes(input.typeOf.get(id) ?? '') &&
              mayEnter(passage, id, room) &&
              adjacent(id, room),
          )
          .sort(
            (p, q) =>
              hosts.indexOf(input.typeOf.get(p) ?? '') - hosts.indexOf(input.typeOf.get(q) ?? ''),
          )[0];
        return host ? { room, host } : null;
      })
      .find((entry) => entry !== null);
    if (!fix) return out;

    const { room, host } = fix;
    const wrong = out.filter(
      (d) =>
        d.b !== OUTSIDE &&
        (d.a === room || d.b === room) &&
        !mayEnter(passage, d.a === room ? d.b : d.a, room) &&
        !mayEnter(passage, room, d.a === room ? d.b : d.a),
    );
    out = [...out.filter((d) => !wrong.includes(d)), { a: host, b: room, kind: 'single' }];
    notes.add(
      'door_rerouted',
      `Chương trình chuyển lối vào "${room}" ở ${where} sang "${host}"${
        wrong.length ? `, bỏ cửa ${wrong.map((d) => `"${d.a}–${d.b}"`).join(', ')}` : ''
      }: không vào phòng này bằng cách đi xuyên phòng khác.`,
    );
  }
}

/** Mã các phòng kề (chung một đoạn vách) với một ô, xếp theo mã để kết quả tất định. */
function neighbourRooms(
  room: string,
  cellById: ReadonlyMap<string, Cell>,
  cells: readonly Cell[],
): string[] {
  const cell = cellById.get(room);
  if (!cell) return [];
  const out = new Set<string>();
  for (const side of SIDES) {
    for (const n of neighboursAcross(cell, side, cells)) {
      if (n.cell.kind === 'room') out.add(n.cell.id);
    }
  }
  return [...out].sort();
}

function reach(starts: readonly string[], links: readonly [string, string][]): Set<string> {
  const reached = new Set<string>();
  const queue = [...starts];
  while (queue.length) {
    const current = queue.pop()!;
    if (reached.has(current)) continue;
    reached.add(current);
    for (const [p, q] of links) {
      if (p === current && !reached.has(q)) queue.push(q);
      if (q === current && !reached.has(p)) queue.push(p);
    }
  }
  return reached;
}

function opposite(side: Side): Side {
  return side === 'x0' ? 'x1' : side === 'x1' ? 'x0' : side === 'y0' ? 'y1' : 'y0';
}

/** Lưới nửa centimet của hợp đồng — số biểu diễn chính xác, nên mã băm vẫn tất định. */
function half(value: number): number {
  return Math.round(value * 2) / 2;
}
