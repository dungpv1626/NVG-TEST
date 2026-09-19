/**
 * Xếp một VÙNG chữ nhật thành cây chia — lõi của bộ giải ý định (T43).
 *
 * Mỗi lá mang vùng mô hình khai (cột, hàng trong lô). Một vùng nhiều lá được chia đôi đệ quy: chọn
 * trục, sắp lá theo toạ độ vùng dọc trục ấy, cắt giữa hai nhóm liền nhau, chiều dài hai nửa theo tỉ lệ
 * diện tích yêu cầu. Nhờ chỉ cắt giữa hai nhóm ĐÃ SẮP, phòng khai «phía trước» không bao giờ nằm sau
 * phòng khai «phía sau» trong cùng một vùng.
 *
 * Chọn cách chia bằng HÀM PHẠT trên chính các ô dựng được (`evaluate`), không bằng luật cứng:
 *  · cứng (trả `null`) — chỉ những gì làm tầng không dựng được: ô hẹp dưới sàn kỹ thuật (đủ đặt một
 *    cửa đi trừ tường), nhát cắt chừa dưới `MIN_CELL_CM`;
 *  · mềm (cộng phạt) — mọi thứ khác: phòng ngõ cụt không giáp phòng đi xuyên được, phòng lệch vùng,
 *    phòng muốn ra mặt đường mà không chạm mặt đường, cạnh ngắn dưới mức kinh nghiệm, tỉ lệ dài/rộng,
 *    ô thang lệch mốc tầng dưới. Số kinh nghiệm từ hồ sơ thật chỉ là THAM KHẢO (Haan, 14/09/2026).
 *
 * Tìm kiếm là beam hẹp: gần gốc thử vài cách chia tốt nhất theo ước lượng rẻ, sâu hơn thì tham lam.
 * Không có số ngẫu nhiên nào — cùng đầu vào cho cùng cây.
 */

import type { Rect } from '../draw/geometry';
import { MIN_CELL_CM } from '../tree/cells';
import { projectedDistance, zoneOfRect, type Zone } from './grid';
import {
  chain,
  extent,
  leaf,
  leaves,
  sharedEdge,
  slices,
  splitLengths,
  type Axis,
  type Placed,
  type Side,
} from './placed';

export type LeafRole = 'hub' | 'room' | 'open';

export interface PackLeaf {
  id: string;
  types: readonly string[];
  /** m² yêu cầu. */
  target: number;
  /** Sàn kỹ thuật theo tim tường, cm — CỨNG. */
  techMin: number;
  /** Cạnh ngắn kinh nghiệm theo tim tường, cm — MỀM. `null` = không có số. */
  pref: number | null;
  /** Tỉ lệ dài/rộng kinh nghiệm — MỀM. */
  aspectMax: number;
  /** Tỉ lệ dài/rộng DÙNG ĐƯỢC (`kb/construction_norms.yaml` mục `usable`) — cổng chặn, ở đây phạt nặng. */
  aspectHard: number | null;
  /**
   * Diện tích lọt lòng TỐI THIỂU đầu bài khai, m² (T45) — cổng chặn, ở đây phạt nặng. Gồm cả mức của
   * phòng ghép vào lá. `null` = đầu bài không khai.
   */
  areaFloor: number | null;
  zone: Zone;
  street: boolean;
  role: LeafRole;
  /** Ban công, sân thượng: cạnh DÀI phải nằm trên một mặt thoáng của hình bao. */
  needsOpenFace: boolean;
  /** Phòng ở, phòng thờ: không lấy cửa từ ô thang (`passage.stair_not_for`) — phải kề hành lang. */
  noStairDoor: boolean;
  /** Lá phòng mẹ khi đây là phòng khép kín. */
  parent: string | null;
  stair: boolean;
  /** Khu vệ sinh — tầng trên nên chồng lên khu vệ sinh tầng dưới. */
  wet: boolean;
  /** Mềm: nhẹ tay với vùng của phòng này (vòng nới). */
  zoneWeight: number;
  /** Đường vào: hub hoặc loại `served_from` cho phép. */
  hostTypes: ReadonlySet<string> | null;
}

export interface PackItem {
  key: string;
  primary: PackLeaf;
  children: PackLeaf[];
  /** m², gồm cả phòng khép kín. */
  weight: number;
  /**
   * m² theo tim phòng này và phòng khép kín của nó CẦN khi chia vào vùng: sàn đầu bài (đổi ra theo tim),
   * hoặc một phần diện tích mục tiêu khi đầu bài không khai (`SOFT_NEED_SHARE`).
   */
  need: number;
  col: number;
  row: number;
}

export interface PenaltyWeights {
  access: number;
  zone: number;
  street: number;
  openFace: number;
  pref: number;
  aspect: number;
  /** Mỗi đơn vị tỉ lệ vượt mức dùng được — đủ nặng để bộ giải tránh trước khi cổng phải bác. */
  aspectHard: number;
  /** Lá hụt diện tích đầu bài khai — cổng chắc chắn bác, nên nặng hơn cả thiếu đường vào. */
  areaFloor: number;
  anchor: number;
  area: number;
  hubLink: number;
  entrance: number;
  wet: number;
  /**
   * Ô thang tầng có tầng trên chắn TRỌN bề ngang hoặc trọn chiều sâu khối nhà — tầng trên không còn
   * đường đi vòng qua thang (nhà phố 4 m, thang nằm ngang cuối lô: Q-45d, 15/09/2026).
   */
  stairSpan: number;
}

export const DEFAULT_WEIGHTS: PenaltyWeights = {
  access: 6,
  zone: 1.2,
  street: 1.5,
  openFace: 3,
  pref: 1,
  aspect: 0.6,
  aspectHard: 4,
  areaFloor: 8,
  anchor: 0.5,
  area: 0.8,
  hubLink: 3,
  entrance: 4,
  wet: 1,
  stairSpan: 6,
};

/**
 * Mỗi chừng này m² THỪA so với chương trình tính như một lần lệch 100 % — phòng lớn thừa vài m² gần
 * như không bị phạt, phòng nhỏ nuốt cả chục m² thì bị phạt nặng.
 */
const AREA_OVER_M2 = 5;

/** Khu vệ sinh tầng trên coi là «chồng lên» khu dưới khi hai tâm cách nhau không quá chừng này, cm. */
const WET_STACK_CM = 150;

export interface PackEnv {
  footprint: Rect;
  /** Cạnh hình bao là mặt thoáng. */
  openSides: ReadonlySet<Side>;
  /** Cạnh hình bao đặt cửa chính / cửa xe (đầu bài khai, hoặc mặt tiếp cận). */
  entranceSide: Side | null;
  vehicleSide: Side | null;
  entryId: string | null;
  garageId: string | null;
  weights: PenaltyWeights;
  /** Tầng này có thang đi LÊN (không phải tầng trên cùng). */
  stairUp: boolean;
  /** Mốc tầng dưới theo tim tường; `null` ở tầng 1. */
  anchors: { stair: Rect | null; lightWells: Rect[]; wetRooms: Rect[] } | null;
  /**
   * Phần tường trừ khỏi MỖI chiều ô theo tim khi ước lượng sàn đầu bài, cm — bằng một bề dày tường ngoài,
   * mức mất lớn nhất (ô áp tường bao cả hai đầu).
   */
  floorWallCm: number;
  /** Chiều dài vách chung tối thiểu để đặt cửa giữa hai lá, cm. */
  doorShared: (a: PackLeaf, b: PackLeaf) => number;
  leafById: ReadonlyMap<string, PackLeaf>;
  /** Trần số lần dựng cây con — bộ giải không được ăn hết CPU của Worker. */
  budget: { left: number };
}

/** Beam: số cách chia thử ở mỗi độ sâu gần gốc; sâu hơn thì một. */
const BEAM = [3, 2, 2];

export interface Packed {
  placed: Placed;
  penalty: number;
}

/**
 * Đường vào một vùng từ BÊN NGOÀI nó.
 *
 *  · `hubs` — chữ nhật theo tim tường của phòng đi xuyên được nằm ngoài vùng (ô thang đã khoét, dải
 *    hành lang): lá chạm được đoạn đủ dài để đặt cửa thì có lối vào. Chính xác.
 *  · `sides` — cạnh vùng giáp một nửa anh em CHƯA dựng có phòng đi xuyên được: ước lượng lạc quan để
 *    chọn cách chia; cây cha đánh giá lại chính xác khi hai nửa đã dựng xong.
 */
export interface Reach {
  sides: ReadonlySet<Side>;
  hubs: readonly Rect[];
}

export const NO_REACH: Reach = { sides: new Set(), hubs: [] };

export function packRegion(
  rect: Rect,
  items: readonly PackItem[],
  reach: Reach,
  env: PackEnv,
  depth = 0,
): Packed | null {
  if (items.length === 0 || env.budget.left <= 0) return null;
  env.budget.left -= 1;
  if (items.length === 1) return placeItem(rect, items[0]!, reach, env);

  const options = splitOptions(rect, items, reach, env);
  const width = BEAM[depth] ?? 1;
  let best: Packed | null = comb(rect, items, reach, env);
  let tried = 0;
  for (const option of options) {
    if (tried >= width) break;
    const [ra, rb] = option.rects;
    const reachA = childReach(reach, rect, ra, option.axis, 'a', hasHub(option.b));
    const reachB = childReach(reach, rect, rb, option.axis, 'b', hasHub(option.a));
    const pa = packRegion(ra, option.a, reachA, env, depth + 1);
    if (!pa) continue;
    const pb = packRegion(rb, option.b, reachB, env, depth + 1);
    if (!pb) continue;
    tried += 1;
    const at = option.axis === 'x' ? ra.x1 : ra.y1;
    const placed: Placed = { kind: 'cut', axis: option.axis, at, a: pa.placed, b: pb.placed, rect };
    const penalty = evaluate(placed, rect, reach, env);
    if (!best || penalty < best.penalty) best = { placed, penalty };
  }
  return best;
}

/**
 * Dãy phòng dọc một vách đi xuyên được: mỗi phòng một lát cắt VUÔNG GÓC với vách, nên phòng nào cũng
 * chạm vách ấy (V-28). Đây là bố cục hành lang cơ bản nhất, và chia đôi đệ quy với beam hẹp hay bỏ sót
 * nó — lượt 9cce001a có vùng 5,45 × 9,25 m giáp hành lang suốt một cạnh mà vẫn xếp một phòng không cửa.
 *
 * Chỉ thử khi vùng có đường vào dọc MỘT cạnh (cạnh giáp nửa có hành lang, hoặc ô đi xuyên được bên
 * ngoài chạm gần trọn cạnh). Phòng xếp theo toạ độ vùng dọc cạnh — trước trước, sau sau. `null` khi
 * không vừa.
 */
function comb(rect: Rect, items: readonly PackItem[], reach: Reach, env: PackEnv): Packed | null {
  if (items.length < 2 || items.some((item) => item.primary.role === 'hub')) return null;
  let side: Side | null = null;
  let contact = 0;
  for (const s of ['x0', 'x1', 'y0', 'y1'] as const) {
    const along: Axis = s[0] === 'x' ? 'y' : 'x';
    const length = extent(rect, along);
    const touched = reach.sides.has(s)
      ? length
      : reach.hubs.reduce(
          (sum, hub) => sum + (touchesSide(rect, hub, s) ? sharedEdge(rect, hub) : 0),
          0,
        );
    if (touched >= 0.8 * length && touched > contact) {
      side = s;
      contact = touched;
    }
  }
  if (!side) return null;
  const axis: Axis = side[0] === 'x' ? 'y' : 'x';
  const coord = (item: PackItem) => (axis === 'x' ? item.col : item.row);
  const sorted = [...items].sort(
    (p, q) => coord(p) - coord(q) || q.weight - p.weight || p.key.localeCompare(q.key),
  );
  const lengths = splitLengths(
    axis === 'x' ? rect.x0 : rect.y0,
    extent(rect, axis),
    sorted.map((item) => ({ weight: item.weight, min: minAlong(item) })),
  );
  if (!lengths) return null;
  const across: Axis = axis === 'x' ? 'y' : 'x';
  const rects = slices(rect, axis, lengths);
  const parts: Placed[] = [];
  for (const [i, item] of sorted.entries()) {
    const r = rects[i]!;
    if (extent(r, across) < minAlong(item)) return null;
    const placed = placeItem(r, item, narrowReach(reach, rect, r), env);
    if (!placed) return null;
    parts.push(placed.placed);
  }
  const placed = chain(rect, axis, parts);
  return { placed, penalty: evaluate(placed, rect, reach, env) };
}

/** Đường vào của một mảnh con: cạnh vùng cha nó còn nằm trên, cộng các ô đi xuyên được đã biết. */
export function narrowReach(
  reach: Reach,
  parent: Rect,
  child: Rect,
  extraHubs: readonly Rect[] = [],
): Reach {
  const sides = new Set<Side>();
  for (const side of reach.sides) if (child[side] === parent[side]) sides.add(side);
  return { sides, hubs: [...extraHubs, ...reach.hubs] };
}

interface SplitOption {
  axis: Axis;
  a: PackItem[];
  b: PackItem[];
  rects: [Rect, Rect];
  estimate: number;
  order: number;
}

function splitOptions(
  rect: Rect,
  items: readonly PackItem[],
  reach: Reach,
  env: PackEnv,
): SplitOption[] {
  const out: SplitOption[] = [];
  let order = 0;
  for (const axis of ['y', 'x'] as const) {
    const coord = (item: PackItem) => (axis === 'x' ? item.col : item.row);
    const other = (item: PackItem) => (axis === 'x' ? item.row : item.col);
    const sorted = [...items].sort(
      (p, q) => coord(p) - coord(q) || other(p) - other(q) || p.key.localeCompare(q.key),
    );
    const total = sorted.reduce((sum, item) => sum + item.weight, 0);
    let running = 0;
    let balanced = 1;
    let bestGap = Infinity;
    const ks = new Set<number>();
    for (let k = 1; k < sorted.length; k += 1) {
      running += sorted[k - 1]!.weight;
      const gap = Math.abs(running - total / 2);
      if (gap < bestGap) {
        bestGap = gap;
        balanced = k;
      }
      if (coord(sorted[k - 1]!) !== coord(sorted[k]!) || sorted.length <= 4) ks.add(k);
    }
    ks.add(balanced);
    for (const k of [...ks].sort((p, q) => p - q)) {
      const a = sorted.slice(0, k);
      const b = sorted.slice(k);
      const origin = axis === 'x' ? rect.x0 : rect.y0;
      const lengths = splitLengths(origin, extent(rect, axis), [
        { weight: weightOf(a), min: Math.max(MIN_CELL_CM, ...a.map(minAlong)) },
        { weight: weightOf(b), min: Math.max(MIN_CELL_CM, ...b.map(minAlong)) },
      ]);
      if (!lengths) continue;
      const [ra, rb] = slices(rect, axis, lengths) as [Rect, Rect];
      const across = axis === 'x' ? 'y' : 'x';
      if (extent(ra, across) < Math.max(...a.map(minAlong))) continue;
      if (extent(rb, across) < Math.max(...b.map(minAlong))) continue;
      let estimate = groupAspect(ra, a.length) + groupAspect(rb, b.length);
      if (coord(sorted[k - 1]!) === coord(sorted[k]!)) estimate += 0.4;
      if (reach.sides.size > 0 || reach.hubs.length > 0) {
        for (const [group, r, siblingHub] of [
          [a, ra, hasHub(b)],
          [b, rb, hasHub(a)],
        ] as const) {
          const reaches =
            siblingHub ||
            [...reach.sides].some((side) => r[side] === rect[side]) ||
            reach.hubs.some((hub) => sharedEdge(r, hub) >= MIN_CELL_CM);
          if (!reaches && !hasHub(group) && group.some((i) => i.primary.role === 'room')) {
            estimate += 2;
          }
        }
      }
      out.push({ axis, a, b, rects: [ra, rb], estimate, order: order++ });
    }
  }
  void env;
  return out.sort((p, q) => p.estimate - q.estimate || p.order - q.order);
}

/** Ước lượng rẻ tỉ lệ dài/rộng của lá khi nhóm `m` lá chia đều một chữ nhật. */
function groupAspect(rect: Rect, m: number): number {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const s = Math.max(w, h) / Math.max(1, Math.min(w, h));
  const leafAspect = Math.max(s / m, m / s);
  return Math.max(0, leafAspect - 1.8);
}

function weightOf(items: readonly PackItem[]): number {
  return items.reduce((sum, item) => sum + item.weight, 0);
}

function minAlong(item: PackItem): number {
  return Math.max(item.primary.techMin, ...item.children.map((child) => child.techMin));
}

function hasHub(items: readonly PackItem[]): boolean {
  return items.some((item) => item.primary.role === 'hub');
}

/** Đường vào của nửa con: cạnh cha nó còn chạm, cộng nhát cắt khi nửa kia có phòng đi xuyên được. */
function childReach(
  reach: Reach,
  parent: Rect,
  child: Rect,
  axis: Axis,
  half: 'a' | 'b',
  siblingHasHub: boolean,
): Reach {
  const sides = new Set<Side>();
  for (const side of reach.sides) if (child[side] === parent[side]) sides.add(side);
  if (siblingHasHub)
    sides.add(axis === 'x' ? (half === 'a' ? 'x1' : 'x0') : half === 'a' ? 'y1' : 'y0');
  return { sides, hubs: reach.hubs };
}

// ── Một lá, và phòng khép kín của nó ──────────────────────────────────────────────────────

function placeItem(rect: Rect, item: PackItem, reach: Reach, env: PackEnv): Packed | null {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  if (item.children.length === 0) {
    if (Math.min(w, h) < item.primary.techMin) return null;
    const placed = leaf(item.primary.id, rect);
    return { placed, penalty: evaluate(placed, rect, reach, env) };
  }

  // Phòng khép kín là một dải ở MỘT cạnh của ô, chia dọc dải cho từng phòng con. Thử cả bốn cạnh; cạnh
  // có đường vào (phía giáp phòng đi xuyên được) để lại cho phòng mẹ mở cửa, nên thử sau cùng.
  const facing = (side: Side) =>
    reach.sides.has(side) ||
    reach.hubs.some((hub) => sharedEdge(rect, hub) > 0 && touchesSide(rect, hub, side));
  const total = item.weight;
  const childWeight = item.children.reduce((sum, child) => sum + child.target, 0);
  const all = ['y1', 'x1', 'x0', 'y0'] as const;
  const sides: Side[] = [...all.filter((s) => !facing(s)), ...all.filter((s) => facing(s))];

  let best: Packed | null = null;
  for (const side of sides) {
    const axis: Axis = side[0] as Axis;
    const length = extent(rect, axis);
    const stripMin = Math.max(...item.children.map((child) => child.techMin));
    const origin = axis === 'x' ? rect.x0 : rect.y0;
    const childFirst = side.endsWith('0');
    const parts = childFirst
      ? [
          { weight: childWeight, min: stripMin },
          { weight: total - childWeight, min: item.primary.techMin },
        ]
      : [
          { weight: total - childWeight, min: item.primary.techMin },
          { weight: childWeight, min: stripMin },
        ];
    const lengths = splitLengths(origin, length, parts);
    if (!lengths) continue;
    const [r0, r1] = slices(rect, axis, lengths) as [Rect, Rect];
    const strip = childFirst ? r0 : r1;
    const main = childFirst ? r1 : r0;
    const across: Axis = axis === 'x' ? 'y' : 'x';
    if (extent(main, across) < item.primary.techMin) continue;
    const alongLengths = splitLengths(
      across === 'x' ? strip.x0 : strip.y0,
      extent(strip, across),
      item.children.map((child) => ({ weight: child.target, min: child.techMin })),
    );
    if (!alongLengths) continue;
    const childRects = slices(strip, across, alongLengths);
    const stripNode = chain(
      strip,
      across,
      item.children.map((child, i) => leaf(child.id, childRects[i]!)),
    );
    const mainNode = leaf(item.primary.id, main);
    const at = axis === 'x' ? r0.x1 : r0.y1;
    const placed: Placed = {
      kind: 'cut',
      axis,
      at,
      a: childFirst ? stripNode : mainNode,
      b: childFirst ? mainNode : stripNode,
      rect,
    };
    const penalty = evaluate(placed, rect, reach, env);
    if (!best || penalty < best.penalty) best = { placed, penalty };
  }
  return best;
}

/** `hub` nằm ngay bên kia cạnh `side` của `rect`. */
function touchesSide(rect: Rect, hub: Rect, side: Side): boolean {
  switch (side) {
    case 'x0':
      return hub.x1 === rect.x0;
    case 'x1':
      return hub.x0 === rect.x1;
    case 'y0':
      return hub.y1 === rect.y0;
    case 'y1':
      return hub.y0 === rect.y1;
  }
}

// ── Hàm phạt ─────────────────────────────────────────────────────────────────────────────

/** Phạt của một cây con — càng nhỏ càng tốt. Không bao giờ ném. */
export function evaluate(placed: Placed, region: Rect, reach: Reach, env: PackEnv): number {
  const w = env.weights;
  const cells = leaves(placed);
  const info = cells.map((cell) => ({ cell, leaf: env.leafById.get(cell.id)! }));
  const hubs = info.filter((entry) => entry.leaf?.role === 'hub');
  const outside = (r: Rect, l: PackLeaf) =>
    [...reach.sides].some((side) => r[side] === region[side]) ||
    reach.hubs.some((hub) => sharedEdge(r, hub) >= env.doorShared(l, l));
  let penalty = 0;

  for (const { cell, leaf: l } of info) {
    if (!l) continue;
    const r = cell.rect;
    const cw = r.x1 - r.x0;
    const ch = r.y1 - r.y0;
    const short = Math.min(cw, ch);
    const long = Math.max(cw, ch);

    if (l.pref !== null && short < l.pref) penalty += w.pref * ((l.pref - short) / l.pref) * 3;
    const aspect = long / Math.max(1, short);
    if (aspect > l.aspectMax) penalty += w.aspect * (aspect - l.aspectMax);
    if (l.aspectHard !== null && aspect > l.aspectHard) {
      penalty += w.aspectHard * (aspect - l.aspectHard);
    }

    penalty +=
      w.zone *
      l.zoneWeight *
      projectedDistance(env.footprint, zoneOfRect(env.footprint, r), l.zone);
    if (l.street && r.y0 !== env.footprint.y0) penalty += w.street;
    // Ban công, lô gia: phải quay CẠNH DÀI ra mặt thoáng (Haan 18/09/2026) — không phải chạm mặt
    // thoáng bằng cạnh nào cũng được. Cùng một luật với cổng `arrange_outdoor_off_face`; ở đây là
    // khoản phạt để bộ xếp chọn đúng chỗ ngay, thay vì để cổng bác cả cây.
    if (l.needsOpenFace) {
      const longSides: Side[] =
        cw > ch ? ['y0', 'y1'] : ch > cw ? ['x0', 'x1'] : ['y0', 'y1', 'x0', 'x1'];
      const onFace = longSides.some(
        (side) => env.openSides.has(side) && r[side] === env.footprint[side],
      );
      if (!onFace) penalty += w.openFace;
    }

    // Định mức NGHỀ (`kb/space_norms.yaml`) cố ý KHÔNG vào hàm phạt: đo ngày 16/09/2026 trên sáu ý
    // định thật của hai lượt đo, thêm một khoản phạt cho phòng dưới mức nghề không đổi được phòng nào
    // (WC 2,26 m² cho mức 2,4 vẫn y nguyên) mà làm một ca biến thể mất phương án. Định mức nghề nằm ở
    // BỘ CHẤM (A5, A6) — đúng quyết định của Haan: chỉ trừ điểm.
    // Diện tích: lọt lòng ước lượng theo tim trừ nửa vách mỗi phía. THIẾU phạt tương đối (kẹp 2);
    // THỪA phạt theo m² tuyệt đối, không kẹp — kẹp thì một WC 4 m² nuốt 45 m² sàn dư chỉ tốn 1,6 điểm
    // phạt, rẻ hơn mọi cách chia lại (phát lại lượt 9cce001a, V-28).
    const clear = (Math.max(0, cw - 16) * Math.max(0, ch - 16)) / 10_000;
    if (l.target > 0) {
      penalty +=
        clear < l.target
          ? w.area * Math.min(2, (l.target - clear) / l.target)
          : w.area * Math.max((clear - l.target) / l.target, (clear - l.target) / AREA_OVER_M2);
    }
    // Sàn đầu bài: ước lượng THẬN TRỌNG (trừ trọn tường ngoài mỗi chiều) — lọt lòng thật chỉ lớn hơn,
    // nên cây bộ giải chọn không bị cổng bác vì hụt vài phần mười m². Hụt bao nhiêu cũng phạt ít nhất
    // một lần trọng số: phòng 29,7 m² cho mức 30 m² là hỏng y như phòng 12 m².
    if (l.areaFloor !== null) {
      const safe = (Math.max(0, cw - env.floorWallCm) * Math.max(0, ch - env.floorWallCm)) / 10_000;
      if (safe < l.areaFloor) {
        penalty += w.areaFloor * (1 + Math.min(3, (10 * (l.areaFloor - safe)) / l.areaFloor));
      }
    }

    // Khu vệ sinh tầng trên: phạt TĂNG DẦN theo khoảng cách tới khu vệ sinh tầng dưới gần nhất, không
    // phải một bậc thang có/không (Q-B, 18/09/2026). Bậc thang không cho bộ xếp lý do nào để kéo phòng
    // từ 4 m xuống 2 m — nó chỉ thấy «vẫn chưa chồng» ở cả hai chỗ, nên đo thật ra E2 = 0 ở mọi bản đã
    // lưu, và nâng trọng số lên gấp năm cũng không đổi ca nào.
    if (env.anchors?.wetRooms.length && l.wet) {
      const [cx, cy] = [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
      const gap = Math.min(
        ...env.anchors.wetRooms.map((wet) =>
          Math.hypot((wet.x0 + wet.x1) / 2 - cx, (wet.y0 + wet.y1) / 2 - cy),
        ),
      );
      if (gap > WET_STACK_CM) penalty += w.wet * (1 + (gap - WET_STACK_CM) / 100);
    }

    if (l.stair && env.stairUp && !env.anchors?.stair) {
      const f = env.footprint;
      if ((r.x0 === f.x0 && r.x1 === f.x1) || (r.y0 === f.y0 && r.y1 === f.y1)) {
        penalty += w.stairSpan;
      }
    }

    if (env.anchors?.stair && l.stair) {
      const s = env.anchors.stair;
      penalty +=
        (w.anchor *
          (Math.abs(r.x0 - s.x0) +
            Math.abs(r.x1 - s.x1) +
            Math.abs(r.y0 - s.y0) +
            Math.abs(r.y1 - s.y1))) /
        100;
    }

    if (
      l.id === env.entryId &&
      env.entranceSide &&
      r[env.entranceSide] !== env.footprint[env.entranceSide]
    ) {
      penalty += w.entrance;
    }
    if (
      l.id === env.garageId &&
      env.vehicleSide &&
      r[env.vehicleSide] !== env.footprint[env.vehicleSide]
    ) {
      penalty += w.entrance;
    }

    // Đường vào.
    if (l.parent) {
      const parent = info.find((entry) => entry.cell.id === l.parent);
      if (parent && sharedEdge(r, parent.cell.rect) < env.doorShared(l, parent.leaf)) {
        penalty += w.access;
      }
      continue;
    }
    if (l.role === 'room') {
      const hosted = info.some(
        (entry) =>
          entry.cell.id !== l.id &&
          entry.leaf &&
          (entry.leaf.role === 'hub' ||
            (l.hostTypes !== null && entry.leaf.types.some((type) => l.hostTypes!.has(type)))) &&
          // Phòng ở không lấy cửa từ ô thang được (Haan 18/09/2026), nên ô thang không tính là
          // đường vào của nó: phạt ngay ở đây để bộ xếp tìm chỗ kề hành lang, thay vì để cổng bác
          // cả cây rồi rơi sang ứng viên xấu hơn.
          !(l.noStairDoor && entry.leaf.stair) &&
          sharedEdge(r, entry.cell.rect) >= env.doorShared(l, entry.leaf),
      );
      if (!hosted && !outside(r, l)) penalty += w.access;
    }
  }

  // Phòng đi xuyên được phải nối được với nhau (hoặc với đường vào từ ngoài vùng).
  if (hubs.length > 1 || (hubs.length === 1 && reach.hubs.length > 0)) {
    for (const hub of hubs) {
      const linked =
        outside(hub.cell.rect, hub.leaf) ||
        hubs.some(
          (other) =>
            other !== hub &&
            sharedEdge(hub.cell.rect, other.cell.rect) >= env.doorShared(hub.leaf, other.leaf),
        );
      if (!linked) penalty += w.hubLink;
    }
  }
  return penalty;
}
