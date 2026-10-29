/**
 * Khung HAI HÀNG — mở rộng khung xương T102 cho tầng trên khi một hàng phòng mỗi dải không đủ chỗ (T179, 28/10/2026).
 *
 * Vì sao có tệp này: khung T102 (`./skeleton.ts`) đặt hành lang theo mép lõi và xếp MỘT hàng phòng mỗi dải; túi giữa cạnh
 * thang chỉ xếp phòng chồng nhau theo chiều sâu (một phòng chạm hành lang trước, một chạm hành lang sau). Biệt thự 12 × 16 m
 * (`NVO-TK-2026-9272`, T178): dải sau sâu 4–4,65 m cần 13,7–14,5 m bề ngang cho ba phòng ngủ + giặt + WC mà khối chỉ 12 m.
 * Kiến trúc sư dựng tầng ấy theo cách khác:
 *
 *   dải TRƯỚC : [một hàng phòng áp mặt tiền]                          ← chạm hành lang T
 *   T         : hành lang ngang áp ĐẦU BƯỚC RA của ô thang, trọn bề ngang
 *   dải SAU   : [vùng tự do | V | ô thang + túi cạnh thang / túi sau thang]
 *               vùng tự do : một hàng chạm T, hay một cột phòng chạm V, hay HAI hàng kẹp hành lang H2 nối vào V
 *               túi sau thang: một cột phòng chạm V (WC, giặt, kho), hay hai hàng kẹp H2
 *
 * Dựng trong một HỆ TOẠ ĐỘ CHUẨN: lật / xoay hình bao sao cho đầu bước ra của ô thang là cạnh `y0`, rồi lật ngược cây về
 * hệ thật — nên mọi hướng thang dùng chung một cách dựng. Phòng giữ hàng theo vị trí bản phác (tâm chữ nhật bao); hàng nào
 * không chứa nổi thì dời bớt phòng sang hàng khác, mỗi bước chọn phép dời giảm nhiều nhất tổng phần thiếu (tối đa
 * `max_moves` lần). Lối vào vẫn là BẤT BIẾN CỦA CÁCH DỰNG: mọi phòng trong hàng chạm T, H2 hay V ngay khi dựng.
 *
 * Mọi số đo do `bandParts` / `bandPlaced` / `stackAlong` của khung T102 gán; cây đi đúng đường `emitCandidate → gate` như
 * mọi ứng viên khác nên cổng, cửa, luật bắt buộc T71, ban công T91, thước chấm giữ nguyên. Hàm THUẦN, tất định.
 *
 * Chưa làm: tầng có thang máy / giếng trời (ô cố định khác ngoài thang), tầng 1 (đầu vào thang chưa biết trước).
 */

import type { Rect } from '../draw/geometry';
import { evaluate, NO_REACH, type PackItem } from './pack';
import { chain, leaf, leaves, sharedEdge, type Axis, type Placed, type Side } from './placed';
import {
  accessHolds,
  balconyThickness,
  bandParts,
  bandPlaced,
  type Cluster,
  hallPlaceholder,
  inside,
  MIN_CELL_CM,
  nameHallSegments,
  needWidth,
  type SkeletonCandidate,
  type SkeletonInput,
  stackAlong,
} from './skeleton';

export interface RowsConfig {
  max_candidates: number;
  max_moves: number;
  depth_step_cm: number;
  /** T181: ban công chính mặt tiền thành dải áp mặt tiền chạy qua đầu hành lang T (mở từ giao thông chung). */
  main_balcony_strip?: boolean;
  /** Bước chỉnh sau khi chia được (T180): trọng số khu ướt đè chỗ khô / phòng ở tối / khoảng cách tới khu ướt dưới. */
  prefer?: {
    max_moves: number;
    wet_over_dry: number;
    dark_room: number;
    dark_bedroom: number;
    wet_distance_per_m: number;
    floor_margin_ratio: number;
    tight_floor: number;
    wet_over_service?: number;
    altar_near_wc?: number;
    wet_swap_insert?: boolean;
    wet_swap_insert_budget?: number;
  };
}

// ── Hệ toạ độ chuẩn ────────────────────────────────────────────────────────────────────────

export interface Transform {
  F: Rect;
  /** Hình bao trong hệ chuẩn. */
  Fn: Rect;
  transpose: boolean;
  mirrorY: boolean;
  mirrorX: boolean;
}

export function makeTransform(
  F: Rect,
  transpose: boolean,
  mirrorY: boolean,
  mirrorX: boolean,
): Transform {
  const Fn = transpose
    ? { x0: F.x0, y0: F.y0, x1: F.x0 + (F.y1 - F.y0), y1: F.y0 + (F.x1 - F.x0) }
    : F;
  return { F, Fn, transpose, mirrorY, mirrorX };
}

/** Hệ chuẩn của một đầu bước ra: xoay / lật sao cho cạnh ấy của ô thang thành cạnh `y0`. */
export function arrivalTransform(F: Rect, arrival: Side, mirrorX: boolean): Transform {
  const transpose = arrival === 'x0' || arrival === 'x1';
  const mirrorY = arrival === 'y1' || arrival === 'x1';
  return makeTransform(F, transpose, mirrorY, mirrorX);
}

export function fwdPt(t: Transform, x: number, y: number): [number, number] {
  let px = x;
  let py = y;
  if (t.transpose) [px, py] = [t.F.x0 + (py - t.F.y0), t.F.y0 + (px - t.F.x0)];
  if (t.mirrorY) py = t.Fn.y0 + t.Fn.y1 - py;
  if (t.mirrorX) px = t.Fn.x0 + t.Fn.x1 - px;
  return [px, py];
}

function invPt(t: Transform, x: number, y: number): [number, number] {
  let px = x;
  let py = y;
  if (t.mirrorX) px = t.Fn.x0 + t.Fn.x1 - px;
  if (t.mirrorY) py = t.Fn.y0 + t.Fn.y1 - py;
  if (t.transpose) [px, py] = [t.F.x0 + (py - t.F.y0), t.F.y0 + (px - t.F.x0)];
  return [px, py];
}

export function mapRect(r: Rect, pt: (x: number, y: number) => [number, number]): Rect {
  const [ax, ay] = pt(r.x0, r.y0);
  const [bx, by] = pt(r.x1, r.y1);
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

const TRANSPOSE_SIDE: Record<Side, Side> = { x0: 'y0', y0: 'x0', x1: 'y1', y1: 'x1' };
const FLIP_Y: Record<Side, Side> = { x0: 'x0', x1: 'x1', y0: 'y1', y1: 'y0' };
const FLIP_X: Record<Side, Side> = { x0: 'x1', x1: 'x0', y0: 'y0', y1: 'y1' };

export function fwdSide(t: Transform, side: Side): Side {
  let s = side;
  if (t.transpose) s = TRANSPOSE_SIDE[s];
  if (t.mirrorY) s = FLIP_Y[s];
  if (t.mirrorX) s = FLIP_X[s];
  return s;
}

/** Cây dựng trong hệ chuẩn → hệ thật: đổi toạ độ, đổi trục khi xoay, giữ nhánh `a` ở phía toạ độ nhỏ. */
export function invPlaced(t: Transform, node: Placed): Placed {
  const back = (r: Rect) => mapRect(r, (x, y) => invPt(t, x, y));
  if (node.kind === 'leaf') return leaf(node.id, back(node.rect));
  const a = invPlaced(t, node.a);
  const b = invPlaced(t, node.b);
  const axis: Axis = t.transpose ? (node.axis === 'x' ? 'y' : 'x') : node.axis;
  const low = (p: Placed) => (axis === 'x' ? p.rect.x0 : p.rect.y0);
  const [first, second] = low(a) <= low(b) ? [a, b] : [b, a];
  return {
    kind: 'cut',
    axis,
    at: axis === 'x' ? first.rect.x1 : first.rect.y1,
    a: first,
    b: second,
    rect: back(node.rect),
  };
}

function transformInput(input: SkeletonInput, t: Transform): SkeletonInput {
  const fwd = (r: Rect) => mapRect(r, (x, y) => fwdPt(t, x, y));
  const balcony = input.balconySides;
  return {
    ...input,
    footprint: t.Fn,
    stair: input.stair ? fwd(input.stair) : null,
    elevators: new Map(),
    lightWells: new Map(),
    boxes: new Map([...input.boxes].map(([id, r]) => [id, fwd(r)])),
    ...(input.dryBelow ? { dryBelow: input.dryBelow.map(fwd) } : {}),
    wetBelow: input.wetBelow.map(fwd),
    avoidWetOver: input.avoidWetOver.map(fwd),
    openSides: new Set([...input.openSides].map((side) => fwdSide(t, side))),
    ...(input.mainFace ? { mainFace: fwdSide(t, input.mainFace) } : {}),
    balconySides: balcony
      ? {
          required: balcony.required.map((side) => fwdSide(t, side)),
          forbidden: balcony.forbidden.map((side) => fwdSide(t, side)),
          projection: Object.fromEntries(
            Object.entries(balcony.projection).map(([side, cm]) => [fwdSide(t, side as Side), cm]),
          ),
        }
      : null,
  };
}

// ── Khung: hàng, cột, nhóm hai hàng ───────────────────────────────────────────────────────

type RegionMode = 'row' | 'stack' | 'split';

interface Slot {
  name: string;
  /** `row`: phòng cạnh nhau theo trục ngang, cùng chạm cạnh `hall`; `stack`: chồng theo chiều sâu, cùng chạm V. */
  kind: 'row' | 'stack';
  hall: 'y0' | 'y1';
  rect: Rect;
  clusters: Cluster[];
  /** Hàng rỗng thành sảnh (túi cạnh thang) thay vì làm hỏng khung. */
  emptyOk: boolean;
  /** Nhóm hai hàng mà hàng này thuộc về. */
  group: Group | null;
  pinFirst: Cluster | null;
  pinLast: Cluster | null;
}

interface Group {
  region: Rect;
  a: Slot;
  b: Slot;
  /** Chiều sâu hàng `a` đang chọn. */
  depthA: number;
}

interface Built {
  placed: Placed;
  program?: SkeletonCandidate['program'];
  leafById?: SkeletonCandidate['leafById'];
  reversed: boolean;
  tuned: boolean;
  /** Có dải ban công chính suốt mặt tiền (T181). */
  stripped?: boolean;
}

interface FrameSpec {
  tag: string;
  v: boolean;
  lft: RegionMode | null;
  under: RegionMode | null;
  /** Ban công chính mặt tiền là dải áp mặt tiền chạy qua đầu hành lang T (T181). */
  strip: boolean;
}

export function rowsCandidates(
  input: SkeletonInput,
  arrival: Side | null,
  config: RowsConfig,
): SkeletonCandidate[] {
  if (config.max_candidates <= 0) return [];
  const stairItem = input.items.find((item) => input.stairIds.has(item.key));
  const s = input.stair;
  if (!arrival || !stairItem || !s || !inside(s, input.footprint)) {
    input.trace?.(`  hai hàng t${input.level}: không có ô thang cố định / đầu bước ra`);
    return [];
  }
  if (input.elevators.size || input.lightWells.size) {
    input.trace?.(`  hai hàng t${input.level}: có thang máy / giếng trời — chưa dựng`);
    return [];
  }
  const out: SkeletonCandidate[] = [];
  const seen = new Set<string>();
  for (const mirrorX of [false, true]) {
    const t = arrivalTransform(input.footprint, arrival, mirrorX);
    const ni = transformInput(input, t);
    for (const spec of frameSpecs(ni, config))
      for (const built of buildFrame(ni, spec, config, stairItem.key)) {
        const placed = invPlaced(t, built.placed);
        const signature = leaves(placed)
          .map((l) => `${l.id}:${l.rect.x0},${l.rect.y0},${l.rect.x1},${l.rect.y1}`)
          .sort()
          .join(';');
        if (seen.has(signature)) continue;
        seen.add(signature);
        const env = built.leafById ? { ...input.env, leafById: built.leafById } : input.env;
        const key = `skeleton|rows|${spec.tag}${mirrorX ? '|m' : ''}${built.reversed ? '|r' : ''}${built.tuned ? '|q' : ''}`;
        input.trace?.(`  hai hàng ${key}: ${leaves(placed).length} ô`);
        out.push({
          key,
          placed,
          penalty: evaluate(placed, input.footprint, NO_REACH, env),
          ...(built.program ? { program: built.program } : {}),
          ...(built.leafById ? { leafById: built.leafById } : {}),
        });
        if (out.length >= config.max_candidates) return out;
      }
  }
  return out;
}

/** Các khung thử, trong hệ chuẩn (đầu bước ra ở `y0`): V áp cạnh thang phía `x0`; không V khi ô thang chạm mép sau. */
function frameSpecs(ni: SkeletonInput, config: RowsConfig): FrameSpec[] {
  const f = ni.footprint;
  const s = ni.stair!;
  const cw = ni.corridorWidth.inner;
  const specs: FrameSpec[] = [];
  const vx0 = s.x0 - cw;
  if (vx0 >= f.x0) {
    const lftModes: (RegionMode | null)[] = vx0 > f.x0 ? ['split', 'row', 'stack'] : [null];
    const underModes: (RegionMode | null)[] = s.y1 < f.y1 ? ['stack', 'split'] : [null];
    for (const lft of lftModes)
      for (const under of underModes)
        specs.push({ tag: `V|L${lft ?? '-'}|U${under ?? '-'}`, v: true, lft, under, strip: false });
  }
  if (s.y1 === f.y1)
    specs.push({
      tag: 'noV',
      v: false,
      lft: s.x0 > f.x0 ? 'row' : null,
      under: null,
      strip: false,
    });
  // Mặt tiền là đầu của hành lang T (mặt bên trong hệ chuẩn): thêm bản có dải ban công chính chạy qua đầu T (T181).
  const main = ni.mainFace;
  if (
    config.main_balcony_strip &&
    main &&
    (main === 'x0' || main === 'x1') &&
    ni.openSides.has(main) &&
    !(ni.balconySides?.forbidden ?? []).includes(main)
  ) {
    for (const spec of [...specs]) specs.push({ ...spec, tag: `${spec.tag}|S`, strip: true });
  }
  return specs;
}

/** Đầu vào trong hệ chuẩn; `landingFor`: dải ban công chính đã tách khỏi hình bao ở cạnh này — cần sảnh mở ra nó. */
type RowsInput = SkeletonInput & { landingFor?: { leaf: PackItem; side: Side } };

function buildFrame(ni: RowsInput, spec: FrameSpec, config: RowsConfig, stairKey: string): Built[] {
  const f = ni.footprint;
  const s = ni.stair!;
  const cw = ni.corridorWidth.inner;
  const wall = ni.env.floorWallCm;
  const fail = (why: string): null => {
    ni.trace?.(`  hai hàng t${ni.level} ${spec.tag} bỏ: ${why}`);
    return null;
  };
  const none = (why: string): Built[] => {
    fail(why);
    return [];
  };
  // Dải ban công chính SUỐT mặt tiền (T181): ô thang không chạm mặt tiền thì tách một dải trọn chiều dài mặt ấy, dựng
  // phần còn lại như một hình bao hẹp hơn rồi ghép dải vào — ban công chính dài nhất tầng (D7) và mở từ sảnh / đầu hành
  // lang T (D6). Ô thang chạm mặt tiền thì dải chỉ chạy qua dải trước + T (bên dưới).
  if (spec.strip && ni.mainFace && !ni.landingFor) {
    const main = ni.mainFace;
    const chosen = ni.items
      .filter(
        (item) =>
          item.children.length === 0 &&
          item.primary.needsOpenFace &&
          item.primary.role === 'open' &&
          !ni.corridorIds.has(item.key),
      )
      .sort((p, q) => q.weight - p.weight || p.key.localeCompare(q.key))[0];
    if (!chosen) return none('không có ban công nào để làm dải mặt tiền');
    const thick = balconyThickness(chosen.primary, f.y1 - f.y0, main, ni);
    const clear = main === 'x0' ? s.x0 >= f.x0 + thick : s.x1 <= f.x1 - thick;
    if (clear) {
      const inner: Rect = main === 'x0' ? { ...f, x0: f.x0 + thick } : { ...f, x1: f.x1 - thick };
      const stripRect: Rect =
        main === 'x0' ? { ...f, x1: f.x0 + thick } : { ...f, x0: f.x1 - thick };
      const balcony = ni.balconySides;
      const innerInput: RowsInput = {
        ...ni,
        footprint: inner,
        items: ni.items.filter((item) => item !== chosen),
        openSides: new Set([...ni.openSides].filter((side) => side !== main)),
        balconySides: balcony
          ? {
              ...balcony,
              required: balcony.required.filter((side) => side !== main),
              forbidden: [...balcony.forbidden, main],
            }
          : null,
        landingFor: { leaf: chosen, side: main },
      };
      const stripLeaf = leaf(chosen.key, stripRect);
      return buildFrame(innerInput, { ...spec, strip: false }, config, stairKey).map((b) => ({
        ...b,
        placed: chain(f, 'x', main === 'x0' ? [stripLeaf, b.placed] : [b.placed, stripLeaf]),
        stripped: true,
      }));
    }
  }
  const frontDepth = s.y0 - cw - f.y0;
  if (frontDepth < 0) return none('ô thang sát mép, không còn chỗ cho hành lang trước thang');
  if (frontDepth > 0 && frontDepth < MIN_CELL_CM) return none(`dải trước chỉ sâu ${frontDepth}`);
  const vx0 = s.x0 - cw;
  const lftRect: Rect | null = spec.v
    ? vx0 > f.x0
      ? { x0: f.x0, y0: s.y0, x1: vx0, y1: f.y1 }
      : null
    : s.x0 > f.x0
      ? { x0: f.x0, y0: s.y0, x1: s.x0, y1: f.y1 }
      : null;
  if (lftRect && lftRect.x1 - lftRect.x0 < MIN_CELL_CM) return none('vùng cạnh dải dọc quá hẹp');
  const besideRect: Rect | null =
    s.x1 < f.x1 ? { x0: s.x1, y0: s.y0, x1: f.x1, y1: spec.v ? s.y1 : f.y1 } : null;
  if (besideRect && besideRect.x1 - besideRect.x0 < MIN_CELL_CM)
    return none('túi cạnh thang quá hẹp');
  const underRect: Rect | null =
    spec.v && s.y1 < f.y1 ? { x0: s.x0, y0: s.y1, x1: f.x1, y1: f.y1 } : null;
  if (underRect && underRect.y1 - underRect.y0 < MIN_CELL_CM) return none('túi sau thang quá nông');

  // ── Hàng / cột ──────────────────────────────────────────────────────────────────────────
  const slots: Slot[] = [];
  const groups: Group[] = [];
  const slot = (
    name: string,
    kind: Slot['kind'],
    hall: Slot['hall'],
    rect: Rect,
    emptyOk = false,
  ): Slot => {
    const made: Slot = {
      name,
      kind,
      hall,
      rect,
      clusters: [],
      emptyOk,
      group: null,
      pinFirst: null,
      pinLast: null,
    };
    slots.push(made);
    return made;
  };
  const region = (name: string, rect: Rect, mode: RegionMode, hall: Slot['hall']): void => {
    if (mode !== 'split') {
      slot(name, mode, hall, rect);
      return;
    }
    const half = Math.round((rect.y1 - rect.y0 - cw) / 2);
    const a = slot(`${name}A`, 'row', 'y1', { ...rect, y1: rect.y0 + half });
    const b = slot(`${name}B`, 'row', 'y0', { ...rect, y0: rect.y0 + half + cw });
    const group: Group = { region: rect, a, b, depthA: half };
    a.group = group;
    b.group = group;
    groups.push(group);
  };
  // Dải ban công chính mặt tiền (T181): áp mặt tiền, chạy suốt dải trước + hành lang T — mở cửa từ T, không chỉ từ phòng riêng.
  let strip: { leaf: PackItem; rect: Rect } | null = null;
  if (spec.strip && ni.mainFace) {
    const main = ni.mainFace;
    const candidates = ni.items
      .filter(
        (item) =>
          item.children.length === 0 &&
          item.primary.needsOpenFace &&
          item.primary.role === 'open' &&
          !ni.corridorIds.has(item.key),
      )
      .sort((p, q) => q.weight - p.weight || p.key.localeCompare(q.key));
    const chosen = candidates[0];
    if (!chosen) return none('không có ban công nào để làm dải mặt tiền');
    const along = s.y0 - f.y0;
    const thick = balconyThickness(chosen.primary, along, main, ni);
    if (f.x1 - f.x0 - thick < MIN_CELL_CM * 2) return none('mặt tiền quá hẹp cho dải ban công');
    strip = {
      leaf: chosen,
      rect:
        main === 'x0'
          ? { x0: f.x0, y0: f.y0, x1: f.x0 + thick, y1: s.y0 }
          : { x0: f.x1 - thick, y0: f.y0, x1: f.x1, y1: s.y0 },
    };
    if (strip.rect.x1 > s.x0 && strip.rect.x0 < s.x1 && strip.rect.y1 > s.y0)
      return none('dải ban công chạm ô thang');
  }
  const topX0 = strip && ni.mainFace === 'x0' ? strip.rect.x1 : f.x0;
  const topX1 = strip && ni.mainFace === 'x1' ? strip.rect.x0 : f.x1;
  // Đầu hành lang T chỉ dài bằng bề rộng hành lang — ngắn hơn đoạn vách cửa ra ban công cần thì thêm một sảnh dọc dải
  // ban công suốt dải trước, để cửa ban công mở từ giao thông chung (cổng cửa chọn chủ nhà cửa theo vách chung đủ dài).
  let landing = 0;
  const landingSide = strip ? ni.mainFace : (ni.landingFor?.side ?? null);
  const landingLeaf = strip?.leaf ?? ni.landingFor?.leaf ?? null;
  if (landingLeaf) {
    const hallLeaf = ni.items.find((item) => ni.corridorIds.has(item.key))?.primary;
    const need = hallLeaf ? ni.env.doorShared(landingLeaf.primary, hallLeaf) : 0;
    if (need > cw) {
      if (frontDepth <= 0)
        return none('đầu hành lang ngắn hơn cửa ra ban công, không có dải trước để thêm sảnh');
      landing = Math.ceil(need / 5) * 5;
    }
  }
  const frontX0 = landingSide === 'x0' ? topX0 + landing : topX0;
  const frontX1 = landingSide === 'x1' ? topX1 - landing : topX1;
  if (frontDepth > 0 && frontX1 - frontX0 < MIN_CELL_CM)
    return none('dải trước không còn chỗ sau sảnh ban công');
  const front =
    frontDepth > 0
      ? slot('front', 'row', 'y1', { x0: frontX0, y0: f.y0, x1: frontX1, y1: s.y0 - cw })
      : null;
  if (lftRect && spec.lft) region('lft', lftRect, spec.lft, 'y0');
  const beside = besideRect ? slot('beside', 'row', 'y0', besideRect, true) : null;
  if (underRect && spec.under) region('under', underRect, spec.under, 'y0');
  if (spec.lft === 'split' && lftRect && lftRect.y1 - lftRect.y0 < 2 * MIN_CELL_CM + cw)
    return none('vùng cạnh dải dọc không đủ sâu cho hai hàng');
  if (spec.under === 'split' && underRect && underRect.y1 - underRect.y0 < 2 * MIN_CELL_CM + cw)
    return none('túi sau thang không đủ sâu cho hai hàng');

  // ── Phòng → hàng theo bản phác ────────────────────────────────────────────────────────────
  const fixedIds = new Set([stairKey]);
  const isBalcony = (item: PackItem) =>
    item.children.length === 0 && item.primary.needsOpenFace && item.primary.role === 'open';
  const corridorItems = ni.items.filter((item) => ni.corridorIds.has(item.key));
  const rooms: Cluster[] = [];
  const balconies: PackItem[] = [];
  for (const item of ni.items) {
    if (fixedIds.has(item.key) || ni.corridorIds.has(item.key)) continue;
    if (strip && item === strip.leaf) continue;
    if (isBalcony(item)) balconies.push(item);
    else rooms.push({ item, balconies: [] });
  }
  const forbidden = new Set(ni.balconySides?.forbidden ?? []);
  const openSide = (side: Side) => ni.openSides.has(side) && !forbidden.has(side);
  /** Mặt ngoài của hàng (đối diện hành lang) nằm trên mép hình bao và thoáng. */
  const outerOpen = (sl: Slot): boolean =>
    sl.kind === 'row' &&
    (sl.hall === 'y1'
      ? sl.rect.y0 === f.y0 && openSide('y0')
      : sl.rect.y1 === f.y1 && openSide('y1'));
  const needsFace = (c: Cluster) => c.item.children.some((kid) => kid.needsOpenFace);
  const accepts = (sl: Slot, c: Cluster): boolean => {
    if (sl.kind === 'stack') {
      return (
        c.item.children.length === 0 &&
        c.balconies.length === 0 &&
        !c.item.primary.needsOpenFace &&
        c.item.primary.techMin <= sl.rect.x1 - sl.rect.x0
      );
    }
    return !needsFace(c) || outerOpen(sl);
  };
  /**
   * Ban công khép kín của phòng mẹ trong một hàng áp mặt thoáng: thành dải áp mặt ấy chạy suốt cột (chung vách với phòng
   * mẹ và WC khép kín), không thành dải đứng cạnh phòng — hai dải khép kín đứng cạnh nhau thì dải ngoài không chạm phòng mẹ.
   */
  const asIn = (sl: Slot, c: Cluster): Cluster => {
    if (sl.kind !== 'row' || !outerOpen(sl)) return c;
    const open = c.item.children.filter((kid) => kid.needsOpenFace && kid.role === 'open');
    if (!open.length) return c;
    const face: Side = sl.hall === 'y1' ? 'y0' : 'y1';
    return {
      item: { ...c.item, children: c.item.children.filter((kid) => !open.includes(kid)) },
      balconies: [...c.balconies, ...open.map((kid) => ({ leaf: kid, side: face }))],
    };
  };
  const boxOf = (c: Cluster): Rect | null => ni.boxes.get(c.item.key) ?? null;
  const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  const distance = (p: { x: number; y: number }, r: Rect) =>
    Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));
  const homeRect = (sl: Slot) => sl.group?.region ?? sl.rect;
  for (const c of rooms) {
    const box = boxOf(c);
    const p = box
      ? centre(box)
      : { x: (f.x0 + f.x1) / 2, y: c.item.row === 0 ? f.y0 : c.item.row === 2 ? f.y1 : s.y1 };
    const ranked = slots
      .filter((sl) => accepts(sl, c))
      .map((sl) => {
        const home = homeRect(sl);
        let d = distance(p, home);
        // Hai hàng: tâm phòng nửa trên vùng → hàng trên.
        if (sl.group) {
          const mid = (home.y0 + home.y1) / 2;
          if ((sl === sl.group.a) !== p.y < mid) d += 0.5;
        }
        return { sl, d };
      })
      .sort((p1, q1) => p1.d - q1.d || p1.sl.name.localeCompare(q1.sl.name));
    const home = ranked[0]?.sl;
    if (!home) return none(`"${c.item.key}" không có hàng nào nhận`);
    home.clusters.push(c);
  }

  // ── Ban công: mặt đầu bài bắt buộc trước, rồi mặt bản phác vẽ; gắn vào phòng của hàng áp mặt ấy ──
  const drawnSide = (box: Rect | null): Side | null => {
    if (!box) return null;
    const touches: Side[] = [];
    if (box.y0 === f.y0) touches.push('y0');
    if (box.y1 === f.y1) touches.push('y1');
    if (box.x0 === f.x0) touches.push('x0');
    if (box.x1 === f.x1) touches.push('x1');
    return touches.find(openSide) ?? null;
  };
  const wanted = (ni.balconySides?.required ?? []).filter(openSide);
  const covered = new Set<Side>(strip && ni.mainFace ? [ni.mainFace] : []);
  const hostsOn = (side: Side): { sl: Slot; c: Cluster }[] => {
    const out: { sl: Slot; c: Cluster }[] = [];
    for (const sl of slots) {
      if (sl.kind !== 'row') continue;
      const ok =
        side === 'y0'
          ? sl.hall === 'y1' && sl.rect.y0 === f.y0
          : side === 'y1'
            ? sl.hall === 'y0' && sl.rect.y1 === f.y1
            : side === 'x0'
              ? sl.rect.x0 === f.x0 && !sl.pinFirst
              : sl.rect.x1 === f.x1 && !sl.pinLast;
      if (!ok) continue;
      for (const c of sl.clusters) {
        if (side === 'x0' && sl.pinLast === c) continue;
        if (side === 'x1' && sl.pinFirst === c) continue;
        out.push({ sl, c });
      }
    }
    return out;
  };
  const sortedBalconies = [...balconies].sort((p, q) => {
    const ps = drawnSide(ni.boxes.get(p.key) ?? null);
    const qs = drawnSide(ni.boxes.get(q.key) ?? null);
    const pw = ps && wanted.includes(ps) ? 0 : 1;
    const qw = qs && wanted.includes(qs) ? 0 : 1;
    return pw - qw || q.weight - p.weight || p.key.localeCompare(q.key);
  });
  for (const balcony of sortedBalconies) {
    const box = ni.boxes.get(balcony.key) ?? null;
    const drawn = drawnSide(box);
    const missing = wanted.filter((side) => !covered.has(side));
    const order: Side[] = [];
    const push = (side: Side | null | undefined) => {
      if (side && openSide(side) && !order.includes(side)) order.push(side);
    };
    if (drawn && (wanted.length === 0 || wanted.includes(drawn) || missing.length === 0))
      push(drawn);
    missing.forEach(push);
    push(drawn);
    (['y0', 'y1', 'x0', 'x1'] as Side[]).forEach(push);
    let attached = false;
    for (const side of order) {
      const ranked = hostsOn(side)
        .map(({ sl, c }) => ({
          sl,
          c,
          shared: box && boxOf(c) ? sharedEdge(box, boxOf(c)!) : 0,
          habitable: c.item.primary.role === 'room' ? 1 : 0,
        }))
        .sort(
          (p, q) =>
            q.shared - p.shared ||
            q.habitable - p.habitable ||
            q.c.item.weight - p.c.item.weight ||
            p.c.item.key.localeCompare(q.c.item.key),
        );
      const host = ranked[0];
      if (!host) continue;
      host.c.balconies.push({ leaf: balcony.primary, side });
      if (side === 'x0') host.sl.pinFirst = host.c;
      if (side === 'x1') host.sl.pinLast = host.c;
      covered.add(side);
      attached = true;
      break;
    }
    if (!attached) return none(`ban công "${balcony.key}" không có phòng để gắn`);
  }

  // ── Đo phần thiếu; dời phòng giữa các hàng tới khi mọi hàng chứa nổi ─────────────────────────
  const depthOf = (r: Rect) => r.y1 - r.y0;
  const rowOver = (rect: Rect, clusters: readonly Cluster[]): number => {
    const parts = bandParts(rect, clusters, ni);
    let over = parts.reduce((sum, p) => sum + p.min, 0) - (rect.x1 - rect.x0);
    for (const c of clusters) {
      const faceDepth = c.balconies
        .filter((b) => b.side === 'y0' || b.side === 'y1')
        .reduce((sum, b) => sum + balconyThickness(b.leaf, (rect.x1 - rect.x0) / 2, b.side, ni), 0);
      const body = depthOf(rect) - faceDepth;
      const tech = Math.max(c.item.primary.techMin, ...c.item.children.map((k) => k.techMin));
      if (body < tech) over += tech - body;
    }
    return over;
  };
  const stackMins = (rect: Rect, clusters: readonly Cluster[]): number[] => {
    const across = rect.x1 - rect.x0;
    return clusters.map((c) =>
      Math.max(
        c.item.primary.techMin,
        needWidth(c.item.primary, across, wall),
        c.item.primary.aspectHard ? Math.ceil(across / c.item.primary.aspectHard / 5) * 5 : 0,
      ),
    );
  };
  const stackOver = (rect: Rect, clusters: readonly Cluster[]): number => {
    const across = rect.x1 - rect.x0;
    let over = stackMins(rect, clusters).reduce((a, b) => a + b, 0) - depthOf(rect);
    for (const c of clusters)
      if (c.item.primary.techMin > across) over += c.item.primary.techMin - across;
    return over;
  };
  const slotOver = (sl: Slot, rect: Rect): number => {
    if (!sl.clusters.length) return sl.emptyOk ? -1 : MIN_CELL_CM;
    return sl.kind === 'row'
      ? rowOver(
          rect,
          sl.clusters.map((c) => asIn(sl, c)),
        )
      : stackOver(rect, sl.clusters);
  };
  const groupRects = (g: Group, depthA: number): [Rect, Rect] => [
    { ...g.region, y1: g.region.y0 + depthA },
    { ...g.region, y0: g.region.y0 + depthA + cw },
  ];
  /** Nhóm hai hàng: chọn chiều sâu hàng trên cho phần thiếu lớn hơn của hai hàng nhỏ nhất. */
  const groupOver = (g: Group): { over: number; depthA: number } => {
    const total = depthOf(g.region) - cw;
    let best = { over: Infinity, depthA: g.depthA };
    for (let d = MIN_CELL_CM; d <= total - MIN_CELL_CM; d += config.depth_step_cm) {
      const [ra, rb] = groupRects(g, d);
      const over = Math.max(slotOver(g.a, ra), slotOver(g.b, rb));
      if (over < best.over - 1e-9) best = { over, depthA: d };
    }
    return best;
  };
  const unitOver = (sl: Slot): number => {
    if (!sl.group) return Math.max(0, slotOver(sl, sl.rect));
    return Math.max(0, groupOver(sl.group).over);
  };
  const units = (): Slot[] => slots.filter((sl) => !sl.group || sl === sl.group.a);
  const totalOver = (): number => units().reduce((sum, sl) => sum + unitOver(sl), 0);
  const unitOf = (sl: Slot): Slot => (sl.group ? sl.group.a : sl);

  let total = totalOver();
  // Mỗi bước: phép dời một phòng sang hàng khác, hay đổi chỗ hai phòng giữa hai hàng, giảm nhiều nhất tổng phần thiếu.
  // Hoà thì phòng nhỏ trước, rồi theo mã — tất định.
  const movable = (c: Cluster) => c.balconies.length === 0;
  for (let move = 0; move < config.max_moves && total > 0; move += 1) {
    const cached = new Map(units().map((u) => [u, unitOver(u)]));
    let best: {
      total: number;
      weight: number;
      key: string;
      apply: () => void;
      say: string;
    } | null = null;
    const consider = (
      touched: Slot[],
      weight: number,
      key: string,
      apply: () => void,
      say: string,
    ) => {
      let next = total;
      for (const u of new Set(touched.map(unitOf))) next += unitOver(u) - cached.get(u)!;
      if (next >= total - 1e-9) return;
      if (
        !best ||
        next < best.total - 1e-9 ||
        (Math.abs(next - best.total) <= 1e-9 &&
          (weight < best.weight || (weight === best.weight && key < best.key)))
      ) {
        best = { total: next, weight, key, apply, say };
      }
    };
    for (const from of slots) {
      for (const c of [...from.clusters]) {
        if (!movable(c)) continue;
        for (const to of slots) {
          if (to === from || !accepts(to, c)) continue;
          const i0 = from.clusters.indexOf(c);
          from.clusters.splice(i0, 1);
          to.clusters.push(c);
          consider(
            [from, to],
            c.item.weight,
            c.item.key,
            () => {
              from.clusters.splice(from.clusters.indexOf(c), 1);
              to.clusters.push(c);
            },
            `dời "${c.item.key}" ${from.name} → ${to.name}`,
          );
          to.clusters.pop();
          from.clusters.splice(i0, 0, c);
        }
      }
    }
    for (let p = 0; p < slots.length; p += 1) {
      for (let q = p + 1; q < slots.length; q += 1) {
        const sa = slots[p]!;
        const sb = slots[q]!;
        for (const ca of [...sa.clusters]) {
          if (!movable(ca) || !accepts(sb, ca)) continue;
          for (const cb of [...sb.clusters]) {
            if (!movable(cb) || !accepts(sa, cb)) continue;
            const ia = sa.clusters.indexOf(ca);
            const ib = sb.clusters.indexOf(cb);
            sa.clusters[ia] = cb;
            sb.clusters[ib] = ca;
            consider(
              [sa, sb],
              Math.min(ca.item.weight, cb.item.weight) + 1e6,
              `${ca.item.key}|${cb.item.key}`,
              () => {
                sa.clusters[sa.clusters.indexOf(ca)] = cb;
                sb.clusters[sb.clusters.indexOf(cb)] = ca;
              },
              `đổi "${ca.item.key}" (${sa.name}) ⇄ "${cb.item.key}" (${sb.name})`,
            );
            sa.clusters[ia] = ca;
            sb.clusters[ib] = cb;
          }
        }
      }
    }
    const chosen = best as { total: number; apply: () => void; say: string } | null;
    if (!chosen) break;
    chosen.apply();
    ni.trace?.(`  hai hàng t${ni.level} ${spec.tag}: ${chosen.say}`);
    total = chosen.total;
  }
  if (total > 0) {
    return none(
      `còn thiếu ${Math.round(total)} cm: ${units()
        .filter((u) => unitOver(u) > 0)
        .map((u) => `${u.group ? u.name.slice(0, -1) : u.name}=${Math.round(unitOver(u))}`)
        .join(
          ' ',
        )} (${slots.map((sl) => `${sl.name}:[${sl.clusters.map((c) => c.item.key).join(',')}]`).join(' ')})`,
    );
  }
  const settleGroups = () => {
    for (const g of groups) {
      g.depthA = groupOver(g).depthA;
      [g.a.rect, g.b.rect] = groupRects(g, g.depthA);
    }
  };
  settleGroups();
  const sketchOrder = (sl: Slot, reverse: boolean): Cluster[] => {
    const key = (c: Cluster) => {
      const box = boxOf(c);
      return box ? (sl.kind === 'row' ? centre(box).x : centre(box).y) : 0;
    };
    const list = [...sl.clusters].sort(
      (p, q) => key(p) - key(q) || p.item.key.localeCompare(q.item.key),
    );
    if (reverse) list.reverse();
    for (const [pin, first] of [
      [sl.pinFirst, true],
      [sl.pinLast, false],
    ] as const) {
      if (!pin || !list.includes(pin)) continue;
      list.splice(list.indexOf(pin), 1);
      if (first) list.unshift(pin);
      else list.push(pin);
    }
    return list;
  };
  /** Thứ tự đã chỉnh (T180) — tắt thì theo bản phác. */
  let explicit = false;

  // ── Dựng cây trong hệ chuẩn ────────────────────────────────────────────────────────────
  const build = (reverse: boolean): Built | null => {
    const hallSegments: Rect[] = [];
    const pushHall = (rect: Rect): Placed => {
      hallSegments.push(rect);
      return leaf(hallPlaceholder(hallSegments.length - 1), rect);
    };
    const ordered = (sl: Slot): Cluster[] =>
      explicit ? [...sl.clusters] : sketchOrder(sl, reverse);
    const placeSlot = (sl: Slot): Placed | null => {
      if (!sl.clusters.length) return sl.emptyOk ? pushHall(sl.rect) : null;
      if (sl.kind === 'row')
        return bandPlaced(
          sl.rect,
          ordered(sl).map((c) => asIn(sl, c)),
          sl.hall,
          ni,
          'lo',
        );
      return stackAlong(
        sl.rect,
        'y',
        ordered(sl).map((c) => c.item),
        wall,
      );
    };
    const placeRegion = (name: string, rect: Rect): Placed | null => {
      const group = groups.find((g) => g.a.name === `${name}A`);
      if (!group) {
        const sl = slots.find((x) => x.name === name);
        return sl ? placeSlot(sl) : null;
      }
      const a = placeSlot(group.a);
      const b = placeSlot(group.b);
      if (!a || !b) return null;
      const hall = pushHall({ ...rect, y0: group.a.rect.y1, y1: group.b.rect.y0 });
      return chain(rect, 'y', [a, hall, b]);
    };
    const rows: Placed[] = [];
    if (front) {
      const placed = placeSlot(front);
      if (!placed) return fail('dải trước không dựng được');
      if (landing > 0) {
        const hall = pushHall(
          landingSide === 'x0'
            ? { x0: topX0, y0: f.y0, x1: frontX0, y1: s.y0 - cw }
            : { x0: frontX1, y0: f.y0, x1: topX1, y1: s.y0 - cw },
        );
        rows.push(
          chain(
            { x0: topX0, y0: f.y0, x1: topX1, y1: s.y0 - cw },
            'x',
            landingSide === 'x0' ? [hall, placed] : [placed, hall],
          ),
        );
      } else rows.push(placed);
    }
    const hallT = pushHall({ x0: topX0, y0: s.y0 - cw, x1: topX1, y1: s.y0 });
    if (strip) {
      const body = chain({ x0: topX0, y0: f.y0, x1: topX1, y1: s.y0 }, 'y', [...rows, hallT]);
      const stripLeaf = leaf(strip.leaf.key, strip.rect);
      rows.length = 0;
      rows.push(
        chain(
          { x0: f.x0, y0: f.y0, x1: f.x1, y1: s.y0 },
          'x',
          ni.mainFace === 'x0' ? [stripLeaf, body] : [body, stripLeaf],
        ),
      );
    } else rows.push(hallT);
    const backRect: Rect = { x0: f.x0, y0: s.y0, x1: f.x1, y1: f.y1 };
    const columns: Placed[] = [];
    if (lftRect) {
      const placed = placeRegion('lft', lftRect);
      if (!placed) return fail('vùng cạnh dải dọc không dựng được');
      columns.push(placed);
    }
    const besidePlaced = beside ? placeSlot(beside) : null;
    if (beside && !besidePlaced) return fail('túi cạnh thang không dựng được');
    if (spec.v) {
      columns.push(pushHall({ x0: vx0, y0: s.y0, x1: s.x0, y1: f.y1 }));
      const topRect: Rect = { x0: s.x0, y0: s.y0, x1: f.x1, y1: s.y1 };
      const top = chain(topRect, 'x', [leaf(stairKey, s), ...(besidePlaced ? [besidePlaced] : [])]);
      if (underRect) {
        const under = placeRegion('under', underRect);
        if (!under) return fail('túi sau thang không dựng được');
        columns.push(chain({ x0: s.x0, y0: s.y0, x1: f.x1, y1: f.y1 }, 'y', [top, under]));
      } else columns.push(top);
    } else {
      columns.push(leaf(stairKey, s));
      if (besidePlaced) columns.push(besidePlaced);
    }
    rows.push(chain(backRect, 'x', columns));
    const placed = chain(f, 'y', rows);

    const named = nameHallSegments(placed, hallSegments, corridorItems, ni);
    if (!named) return fail('không gán được mã hành lang');
    const leafById = named.leafById ?? ni.env.leafById;
    if (!accessHolds(named.placed, leafById, ni, stairKey)) return fail('lối vào');
    // Mặt ban công đầu bài BẮT BUỘC (T91): phải có một ban công nằm dọc mặt ấy (cạnh dài trên mép hình bao). Cổng cả nhà
    // bác cây thiếu — để lọt thì tầng «qua» bằng một cây chắc chắn hỏng và các bước quay lui sau không chạy.
    const cells = leaves(named.placed);
    for (const side of wanted) {
      const along = cells.some(({ id, rect }) => {
        const l = leafById.get(id);
        if (!l || l.role !== 'open' || !l.needsOpenFace) return false;
        const w = rect.x1 - rect.x0;
        const d = rect.y1 - rect.y0;
        if (side === 'y0') return rect.y0 === f.y0 && w >= d;
        if (side === 'y1') return rect.y1 === f.y1 && w >= d;
        if (side === 'x0') return rect.x0 === f.x0 && d >= w;
        return rect.x1 === f.x1 && d >= w;
      });
      if (!along) return fail(`không ban công nào nằm dọc mặt ${side} đầu bài bắt buộc`);
    }
    return {
      placed: named.placed,
      ...(named.program ? { program: named.program } : {}),
      ...(named.leafById ? { leafById: named.leafById } : {}),
      reversed: reverse,
      tuned: explicit,
    };
  };
  // Hai thứ tự trong hàng: theo bản phác, và lật ngược — luật bắt buộc T71 (thờ / WC kề nhau, đối cửa) do cổng quyết.
  const out = [build(false), build(true)];
  if (config.prefer && config.prefer.max_moves > 0 && tune(config.prefer)) {
    explicit = true;
    settleGroups();
    out.push(build(false));
  }
  return out.filter((b): b is Built => b !== null);

  /**
   * Bước chỉnh (T180): chia đã vừa thì dời / đổi phòng giữa các hàng và đổi chỗ trong hàng sao cho khu ướt (WC, giặt) không
   * đè chỗ khô tầng dưới (E5) và gần khu ướt tầng dưới (E2), phòng ở có mặt thoáng (D2). Đo trên chính các ô dựng ra; mọi
   * phép giữ «mọi hàng chứa nổi». Bản chỉnh là ỨNG VIÊN THÊM — bản theo bản phác vẫn lên cổng, cổng + thước chấm chọn.
   */
  function tune(prefer: NonNullable<RowsConfig['prefer']>): boolean {
    const wetTypes = ni.wetTypes ?? new Set<string>();
    const habitable = ni.habitableTypes ?? new Set<string>();
    const sleeping = ni.sleepingTypes ?? new Set<string>();
    const dry = ni.dryBelow ?? [];
    const wetBelow = ni.wetBelow;
    const ratio = ni.wetOverlapRatio ?? 0;
    if (!wetTypes.size && !habitable.size) return false;
    for (const sl of slots) sl.clusters = sketchOrder(sl, false);
    const typesOf = (id: string) => ni.env.leafById.get(id)?.types ?? [];
    const overlap = (a: Rect, b: Rect) =>
      Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
      Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const lit = (r: Rect, balconies: Rect[]) =>
      (r.y0 === f.y0 && ni.openSides.has('y0')) ||
      (r.y1 === f.y1 && ni.openSides.has('y1')) ||
      (r.x0 === f.x0 && ni.openSides.has('x0')) ||
      (r.x1 === f.x1 && ni.openSides.has('x1')) ||
      balconies.some((b) => sharedEdge(b, r) > 0);
    const slotLeaves = (sl: Slot): { id: string; rect: Rect }[] | null => {
      if (!sl.clusters.length) return sl.emptyOk ? [] : null;
      const placed =
        sl.kind === 'row'
          ? bandPlaced(
              sl.rect,
              sl.clusters.map((c) => asIn(sl, c)),
              sl.hall,
              ni,
              'lo',
            )
          : stackAlong(
              sl.rect,
              'y',
              sl.clusters.map((c) => c.item),
              wall,
            );
      return placed ? leaves(placed) : null;
    };
    const cost = (): number => {
      if (totalOver() > 0) return Infinity;
      settleGroups();
      const cells: { id: string; rect: Rect }[] = [];
      for (const sl of slots) {
        const ls = slotLeaves(sl);
        if (!ls) return Infinity;
        cells.push(...ls);
      }
      const balconies = cells
        .filter((c) => ni.env.leafById.get(c.id)?.role === 'open')
        .map((c) => c.rect);
      let value = 0;
      // Phòng thờ cạnh / đối diện WC qua hành lang (luật bắt buộc T71): cổng bác — trừ nặng để bước chỉnh né trước.
      const altarTypes = ni.altarTypes;
      const wcTypes = ni.wcTypes;
      if (altarTypes && wcTypes && prefer.altar_near_wc) {
        const is = (id: string, set: ReadonlySet<string>) => typesOf(id).some((t) => set.has(t));
        const altars = cells.filter((c) => is(c.id, altarTypes));
        const wcs = cells.filter((c) => is(c.id, wcTypes));
        for (const a of altars)
          for (const w of wcs) {
            const gapX = Math.max(a.rect.x0 - w.rect.x1, w.rect.x0 - a.rect.x1);
            const gapY = Math.max(a.rect.y0 - w.rect.y1, w.rect.y0 - a.rect.y1);
            const near =
              (gapX <= 0 && gapY <= 0) || (gapX <= 0 && gapY <= cw) || (gapY <= 0 && gapX <= cw);
            if (near) value += prefer.altar_near_wc;
          }
      }
      for (const { id, rect } of cells) {
        const types = typesOf(id);
        const area = Math.max(1, (rect.x1 - rect.x0) * (rect.y1 - rect.y0));
        // Sàn đầu bài phải còn dư một phần cho cổng (ước lọt lòng bằng một bề dày tường là ước — T179 còn mở 3): cách xếp
        // sát sàn bị cổng bác, nên bước chỉnh không được đổi lấy nó.
        const floor = ni.env.leafById.get(id)?.areaFloor ?? null;
        if (floor !== null) {
          const clear =
            (Math.max(0, rect.x1 - rect.x0 - wall) * Math.max(0, rect.y1 - rect.y0 - wall)) /
            10_000;
          if (clear < floor * (1 + prefer.floor_margin_ratio)) value += prefer.tight_floor;
        }
        if (types.some((t) => wetTypes.has(t))) {
          const over = dry.reduce((sum, r) => sum + overlap(rect, r), 0);
          if (over / area >= ratio) value += prefer.wet_over_dry;
          // Bếp / phòng thờ tầng dưới (luật bắt buộc T71): đè lên thì cổng bác — trừ nặng để bước chỉnh không đổi lấy nó.
          if (ni.avoidWetOver.some((r) => overlap(rect, r) > 0))
            value += prefer.wet_over_service ?? 0;
          if (wetBelow.length) {
            const cx = (rect.x0 + rect.x1) / 2;
            const cy = (rect.y0 + rect.y1) / 2;
            const near = Math.min(
              ...wetBelow.map((r) =>
                Math.hypot(Math.max(r.x0 - cx, 0, cx - r.x1), Math.max(r.y0 - cy, 0, cy - r.y1)),
              ),
            );
            value += (prefer.wet_distance_per_m * near) / 100;
          }
        } else if (types.some((t) => habitable.has(t)) && !lit(rect, balconies)) {
          value += prefer.dark_room;
          if (types.some((t) => sleeping.has(t))) value += prefer.dark_bedroom;
        }
      }
      return value;
    };
    const start = cost();
    if (!Number.isFinite(start)) return false;
    let current = start;
    const pinnedIn = (sl: Slot, c: Cluster) => c === sl.pinFirst || c === sl.pinLast;
    // Ngân sách số cách xếp phép đổi chỗ một bước được đo trong cả lần chỉnh (T182) — giữ thời gian một vòng dưới trần CPU.
    let swapBudget = prefer.wet_swap_insert_budget ?? Infinity;
    for (let step = 0; step < prefer.max_moves && current > 0; step += 1) {
      let best: { value: number; apply: () => void } | null = null;
      const consider = (apply: () => void, undo: () => void) => {
        apply();
        const value = cost();
        undo();
        if (value < current - 1e-9 && (!best || value < best.value - 1e-9)) best = { value, apply };
      };
      // Đổi chỗ trong hàng.
      for (const sl of slots) {
        for (let i = 0; i < sl.clusters.length; i += 1)
          for (let j = i + 1; j < sl.clusters.length; j += 1) {
            const a = sl.clusters[i]!;
            const b = sl.clusters[j]!;
            if (pinnedIn(sl, a) || pinnedIn(sl, b)) continue;
            const swap = () => {
              const x = sl.clusters.indexOf(a);
              const y = sl.clusters.indexOf(b);
              sl.clusters[x] = b;
              sl.clusters[y] = a;
            };
            consider(swap, swap);
          }
      }
      // Dời sang hàng khác (vào từng chỗ), đổi chỗ hai phòng giữa hai hàng.
      for (const from of slots)
        for (const c of [...from.clusters]) {
          if (!movable(c)) continue;
          for (const to of slots) {
            if (to === from || !accepts(to, c)) continue;
            for (let at = 0; at <= to.clusters.length; at += 1) {
              const i0 = from.clusters.indexOf(c);
              consider(
                () => {
                  from.clusters.splice(from.clusters.indexOf(c), 1);
                  to.clusters.splice(at, 0, c);
                },
                () => {
                  to.clusters.splice(to.clusters.indexOf(c), 1);
                  from.clusters.splice(i0, 0, c);
                },
              );
            }
          }
          for (const to of slots) {
            if (to === from || !accepts(to, c)) continue;
            for (const d of [...to.clusters]) {
              if (!movable(d) || !accepts(from, d)) continue;
              const swap = () => {
                const x = from.clusters.indexOf(c);
                if (x >= 0) {
                  const y = to.clusters.indexOf(d);
                  from.clusters[x] = d;
                  to.clusters[y] = c;
                } else {
                  from.clusters[from.clusters.indexOf(d)] = c;
                  to.clusters[to.clusters.indexOf(c)] = d;
                }
              };
              consider(swap, swap);
            }
          }
        }
      // Không phép đơn nào lợi (T182): đổi chỗ một khu ướt với một phòng ở hàng khác, mỗi phòng vào MỌI vị trí của hàng
      // mới — một bước mà phép đơn cần hai (đổi chỗ rồi dời trong hàng), bước giữa thường tệ hơn nên tìm tham không qua.
      // Ví dụ 9272: WC chung đổi với phòng làm việc rồi xuống góc sau, nơi khu ướt tầng dưới nằm.
      if (!best && prefer.wet_swap_insert) {
        const wetCluster = (c: Cluster) =>
          [c.item.primary, ...c.item.children].some((l) => l.types.some((t) => wetTypes.has(t)));
        for (const sa of slots)
          for (const sb of slots) {
            if (sa === sb) continue;
            for (const ca of [...sa.clusters]) {
              if (!movable(ca) || !wetCluster(ca) || pinnedIn(sa, ca) || !accepts(sb, ca)) continue;
              for (const cb of [...sb.clusters]) {
                if (!movable(cb) || pinnedIn(sb, cb) || !accepts(sa, cb)) continue;
                for (let pa = 0; pa < sa.clusters.length; pa += 1)
                  for (let pb = 0; pb < sb.clusters.length; pb += 1) {
                    if (swapBudget <= 0) continue;
                    swapBudget -= 1;
                    const a0 = [...sa.clusters];
                    const b0 = [...sb.clusters];
                    const apply = () => {
                      const a = a0.filter((c) => c !== ca);
                      const b = b0.filter((c) => c !== cb);
                      a.splice(pa, 0, cb);
                      b.splice(pb, 0, ca);
                      sa.clusters = a;
                      sb.clusters = b;
                    };
                    consider(apply, () => {
                      sa.clusters = a0;
                      sb.clusters = b0;
                    });
                  }
              }
            }
          }
      }
      const chosen = best as { value: number; apply: () => void } | null;
      if (!chosen) break;
      chosen.apply();
      current = chosen.value;
    }
    settleGroups();
    ni.trace?.(
      `  hai hàng t${ni.level} ${spec.tag}: chỉnh khu ướt / mặt thoáng ${start} → ${current}`,
    );
    return current < start - 1e-9;
  }
}
