/**
 * Bộ khung (parti) của một tầng — các cách tổ chức giao thông mà bộ giải thử (T43).
 *
 * Ý định nói phòng nào ở VÙNG nào; nó không nói hành lang chạy đâu. Cùng một ý định cho ra những mặt
 * bằng rất khác nhau tuỳ hành lang, nên bộ giải thử vài khung và để hàm phạt + cổng kiểm + bộ chấm
 * chọn:
 *
 *  · `zones`  — không dải hành lang riêng: phòng khách, phòng ăn, thang làm nút giao thông. Hợp tầng 1
 *               nhà phố, và tầng không có phòng hành lang trong chương trình.
 *  · `spine`  — hành lang là một DẢI dọc theo trục chính (trước→sau nếu trục `y`), nằm sát một bên
 *               (`lo`/`hi`) hoặc giữa (`mid`), chạy qua một khoảng hàng; phòng hai bên dải mở cửa ra
 *               dải, hàng ngoài khoảng là «nắp» trước/sau. Thang có thể nằm trong dải.
 *  · `band`   — hành lang là một dải NGANG giữa hai hàng, phòng hai hàng mở cửa ra dải.
 *
 * Khung nào không dựng được (thiếu phòng hành lang, một bên dải rỗng) thì bỏ qua, không lỗi.
 */

import type { Rect } from '../draw/geometry';
import { MIN_CELL_CM } from '../tree/cells';
import { projectedDistance, SPLIT_MIN_CM, zoneOfRect } from './grid';
import {
  evaluate,
  narrowReach,
  NO_REACH,
  packRegion,
  type PackEnv,
  type PackItem,
  type Reach,
} from './pack';
import {
  chain,
  extent,
  halves,
  sharedEdge,
  slices,
  splitLengths,
  type Axis,
  type Placed,
  type Side,
} from './placed';

export interface FrameCandidate {
  key: string;
  placed: Placed;
  penalty: number;
}

export interface FrameInput {
  footprint: Rect;
  items: readonly PackItem[];
  env: PackEnv;
  /** Bề rộng dải hành lang theo tim tường, cm: `edge` khi dải áp tường bao, `inner` khi nằm giữa. */
  corridorWidth: { edge: number; inner: number };
  /** Mã lá hành lang (`circulation`, `core` không phải thang). */
  corridorIds: ReadonlySet<string>;
  stairIds: ReadonlySet<string>;
  trace?: (line: string) => void;
}

export function enumerateFrames(input: FrameInput): FrameCandidate[] {
  const out: FrameCandidate[] = [];
  const push = (key: string, placed: Placed | null) => {
    if (!placed) return;
    out.push({ key, placed, penalty: evaluate(placed, input.footprint, NO_REACH, input.env) });
  };

  const whole = packRegion(input.footprint, input.items, NO_REACH, input.env);
  push('zones', whole?.placed ?? null);

  for (const frame of corridorFrames(input, input.footprint, input.items, NO_REACH)) {
    push(frame.key, frame.placed);
  }
  return out;
}

/**
 * Các khung có DẢI hành lang (`spine`, `band`) trong một vùng chữ nhật `region` — cả hình bao (tầng
 * không có mốc) lẫn một vùng tự do của cách khoét mốc (tầng trên, V-28). `reach` là đường vào vùng từ
 * bên ngoài (ô thang đã khoét): dải và các phòng quanh nó đều mở cửa ra được.
 *
 * Vùng không có lá hành lang thì không có khung nào.
 */
function corridorFrames(
  input: FrameInput,
  region: Rect,
  items: readonly PackItem[],
  reach: Reach,
): { key: string; placed: Placed }[] {
  const out: { key: string; placed: Placed }[] = [];
  const push = (key: string, placed: Placed | null) => {
    if (placed) out.push({ key, placed });
  };
  if (!items.some((item) => input.corridorIds.has(item.key))) return out;

  const axes: Axis[] = [];
  if (extent(region, 'y') >= SPLIT_MIN_CM) axes.push('y');
  if (extent(region, 'x') >= SPLIT_MIN_CM) axes.push('x');
  if (axes.length === 0) axes.push(extent(region, 'y') >= extent(region, 'x') ? 'y' : 'x');

  const frame = { input, region, items, reach };
  for (const axis of axes) {
    const primary = (item: PackItem) => (axis === 'y' ? item.row : item.col);
    const rows = [...new Set(items.map(primary))].sort((a, b) => a - b);
    const across: Axis = axis === 'y' ? 'x' : 'y';
    const positions: ('lo' | 'mid' | 'hi')[] =
      extent(region, across) >= SPLIT_MIN_CM ? ['lo', 'mid', 'hi'] : ['lo', 'hi'];
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i; j < rows.length; j += 1) {
        for (const pos of positions) {
          for (const stairInSpine of [false, true]) {
            const key = `spine|${axis}|${pos}|${rows[i]}-${rows[j]}|${stairInSpine ? 'st' : 'ns'}`;
            push(key, spine(frame, axis, pos, rows[i]!, rows[j]!, stairInSpine));
          }
        }
      }
    }
    for (let i = 0; i + 1 < rows.length; i += 1) {
      push(`band|${axis}|${rows[i]}`, band(frame, axis, rows[i]!));
    }
  }
  return out;
}

interface RegionFrame {
  input: FrameInput;
  region: Rect;
  items: readonly PackItem[];
  /** Đường vào vùng từ bên ngoài. */
  reach: Reach;
}

function weight(items: readonly PackItem[]): number {
  return items.reduce((sum, item) => sum + item.weight, 0);
}

function minOf(items: readonly PackItem[]): number {
  return Math.max(
    MIN_CELL_CM,
    ...items.flatMap((item) => [item.primary.techMin, ...item.children.map((c) => c.techMin)]),
  );
}

/** Hành lang dọc trục chính, hai bên là phòng; hàng ngoài khoảng `[lo, hi]` thành nắp trước/sau. */
function spine(
  frame: RegionFrame,
  axis: Axis,
  pos: 'lo' | 'mid' | 'hi',
  lo: number,
  hi: number,
  stairInSpine: boolean,
): Placed | null {
  const { input, region: footprint, reach } = frame;
  const { env } = input;
  const primary = (item: PackItem) => (axis === 'y' ? item.row : item.col);
  const cross = (item: PackItem) => (axis === 'y' ? item.col : item.row);
  const inRun = (item: PackItem) => primary(item) >= lo && primary(item) <= hi;

  const spineItems = frame.items.filter(
    (item) =>
      input.corridorIds.has(item.key) ||
      (stairInSpine && input.stairIds.has(item.key) && inRun(item)),
  );
  if (stairInSpine && !spineItems.some((item) => input.stairIds.has(item.key))) return null;
  const rest = frame.items.filter((item) => !spineItems.includes(item));
  const capLo = rest.filter((item) => primary(item) < lo);
  const capHi = rest.filter((item) => primary(item) > hi);
  const run = rest.filter(inRun);
  if (run.length === 0) return null;

  const across: Axis = axis === 'y' ? 'x' : 'y';
  let sideA: PackItem[] = [];
  let sideB: PackItem[] = [];
  if (pos === 'lo') sideB = run;
  else if (pos === 'hi') sideA = run;
  else {
    sideA = run.filter((item) => cross(item) < 1);
    sideB = run.filter((item) => cross(item) > 1);
    for (const item of run.filter((it) => cross(it) === 1)) {
      if (weight(sideA) <= weight(sideB)) sideA.push(item);
      else sideB.push(item);
    }
    if (sideA.length === 0 || sideB.length === 0) return null;
  }

  // Dọc trục chính: [nắp trước][khoảng chạy][nắp sau].
  const bands = [
    ...(capLo.length ? [{ kind: 'capLo' as const, items: capLo }] : []),
    { kind: 'run' as const, items: [...run, ...spineItems] },
    ...(capHi.length ? [{ kind: 'capHi' as const, items: capHi }] : []),
  ];
  const lengths = splitLengths(
    axis === 'x' ? footprint.x0 : footprint.y0,
    extent(footprint, axis),
    bands.map((b) => ({ weight: weight(b.items), min: minOf(b.items) })),
  );
  if (!lengths) return null;
  const rects = slices(footprint, axis, lengths);
  const runIndex = bands.findIndex((b) => b.kind === 'run');
  const runRect = rects[runIndex]!;

  // Khoảng chạy, ngang trục: [bên A][dải][bên B]. Dựng chữ nhật trước để nắp và hai bên biết dải nằm đâu.
  // Dải áp tường bao thì mất cả nửa tường ngoài; áp một ô trong nhà (thang đã khoét) thì chỉ mất vách.
  const stripSide: Side | null =
    pos === 'lo'
      ? across === 'x'
        ? 'x0'
        : 'y0'
      : pos === 'hi'
        ? across === 'x'
          ? 'x1'
          : 'y1'
        : null;
  const onBoundary = stripSide !== null && footprint[stripSide] === input.footprint[stripSide];
  const stripMin = Math.max(
    onBoundary ? input.corridorWidth.edge : input.corridorWidth.inner,
    minOf(spineItems),
  );
  const crossParts = [
    ...(sideA.length ? [{ kind: 'A' as const, items: sideA }] : []),
    { kind: 'S' as const, items: spineItems },
    ...(sideB.length ? [{ kind: 'B' as const, items: sideB }] : []),
  ];
  const crossLengths = splitLengths(
    across === 'x' ? runRect.x0 : runRect.y0,
    extent(runRect, across),
    crossParts.map((p) =>
      p.kind === 'S'
        ? { weight: 0, min: stripMin, fixed: stripMin }
        : { weight: weight(p.items), min: minOf(p.items) },
    ),
  );
  if (!crossLengths) return null;
  const crossRects = slices(runRect, across, crossLengths);
  const spineRect = crossRects[crossParts.findIndex((p) => p.kind === 'S')]!;

  const parts: Placed[] = [];
  for (let k = 0; k < bands.length; k += 1) {
    const band = bands[k]!;
    const rect = rects[k]!;
    if (band.kind !== 'run') {
      const packed = packRegion(
        rect,
        band.items,
        narrowReach(reach, footprint, rect, [spineRect]),
        env,
      );
      if (!packed) return null;
      parts.push(packed.placed);
      continue;
    }
    const runParts: Placed[] = [];
    for (let m = 0; m < crossParts.length; m += 1) {
      const part = crossParts[m]!;
      const packed = packRegion(
        crossRects[m]!,
        part.items,
        part.kind === 'S'
          ? narrowReach(reach, footprint, crossRects[m]!)
          : narrowReach(reach, footprint, crossRects[m]!, [spineRect]),
        env,
      );
      if (!packed) return null;
      runParts.push(packed.placed);
    }
    parts.push(chain(rect, across, runParts));
  }
  return chain(footprint, axis, parts);
}

/**
 * Tầng trên: KHOÉT các ô mốc tầng dưới (thang, giếng trời) đúng toạ độ trước, rồi xếp phần còn lại
 * (T38, T43).
 *
 * Ép ô thang SAU khi đã xếp (dời nhát cắt) hỏng ngay khi cây xếp đặt thang áp một cạnh hình bao khác
 * tầng dưới — không có nhát cắt nào để dời. Khoét trước thì mốc đúng theo CẤU TRÚC: hình bao được chia
 * guillotine bằng các nhát cắt nằm trên cạnh của mốc, không nhát nào xuyên qua lòng một mốc. Mỗi mảnh
 * không chứa mốc là một vùng tự do, nhận phòng theo vùng ý định và sức chứa.
 *
 * Vùng tự do không nhận được phòng nào (phòng không đủ để chia) mà nhỏ và giáp giếng trời thì thành ô
 * thông tầng `void_N` — giếng trời mở rộng ở tầng trên, không phải một khoảng chết không ai dùng.
 */
export interface ForcedCell {
  /** Mã lá của phòng mang mốc (thang, giếng trời). */
  key: string;
  rect: Rect;
}

/** Một «làn» đường vào: đoạn vách chung với ô thang đủ đặt một cửa, cm. */
const LANE_CM = 150;
/** Mặt tiền trung bình một phòng chiếm dọc một vách đi xuyên được, cm — để đếm số làn của vách dài. */
const ROOM_FRONT_CM = 300;
/** Phạt mỗi phòng ngõ cụt thừa so với số làn đường vào của vùng. */
const ACCESS_COST = 3;

/** Vùng trống chỉ mượn một phòng khi diện tích vùng đạt ít nhất chừng này phần diện tích phòng ấy. */
const DONOR_MIN_SHARE = 0.6;

/**
 * Phạt một vùng mà diện tích phòng cần vượt diện tích vùng — nặng hơn mọi lệch vùng, lệch tải hay ngõ
 * cụt. Đo trên hai lượt thật: 10, 20 hay 40 cho cùng kết quả; 0 thì tầng 2 của 4a521f52 hỏng.
 */
const CAPACITY_COST = 20;

/** Phạt mỗi phòng cần cửa quá nhỏ cho chiều sâu vùng — cùng hạng với sức chứa. */
const DEPTH_COST = 20;
/** Phòng được nở tới chừng này lần diện tích xếp để chạy suốt chiều sâu vùng. */
const DEPTH_SLACK = 1.5;

/** Vùng thừa lớn nhất được biến thành ô thông tầng, cm². */
const VOID_MAX_CM2 = 80_000;

export function enumerateCarved(
  input: FrameInput,
  forced: readonly ForcedCell[],
): FrameCandidate[] {
  const out: FrameCandidate[] = [];
  if (forced.length === 0) return out;
  const f = input.footprint;
  for (const cell of forced) {
    const r = cell.rect;
    if (r.x0 < f.x0 || r.y0 < f.y0 || r.x1 > f.x1 || r.y1 > f.y1) return out;
  }
  const seen = new Set<string>();
  for (const prefer of ['y', 'x'] as const) {
    for (const partition of partitions(f, forced, prefer)) {
      const signature = JSON.stringify(partition);
      if (seen.has(signature)) continue;
      seen.add(signature);
      for (const spread of [3, 1] as const) {
        for (const corridor of [false, true]) {
          const placed = fillPartition(input, partition, forced, spread, corridor);
          if (placed) {
            out.push({
              key: `carve|${prefer}|${out.length}|${spread}${corridor ? '|dai' : ''}`,
              placed,
              penalty: evaluate(placed, f, NO_REACH, input.env),
            });
          }
        }
      }
    }
  }
  return out;
}

type Part =
  | { kind: 'forced'; key: string; rect: Rect }
  | { kind: 'free'; rect: Rect }
  | { kind: 'cut'; axis: Axis; at: number; a: Part; b: Part; rect: Rect };

/** Trần số cách chia hình bao theo mốc — mỗi cách là một lượt xếp đầy đủ. */
const PARTITIONS_MAX = 6;

function partitions(rect: Rect, forced: readonly ForcedCell[], prefer: Axis): Part[] {
  const inside = forced.filter(
    (cell) =>
      cell.rect.x0 >= rect.x0 &&
      cell.rect.x1 <= rect.x1 &&
      cell.rect.y0 >= rect.y0 &&
      cell.rect.y1 <= rect.y1,
  );
  if (inside.length === 0) {
    return Math.min(extent(rect, 'x'), extent(rect, 'y')) >= MIN_CELL_CM
      ? [{ kind: 'free', rect }]
      : [];
  }
  const only = inside[0]!;
  if (
    inside.length === 1 &&
    only.rect.x0 === rect.x0 &&
    only.rect.x1 === rect.x1 &&
    only.rect.y0 === rect.y0 &&
    only.rect.y1 === rect.y1
  ) {
    return [{ kind: 'forced', key: only.key, rect }];
  }
  const out: Part[] = [];
  for (const axis of prefer === 'y' ? (['y', 'x'] as const) : (['x', 'y'] as const)) {
    const lo = axis === 'x' ? rect.x0 : rect.y0;
    const hi = axis === 'x' ? rect.x1 : rect.y1;
    const coords = [
      ...new Set(
        inside.flatMap((cell) =>
          axis === 'x' ? [cell.rect.x0, cell.rect.x1] : [cell.rect.y0, cell.rect.y1],
        ),
      ),
    ]
      .filter((c) => c > lo && c < hi)
      .filter((c) =>
        inside.every((cell) => {
          const a = axis === 'x' ? cell.rect.x0 : cell.rect.y0;
          const b = axis === 'x' ? cell.rect.x1 : cell.rect.y1;
          return c <= a || c >= b;
        }),
      )
      .sort((p, q) => p - q);
    for (const at of coords) {
      const [ra, rb] = halves(rect, axis, at);
      const left = partitions(ra, inside, prefer);
      if (left.length === 0) continue;
      const right = partitions(rb, inside, prefer);
      for (const a of left) {
        for (const b of right) {
          out.push({ kind: 'cut', axis, at, a, b, rect });
          if (out.length >= PARTITIONS_MAX) return out;
        }
      }
    }
    if (out.length) return out;
  }
  return out;
}

function freeRegions(part: Part, out: Rect[] = []): Rect[] {
  if (part.kind === 'free') out.push(part.rect);
  else if (part.kind === 'cut') {
    freeRegions(part.a, out);
    freeRegions(part.b, out);
  }
  return out;
}

function fillPartition(
  input: FrameInput,
  partition: Part,
  forced: readonly ForcedCell[],
  overflowWeight: number,
  corridorStrip: boolean,
): Placed | null {
  const { env, footprint: f } = input;
  const forcedKeys = new Set(forced.map((cell) => cell.key));
  const rest = input.items.filter((item) => !forcedKeys.has(item.key));
  // Ô khoét đi xuyên được: thang, và dải hành lang khoét cùng thang (V-28).
  const isHub = (key: string) => input.stairIds.has(key) || input.corridorIds.has(key);
  const stairs = forced.filter((cell) => isHub(cell.key)).map((cell) => cell.rect);
  const regions = freeRegions(partition).map((rect, index) => {
    const access = stairs.filter((stair) => sharedEdge(rect, stair) > 0);
    const nextToWell = forced.some((cell) => !isHub(cell.key) && sharedEdge(rect, cell.rect) > 0);
    return { key: `r${index}`, rect, access, nextToWell };
  });
  const assigned = assignRegions(rest, regions, f, overflowWeight);
  if (!assigned) return null;
  input.trace?.(
    `    khoét: ${regions.map((r) => `[${r.rect.x0},${r.rect.y0},${r.rect.x1},${r.rect.y1}]←${(assigned.get(r.key) ?? []).map((i) => i.key).join('+') || 'ô thông tầng'}`).join(' ; ')}`,
  );

  let voids = 0;
  const packedOf = new Map<string, Placed>();
  for (const region of regions) {
    const items = assigned.get(region.key) ?? [];
    if (items.length === 0) {
      if (!region.nextToWell || extent(region.rect, 'x') * extent(region.rect, 'y') > VOID_MAX_CM2)
        return null;
      voids += 1;
      packedOf.set(region.key, { kind: 'leaf', id: `void_${voids}`, rect: region.rect });
      continue;
    }
    const reach: Reach = { sides: new Set(), hubs: region.access };
    const packed = corridorStrip
      ? bestCorridorFrame(input, region.rect, items, reach)
      : packRegion(region.rect, items, reach, env)?.placed;
    if (!packed) return null;
    packedOf.set(region.key, packed);
  }

  let index = 0;
  const build = (part: Part): Placed => {
    if (part.kind === 'forced') return { kind: 'leaf', id: part.key, rect: part.rect };
    if (part.kind === 'free') return packedOf.get(`r${index++}`)!;
    const a = build(part.a);
    const b = build(part.b);
    return { kind: 'cut', axis: part.axis, at: part.at, a, b, rect: part.rect };
  };
  return build(partition);
}

/**
 * Vùng tự do chứa hành lang: dựng hành lang thành DẢI trong vùng (V-28) thay vì xếp nó như một phòng.
 *
 * Xếp như một phòng thì hành lang thành một ô 10 m² đứng đâu đó giữa vùng, và các phòng mô hình khai
 * «cạnh hành lang» không chạm được nó — lượt đo 9cce001a bỏ rơi hai phòng ngủ ở cả hai lượt. Chọn khung
 * có phạt nhỏ nhất; vùng không có hành lang hoặc không dựng được dải nào thì lùi về cách xếp thường.
 */
function bestCorridorFrame(
  input: FrameInput,
  region: Rect,
  items: readonly PackItem[],
  reach: Reach,
): Placed | null {
  const fallback = packRegion(region, items, reach, input.env);
  let best: { placed: Placed; penalty: number } | null = fallback
    ? { placed: fallback.placed, penalty: fallback.penalty }
    : null;
  for (const frame of corridorFrames(input, region, items, reach)) {
    const penalty = evaluate(frame.placed, region, reach, input.env);
    if (!best || penalty < best.penalty - 1e-9) best = { placed: frame.placed, penalty };
  }
  return best?.placed ?? null;
}

/**
 * Chia phòng vào các vùng tự do: gần vùng ý định trước, rồi cân theo sức chứa (diện tích vùng). Chia
 * tham lam xong thì dời từng phòng sang vùng khác khi việc dời làm tổng lệch vùng + lệch tải nhỏ đi.
 * Vùng không nhận được phòng nào thì mượn một phòng từ vùng có từ hai phòng; mượn không được thì để
 * trống — lớp gọi quyết biến nó thành ô thông tầng hay bỏ cách chia này.
 */
function assignRegions(
  items: readonly PackItem[],
  regions: readonly { key: string; rect: Rect; access: readonly Rect[]; nextToWell: boolean }[],
  f: Rect,
  overflowWeight: number,
): Map<string, PackItem[]> | null {
  const out = new Map<string, PackItem[]>(regions.map((r) => [r.key, []]));
  if (regions.length === 0) return items.length === 0 ? out : null;
  const total = weight(items);
  const areas = new Map(regions.map((r) => [r.key, extent(r.rect, 'x') * extent(r.rect, 'y')]));
  const areaSum = [...areas.values()].reduce((sum, a) => sum + a, 0);
  const share = new Map(regions.map((r) => [r.key, (total * areas.get(r.key)!) / areaSum]));
  const zoneOf = new Map(regions.map((r) => [r.key, zoneOfRect(f, r.rect)]));
  const fits = (item: PackItem, region: { rect: Rect }) =>
    Math.min(extent(region.rect, 'x'), extent(region.rect, 'y')) >= item.primary.techMin;
  const placeCost = (item: PackItem, key: string) =>
    // Cùng mức nới vùng của vòng (`PackLeaf.zoneWeight`) mà hàm phạt dùng — không thì bộ chia vùng vẫn
    // kéo phòng về vùng cũ ở vòng đã nới.
    2 * item.primary.zoneWeight * projectedDistance(f, zoneOf.get(key)!, item.primary.zone) -
    (item.primary.role === 'hub' && regions.find((r) => r.key === key)!.access.length > 0
      ? 0.5
      : 0);
  const loadCost = (load: Map<string, number>) =>
    overflowWeight *
    regions.reduce(
      (sum, r) =>
        sum + Math.abs(load.get(r.key)! - share.get(r.key)!) / Math.max(share.get(r.key)!, 1),
      0,
    );
  // Phòng ngõ cụt trong một vùng không có phòng đi xuyên được chỉ mở cửa ra ô thang bên ngoài vùng — mỗi
  // ô thang giáp vùng một đoạn đủ đặt cửa là MỘT «làn» — một phòng mở thẳng ra thang, không hơn. Thừa phòng so với làn là thừa phòng không có lối vào.
  // Vách chung dài (dải hành lang chạy suốt vùng) mở được nhiều cửa: một làn mỗi `ROOM_FRONT_CM`.
  const lanesOf = new Map(
    regions.map((r) => [
      r.key,
      r.access.reduce((sum, hub) => {
        const shared = sharedEdge(r.rect, hub);
        return sum + (shared >= LANE_CM ? Math.max(1, Math.floor(shared / ROOM_FRONT_CM)) : 0);
      }, 0),
    ]),
  );
  const accessCost = (where: Map<PackItem, string>) => {
    let cost = 0;
    for (const region of regions) {
      const inside = ordered.filter((item) => where.get(item) === region.key);
      if (inside.some((item) => item.primary.role === 'hub')) continue;
      const deadEnds = inside.filter((item) => item.primary.role === 'room').length;
      cost += ACCESS_COST * Math.max(0, deadEnds - lanesOf.get(region.key)!);
    }
    return cost;
  };

  const where = new Map<PackItem, string>();
  const load = new Map(regions.map((r) => [r.key, 0]));
  const ordered = [...items].sort((p, q) => q.weight - p.weight || p.key.localeCompare(q.key));
  for (const item of ordered) {
    let best: { key: string; cost: number } | null = null;
    for (const region of regions) {
      if (!fits(item, region)) continue;
      load.set(region.key, load.get(region.key)! + item.weight);
      const cost = placeCost(item, region.key) + loadCost(load);
      load.set(region.key, load.get(region.key)! - item.weight);
      if (!best || cost < best.cost) best = { key: region.key, cost };
    }
    if (!best) return null;
    where.set(item, best.key);
    load.set(best.key, load.get(best.key)! + item.weight);
  }

  // Sức chứa: diện tích các phòng dồn vào một vùng CẦN (`PackItem.need`) vượt diện tích vùng thì bước lọc
  // gần như chắc chắn bác mọi cây dựng từ cách chia ấy. Lệch tải chỉ là phạt tương đối, không đủ nặng —
  // lượt đo 4a521f52 dồn hai phòng ngủ 20 m² kèm ban công vào dải 3,55 × 9 m ở mọi cách khoét, và tầng 2
  // không ra cây nào (V-29).
  const capacityCost = (where: Map<PackItem, string>) => {
    let cost = 0;
    for (const region of regions) {
      const need = ordered
        .filter((item) => where.get(item) === region.key)
        .reduce((sum, item) => sum + item.need, 0);
      const capacity = areas.get(region.key)! / 10_000;
      if (need > capacity) cost += CAPACITY_COST * (1 + (need - capacity) / capacity);
    }
    return cost;
  };

  // Chiều sâu CỨNG: vùng chỉ vào được từ ô thang / dải hành lang bên ngoài thì phòng cần cửa phải chạy
  // suốt từ cạnh ấy vào tới hết vùng. Phòng nhỏ trong vùng sâu thành dải quá tỉ lệ dùng được (bị lọc), còn
  // nép ra một đầu thì mất cửa — lượt đo 4a521f52: phòng thờ 10 m² trong vùng trước sâu 7,7 m cần ít nhất
  // 7,7² / 3 ≈ 19,8 m² mới vừa tỉ lệ. Sâu tính theo cạnh giáp đường vào NÔNG nhất; phòng khép kín của nó
  // đứng cùng dải nên được cộng.
  const depthOf = new Map(
    regions.map((r) => {
      const depths = r.access
        .filter((hub) => sharedEdge(r.rect, hub) >= LANE_CM)
        .map((hub) =>
          hub.x1 === r.rect.x0 || hub.x0 === r.rect.x1 ? extent(r.rect, 'x') : extent(r.rect, 'y'),
        );
      return [r.key, depths.length ? Math.min(...depths) : null];
    }),
  );
  const depthCost = (where: Map<PackItem, string>) => {
    let cost = 0;
    for (const region of regions) {
      const depth = depthOf.get(region.key);
      if (depth === null || depth === undefined) continue;
      const inside = ordered.filter((item) => where.get(item) === region.key);
      if (inside.some((item) => item.primary.role === 'hub')) continue;
      for (const item of inside) {
        const aspect = item.primary.aspectHard;
        if (item.primary.role !== 'room' || aspect === null) continue;
        const need = (depth / 100) ** 2 / aspect;
        if (item.weight * DEPTH_SLACK < need) cost += DEPTH_COST;
      }
    }
    return cost;
  };

  // Dời từng phòng khi tổng chi phí giảm — tất định: duyệt theo thứ tự cố định, dừng khi đứng yên.
  const totalCost = () =>
    ordered.reduce((sum, item) => sum + placeCost(item, where.get(item)!), 0) +
    loadCost(load) +
    accessCost(where) +
    capacityCost(where) +
    depthCost(where);
  for (let pass = 0; pass < 8; pass += 1) {
    let moved = false;
    for (const item of ordered) {
      const from = where.get(item)!;
      let bestKey = from;
      let bestCost = totalCost();
      for (const region of regions) {
        if (region.key === from || !fits(item, region)) continue;
        load.set(from, load.get(from)! - item.weight);
        load.set(region.key, load.get(region.key)! + item.weight);
        where.set(item, region.key);
        const cost = totalCost();
        where.set(item, from);
        load.set(region.key, load.get(region.key)! - item.weight);
        load.set(from, load.get(from)! + item.weight);
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          bestKey = region.key;
        }
      }
      if (bestKey !== from) {
        load.set(from, load.get(from)! - item.weight);
        load.set(bestKey, load.get(bestKey)! + item.weight);
        where.set(item, bestKey);
        moved = true;
      }
    }
    if (!moved) break;
  }
  for (const item of ordered) out.get(where.get(item)!)!.push(item);

  for (const region of regions) {
    if (out.get(region.key)!.length > 0) continue;
    // Vùng nhỏ cạnh giếng trời thành ô thông tầng — tốt hơn giật một phòng khỏi chỗ nó cần đứng.
    if (region.nextToWell && areas.get(region.key)! <= VOID_MAX_CM2) continue;
    let donor: { from: string; item: PackItem; cost: number } | null = null;
    for (const other of regions) {
      const list = out.get(other.key)!;
      if (list.length < 2) continue;
      for (const item of list) {
        // Mượn chỉ khi vùng đủ chỗ cho phòng ấy thành một phòng dùng được — nhét phòng ngủ 17 m² vào
        // một góc 4 m² là đổi một ô thông tầng lấy một phòng không ai ở được.
        if (!fits(item, region) || areas.get(region.key)! / 10_000 < DONOR_MIN_SHARE * item.weight)
          continue;
        const cost = projectedDistance(f, zoneOf.get(region.key)!, item.primary.zone);
        if (!donor || cost < donor.cost) donor = { from: other.key, item, cost };
      }
    }
    if (!donor) continue;
    out.set(
      donor.from,
      out.get(donor.from)!.filter((item) => item !== donor!.item),
    );
    out.get(region.key)!.push(donor.item);
  }
  return out;
}

/** Hành lang ngang giữa hàng `row` và hàng kế sau nó. */
function band(frame: RegionFrame, axis: Axis, row: number): Placed | null {
  const { input, region: footprint, reach } = frame;
  const { env } = input;
  const primary = (item: PackItem) => (axis === 'y' ? item.row : item.col);
  const corridors = frame.items.filter((item) => input.corridorIds.has(item.key));
  const rest = frame.items.filter((item) => !input.corridorIds.has(item.key));
  const before = rest.filter((item) => primary(item) <= row);
  const after = rest.filter((item) => primary(item) > row);
  if (before.length === 0 || after.length === 0) return null;
  const width = Math.max(input.corridorWidth.inner, minOf(corridors));
  const lengths = splitLengths(
    axis === 'x' ? footprint.x0 : footprint.y0,
    extent(footprint, axis),
    [
      { weight: weight(before), min: minOf(before) },
      { weight: 0, min: width, fixed: width },
      { weight: weight(after), min: minOf(after) },
    ],
  );
  if (!lengths) return null;
  const [ra, rc, rb] = slices(footprint, axis, lengths) as [Rect, Rect, Rect];
  const pa = packRegion(ra, before, narrowReach(reach, footprint, ra, [rc]), env);
  const pc = pa ? packRegion(rc, corridors, narrowReach(reach, footprint, rc), env) : null;
  const pb = pc ? packRegion(rb, after, narrowReach(reach, footprint, rb, [rc]), env) : null;
  if (!pa || !pc || !pb) return null;
  return chain(footprint, axis, [pa.placed, pc.placed, pb.placed]);
}
