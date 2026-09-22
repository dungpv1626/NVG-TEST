/**
 * Chuẩn hoá Ý ĐỊNH BỐ CỤC mô hình khai cho một tầng — trước khi dựng cây (T43).
 *
 * Ý định là dữ liệu KHÔNG TIN ĐƯỢC: mô hình có thể bỏ sót phòng, nhắc phòng của tầng khác, khai hai
 * quan hệ ngược nhau cho cùng một cặp. Không lỗi nào trong số đó đáng bác cả tầng và mua lại một lượt
 * gọi — chương trình sửa được mà không đổi ý đồ. Mọi chỗ sửa để lại một ghi chú `intent_*`.
 *
 * Chỉ MỘT điều ở đây là lỗi chặn: một vùng bị dồn quá nhiều phòng (`arrange_zone_overfull`) — đó là
 * ý đồ bố cục không dựng được, và chỉ mô hình đổi được.
 *
 * Hàm THUẦN, tất định: mọi danh sách đi theo thứ tự phòng của chương trình không gian.
 */

import type { AiPlanIntent, AiSpaceProgram } from '@nvg/shared/design';
import { mergeKey, type ZoneDefaults } from '../../kb/vocabulary';
import { DrawNotes, type DrawNote } from '../draw/notes';
import type { PlanIssue } from '../plan-check';
import type { RoomGroups } from '../tree';
import { ZONE_CELL, zoneAt, ZONES, type Zone } from './grid';
import { arrangeIssue } from './issues';

type Space = AiSpaceProgram['spaces'][number];

export type RelationKind = 'adjacent' | 'near' | 'far';

export interface IntentRoom {
  id: string;
  type: string;
  /** m², diện tích chương trình yêu cầu. */
  target: number;
  zone: Zone;
  street: boolean;
  ensuiteOf: string | null;
}

/** Một LÁ của cây: phòng chính cùng các phòng ghép vào nó (`open` → `also`). */
export interface IntentLeaf {
  id: string;
  /** Mọi loại phòng lá mang — loại riêng và loại ghép. */
  types: string[];
  /** Mã phòng ghép vào lá này (không gồm chính nó). */
  merged: string[];
  /** m², tổng diện tích yêu cầu của lá. */
  target: number;
  zone: Zone;
  street: boolean;
  ensuiteOf: string | null;
}

export interface LevelIntent {
  level: number;
  leaves: IntentLeaf[];
  /** Mã phòng của chương trình → mã lá chứa nó. */
  hostOf: Map<string, string>;
  /** Quan hệ giữa hai LÁ khác nhau, đã khử trùng và giải mâu thuẫn. */
  relations: { a: string; b: string; kind: RelationKind }[];
  /** Cặp lá mô hình muốn «thông nhau» mà không ghép được thành một ô — cửa ô thông. */
  openings: [string, string][];
  entryRoom: string | null;
  garageRoom: string | null;
  variantLabel: string | null;
  rationale: string;
  /** Ý định đã sửa, đúng hình `levels[].intent` của artifact. */
  stored: Pick<AiPlanIntent, 'rooms' | 'relationships' | 'entry_room' | 'garage_room'>;
  notes: DrawNote[];
  issues: PlanIssue[];
}

export interface IntentContext {
  level: number;
  /** Phòng của chương trình THUỘC TẦNG NÀY, theo thứ tự chương trình. */
  spaces: readonly Space[];
  groups: RoomGroups;
  mergeAllowed: ReadonlySet<string>;
  zoneDefaults: ZoneDefaults;
  /**
   * Tầng trên: vùng của ô thang, giếng trời và khu vệ sinh tầng dưới — ép, không hỏi lại mô hình. Ô
   * thang và giếng trời phải chồng KHÍT; khu vệ sinh chỉ cần cùng vùng để trục ống nước còn thẳng
   * được (Q-B, 18/09/2026), vị trí trong vùng do bộ xếp quyết bằng khoản phạt `wet`.
   */
  anchorZones?: {
    stair: Zone | null;
    lightWells: Zone[];
    wetRooms?: Zone[];
    /** Vùng ô thang máy tầng dưới — tầng trên phải chồng khít, nên phải cùng vùng. */
    elevators?: Zone[];
  } | null;
  /** Loại phòng nào là khu vệ sinh — dùng cho việc ép vùng ở trên. */
  isWet?: (type: string) => boolean;
  /** Số phòng tối đa một vùng nhận được — theo lưới hiệu dụng của hình bao. */
  maxPerZone: number;
  /**
   * Hai vùng là MỘT trên lưới hiệu dụng (lô 4 m: `back` và `back_right`). Vắng = so bằng nhau. Ép vùng
   * mốc chỉ khi khác thật — không ghi chú «đã sửa» cho một chỗ không có gì để sửa.
   */
  sameZone?: (a: Zone, b: Zone) => boolean;
  /**
   * Vùng có chạm một mặt thoáng của hình bao. Vắng = coi mọi vùng đều chạm (không đổi hành vi cũ). Dùng
   * để không kéo ban công khép kín vào một vùng nó không ra được mặt thoáng (V-28).
   */
  touchesOpenFace?: (zone: Zone) => boolean;
}

/** Tối đa bấy nhiêu phòng một lá (phòng chính + ghép) — cùng trần `also.with` của hợp đồng cây. */
const MERGE_GROUP_MAX = 3;
/** Cùng trần `also` của hợp đồng cây. */
const MERGES_MAX = 6;
const LIGHT_WELL = 'light_well';
/** Ô thang máy — bám vùng của tầng dưới y như giếng trời (T65). */
const ELEVATOR = 'elevator';

/** Loại phòng ưu tiên mang cửa chính khi ý định bỏ trống — theo thứ tự. */
const ENTRY_PREFERENCE = ['porch', 'circulation', 'living', 'dining', 'core', 'garage'];

export function normaliseIntent(raw: AiPlanIntent, ctx: IntentContext): LevelIntent {
  const notes = new DrawNotes();
  const issues: PlanIssue[] = [];
  const where = `tầng ${ctx.level}`;
  const spaces = new Map(ctx.spaces.map((space) => [space.id, space]));
  const through = ctx.groups.passage?.through ?? new Set<string>();
  const entryThrough = ctx.groups.passage?.entryThrough ?? new Set<string>();

  // ── Phòng: vùng, mặt đường ─────────────────────────────────────────────────────────────
  const declared = new Map<string, { zone: Zone; street: boolean }>();
  for (const room of raw.rooms) {
    if (!spaces.has(room.id)) {
      notes.add(
        'intent_room_dropped',
        `Bỏ "${room.id}" khỏi ý định ${where}: không phải phòng của tầng này trong chương trình không gian.`,
      );
      continue;
    }
    if (!declared.has(room.id))
      declared.set(room.id, { zone: room.zone, street: room.street_facing });
  }

  const rooms: IntentRoom[] = ctx.spaces.map((space) => {
    const given = declared.get(space.id);
    const fallback = defaultZone(space.type, ctx.zoneDefaults);
    if (!given) {
      notes.add(
        'intent_zone_defaulted',
        `Ý định ${where} bỏ sót "${space.id}" — chương trình đặt vào vùng ${fallback} theo vùng mặc định của loại phòng.`,
      );
    }
    return {
      id: space.id,
      type: space.type,
      target: space.target_area_m2,
      zone: given?.zone ?? fallback,
      street: given?.street ?? ctx.zoneDefaults.street.has(space.type),
      ensuiteOf: space.ensuite_of ?? null,
    };
  });
  const roomById = new Map(rooms.map((room) => [room.id, room]));

  // Phòng khép kín nằm TRONG phòng mẹ: cùng vùng, không ra mặt đường riêng. Riêng ban công, sân thượng:
  // phòng mẹ ở vùng không chạm mặt thoáng thì kéo PHÒNG MẸ ra vùng của ban công — kéo ban công vào giữa
  // nhà là dựng một ban công không có lan can nào ra ngoài (lượt 9cce001a, V-28).
  const openFace = ctx.touchesOpenFace ?? (() => true);
  for (const room of rooms) {
    const parent = room.ensuiteOf ? roomById.get(room.ensuiteOf) : undefined;
    if (!parent) continue;
    if (room.zone !== parent.zone || room.street) {
      if (room.zone !== parent.zone) {
        const outdoor = ctx.groups.outdoor.has(room.type) && room.type !== LIGHT_WELL;
        if (outdoor && !openFace(parent.zone) && openFace(room.zone)) {
          notes.add(
            'intent_ensuite_zone_forced',
            `"${parent.id}" chuyển từ vùng ${parent.zone} sang ${room.zone} để ban công khép kín "${room.id}" của nó ra được mặt thoáng.`,
          );
          parent.zone = room.zone;
          for (const sibling of rooms) {
            if (sibling.ensuiteOf === parent.id) sibling.zone = parent.zone;
          }
        } else {
          notes.add(
            'intent_ensuite_zone_forced',
            `"${room.id}" là phòng khép kín của "${parent.id}" nên đặt cùng vùng ${parent.zone}, không phải ${room.zone}.`,
          );
        }
      }
      room.zone = parent.zone;
      room.street = false;
    }
  }

  // Tầng trên: ô thang và giếng trời ở đúng vùng của tầng dưới — chúng phải chồng khít.
  if (ctx.anchorZones) {
    const same = ctx.sameZone ?? ((a: Zone, b: Zone) => a === b);
    const wells = [...ctx.anchorZones.lightWells];
    const lifts = [...(ctx.anchorZones.elevators ?? [])];
    for (const room of rooms) {
      const forced =
        room.type === 'stair'
          ? ctx.anchorZones.stair
          : room.type === LIGHT_WELL
            ? (wells.shift() ?? null)
            : room.type === ELEVATOR
              ? (lifts.shift() ?? null)
              : null;
      if (forced && !same(forced, room.zone)) {
        notes.add(
          'intent_anchor_zone_forced',
          `"${room.id}" ${where} đặt ở vùng ${forced} để chồng khít tầng dưới, thay cho ${room.zone} mô hình khai.`,
        );
        room.zone = forced;
      }
    }
    // Khu vệ sinh: cùng VÙNG với khu vệ sinh tầng dưới, không đòi chồng khít (Q-B). Phòng khép kín
    // không đụng tới — vùng của nó là vùng phòng mẹ, kéo đi là phòng ngủ mất khu vệ sinh riêng.
    const wet = [...(ctx.anchorZones.wetRooms ?? [])];
    const upperWet = ctx.isWet
      ? rooms.filter((room) => ctx.isWet!(room.type) && !room.ensuiteOf)
      : [];
    for (const room of upperWet) {
      const at = wet.findIndex((zone) => same(zone, room.zone));
      if (at >= 0) wet.splice(at, 1);
    }
    for (const room of upperWet) {
      if (wet.some((zone) => same(zone, room.zone))) continue;
      const forced = wet.shift();
      if (forced === undefined) break;
      notes.add(
        'intent_wet_zone_forced',
        `"${room.id}" ${where} đặt ở vùng ${forced} để trục ống nước thẳng với khu vệ sinh tầng dưới, thay cho ${room.zone} mô hình khai.`,
      );
      room.zone = forced;
    }
  }

  // ── Ghép phòng (`open`) ──────────────────────────────────────────────────────────────────
  const openPairs: [string, string][] = [];
  const relationPairs: { a: string; b: string; kind: RelationKind }[] = [];
  for (const rel of raw.relationships) {
    if (rel.a === rel.b || !roomById.has(rel.a) || !roomById.has(rel.b)) {
      notes.add(
        'intent_relationship_dropped',
        `Bỏ quan hệ "${rel.a}–${rel.b}" (${rel.kind}) ở ${where}: ${rel.a === rel.b ? 'một phòng với chính nó' : 'nhắc phòng không thuộc tầng này'}.`,
      );
      continue;
    }
    if (rel.kind === 'open') openPairs.push([rel.a, rel.b]);
    else relationPairs.push({ a: rel.a, b: rel.b, kind: rel.kind });
  }

  const group = new Map<string, string[]>(rooms.map((room) => [room.id, [room.id]]));
  const leader = new Map<string, string>(rooms.map((room) => [room.id, room.id]));
  const openings: [string, string][] = [];
  let mergeCount = 0;
  for (const [a, b] of openPairs) {
    const ra = roomById.get(a)!;
    const rb = roomById.get(b)!;
    const la = leader.get(a)!;
    const lb = leader.get(b)!;
    if (la === lb) continue;
    const mergeable =
      !ra.ensuiteOf &&
      !rb.ensuiteOf &&
      ctx.mergeAllowed.has(mergeKey(ra.type, rb.type)) &&
      group.get(la)!.length + group.get(lb)!.length <= MERGE_GROUP_MAX &&
      mergeCount < MERGES_MAX;
    if (!mergeable) {
      openings.push([a, b]);
      notes.add(
        ctx.mergeAllowed.has(mergeKey(ra.type, rb.type))
          ? 'intent_merge_capped'
          : 'intent_open_not_merged',
        `"${a}" và "${b}" ở ${where} không ghép thành một ô được — chương trình nối hai phòng bằng ô thông.`,
      );
      continue;
    }
    const members = [...group.get(la)!, ...group.get(lb)!];
    group.delete(lb);
    group.set(la, members);
    for (const id of members) leader.set(id, la);
    mergeCount += 1;
  }

  const hostOf = new Map<string, string>();
  const leaves: IntentLeaf[] = [];
  for (const [lead, members] of group) {
    // Lá mang mã của phòng LỚN NHẤT trong nhóm (hoà thì phòng khai trước): nhãn trên tờ vẽ đọc theo
    // phòng chính, và bếp + ăn thì bếp là chỗ gia chủ gọi tên.
    const ordered = members
      .map((id) => roomById.get(id)!)
      .sort((p, q) => q.target - p.target || rooms.indexOf(p) - rooms.indexOf(q));
    const host = ordered[0]!;
    for (const id of members) hostOf.set(id, host.id);
    void lead;
    leaves.push({
      id: host.id,
      types: [...new Set(ordered.map((room) => room.type))],
      merged: ordered.slice(1).map((room) => room.id),
      target: ordered.reduce((sum, room) => sum + room.target, 0),
      zone: host.zone,
      street: ordered.some((room) => room.street),
      ensuiteOf: host.ensuiteOf,
    });
  }
  leaves.sort(
    (p, q) => rooms.findIndex((r) => r.id === p.id) - rooms.findIndex((r) => r.id === q.id),
  );

  // ── Quan hệ giữa LÁ ──────────────────────────────────────────────────────────────────────
  const rank: Record<RelationKind, number> = { adjacent: 3, near: 2, far: 1 };
  const byPair = new Map<string, { a: string; b: string; kind: RelationKind }>();
  const merged = new Set(openings.map(([a, b]) => [hostOf.get(a), hostOf.get(b)].sort().join('|')));
  for (const rel of relationPairs) {
    const a = hostOf.get(rel.a)!;
    const b = hostOf.get(rel.b)!;
    if (a === b) continue;
    const key = [a, b].sort().join('|');
    const previous = byPair.get(key);
    if (previous && previous.kind !== rel.kind) {
      notes.add(
        'intent_relationship_conflict',
        `Cặp "${a}–${b}" ở ${where} vừa «${previous.kind}» vừa «${rel.kind}» — giữ «${rank[rel.kind] > rank[previous.kind] ? rel.kind : previous.kind}».`,
      );
    }
    if (!previous || rank[rel.kind] > rank[previous.kind]) {
      byPair.set(key, { a: key.split('|')[0]!, b: key.split('|')[1]!, kind: rel.kind });
    }
  }
  // Ô thông cũng là «cạnh nhau».
  for (const key of merged) {
    const [a, b] = key.split('|') as [string, string];
    if (a !== b) byPair.set(key, { a, b, kind: 'adjacent' });
  }
  const relations = [...byPair.values()].sort((p, q) =>
    `${p.a}|${p.b}`.localeCompare(`${q.a}|${q.b}`),
  );
  const openingLeaves = [
    ...new Set(openings.map(([a, b]) => [hostOf.get(a)!, hostOf.get(b)!].sort().join('|'))),
  ]
    .map((key) => key.split('|') as [string, string])
    .filter(([a, b]) => a !== b);

  // ── Cửa chính, cửa xe ─────────────────────────────────────────────────────────────────────
  const leafById = new Map(leaves.map((leaf) => [leaf.id, leaf]));
  const canEnter = (leaf: IntentLeaf) =>
    leaf.types.some((type) => through.has(type) || entryThrough.has(type));
  let entryRoom: string | null = null;
  if (ctx.level === 1) {
    const given = raw.entry_room ? hostOf.get(raw.entry_room) : undefined;
    const givenLeaf = given ? leafById.get(given) : undefined;
    if (givenLeaf && canEnter(givenLeaf) && !givenLeaf.ensuiteOf) {
      entryRoom = givenLeaf.id;
    } else {
      entryRoom = defaultEntry(leaves);
      if (entryRoom) {
        notes.add(
          raw.entry_room ? 'intent_entry_invalid' : 'intent_entry_defaulted',
          raw.entry_room
            ? `"${raw.entry_room}" không mang được cửa chính ở tầng 1 (chỉ phòng giao thông, sinh hoạt chung, sảnh hoặc chỗ để xe) — chương trình đặt cửa chính ở "${entryRoom}".`
            : `Ý định không nói phòng nào mang cửa chính — chương trình đặt ở "${entryRoom}".`,
        );
      }
    }
  }

  const garages = leaves.filter((leaf) => leaf.types.includes('garage'));
  let garageRoom: string | null = null;
  const givenGarage = raw.garage_room ? hostOf.get(raw.garage_room) : undefined;
  if (givenGarage && leafById.get(givenGarage)?.types.includes('garage')) {
    garageRoom = givenGarage;
  } else if (garages.length >= 1) {
    garageRoom = garages[0]!.id;
    notes.add(
      'intent_garage_defaulted',
      `Chỗ để xe ${where} là "${garageRoom}" — ý định ${raw.garage_room ? `khai "${raw.garage_room}" không phải chỗ để xe` : 'không nói'}.`,
    );
  }

  // ── Vùng quá tải ──────────────────────────────────────────────────────────────────────────
  const perZone = new Map<Zone, string[]>();
  for (const leaf of leaves) {
    if (leaf.ensuiteOf) continue;
    perZone.set(leaf.zone, [...(perZone.get(leaf.zone) ?? []), leaf.id]);
  }
  for (const zone of ZONES) {
    const ids = perZone.get(zone) ?? [];
    if (ids.length > ctx.maxPerZone) {
      issues.push(
        arrangeIssue(
          'arrange_zone_overfull',
          `Vùng ${zone} ở ${where} dồn ${ids.length} phòng (${ids.join(', ')}) — một vùng nhận tối đa ${ctx.maxPerZone} phòng trên lô này.`,
          { zone, rooms: ids.join(', '), max: ctx.maxPerZone },
        ),
      );
    }
  }

  return {
    level: ctx.level,
    leaves,
    hostOf,
    relations,
    openings: openingLeaves,
    entryRoom,
    garageRoom,
    variantLabel: raw.variant_label,
    rationale: raw.rationale,
    stored: {
      rooms: rooms.map((room) => ({ id: room.id, zone: room.zone, street_facing: room.street })),
      relationships: [
        ...relations.map((rel) => ({ a: rel.a, b: rel.b, kind: rel.kind })),
        ...[...group.values()]
          .filter((members) => members.length > 1)
          .flatMap((members) => {
            const host = hostOf.get(members[0]!)!;
            return members
              .filter((id) => id !== host)
              .map((id) => ({ a: host, b: id, kind: 'open' as const }));
          }),
      ].slice(0, 30),
      entry_room: entryRoom,
      garage_room: garageRoom,
    },
    notes: notes.list(),
    issues,
  };
}

function defaultZone(type: string, defaults: ZoneDefaults): Zone {
  const row = defaults.row.get(type) ?? 'center';
  return zoneAt(1, row === 'front' ? 0 : row === 'back' ? 2 : 1);
}

function defaultEntry(leaves: readonly IntentLeaf[]): string | null {
  for (const type of ENTRY_PREFERENCE) {
    const found = leaves
      .filter((leaf) => leaf.types.includes(type) && !leaf.ensuiteOf)
      .sort((p, q) => ZONE_CELL[p.zone].row - ZONE_CELL[q.zone].row);
    if (found[0]) return found[0].id;
  }
  return null;
}
