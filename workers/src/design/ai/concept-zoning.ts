/**
 * «Đầu bài có vừa lô không» + sơ đồ công năng từng tầng — «Bộ ý tưởng cho khách» B1
 * (doc/design/KE_HOACH_BO_Y_TUONG_KHACH.md, anh Dũng đồng ý hướng 30/10/2026).
 *
 * TẤT ĐỊNH, không gọi mô hình. Mỗi tầng: phòng đầu bài GHIM ở tầng ấy (chỗ để xe không ghim thì tầng 1, khu vệ sinh
 * khép kín của phòng ngủ khép kín, ô thang khi nhà nhiều tầng) xếp thành các HÀNG nguyên bề ngang, đi từ mặt đường vào
 * trong theo bảng dải trước / giữa / sau (`kb/concept_zoning.yaml`). Phòng cùng hàng đứng cạnh nhau theo bề ngang khi
 * vừa; không vừa thì chồng thêm hàng — đúng chỗ nhà ống hẹp hết chiều sâu (T189: AT01 4 × 15 m, tầng 1 cần ~15,3 m trên
 * 14 m khối nhà). Cách chia hàng tối ưu bằng quy hoạch động trên tập con (chiều sâu cộng nhỏ nhất); một hàng không trộn
 * dải trước với dải sau. Hàng có ô dải giữa chừa lối đi dọc (bề rộng hành lang theo loại nhà) khi tầng có phòng ở dải sau.
 *
 * Số đo cùng quy ước bộ đo chiều sâu đường dải (`feasibility.ts` `storeyDepth`, T189): mỗi ô cộng một phần tường
 * `ceil(tường ngoài + nửa vách ngăn)` mỗi chiều; ô cần bề ngang max(cạnh tối thiểu, diện tích / (sâu − tường)) + tường;
 * cạnh tối thiểu `usable.min_side_m` (đã theo loại nhà), ô thang nhỏ nhất theo loại thang của đầu bài. Diện tích chỉ lấy
 * số ĐẦU BÀI khai (và chỗ để xe suy từ số xe); phòng không khai diện tích chỉ tính cạnh tối thiểu. Cố ý ĐẾM THIẾU: «không
 * vừa» là chắc chắn thiếu, «vừa» chưa có nghĩa là mặt bằng xếp được (hành lang ngang, bậc tam cấp chưa tính).
 *
 * Hàm THUẦN — bên gọi đưa tri thức đầu bài (`planContext(...).knowledge`) và quy cách đã theo loại nhà / loại thang.
 */

import type { AiBriefDigest } from '@nvg/shared/design';
import { usableMinSide, type ConstructionNorms } from '../kb/construction';
import type { ConceptZoningTable } from '../kb/concept-zoning';
import { buildableFromDigest, setbacksFromDigest } from './buildable';
import type { HouseKnowledge } from './plan';

export type ZoningVerdict = 'fits' | 'tight' | 'over';

export interface ZoningCell {
  /** Mã ổn định trong tầng. */
  key: string;
  /** Loại phòng (khối gộp: loại đầu tiên). */
  type: string;
  /** Mọi loại trong khối (khối gộp có nhiều loại). */
  types: string[];
  label: string;
  /** Diện tích đầu bài khai, m² — `null` khi không khai. */
  areaM2: number | null;
  /** Thứ tự dải (0 = trước). */
  band: number;
  /** Bề ngang ô trong hàng của nó, cm (đã cộng tường) — để vẽ theo tỉ lệ. */
  widthCm: number;
  /**
   * Thứ tự trong `required_spaces` của đầu bài mà khối này chứa (khối gộp: nhiều dòng; ô thang, WC khép kín: rỗng) —
   * cùng số thứ tự trong khoá phòng `<loại>:<tầng>:<thứ tự>` của ảnh nội thất (`room-image.ts` `briefRooms`).
   */
  spaces: number[];
}

export interface ZoningRow {
  cells: ZoningCell[];
  depthCm: number;
  /** Hàng chừa lối đi dọc; bề rộng lối đi, cm. */
  passageCm: number;
}

export interface ZoningFloor {
  level: number;
  rows: ZoningRow[];
  /** Chiều sâu cần (tổng các hàng), m. */
  needM: number;
  /** Chiều sâu khối xây được, m. */
  haveM: number;
  verdict: ZoningVerdict;
  /** Thiếu bao nhiêu mét (0 khi vừa). */
  shortfallM: number;
  /** Cách nới đầu bài (chỉ tầng không vừa). */
  suggestions: string[];
}

export interface ConceptZoning {
  widthM: number;
  depthM: number;
  /** `false` = lô không chữ nhật, tính trên phần chữ nhật lớn nhất nằm gọn trong lô. */
  exact: boolean;
  floors: ZoningFloor[];
  verdict: ZoningVerdict;
  /** Thiếu lớn nhất trong các tầng, m. */
  shortfallM: number;
  /** Câu báo tiếng Việt, câu chính đứng đầu. */
  messages: string[];
  /** Cách nới đầu bài, gộp mọi tầng không vừa. */
  suggestions: string[];
  /** Phòng đầu bài chưa ghim tầng — không xếp vào sơ đồ. */
  unplaced: string[];
}

export interface ConceptZoningInput {
  table: ConceptZoningTable;
  knowledge: Pick<HouseKnowledge, 'floors' | 'brief_spaces' | 'garage_min_m2' | 'stair_geometry'>;
  /** Quy cách đã theo loại nhà (`withHouseProfile`) và loại thang (`withStairShape`). */
  construction: ConstructionNorms;
  digest: AiBriefDigest;
  labels: Record<string, string>;
  /** Định mức diện tích nghề — chỉ để gợi ý thu phòng khách về mức tối thiểu. */
  areaNorms?: ReadonlyMap<string, { min: number }>;
}

/** Ô khi đo: phòng thường (cạnh + diện tích) hoặc ô cố định (ô thang). */
interface Cell {
  key: string;
  type: string;
  types: string[];
  label: string;
  areaM2: number | null;
  band: number;
  /** cm. */
  side: number;
  /** cm². 0 = không đẩy chiều sâu theo diện tích. */
  area: number;
  fixed?: { w: number; d: number };
  /** Khu vệ sinh khép kín đi theo phòng ngủ — không đề xuất dời riêng. */
  attached?: boolean;
  /** Thứ tự trong `required_spaces` — xem `ZoningCell.spaces`. */
  spaces: number[];
}

interface Ctx {
  table: ConceptZoningTable;
  widthCm: number;
  wallCm: number;
  passageCm: number;
  passageBand: Set<number>;
}

/** Quy hoạch động trên tập con chỉ tới chừng này ô; quá thì chia theo từng dải (vẫn đúng, kém tối ưu hơn). */
const DP_MAX = 14;

function widthAt(cell: Cell, d: number, wall: number): number {
  if (cell.fixed) return cell.fixed.w;
  return Math.max(cell.side, cell.area > 0 ? cell.area / Math.max(d - wall, 1) : 0) + wall;
}

function minDepth(cell: Cell, wall: number): number {
  if (cell.fixed) return cell.fixed.d;
  return cell.side > 0 ? cell.side + wall : wall + 1;
}

/** Chiều sâu nhỏ nhất (cm, làm tròn lên) của một hàng chứa `cells` trên bề ngang `width`; vô cực khi không vừa. */
function rowDepth(cells: readonly Cell[], width: number, wall: number): number {
  const lb = Math.max(...cells.map((c) => minDepth(c, wall)));
  const total = (d: number) => cells.reduce((sum, c) => sum + widthAt(c, d, wall), 0);
  if (total(lb) <= width) return Math.ceil(lb);
  // Sâu vô hạn thì ô diện tích chỉ còn cạnh tối thiểu — vẫn quá bề ngang thì không hàng nào chứa nổi.
  const floorWidth = cells.reduce(
    (sum, c) => sum + (c.fixed ? c.fixed.w : Math.max(c.side, 0) + wall),
    0,
  );
  if (floorWidth >= width) return Number.POSITIVE_INFINITY;
  let lo = lb;
  let hi = lb * 2 + 100;
  while (total(hi) > width) hi *= 2;
  for (let i = 0; i < 40 && hi - lo > 0.5; i += 1) {
    const mid = (lo + hi) / 2;
    if (total(mid) <= width) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

interface Arranged {
  rows: { cells: Cell[]; depth: number; passage: number }[];
  depth: number;
}

/** Chia `cells` thành hàng, chiều sâu cộng nhỏ nhất. */
function partition(cells: readonly Cell[], ctx: Ctx, oversize = true): Arranged {
  const n = cells.length;
  if (n === 0) return { rows: [], depth: 0 };
  const lastBand = Math.max(...cells.map((c) => c.band));
  const facing = ctx.table.facing;
  const rowOf = (members: Cell[]) => {
    const bands = members.map((c) => c.band);
    if (Math.max(...bands) - Math.min(...bands) > 1) return { depth: Infinity, passage: 0 };
    if (
      new Set(bands).size > 1 &&
      members.some((c) => c.types.some((t) => facing.front.has(t) || facing.back.has(t)))
    ) {
      return { depth: Infinity, passage: 0 };
    }
    const passage = members.some((c) => ctx.passageBand.has(c.band) && c.band < lastBand)
      ? ctx.passageCm
      : 0;
    const depth = rowDepth(members, ctx.widthCm - passage, ctx.wallCm);
    if (Number.isFinite(depth) || members.length > 1 || !oversize) return { depth, passage };
    // Một ô rộng hơn cả lô (ô thang lô quá hẹp): vẫn đặt để sơ đồ đủ, chiều sâu theo cạnh tối thiểu.
    const c = members[0]!;
    return {
      depth: Math.ceil(
        Math.max(
          minDepth(c, ctx.wallCm),
          c.area / Math.max(ctx.widthCm - ctx.wallCm, 1) + ctx.wallCm,
        ),
      ),
      passage: 0,
    };
  };
  if (n > DP_MAX) {
    // Theo từng dải riêng — số ô mỗi dải nhỏ.
    const byBand = new Map<number, Cell[]>();
    for (const c of cells) byBand.set(c.band, [...(byBand.get(c.band) ?? []), c]);
    const parts = [...byBand.values()].map((group) => partition(group, ctx, oversize));
    return {
      rows: parts.flatMap((p) => p.rows),
      depth: parts.reduce((s, p) => s + p.depth, 0),
    };
  }
  const full = (1 << n) - 1;
  const row = new Array<{ depth: number; passage: number }>(full + 1);
  for (let mask = 1; mask <= full; mask += 1) {
    row[mask] = rowOf(cells.filter((_, i) => mask & (1 << i)));
  }
  const best = new Array<number>(full + 1).fill(Infinity);
  const pick = new Array<number>(full + 1).fill(0);
  best[0] = 0;
  for (let mask = 1; mask <= full; mask += 1) {
    const low = mask & -mask;
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if (!(sub & low)) continue;
      const total = row[sub]!.depth + best[mask ^ sub]!;
      if (total < best[mask]!) {
        best[mask] = total;
        pick[mask] = sub;
      }
    }
  }
  const rows: Arranged['rows'] = [];
  for (let mask = full; mask > 0 && Number.isFinite(best[mask]!); mask ^= pick[mask]!) {
    const sub = pick[mask]!;
    rows.push({
      cells: cells.filter((_, i) => sub & (1 << i)),
      depth: row[sub]!.depth,
      passage: row[sub]!.passage,
    });
  }
  return { rows, depth: best[full]! };
}

/** Xếp một tầng; ô thang thử cả hai hướng, lấy hướng nông hơn. */
function arrangeFloor(cells: readonly Cell[], ctx: Ctx): Arranged {
  const stair = cells.find((c) => c.fixed);
  if (!stair) return partition(cells, ctx);
  const turned: Cell = { ...stair, fixed: { w: stair.fixed!.d, d: stair.fixed!.w } };
  const a = partition(cells, ctx);
  // Hướng xoay chỉ dùng khi thật sự vừa — không lấy lối thoát «ô rộng hơn lô» cho nó.
  const b = partition(
    cells.map((c) => (c === stair ? turned : c)),
    ctx,
    false,
  );
  return b.depth < a.depth ? b : a;
}

const m1 = (cm: number) =>
  (Math.round(cm / 10) / 10).toLocaleString('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export function conceptZoning(input: ConceptZoningInput): ConceptZoning {
  const { table, knowledge: k, construction, digest, labels } = input;
  const box = buildableFromDigest(digest);
  const wallCm = Math.ceil(
    construction.walls.exterior_m * 100 + construction.walls.partition_m * 50,
  );
  const bandIndex = new Map<string, number>();
  table.bands.forEach((band, i) => band.types.forEach((type) => bandIndex.set(type, i)));
  const defaultBand = table.bands.findIndex((b) => b.id === table.defaultBand);
  const bandOf = (type: string) => bandIndex.get(type) ?? defaultBand;
  const typeOrder = new Map(table.bands.flatMap((b) => b.types).map((t, i) => [t, i] as const));
  const label = (type: string) => labels[type] ?? type;
  const cars = digest.parking?.cars ?? 0;
  const sideOf = (type: string) =>
    Math.round((usableMinSide(construction, type, { cars }) ?? 0) * 100);
  const corridor = construction.circulation?.corridor_clear_m ?? 0;
  const ctx: Ctx = {
    table,
    widthCm: Math.round(box.widthM * 100),
    wallCm,
    passageCm: corridor > 0 ? Math.round(corridor * 100) + wallCm : 0,
    passageBand: new Set(table.bands.flatMap((b, i) => (b.passageBeside ? [i] : []))),
  };
  const haveCm = Math.round(box.depthM * 100);

  // Nhóm gộp theo câu trả lời ĐÃ có (chưa trả lời thì để riêng).
  const lifestyle = (digest.lifestyle ?? {}) as Record<string, unknown>;
  const mergeGroups: string[][] = [];
  for (const [question, answers] of Object.entries(table.mergeByAnswer)) {
    const answer = lifestyle[question];
    if (typeof answer === 'string' && answers[answer]) {
      mergeGroups.push(...answers[answer].map((g) => [...g]));
    }
  }

  // Ô thang (lọt lòng → cộng tường), mọi tầng của nhà nhiều tầng.
  const shape = k.stair_geometry.shape;
  const stairShort = shape?.short_m ?? k.stair_geometry.two_flights_min_width_m;
  const stairLong =
    shape?.long_m ?? k.stair_geometry.two_flights_length_m ?? k.stair_geometry.one_flight_length_m;
  const stairCell = (level: number): Cell | null =>
    k.floors >= 2 && stairShort && stairLong
      ? {
          key: `t${level}-stair`,
          type: 'stair',
          types: ['stair'],
          label: label('stair'),
          areaM2: null,
          band: bandOf('stair'),
          side: 0,
          area: 0,
          spaces: [],
          fixed: {
            w: Math.ceil(stairShort * 100) + wallCm,
            d: Math.ceil(stairLong * 100) + wallCm,
          },
        }
      : null;

  const unplaced: string[] = [];
  const roomCell = (
    key: string,
    type: string,
    areaM2: number | null,
    extra: Partial<Cell> = {},
  ): Cell => ({
    key,
    type,
    types: [type],
    label: label(type),
    areaM2,
    band: bandOf(type),
    side: sideOf(type),
    area: table.sideOnly.has(type) || !areaM2 ? 0 : areaM2 * 1e4,
    spaces: [],
    ...extra,
  });

  const floorCells = (level: number): Cell[] => {
    const cells: Cell[] = [];
    k.brief_spaces.forEach((space, i) => {
      const floor = space.floor ?? (space.type === 'garage' ? 1 : null);
      if (floor !== level) return;
      const area = space.area_m2 ?? (space.type === 'garage' ? (k.garage_min_m2 ?? null) : null);
      cells.push(roomCell(`t${level}-${i}`, space.type, area, { spaces: [i] }));
      if (space.ensuite) {
        cells.push(
          roomCell(`t${level}-${i}-wc`, 'wc', null, {
            label: `${label('wc')} riêng`,
            attached: true,
          }),
        );
      }
    });
    const stair = stairCell(level);
    if (stair) cells.push(stair);
    return mergeCells(cells, mergeGroups);
  };

  const mergeCells = (cells: Cell[], groups: readonly string[][]): Cell[] => {
    let out = [...cells];
    for (const group of groups) {
      const members = group
        .map((type) => out.find((c) => c.type === type && c.types.length === 1 && !c.attached))
        .filter((c): c is Cell => Boolean(c));
      if (members.length < 2) continue;
      const known = members.filter((c) => c.areaM2 !== null);
      const areaM2 = known.length ? known.reduce((s, c) => s + c.areaM2!, 0) : null;
      const merged: Cell = {
        key: members.map((c) => c.key).join('+'),
        type: members[0]!.type,
        types: members.map((c) => c.type),
        label: members.map((c) => c.label).join(' + '),
        areaM2,
        band: members[0]!.band,
        side: Math.max(...members.map((c) => c.side)),
        area: members.reduce((s, c) => s + c.area, 0),
        spaces: members.flatMap((c) => c.spaces),
      };
      out = [...out.filter((c) => !members.includes(c)), merged];
    }
    return out;
  };

  k.brief_spaces.forEach((space) => {
    if (space.floor === null && space.type !== 'garage') unplaced.push(label(space.type));
  });

  const levels = Array.from({ length: Math.max(1, k.floors) }, (_, i) => i + 1);
  const baseCells = new Map(levels.map((level) => [level, floorCells(level)] as const));
  const depthOf = (cells: readonly Cell[], c: Ctx = ctx) => arrangeFloor(cells, c).depth;
  const verdictOf = (need: number, have: number): ZoningVerdict =>
    need > have
      ? 'over'
      : table.tightShare !== null && need >= have * table.tightShare
        ? 'tight'
        : 'fits';

  const floors: ZoningFloor[] = levels.map((level) => {
    const cells = baseCells.get(level)!;
    const arranged = arrangeFloor(cells, ctx);
    const need = arranged.depth;
    const verdict = verdictOf(need, haveCm);
    const rows = [...arranged.rows]
      .map((row) => ({
        ...row,
        cells: [...row.cells].sort(
          (a, b) =>
            a.band - b.band ||
            (typeOrder.get(a.type) ?? 99) - (typeOrder.get(b.type) ?? 99) ||
            a.key.localeCompare(b.key),
        ),
      }))
      .sort(
        (a, b) =>
          rank(a.cells) - rank(b.cells) || facingRank(a.cells, table) - facingRank(b.cells, table),
      );
    return {
      level,
      rows: rows.map((row) => ({
        depthCm: row.depth,
        passageCm: row.passage,
        cells: row.cells.map((c) => ({
          key: c.key,
          type: c.type,
          types: c.types,
          label: c.label,
          areaM2: c.areaM2,
          band: c.band,
          widthCm: Math.round(widthAt(c, row.depth, wallCm)),
          spaces: c.spaces,
        })),
      })),
      needM: Math.round(need) / 100,
      haveM: haveCm / 100,
      verdict,
      shortfallM: verdict === 'over' ? Math.round(need - haveCm) / 100 : 0,
      suggestions: [],
    };
  });
  numberDuplicates(floors);

  // Gợi ý nới đầu bài cho tầng không vừa — mỗi gợi ý tính lại thật, nói bớt bao nhiêu và đã vừa chưa.
  for (const floor of floors) {
    if (floor.verdict !== 'over') continue;
    const level = floor.level;
    const cells = baseCells.get(level)!;
    const need = floor.needM * 100;
    const out: string[] = [];
    const say = (what: string, after: number) => {
      const saved = need - after;
      if (saved < 5) return;
      out.push(
        `${what}: bớt khoảng ${m1(saved)} m chiều sâu${after <= haveCm ? ` (tầng ${level} khi đó vừa)` : ''}.`,
      );
    };
    const well = cells.filter((c) => c.types.includes('light_well'));
    if (well.length) {
      say(
        `Bỏ ${lowerFirst(label('light_well'))} ở tầng ${level} hoặc dời ra cuối nhà thành sân sau`,
        depthOf(cells.filter((c) => !well.includes(c))),
      );
    }
    const [mergeA, mergeB] = table.suggestMerge;
    if (
      mergeA &&
      mergeB &&
      cells.some((c) => c.types.length === 1 && c.type === mergeA) &&
      cells.some((c) => c.types.length === 1 && c.type === mergeB)
    ) {
      say(
        `Để ${lowerFirst(label(mergeA))} và ${lowerFirst(label(mergeB))} chung một không gian`,
        depthOf(mergeCells(cells, [[mergeA, mergeB]])),
      );
    }
    const livingMin = input.areaNorms?.get('living')?.min;
    const living = cells.find((c) => c.types.includes('living'));
    if (living && livingMin && living.areaM2 !== null && living.areaM2 > livingMin) {
      const less = living.areaM2 - livingMin;
      say(
        `Thu ${lowerFirst(label('living'))} từ ${fmtM2(living.areaM2)} m² xuống ${fmtM2(livingMin)} m²`,
        depthOf(
          cells.map((c) =>
            c === living ? { ...c, areaM2: c.areaM2! - less, area: c.area - less * 1e4 } : c,
          ),
        ),
      );
    }
    // Dời một phòng sang tầng khác mà tầng ấy vẫn vừa.
    const moves: { text: string; after: number }[] = [];
    for (const cell of cells) {
      if (cell.fixed || cell.attached || cell.types.some((t) => table.keepOnFloor.has(t))) continue;
      if (cell.types.includes('light_well')) continue;
      const after = depthOf(cells.filter((c) => c !== cell));
      for (const target of levels) {
        if (target === level) continue;
        const there = depthOf([...baseCells.get(target)!, { ...cell, key: `${cell.key}-moi` }]);
        if (there > haveCm) continue;
        moves.push({
          text: `Chuyển ${lowerFirst(cell.label)} ${target > level ? 'lên' : 'xuống'} tầng ${target}`,
          after,
        });
        break;
      }
    }
    moves.sort((a, b) => a.after - b.after);
    for (const move of moves.slice(0, 2)) say(move.text, move.after);
    // Sân gia chủ muốn sâu hơn khoảng lùi bắt buộc: thu về mức bắt buộc.
    const setbacks = setbacksFromDigest(digest);
    const yard = digest.massing?.yard_depth_m ?? {};
    for (const side of ['front', 'back'] as const) {
      const wanted = yard?.[side] ?? 0;
      const required = digest.site.setback_required_m?.[side] ?? 0;
      if (wanted > required && setbacks[side] === wanted) {
        const gain = Math.round((wanted - required) * 100);
        const after = need - gain;
        out.push(
          `Thu ${side === 'front' ? 'sân trước' : 'sân sau'} từ ${m1(wanted * 100)} m xuống ${m1(required * 100)} m (mức khoảng lùi bắt buộc): thêm khoảng ${m1(gain)} m chiều sâu khối nhà${after <= haveCm ? ` (tầng ${level} khi đó vừa)` : ''}.`,
        );
      }
    }
    if (!out.some((line) => line.includes('khi đó vừa'))) {
      out.push(`Thêm một tầng rồi dời bớt phòng của tầng ${level} lên trên.`);
    }
    floor.suggestions = out;
  }

  const over = floors.filter((f) => f.verdict === 'over');
  const tight = floors.filter((f) => f.verdict === 'tight');
  const verdict: ZoningVerdict = over.length ? 'over' : tight.length ? 'tight' : 'fits';
  const messages: string[] = [];
  if (over.length) {
    messages.push(
      `Đầu bài chưa vừa lô: ${over
        .map(
          (f) =>
            `tầng ${f.level} xếp từ mặt đường vào cần khoảng ${m1(f.needM * 100)} m chiều sâu mà khối nhà chỉ sâu ${m1(f.haveM * 100)} m — thiếu khoảng ${m1(f.shortfallM * 100)} m`,
        )
        .join('; ')}. Cần nới đầu bài trước khi làm phương án.`,
    );
  }
  for (const f of tight) {
    messages.push(
      `Tầng ${f.level} khá chật: cần khoảng ${m1(f.needM * 100)} m trên ${m1(f.haveM * 100)} m chiều sâu, chưa kể hành lang ngang và bậc tam cấp.`,
    );
  }
  if (!over.length && !tight.length) {
    const worst = [...floors].sort((a, b) => b.needM - a.needM)[0];
    messages.push(
      worst
        ? `Đầu bài vừa lô: tầng chật nhất (tầng ${worst.level}) cần khoảng ${m1(worst.needM * 100)} m trên ${m1(worst.haveM * 100)} m chiều sâu.`
        : 'Đầu bài vừa lô.',
    );
  }
  if (!box.exact) {
    messages.push(
      'Lô không phải hình chữ nhật: số đo tính trên phần chữ nhật lớn nhất nằm gọn trong lô, phần đất còn lại chưa dùng.',
    );
  }
  if (unplaced.length) {
    messages.push(
      `Chưa ghim tầng nên chưa xếp vào sơ đồ: ${[...new Set(unplaced)].join(', ')}. Ghim tầng ở đầu bài để sơ đồ đủ.`,
    );
  }
  messages.push(
    'Ước lượng theo cạnh tối thiểu và diện tích đầu bài khai, xếp phòng thành hàng từ mặt đường vào; chưa phải mặt bằng.',
  );
  return {
    widthM: box.widthM,
    depthM: box.depthM,
    exact: box.exact,
    floors,
    verdict,
    shortfallM: Math.max(0, ...floors.map((f) => f.shortfallM)),
    messages,
    suggestions: floors.flatMap((f) => f.suggestions),
    unplaced: [...new Set(unplaced)],
  };
}

function rank(cells: readonly { band: number }[]): number {
  return Math.min(...cells.map((c) => c.band)) * 10 + Math.max(...cells.map((c) => c.band));
}

/** Viết thường chữ đầu cho câu văn — giữ nguyên tên viết tắt («WC»). */
function lowerFirst(text: string): string {
  return text.length > 1 && text[1] === text[1]!.toLowerCase()
    ? text[0]!.toLowerCase() + text.slice(1)
    : text;
}

/** Hàng có phòng quay ra mặt trước đứng đầu dải, quay ra mặt sau đứng cuối. */
function facingRank(
  cells: readonly { types: readonly string[] }[],
  table: ConceptZoningTable,
): number {
  const has = (set: ReadonlySet<string>) => cells.some((c) => c.types.some((t) => set.has(t)));
  return has(table.facing.front) ? -1 : has(table.facing.back) ? 1 : 0;
}

function fmtM2(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

/** Cùng tên trong một tầng thì đánh số: «Phòng ngủ 1», «Phòng ngủ 2». */
function numberDuplicates(floors: ZoningFloor[]): void {
  for (const floor of floors) {
    const cells = floor.rows.flatMap((row) => row.cells);
    const counts = new Map<string, number>();
    for (const c of cells) counts.set(c.label, (counts.get(c.label) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const c of cells) {
      if ((counts.get(c.label) ?? 0) < 2) continue;
      const n = (seen.get(c.label) ?? 0) + 1;
      seen.set(c.label, n);
      c.label = `${c.label} ${n}`;
    }
  }
}
