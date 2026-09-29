/**
 * Luật bố trí BẮT BUỘC của NVG (T71, Haan đặt 23/09/2026) — `rules/nvg-mandatory.yaml`.
 *
 * Một nơi đo, hai nơi gọi: cổng từng tầng của bộ xếp (`arrange/index.ts` `gate()` — loại ứng viên để
 * bộ xếp tự thử cách khác) và cổng liên tầng cuối (`plan-check.ts` — lưới an toàn cho tuyến sửa, tuyến
 * xem lại). Hai nơi gọi CÙNG hàm nên không lệch nhau được.
 *
 *  · `kitchen_under_wc` / `altar_under_wc` — WC tầng trên chồng lên bếp / phòng thờ tầng NGAY dưới.
 *  · `altar_beside_wc` / `altar_facing_wc` — phòng thờ giáp hay đối diện WC cùng tầng.
 *  · `balcony_on_open_face` — ban công có cạnh dài trên mép hình bao là mặt thoáng.
 *  · `wc_stack` — ƯU TIÊN, không chặn: WC chung thẳng trục với WC / hộp kỹ thuật tầng dưới.
 *
 * Không gian mở (bếp gộp với phòng ăn, phòng thờ gộp với phòng khách) đo theo KHU (`parts`), chia
 * đúng cách tờ vẽ chia (`withMergedParts`) — WC đặt trên phần phòng khách của một không gian mở có bếp
 * không phải là WC trên bếp.
 *
 * Hàm THUẦN. Mọi ngưỡng đọc từ tệp dữ liệu; phép thử grep canh không có số nào viết cứng ở đây.
 */

import { load as parseYaml } from 'js-yaml';
import type { AiFloorPlanLevel, AiSpaceProgram } from '@nvg/shared/design';
import { overlapArea, rectCentre, toPt, toRect, type Pt, type Rect } from './draw/geometry';
import { prepareWalls } from './draw/walls';
import { faceAtPoint, type OutlineFace } from './outline-faces';
import { doorLinks, type PlanIssue } from './plan-check';
import { withMergedParts, type MergedZoning } from './plan-geometry';

// ── Dữ liệu ─────────────────────────────────────────────────────────────────────────────

export interface MandatoryRules {
  version: string;
  kitchenUnderWc: { blocking: boolean; overlapMinCm2: number } | null;
  altarUnderWc: { blocking: boolean; overlapMinCm2: number } | null;
  altarBesideWc: { blocking: boolean; wallGapCm: number; overlapCm: number } | null;
  altarFacingWc: { blocking: boolean; offsetCm: number; maxDistanceCm: number } | null;
  balconyOnOpenFace: { blocking: boolean; edgeToleranceCm: number; longRatio: number } | null;
  wcStack: { prefer: boolean } | null;
}

export class MandatoryRulesError extends Error {
  constructor(message: string) {
    super(`Không đọc được luật bắt buộc (rules/nvg-mandatory.yaml): ${message}`);
    this.name = 'MandatoryRulesError';
  }
}

/** Phân tích `rules/nvg-mandatory.yaml`. Luật vắng = tắt; luật có mà thiếu số = lỗi lúc nạp. */
export function parseMandatoryRules(yamlText: string): MandatoryRules {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') throw new MandatoryRulesError('tệp rỗng');
  const section = (key: string): Record<string, unknown> | null => {
    const value = raw[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object') throw new MandatoryRulesError(`mục "${key}" phải là bảng`);
    return value as Record<string, unknown>;
  };
  const num = (key: string, s: Record<string, unknown>, field: string): number => {
    const value = s[field];
    if (typeof value !== 'number' || !(value >= 0)) {
      throw new MandatoryRulesError(`"${key}.${field}" phải là số không âm`);
    }
    return value;
  };
  const blocking = (key: string, s: Record<string, unknown>): boolean => {
    if (typeof s.blocking !== 'boolean') {
      // Cố ý không có mặc định: quên khai là quên trả lời «chặn hay chỉ nhắc» (cùng lẽ T65).
      throw new MandatoryRulesError(`"${key}.blocking" phải là true hay false`);
    }
    return s.blocking;
  };
  const read = <T>(key: string, build: (s: Record<string, unknown>) => T): T | null => {
    const s = section(key);
    return s ? build(s) : null;
  };
  return {
    version: String(raw.version ?? '0'),
    kitchenUnderWc: read('kitchen_under_wc', (s) => ({
      blocking: blocking('kitchen_under_wc', s),
      overlapMinCm2: num('kitchen_under_wc', s, 'overlap_min_cm2'),
    })),
    altarUnderWc: read('altar_under_wc', (s) => ({
      blocking: blocking('altar_under_wc', s),
      overlapMinCm2: num('altar_under_wc', s, 'overlap_min_cm2'),
    })),
    altarBesideWc: read('altar_beside_wc', (s) => ({
      blocking: blocking('altar_beside_wc', s),
      wallGapCm: num('altar_beside_wc', s, 'wall_gap_cm'),
      overlapCm: num('altar_beside_wc', s, 'overlap_cm'),
    })),
    altarFacingWc: read('altar_facing_wc', (s) => ({
      blocking: blocking('altar_facing_wc', s),
      offsetCm: num('altar_facing_wc', s, 'offset_cm'),
      maxDistanceCm: num('altar_facing_wc', s, 'max_distance_cm'),
    })),
    balconyOnOpenFace: read('balcony_on_open_face', (s) => ({
      blocking: blocking('balcony_on_open_face', s),
      edgeToleranceCm: num('balcony_on_open_face', s, 'edge_tolerance_cm'),
      longRatio: num('balcony_on_open_face', s, 'long_ratio'),
    })),
    wcStack: read('wc_stack', (s) => ({ prefer: s.prefer === true })),
  };
}

// ── Ngữ cảnh đo ─────────────────────────────────────────────────────────────────────────

/** Loại phòng mà các luật nhắc tới — mã trong `kb/room_vocabulary.yaml`. */
const WC = 'wc';
const KITCHEN = 'kitchen';
const ALTAR = 'altar_room';
const BALCONY = 'balcony';
const SHAFT = 'shaft';

export const MANDATORY_CODES = [
  'wc_over_kitchen',
  'wc_over_altar',
  'altar_beside_wc',
  'altar_facing_wc',
  'balcony_off_open_face',
] as const;
export type MandatoryCode = (typeof MANDATORY_CODES)[number];

export interface MandatoryContext {
  rules: MandatoryRules;
  /** Mã không gian → loại và diện tích mục tiêu (chương trình) — để chia không gian mở thành khu. */
  spaceOf: (id: string) => { type: string; target: number } | null;
  /** Mã các không gian khép kín (`ensuite_of`) — WC khép kín không vào luật ưu tiên thẳng trục. */
  ensuite: ReadonlySet<string>;
  zoning?: MergedZoning;
  /** Tâm WC cách tâm WC / hộp kỹ thuật dưới bao nhiêu thì còn là «thẳng trục», cm (E2). */
  stackReachCm: number | null;
}

/** Phần KHÔNG phụ thuộc chương trình — dựng một lần cho cả lượt, ghép chương trình lúc đo. */
export interface MandatorySetup {
  rules: MandatoryRules;
  stackReachCm: number | null;
  zoning?: MergedZoning;
}

/** `null` khi không kiểm (không truyền luật). */
export function mandatoryFor(
  setup: MandatorySetup | null | undefined,
  program: AiSpaceProgram,
): MandatoryContext | null {
  return setup ? mandatoryContext(setup.rules, program, setup) : null;
}

/** Dựng ngữ cảnh từ chương trình không gian — cùng cách `assemblePlan` tra loại và mục tiêu. */
export function mandatoryContext(
  rules: MandatoryRules,
  program: AiSpaceProgram,
  options: { zoning?: MergedZoning; stackReachCm?: number | null } = {},
): MandatoryContext {
  const byId = new Map(program.spaces.map((space) => [space.id, space]));
  return {
    rules,
    spaceOf: (id) => {
      const space = byId.get(id);
      return space ? { type: space.type, target: space.target_area_m2 } : null;
    },
    ensuite: new Set(program.spaces.filter((space) => space.ensuite_of).map((space) => space.id)),
    ...(options.zoning ? { zoning: options.zoning } : {}),
    stackReachCm: options.stackReachCm ?? null,
  };
}

type Rooms = AiFloorPlanLevel['rooms'];

export interface Zone {
  /** Mã không gian (khu của không gian mở mang mã của không gian nó thay mặt). */
  id: string;
  /** Mã phòng chứa khu — để so «cùng một không gian mở». */
  room: string;
  type: string;
  rect: Rect;
}

/**
 * Khu mang loại phòng. Phòng đã có `parts` (artifact đã ghép) thì dùng nguyên; chưa có thì chia đúng
 * cách `assemblePlan` chia. Chia không được (thiếu mục tiêu) thì mỗi thành viên `also` coi như phủ cả
 * chữ nhật — nghiêng về phía báo, vì không biết bếp nằm ở phần nào.
 */
export function zonesOf(
  rooms: Rooms,
  ctx: MandatoryContext,
  /** Chữ nhật WC của tầng ngay trên — chia khu tránh đặt bếp dưới chúng, đúng cách tờ vẽ chia (T96). */
  avoidAbove: readonly Rect[] = [],
): Zone[] {
  const needsSplit = rooms.some((room) => (room.also?.length ?? 0) > 0 && !room.parts?.length);
  const split = needsSplit ? withMergedParts(rooms, ctx.spaceOf, ctx.zoning, avoidAbove) : rooms;
  return split.flatMap((room): Zone[] => {
    const parts = room.parts ?? [];
    if (parts.length > 1) {
      return parts.map((part) => ({
        id: part.id,
        room: room.id,
        type: part.type,
        rect: toRect(part.rect),
      }));
    }
    const rect = toRect(room.rect);
    return [
      { id: room.id, room: room.id, type: room.type, rect },
      ...(room.also ?? []).flatMap((id) => {
        const type = ctx.spaceOf(id)?.type;
        return type ? [{ id, room: room.id, type, rect }] : [];
      }),
    ];
  });
}

/** Mốc dịch vụ của một tầng — tầng NGAY TRÊN đo luật đứng theo đây. */
export interface ServiceAnchors {
  kitchens: Array<{ id: string; rect: Rect }>;
  altars: Array<{ id: string; rect: Rect }>;
  /** Mọi WC và hộp kỹ thuật — mốc thẳng trục (cùng tập với E2). */
  stack: Rect[];
}

export function serviceAnchors(
  rooms: Rooms,
  ctx: MandatoryContext,
  avoidAbove: readonly Rect[] = [],
): ServiceAnchors {
  const zones = zonesOf(rooms, ctx, avoidAbove);
  const pick = (type: string) =>
    zones.filter((zone) => zone.type === type).map((zone) => ({ id: zone.id, rect: zone.rect }));
  return {
    kitchens: pick(KITCHEN),
    altars: pick(ALTAR),
    stack: zones.filter((zone) => zone.type === WC || zone.type === SHAFT).map((zone) => zone.rect),
  };
}

// ── Luật ────────────────────────────────────────────────────────────────────────────────

function issue(
  code: MandatoryCode,
  message: string,
  params: Record<string, string | number>,
  ref: string,
  blocking: boolean,
): PlanIssue {
  return { code, level: blocking ? 'blocking' : 'finding', message, params, ref };
}

/** WC tầng `level` chồng lên bếp / phòng thờ của tầng ngay dưới (`below`). */
export function verticalViolations(
  below: ServiceAnchors,
  rooms: Rooms,
  level: number,
  ctx: MandatoryContext,
): PlanIssue[] {
  const out: PlanIssue[] = [];
  const wcs = zonesOf(rooms, ctx).filter((zone) => zone.type === WC);
  const kitchen = ctx.rules.kitchenUnderWc;
  const altar = ctx.rules.altarUnderWc;
  for (const wc of wcs) {
    if (kitchen) {
      const hit = below.kitchens.find((k) => overlapArea(k.rect, wc.rect) > kitchen.overlapMinCm2);
      if (hit) {
        out.push(
          issue(
            'wc_over_kitchen',
            `Khu vệ sinh "${wc.id}" ở tầng ${level} nằm ngay trên bếp "${hit.id}" tầng ${level - 1} — bếp không được nằm dưới nhà vệ sinh.`,
            { room: wc.id, below: hit.id, level },
            wc.id,
            kitchen.blocking,
          ),
        );
      }
    }
    if (altar) {
      const hit = below.altars.find((a) => overlapArea(a.rect, wc.rect) > altar.overlapMinCm2);
      if (hit) {
        out.push(
          issue(
            'wc_over_altar',
            `Khu vệ sinh "${wc.id}" ở tầng ${level} nằm ngay trên phòng thờ "${hit.id}" tầng ${level - 1} — phòng thờ không được nằm dưới nhà vệ sinh.`,
            { room: wc.id, below: hit.id, level },
            wc.id,
            altar.blocking,
          ),
        );
      }
    }
  }
  return out;
}

/** Hai chữ nhật chung một bức tường: khe ≤ `gap`, phần chồng dọc tường ≥ `overlap`. */
function shareWall(a: Rect, b: Rect, gap: number, overlap: number): boolean {
  const alongX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const alongY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (alongX >= overlap && (Math.abs(b.y0 - a.y1) <= gap || Math.abs(a.y0 - b.y1) <= gap)) {
    return true;
  }
  return alongY >= overlap && (Math.abs(b.x0 - a.x1) <= gap || Math.abs(a.x0 - b.x1) <= gap);
}

/** Phòng thờ giáp hay đối diện WC cùng tầng. Cần tường và cửa: `level` là tầng đã suy tường. */
export function altarNeighbourViolations(
  level: AiFloorPlanLevel,
  ctx: MandatoryContext,
): PlanIssue[] {
  const out: PlanIssue[] = [];
  const zones = zonesOf(level.rooms, ctx);
  const altars = zones.filter((zone) => zone.type === ALTAR);
  if (!altars.length) return out;
  const wcs = zones.filter((zone) => zone.type === WC);
  const beside = ctx.rules.altarBesideWc;
  if (beside) {
    for (const altar of altars) {
      const hit = wcs.find(
        (wc) =>
          wc.room !== altar.room &&
          shareWall(altar.rect, wc.rect, beside.wallGapCm, beside.overlapCm),
      );
      if (hit) {
        out.push(
          issue(
            'altar_beside_wc',
            `Phòng thờ "${altar.id}" ở tầng ${level.level} chung tường với khu vệ sinh "${hit.id}" — phòng thờ không được giáp nhà vệ sinh.`,
            { room: altar.id, wc: hit.id, level: level.level },
            altar.id,
            beside.blocking,
          ),
        );
      }
    }
  }
  const facing = ctx.rules.altarFacingWc;
  if (facing) out.push(...facingViolations(level, altars, wcs, facing));
  return out;
}

function facingViolations(
  level: AiFloorPlanLevel,
  altars: readonly Zone[],
  wcs: readonly Zone[],
  rule: NonNullable<MandatoryRules['altarFacingWc']>,
): PlanIssue[] {
  const walls = prepareWalls(level.walls);
  const wallOf = new Map(walls.map((wall) => [wall.id, wall]));
  const doorWall = new Map((level.doors ?? []).map((door) => [door.id, door.wall]));
  const links = doorLinks(level, walls);
  const altarRooms = new Set(altars.map((zone) => zone.room));
  const wcRooms = new Set(wcs.map((zone) => zone.room));
  const out: PlanIssue[] = [];
  const seen = new Set<string>();
  for (const a of links) {
    const altarRoom = a.rooms.find((id) => altarRooms.has(id));
    if (!altarRoom) continue;
    for (const w of links) {
      if (w === a) continue;
      const wcRoom = w.rooms.find((id) => wcRooms.has(id));
      if (!wcRoom || wcRoom === altarRoom) continue;
      // Hai cửa cùng mở vào một phòng thứ ba.
      const shared = a.rooms.find((id) => id !== altarRoom && w.rooms.includes(id));
      if (!shared || shared === wcRoom) continue;
      const wa = wallOf.get(doorWall.get(a.id) ?? '');
      const ww = wallOf.get(doorWall.get(w.id) ?? '');
      if (!wa || !ww || wa.id === ww.id) continue;
      if (Math.abs(wa.n[0] * ww.n[0] + wa.n[1] * ww.n[1]) < 0.9) continue;
      const d: Pt = [w.at[0] - a.at[0], w.at[1] - a.at[1]];
      const across = Math.abs(d[0] * wa.n[0] + d[1] * wa.n[1]);
      const lateral = Math.abs(d[0] * wa.u[0] + d[1] * wa.u[1]);
      if (lateral > rule.offsetCm || across > rule.maxDistanceCm) continue;
      const key = `${altarRoom}|${wcRoom}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(
        issue(
          'altar_facing_wc',
          `Cửa phòng thờ "${altarRoom}" ở tầng ${level.level} nhìn thẳng sang cửa khu vệ sinh "${wcRoom}" qua "${shared}" — phòng thờ không được đối diện nhà vệ sinh.`,
          { room: altarRoom, wc: wcRoom, via: shared, level: level.level },
          altarRoom,
          rule.blocking,
        ),
      );
    }
  }
  return out;
}

/** Ban công nhô ra khỏi mặt nhà (đua ngoài ranh) có ba cạnh ngoài trời. */
export const BALCONY_PROJECTING_OPEN_SIDES = 3;

/** Một ban công so với mặt thoáng của tầng (T91). */
export interface BalconyFaceStatus {
  id: string;
  /** Số cạnh (0–4) nằm trên mép hình bao là mặt thoáng. */
  openSides: number;
  /** Có ít nhất một cạnh DÀI trên mặt thoáng (vuông: cạnh nào cũng là cạnh dài). */
  longOpen: boolean;
  /** Cạnh dài / cạnh ngắn. */
  ratio: number;
}

/**
 * Ban công của tầng và mặt thoáng của chúng. Cần `outline_faces`; tầng không có (artifact rất cũ)
 * thì trả rỗng — không đoán mặt thoáng.
 */
export function balconyFaces(
  level: AiFloorPlanLevel,
  edgeToleranceCm: number,
): BalconyFaceStatus[] {
  const faces = level.outline_faces ?? [];
  if (faces.length !== level.outline.length) return [];
  const outline = level.outline.map(toPt);
  const isOpen = (point: Pt) =>
    faceAtPoint(point, outline, faces as OutlineFace[], edgeToleranceCm) === 'open';
  return level.rooms
    .filter((room) => room.type === BALCONY)
    .map((room) => {
      const r = toRect(room.rect);
      const w = r.x1 - r.x0;
      const h = r.y1 - r.y0;
      const midX = (r.x0 + r.x1) / 2;
      const midY = (r.y0 + r.y1) / 2;
      const top = isOpen([midX, r.y0]);
      const bottom = isOpen([midX, r.y1]);
      const left = isOpen([r.x0, midY]);
      const right = isOpen([r.x1, midY]);
      const longOpen = (w >= h && (top || bottom)) || (h >= w && (left || right));
      return {
        id: room.id,
        openSides: [top, bottom, left, right].filter(Boolean).length,
        longOpen,
        ratio: Math.max(w, h) / Math.max(1, Math.min(w, h)),
      };
    });
}

/**
 * Ban công không quay cạnh dài ra mặt thoáng (T71, sửa T91). Ban công ĐUA ra ngoài ranh nhô khỏi mặt
 * nhà nên có ba cạnh thoáng — không xét (`BALCONY_PROJECTING_OPEN_SIDES`). Hai cạnh thoáng chưa đủ:
 * ban công chạy suốt chiều sâu nhà, thoáng ở hai đầu ngắn, vẫn là ban công trong sàn quay cạnh dài vào
 * tường nhà bên; ban công góc nhà thì tự có một cạnh dài thoáng. Ban công dài (> `longRatio`) → theo cờ
 * `blocking` của luật; ban công gần vuông → chỉ cảnh báo (tiêu chí điểm D3 trừ điểm).
 */
export function balconyViolations(level: AiFloorPlanLevel, ctx: MandatoryContext): PlanIssue[] {
  const rule = ctx.rules.balconyOnOpenFace;
  if (!rule) return [];
  const out: PlanIssue[] = [];
  for (const b of balconyFaces(level, rule.edgeToleranceCm)) {
    if (b.openSides >= BALCONY_PROJECTING_OPEN_SIDES || b.longOpen) continue;
    const long = b.ratio > rule.longRatio;
    out.push(
      issue(
        'balcony_off_open_face',
        long
          ? `Ban công "${b.id}" ở tầng ${level.level} dài (cạnh dài gấp ${Math.round(b.ratio * 10) / 10} lần cạnh ngắn) mà không quay cạnh dài ra mặt thoáng — ban công dài phải quay cạnh dài ra mặt ngoài thoáng, không ra phía nhà bên cạnh.`
          : `Ban công "${b.id}" ở tầng ${level.level} không quay cạnh dài ra mặt thoáng — ban công gần vuông nên không chặn, chỉ lưu ý.`,
        { room: b.id, level: level.level },
        b.id,
        long && rule.blocking,
      ),
    );
  }
  return out;
}

/** WC CHUNG lệch trục: không WC / hộp kỹ thuật tầng dưới nào trong tầm `stackReachCm`. */
export function wcOffAxis(
  below: ServiceAnchors,
  rooms: Rooms,
  ctx: MandatoryContext,
): Array<{ id: string; offsetM: number }> {
  const reach = ctx.stackReachCm;
  if (!ctx.rules.wcStack?.prefer || reach === null || !below.stack.length) return [];
  return zonesOf(rooms, ctx)
    .filter((zone) => zone.type === WC && !ctx.ensuite.has(zone.id))
    .flatMap((wc) => {
      const [cx, cy] = rectCentre(wc.rect);
      const nearest = Math.min(
        ...below.stack.map((rect) => {
          const [bx, by] = rectCentre(rect);
          return Math.hypot(bx - cx, by - cy);
        }),
      );
      return nearest > reach ? [{ id: wc.id, offsetM: Math.round(nearest) / 100 }] : [];
    });
}

/**
 * Mọi luật chặn trên CẢ NHÀ — cổng cuối. Tầng sắp theo số; luật đứng so mỗi tầng với tầng ngay dưới.
 */
export function mandatoryViolations(
  levels: readonly AiFloorPlanLevel[],
  ctx: MandatoryContext,
): PlanIssue[] {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const out: PlanIssue[] = [];
  sorted.forEach((level, index) => {
    const below = index > 0 ? sorted[index - 1]! : null;
    if (below && below.level === level.level - 1) {
      out.push(
        ...verticalViolations(
          serviceAnchors(below.rooms, ctx, wetRects(level.rooms)),
          level.rooms,
          level.level,
          ctx,
        ),
      );
    }
    out.push(...altarNeighbourViolations(level, ctx), ...balconyViolations(level, ctx));
  });
  return out;
}

/** Chữ nhật WC của một tầng — mốc để tầng dưới chia khu tránh đặt bếp dưới chúng. */
export function wetRects(rooms: Rooms): Rect[] {
  return rooms.filter((room) => room.type === WC).map((room) => toRect(room.rect));
}

/** Khoá so một vi phạm với phương án đã lưu — `mã|phòng`. */
export function mandatoryKey(found: Pick<PlanIssue, 'code' | 'ref'>): string {
  return `${found.code}|${found.ref ?? ''}`;
}

/** Ghi chú WC chung lệch trục trên cả nhà — không chặn, để kỹ sư thấy lệch bao nhiêu. */
export function offAxisNotes(
  levels: readonly AiFloorPlanLevel[],
  ctx: MandatoryContext,
): Array<{ code: string; message: string }> {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  return sorted.flatMap((level, index) => {
    const below = index > 0 ? sorted[index - 1]! : null;
    if (!below || below.level !== level.level - 1) return [];
    return wcOffAxis(serviceAnchors(below.rooms, ctx), level.rooms, ctx).map((wc) => ({
      code: 'wc_off_axis',
      message: `Khu vệ sinh chung "${wc.id}" ở tầng ${level.level} lệch trục khu vệ sinh / hộp kỹ thuật tầng dưới ${wc.offsetM.toString().replace('.', ',')} m — bộ xếp không tìm được cách xếp thẳng trục mà vẫn đủ công năng.`,
    }));
  });
}
