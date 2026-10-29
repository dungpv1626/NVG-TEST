/**
 * Khung xương của một tầng — chương trình DỰNG lõi và hành lang, phòng lấp vào các túi quanh hành lang (T102,
 * 29/09/2026 — `doc/design/THIET_KE_KHUNG_XUONG.md`).
 *
 * Vì sao có tệp này: 77 % vòng thật hỏng vì giao thông — mô hình vẽ phòng đúng chỗ nhưng hành lang vỡ mẩu, phòng
 * không chạm hành lang, ô thang cô lập; bộ đóng gói dự phòng (`pack.ts`, `frames.ts`) chỉ coi lối vào là một
 * khoản phạt mềm nên hiếm khi cứu được. Ở đây lối vào là BẤT BIẾN CỦA CÁCH DỰNG: mọi phòng cần cửa được đặt sao
 * cho nó chạm một đoạn hành lang hay một khu chung ngay khi dựng.
 *
 *   dải TRƯỚC  : các cột, mỗi cột một cụm [ban công | phòng (+ WC khép kín một bên)] — chạm dải HF hay đầu V
 *   HF         : dải hành lang ngang trước lõi (tuỳ chọn)
 *   dải LÕI    : [ô thang S (cố định) | thang máy E | dải dọc V áp lõi | cột phụ trợ áp V | túi giữa]
 *   HB         : dải hành lang ngang sau lõi (tuỳ chọn)
 *   dải SAU    : như dải trước, ban công áp mặt sau
 *
 * Bản phác của mô hình chỉ còn là GỢI Ý VỊ TRÍ: phòng nào dải nào, thứ tự trái → phải, ban công thuộc phòng nào.
 * Chương trình liệt kê vài biến thể khung (có / không HF, HB, V; phòng lớn ở dải lõi đẩy sang dải trước / sau;
 * phòng nhỏ kéo vào cột phụ trợ) và để cổng + thước chấm chọn — không fix cứng kiểu hành lang theo bề rộng nhà
 * (Haan, T96).
 *
 * Hàm THUẦN, tất định: mọi thứ tự có khoá cuối là mã phòng. Không import gì của bộ giải nội bộ đã gỡ.
 */

import type { AiSpaceProgram } from '@nvg/shared/design';
import type { Rect } from '../draw/geometry';
import { evaluate, NO_REACH, type PackEnv, type PackItem, type PackLeaf } from './pack';
import {
  chain,
  leaf,
  leaves,
  MODULE_CM,
  sharedEdge,
  slices,
  splitLengths,
  type Placed,
  type Side,
} from './placed';

export interface SkeletonInput {
  /** Hình bao tầng theo tim tường, cm. */
  footprint: Rect;
  level: number;
  env: PackEnv;
  /** Lá gốc của tầng (phòng mẹ kèm phòng khép kín) — như `environment()` trả. */
  items: readonly PackItem[];
  corridorIds: ReadonlySet<string>;
  stairIds: ReadonlySet<string>;
  /** Ô thang CỐ ĐỊNH: mốc tầng dưới, hoặc ô bản phác tầng 1 vẽ. `null` = không dựng khung. */
  stair: Rect | null;
  /** Ô thang máy cố định (mốc tầng dưới / bản phác tầng 1), theo mã lá. */
  elevators: ReadonlyMap<string, Rect>;
  /** Giếng trời cố định (mốc tầng dưới), theo mã lá. */
  lightWells: ReadonlyMap<string, Rect>;
  /** Chữ nhật bao các ô bản phác của từng phòng, cm — gợi ý vị trí. Thiếu thì dùng vùng của lá. */
  boxes: ReadonlyMap<string, Rect>;
  corridorWidth: { edge: number; inner: number };
  /** Loại phòng đặt cho đoạn hành lang chương trình thêm khi tầng thiếu lá hành lang. */
  corridorType: string;
  /** Khu ướt tầng dưới — WC khép kín quay về phía gần nhất (E2). */
  wetBelow: readonly Rect[];
  /** Bếp / phòng thờ tầng dưới — WC không đặt lên (T71). */
  avoidWetOver: readonly Rect[];
  /** Mặt hình bao thoáng (ban công quay ra). */
  openSides: ReadonlySet<Side>;
  /**
   * Mặt ban công đầu bài BẮT BUỘC / CẤM (T91), và độ đua ra ngoài ranh từng mặt, cm (T65) — ô ban công áp mép
   * hình bao được nới ra ngoài đúng bấy nhiêu ở `tree/balcony-projection.ts`, nên dải trong nhà chỉ cần
   * phần còn thiếu. Rỗng = không đua.
   */
  balconySides: {
    required: readonly Side[];
    forbidden: readonly Side[];
    projection: Readonly<Partial<Record<Side, number>>>;
  } | null;
  program: AiSpaceProgram;
  trace?: (line: string) => void;
}

export interface SkeletonCandidate {
  key: string;
  placed: Placed;
  penalty: number;
  /** Chương trình có thêm đoạn hành lang (khi lá hành lang của tầng không đủ đoạn). */
  program?: AiSpaceProgram;
  /** `leafById` có thêm lá hành lang mới — đưa vào `PackEnv` của ứng viên. */
  leafById?: ReadonlyMap<string, PackLeaf>;
}

/**
 * Bề rộng theo tim một lá CẦN để đạt sàn đầu bài khi chiều kia là `depth` cm: lọt lòng ≈ (rộng − tường)(sâu −
 * tường), tường lấy một bề dày tường ngoài như `environment()` (`floorWallCm`). Không có sàn đầu bài → 0.
 */
export function needWidth(l: PackLeaf, depth: number, wallCm: number): number {
  if (l.areaFloor === null) return 0;
  const clearDepth = Math.max(1, depth - wallCm);
  return ceil5((l.areaFloor * 10_000) / clearDepth + wallCm);
}

/** Ô nhỏ nhất của cây chia — cùng `tree/cells.ts` (`MIN_CELL_CM`), chép số để không kéo cả `tree/` vào đây. */
export const MIN_CELL_CM = 60;

/**
 * Bề dày dải ban công trong nhà theo tim, cm: đủ cạnh dùng được và đủ diện tích dọc `along`, TRỪ phần đua ra
 * ngoài ranh ở mặt ấy — cổng đo phòng SAU khi nới, nên phần trong nhà chỉ cần bù chỗ thiếu.
 */
export function balconyThickness(
  balcony: PackLeaf,
  along: number,
  side: Side,
  input: SkeletonInput,
): number {
  const projection = input.balconySides?.projection[side] ?? 0;
  const need = Math.max(balcony.techMin, ceil5((balcony.target * 10_000) / Math.max(1, along)));
  return Math.max(MIN_CELL_CM, ceil5(need - projection));
}

/** Phòng đặt vào cột phụ trợ áp dải dọc khi không lớn hơn chừng này, m² (WC chung, giặt, kho, kỹ thuật). */
const SERVICE_MAX_M2 = 8;
/** Trần ứng viên trả ra — mỗi ứng viên là một lượt qua cổng. */
const CANDIDATES_MAX = 36;
/** Mã tạm cho đoạn hành lang trước khi gán mã thật. */
export const hallPlaceholder = (index: number) => `__hall_${index}`;

type Band = 'front' | 'core' | 'back';

export interface Cluster {
  item: PackItem;
  /** Ban công / sân gắn vào phòng này (lá gốc không cha, mô hình vẽ kề) và mặt hình bao nó áp vào. */
  balconies: { leaf: PackLeaf; side: Side }[];
}

/**
 * Dải hành lang ngang của một phía: `none` không có; `edge` áp lõi (phòng một hàng chạm nó); `mid` nằm GIỮA
 * vùng — hai hàng phòng, hàng ngoài áp mặt tiền, hàng trong áp lõi, cả hai chạm hành lang, dải dọc V xuyên hàng
 * trong nối về lõi (vùng sâu 7–9 m trước thang: phòng chạy suốt chiều sâu thì thành hành lang có giường).
 */
type HallMode = 'none' | 'edge' | 'mid';

interface Variant {
  hf: HallMode;
  hb: HallMode;
  v: boolean;
  /** Phòng lớn ở dải lõi đẩy sang dải trước / sau. */
  spill: boolean;
  /** Phòng nhỏ ở dải trước / sau kéo vào cột phụ trợ. */
  pull: boolean;
}

interface FixedColumn {
  x0: number;
  x1: number;
  cells: { id: string; rect: Rect }[];
}

interface Frame {
  f: Rect;
  s: Rect;
  cy0: number;
  cy1: number;
  coreX0: number;
  coreX1: number;
  columns: FixedColumn[];
  vSide: 'lo' | 'hi';
  cw: number;
  rest: PackItem[];
  corridorItems: PackItem[];
  stairKey: string;
  variant: Variant;
}

interface BuiltVariant {
  placed: Placed;
  program?: AiSpaceProgram;
  leafById?: ReadonlyMap<string, PackLeaf>;
}

export function skeletonCandidates(input: SkeletonInput): SkeletonCandidate[] {
  const f = input.footprint;
  const stairItem = input.items.find((item) => input.stairIds.has(item.key));
  const s = input.stair;
  if (!stairItem || !s || !inside(s, f)) {
    input.trace?.(
      `  khung: không có ô thang cố định (${stairItem?.key ?? '-'} ${JSON.stringify(s)})`,
    );
    return [];
  }

  // ── Ô cố định: thang, thang máy, giếng trời — phải kề thang và xếp thành các cột x rời nhau, liền nhau ──
  const fixed: { id: string; rect: Rect }[] = [{ id: stairItem.key, rect: s }];
  for (const source of [input.elevators, input.lightWells]) {
    for (const [id, rect] of source) {
      if (!input.items.some((item) => item.key === id)) continue;
      if (!inside(rect, f) || sharedEdge(rect, s) <= 0) {
        input.trace?.(
          `  khung: ô cố định "${id}" ${JSON.stringify(rect)} không kề thang ${JSON.stringify(s)}`,
        );
        return [];
      }
      fixed.push({ id, rect });
    }
  }
  const cy0 = Math.min(...fixed.map((c) => c.rect.y0));
  const cy1 = Math.max(...fixed.map((c) => c.rect.y1));
  const columns: FixedColumn[] = [];
  for (const cell of [...fixed].sort((p, q) => p.rect.x0 - q.rect.x0 || p.id.localeCompare(q.id))) {
    const same = columns.find((col) => col.x0 === cell.rect.x0 && col.x1 === cell.rect.x1);
    if (same) same.cells.push(cell);
    else columns.push({ x0: cell.rect.x0, x1: cell.rect.x1, cells: [cell] });
  }
  columns.sort((p, q) => p.x0 - q.x0);
  for (let i = 1; i < columns.length; i += 1) {
    if (columns[i]!.x0 !== columns[i - 1]!.x1) {
      input.trace?.(
        `  khung: các cột ô cố định không liền nhau: ${columns.map((c) => `${c.x0}–${c.x1}`).join(' ')} (${fixed.map((c) => `${c.id}=${JSON.stringify(c.rect)}`).join(' ')})`,
      );
      return [];
    }
  }
  for (const col of columns) {
    const sorted = [...col.cells].sort((p, q) => p.rect.y0 - q.rect.y0);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.rect.y0 < sorted[i - 1]!.rect.y1) {
        input.trace?.(`  khung: ô cố định chồng nhau trong cột ${col.x0}–${col.x1}`);
        return [];
      }
    }
  }
  const coreX0 = columns[0]!.x0;
  const coreX1 = columns[columns.length - 1]!.x1;
  const wallLeft = coreX0 === f.x0;
  const wallRight = coreX1 === f.x1;
  // Lõi chắn trọn bề ngang: không dựng. Lõi đứng GIỮA nhà (T105, lượt 25fdc90c — thang giữa, hành lang sau
  // chỉ tới được qua vế bậc): dải dọc V thử cả hai bên lõi, bên kia thành một cột phòng xếp dọc (`far`).
  if (wallLeft && wallRight) {
    input.trace?.(`  khung: lõi ${coreX0}–${coreX1} chắn trọn bề ngang ${f.x0}–${f.x1}`);
    return [];
  }
  const vSides: ('lo' | 'hi')[] = wallLeft ? ['hi'] : wallRight ? ['lo'] : ['hi', 'lo'];

  const fixedIds = new Set(fixed.map((c) => c.id));
  const corridorItems = input.items.filter((item) => input.corridorIds.has(item.key));
  const rest = input.items.filter(
    (item) => !fixedIds.has(item.key) && !input.corridorIds.has(item.key),
  );
  const cw = input.corridorWidth.inner;

  const out: SkeletonCandidate[] = [];
  const seen = new Set<string>();
  const modes: HallMode[] = ['edge', 'mid', 'none'];
  const midCore = !wallLeft && !wallRight;
  for (const vSide of vSides)
    for (const v of [true, false]) {
      for (const hf of modes) {
        for (const hb of modes) {
          if (!v && (hf === 'mid' || hb === 'mid')) continue;
          // Lõi giữa: bên xa là một cột phòng; khối hai hàng (`mid`) chưa dựng cho trường hợp này.
          if (midCore && (hf === 'mid' || hb === 'mid')) continue;
          for (const spill of [false, true]) {
            for (const pull of [true, false]) {
              if (out.length >= CANDIDATES_MAX) return out;
              const variant: Variant = { hf, hb, v, spill, pull };
              const built = buildVariant(input, {
                f,
                s,
                cy0,
                cy1,
                coreX0,
                coreX1,
                columns,
                vSide,
                cw,
                rest,
                corridorItems,
                stairKey: stairItem.key,
                variant,
              });
              if (!built) continue;
              const signature = leaves(built.placed)
                .map((l) => `${l.id}:${l.rect.x0},${l.rect.y0},${l.rect.x1},${l.rect.y1}`)
                .sort()
                .join(';');
              if (seen.has(signature)) continue;
              seen.add(signature);
              const env = built.leafById ? { ...input.env, leafById: built.leafById } : input.env;
              const key = `skeleton|${variantTag(variant)}${midCore ? `|${vSide}` : ''}`;
              input.trace?.(`  khung ${key}: ${leaves(built.placed).length} ô`);
              out.push({
                key,
                placed: built.placed,
                penalty: evaluate(built.placed, f, NO_REACH, env),
                ...(built.program ? { program: built.program } : {}),
                ...(built.leafById ? { leafById: built.leafById } : {}),
              });
            }
          }
        }
      }
    }
  return out;
}

function variantTag(variant: Variant): string {
  const mode = (m: HallMode, name: string) =>
    m === 'edge' ? name : m === 'mid' ? `${name}m` : '-';
  return `${mode(variant.hf, 'HF')}${variant.v ? 'V' : '-'}${mode(variant.hb, 'HB')}|${
    variant.spill ? 'spill' : 'keep'
  }|${variant.pull ? 'pull' : 'stay'}`;
}

/** Kết quả dựng một phía (trước / sau) của lõi. */
type Region =
  | { kind: 'none' }
  | { kind: 'row'; placed: Placed }
  | {
      kind: 'split';
      rowA: Placed;
      hall: Rect;
      /** Mảnh hàng trong nằm trên các cột ô cố định (`null` = thành sảnh). */
      fixed: Placed | null;
      fixedRect: Rect;
      /** Mảnh hàng trong nằm trên vùng trống bên lõi (`null` = thành sảnh). */
      free: Placed | null;
      freeRect: Rect;
      /** Đoạn dải dọc V xuyên hàng trong. */
      vRect: Rect;
    };

function buildVariant(input: SkeletonInput, frame: Frame): BuiltVariant | null {
  const { f, cy0, cy1, cw, variant, vSide } = frame;
  const env = input.env;
  const tag = `t${input.level} ${variantTag(variant)}`;
  const fail = (why: string): null => {
    input.trace?.(`  khung ${tag} bỏ: ${why}`);
    return null;
  };
  const anyMid = variant.hf === 'mid' || variant.hb === 'mid';

  // ── Phân phòng vào dải theo bản phác ─────────────────────────────────────────────────────
  const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  const boxOf = (item: PackItem): Rect | null => input.boxes.get(item.key) ?? null;
  const bandOf = (item: PackItem): Band => {
    const box = boxOf(item);
    if (box) {
      const c = centre(box).y;
      if (c < cy0) return 'front';
      if (c > cy1) return 'back';
      return 'core';
    }
    return item.row === 0 ? 'front' : item.row === 2 ? 'back' : 'core';
  };
  const isService = (item: PackItem) =>
    item.children.length === 0 &&
    item.primary.role !== 'hub' &&
    !item.primary.needsOpenFace &&
    !item.primary.stair &&
    item.primary.target <= SERVICE_MAX_M2;
  const isBalcony = (item: PackItem) =>
    item.children.length === 0 && item.primary.needsOpenFace && item.primary.role === 'open';

  const front: PackItem[] = [];
  const back: PackItem[] = [];
  const service: PackItem[] = [];
  const mid: PackItem[] = [];
  const balconies: PackItem[] = [];
  // Lõi giữa: vùng giữa tường và lõi ở phía KHÔNG có V (rộng 0 khi lõi áp tường).
  const farX: [number, number] = vSide === 'hi' ? [f.x0, frame.coreX0] : [frame.coreX1, f.x1];
  const farW = farX[1] - farX[0];
  const far: PackItem[] = [];
  const spillTo = (item: PackItem) => {
    const box = boxOf(item);
    const toFront = box ? centre(box).y - cy0 < cy1 - centre(box).y : false;
    (toFront ? front : back).push(item);
  };
  for (const item of frame.rest) {
    if (isBalcony(item)) {
      balconies.push(item);
      continue;
    }
    const band = bandOf(item);
    if (band === 'core') {
      const box = boxOf(item);
      const cx = box ? centre(box).x : null;
      if (farW > 0 && cx !== null && cx >= farX[0] && cx <= farX[1]) far.push(item);
      // `stay`: phòng phụ trợ ở dải lõi cũng không vào cột phụ trợ, để dải V bên lõi hẹp (nhà phố 4 m) còn đủ
      // chỗ làm hành lang dọc thang (T105 — thiếu nó thì phòng sau chỉ «tới được» qua vế bậc).
      else if (isService(item) && variant.v && variant.pull) service.push(item);
      else if (variant.spill) spillTo(item);
      else if (item.primary.role === 'hub' || variant.hf !== 'none' || variant.hb !== 'none')
        mid.push(item);
      else spillTo(item);
      continue;
    }
    if (variant.pull && variant.v && isService(item)) service.push(item);
    else (band === 'front' ? front : back).push(item);
  }
  const frontRegion: Rect = { x0: f.x0, y0: f.y0, x1: f.x1, y1: cy0 };
  const backRegion: Rect = { x0: f.x0, y0: cy1, x1: f.x1, y1: f.y1 };
  const frontDepth = frontRegion.y1 - frontRegion.y0;
  const backDepth = backRegion.y1 - backRegion.y0;
  // Vùng trống mà vẫn có chiều sâu thì không lấp được; vùng có phòng mà không còn chiều sâu cũng vậy.
  if ((front.length === 0) !== (frontDepth === 0))
    return fail(`dải trước ${front.length} phòng, sâu ${frontDepth}`);
  if ((back.length === 0) !== (backDepth === 0))
    return fail(`dải sau ${back.length} phòng, sâu ${backDepth}`);
  if (variant.hf !== 'none' && frontDepth < cw + MIN_CELL_CM) return fail('HF không còn chỗ');
  if (variant.hb !== 'none' && backDepth < cw + MIN_CELL_CM) return fail('HB không còn chỗ');
  if (variant.hf === 'mid' && front.length < 2) return fail('HF giữa dải cần ít nhất hai phòng');
  if (variant.hb === 'mid' && back.length < 2) return fail('HB giữa dải cần ít nhất hai phòng');

  const clustersFront = front.map((item): Cluster => ({ item, balconies: [] }));
  const clustersBack = back.map((item): Cluster => ({ item, balconies: [] }));

  // ── Thứ tự trong dải: trái → phải (dải trước / sau), trước → sau (cột phụ trợ, túi giữa) ──
  const byX = (clusters: Cluster[]) =>
    [...clusters].sort((p, q) => {
      const a = boxOf(p.item);
      const b = boxOf(q.item);
      const ax = a ? centre(a).x : p.item.col * 1e6;
      const bx = b ? centre(b).x : q.item.col * 1e6;
      return ax - bx || p.item.key.localeCompare(q.item.key);
    });
  const byY = (items: PackItem[]) =>
    [...items].sort((p, q) => {
      const a = boxOf(p);
      const b = boxOf(q);
      return (a ? centre(a).y : 0) - (b ? centre(b).y : 0) || p.key.localeCompare(q.key);
    });
  const frontOrdered = byX(clustersFront);
  const backOrdered = byX(clustersBack);
  const serviceOrdered = byY(service);
  let midOrdered = byY(mid);
  // Túi giữa: phòng không phải khu chung chỉ chạm được HF (phòng đầu) / HB (phòng cuối) khi dải ấy áp lõi.
  const midSlots = (variant.hf === 'edge' ? 1 : 0) + (variant.hb === 'edge' ? 1 : 0);
  const midPrivate = (list: readonly PackItem[]) =>
    list.filter((item) => item.primary.role !== 'hub').length;

  // ── Ban công: mặt đầu bài BẮT BUỘC trước, rồi mặt bản phác vẽ; gắn vào phòng kề nhất ở mặt ấy ──
  const forbidden = new Set(input.balconySides?.forbidden ?? []);
  const openSide = (side: Side) => input.openSides.has(side) && !forbidden.has(side);
  const drawnSide = (box: Rect | null): Side | null => {
    if (!box) return null;
    const touches: Side[] = [];
    if (box.y0 === f.y0) touches.push('y0');
    if (box.y1 === f.y1) touches.push('y1');
    if (box.x0 === f.x0) touches.push('x0');
    if (box.x1 === f.x1) touches.push('x1');
    return touches.find(openSide) ?? null;
  };
  const wanted = (input.balconySides?.required ?? []).filter(openSide);
  const covered = new Set<Side>();
  const hostFor = (side: Side, box: Rect | null): Cluster | null => {
    if (side === 'y0' || side === 'y1') {
      const list = side === 'y0' ? frontOrdered : backOrdered;
      const ranked = list
        .map((host) => ({
          host,
          shared: box && boxOf(host.item) ? sharedEdge(box, boxOf(host.item)!) : 0,
          habitable: host.item.primary.role === 'room' ? 1 : 0,
        }))
        .sort(
          (p, q) =>
            q.shared - p.shared ||
            q.habitable - p.habitable ||
            q.host.item.weight - p.host.item.weight ||
            p.host.item.key.localeCompare(q.host.item.key),
        );
      return ranked[0]?.host ?? null;
    }
    // Mặt bên: cột đầu (x0) / cột cuối (x1) của dải gần tâm ban công hơn; dải rỗng thì dải kia.
    const preferFront = box ? centre(box).y - f.y0 < f.y1 - centre(box).y : true;
    const bands = preferFront ? [frontOrdered, backOrdered] : [backOrdered, frontOrdered];
    for (const band of bands) {
      const host = side === 'x0' ? band[0] : band[band.length - 1];
      if (host) return host;
    }
    return null;
  };
  const sortedBalconies = [...balconies].sort((p, q) => {
    const ps = drawnSide(boxOf(p));
    const qs = drawnSide(boxOf(q));
    const pw = ps && wanted.includes(ps) ? 0 : 1;
    const qw = qs && wanted.includes(qs) ? 0 : 1;
    return pw - qw || q.weight - p.weight || p.key.localeCompare(q.key);
  });
  for (const balcony of sortedBalconies) {
    const box = boxOf(balcony);
    const drawn = drawnSide(box);
    const missing = wanted.filter((side) => !covered.has(side));
    const side =
      drawn && (wanted.length === 0 || wanted.includes(drawn) || missing.length === 0)
        ? drawn
        : (missing[0] ?? drawn ?? (['y0', 'y1', 'x0', 'x1'] as Side[]).find(openSide) ?? null);
    if (!side) return fail(`ban công "${balcony.key}" không có mặt thoáng để áp`);
    const host = hostFor(side, box);
    if (!host) return fail(`ban công "${balcony.key}" không có phòng để gắn ở mặt ${side}`);
    host.balconies.push({ leaf: balcony.primary, side });
    covered.add(side);
  }

  // ── Một phía của lõi: một hàng (hành lang `none` / `edge`) hay hai hàng kẹp hành lang (`mid`) ──
  const vx0 = vSide === 'hi' ? frame.coreX1 : frame.coreX0 - cw;
  const vx1 = vx0 + cw;
  if (variant.v && (vx0 < f.x0 || vx1 > f.x1)) return fail('không còn chỗ cho dải dọc V');
  const fixedX: [number, number] = [frame.coreX0, frame.coreX1];
  const freeX: [number, number] = vSide === 'hi' ? [vx1, f.x1] : [f.x0, vx0];
  const buildRegion = (side: 'front' | 'back', clusters: Cluster[]): Region | null => {
    const mode = side === 'front' ? variant.hf : variant.hb;
    const region = side === 'front' ? frontRegion : backRegion;
    const depth = region.y1 - region.y0;
    if (clusters.length === 0) return depth === 0 ? { kind: 'none' } : null;
    if (depth === 0) return null;
    const hallSide: 'y0' | 'y1' = side === 'front' ? 'y1' : 'y0';
    if (mode !== 'mid') {
      const row =
        mode === 'edge'
          ? side === 'front'
            ? { ...region, y1: region.y1 - cw }
            : { ...region, y0: region.y0 + cw }
          : region;
      const placed = bandPlaced(row, clusters, hallSide, input, frame.vSide);
      return placed ? { kind: 'row', placed } : null;
    }
    // Hai hàng: hàng ngoài (A) áp mặt tiền, hàng trong (B) áp lõi — theo tâm ô bản phác so với giữa vùng.
    const midY = (region.y0 + region.y1) / 2;
    const rowA: Cluster[] = [];
    const rowB: Cluster[] = [];
    for (const c of clusters) {
      const box = boxOf(c.item);
      const y = box ? centre(box).y : side === 'front' ? region.y0 : region.y1;
      const outer = side === 'front' ? y < midY : y > midY;
      (outer ? rowA : rowB).push(c);
    }
    if (!rowA.length || !rowB.length) {
      input.trace?.(
        `  khung ${tag}: phía ${side} hai hàng cần phòng ở cả hai hàng (${rowA.length}/${rowB.length})`,
      );
      return null;
    }
    const techOf = (list: Cluster[]) =>
      Math.max(MIN_CELL_CM, ...list.map((c) => c.item.primary.techMin));
    const weightOf = (list: Cluster[]) => list.reduce((sum, c) => sum + c.item.weight, 0);
    const partsA = { weight: weightOf(rowA), min: techOf(rowA) };
    const partsH = { weight: 0, min: cw, fixed: cw };
    const partsB = { weight: weightOf(rowB), min: techOf(rowB) };
    const lengths = splitLengths(
      region.y0,
      depth,
      side === 'front' ? [partsA, partsH, partsB] : [partsB, partsH, partsA],
    );
    if (!lengths) {
      input.trace?.(`  khung ${tag}: phía ${side} sâu ${depth} không đủ cho hai hàng + hành lang`);
      return null;
    }
    const rects = slices(region, 'y', lengths);
    const [rectA, hall, rectB] =
      side === 'front' ? [rects[0]!, rects[1]!, rects[2]!] : [rects[2]!, rects[1]!, rects[0]!];
    const placedA = bandPlaced(rectA, rowA, hallSide, input, frame.vSide);
    if (!placedA) return null;
    // Hàng trong chia ba theo dải dọc: mảnh trên cột ô cố định, V, mảnh trên vùng trống.
    const hallSideB: 'y0' | 'y1' = side === 'front' ? 'y0' : 'y1';
    let onFixed: Cluster[] = [];
    let onFree: Cluster[] = [];
    for (const c of rowB) {
      const box = boxOf(c.item);
      const x = box ? centre(box).x : (freeX[0] + freeX[1]) / 2;
      (x >= fixedX[0] && x <= fixedX[1] ? onFixed : onFree).push(c);
    }
    const fixedRect: Rect = { x0: fixedX[0], y0: rectB.y0, x1: fixedX[1], y1: rectB.y1 };
    const freeRect: Rect = { x0: freeX[0], y0: rectB.y0, x1: freeX[1], y1: rectB.y1 };
    let fixed = onFixed.length
      ? bandPlaced(fixedRect, onFixed, hallSideB, input, frame.vSide)
      : null;
    if (onFixed.length && !fixed) {
      onFree = byX([...onFree, ...onFixed]);
      onFixed = [];
      fixed = null;
    }
    const free = onFree.length ? bandPlaced(freeRect, onFree, hallSideB, input, frame.vSide) : null;
    if (onFree.length && !free) return null;
    if (freeRect.x1 <= freeRect.x0 && onFree.length) return null;
    return {
      kind: 'split',
      rowA: placedA,
      hall,
      fixed,
      fixedRect,
      free,
      freeRect,
      vRect: { x0: vx0, y0: rectB.y0, x1: vx1, y1: rectB.y1 },
    };
  };

  // ── Dựng hai phía — phòng nhỏ nhất không vừa thì dời vào túi giữa (chạm HF / HB áp lõi) rồi thử lại ──
  const relieve = (list: Cluster[], hall: HallMode): boolean => {
    if (hall !== 'edge' || midPrivate(midOrdered) >= midSlots) return false;
    const movable = list
      .filter(
        (c) => !c.item.children.length && !c.balconies.length && c.item.primary.role !== 'hub',
      )
      .sort((p, q) => p.item.weight - q.item.weight || p.item.key.localeCompare(q.item.key));
    const pick = movable[0];
    if (!pick || list.length < 2) return false;
    list.splice(list.indexOf(pick), 1);
    midOrdered = byY([...midOrdered, pick.item]);
    input.trace?.(`  khung ${tag}: dời "${pick.item.key}" vào túi giữa`);
    return true;
  };
  let frontBuilt: Region | null = null;
  let backBuilt: Region | null = null;
  for (let attempt = 0; ; attempt += 1) {
    if (midPrivate(midOrdered) > midSlots) {
      return fail(
        `túi giữa ${midPrivate(midOrdered)} phòng riêng, chỉ ${midSlots} chỗ chạm hành lang`,
      );
    }
    frontBuilt = buildRegion('front', frontOrdered);
    backBuilt = buildRegion('back', backOrdered);
    if (frontBuilt && backBuilt) break;
    if (attempt >= 3) return fail('dải không chia được sau khi dời phòng');
    if (!frontBuilt && !relieve(frontOrdered, variant.hf)) return fail('dải trước không chia được');
    if (!backBuilt && !relieve(backOrdered, variant.hb)) return fail('dải sau không chia được');
  }

  // ── Dải lõi theo trục ngang: các cột ô cố định (khe → sảnh), rồi vùng trống [V][cột phụ trợ][túi giữa] ──
  const hallSegments: Rect[] = [];
  const pushHall = (rect: Rect): Placed => {
    hallSegments.push(rect);
    return leaf(hallPlaceholder(hallSegments.length - 1), rect);
  };
  const fixedColumns: Placed[] = frame.columns.map((col) => {
    const rect: Rect = { x0: col.x0, y0: cy0, x1: col.x1, y1: cy1 };
    const sorted = [...col.cells].sort((p, q) => p.rect.y0 - q.rect.y0);
    const parts: Placed[] = [];
    let cursor = cy0;
    for (const cell of sorted) {
      if (cell.rect.y0 > cursor) parts.push(pushHall({ ...rect, y0: cursor, y1: cell.rect.y0 }));
      parts.push(leaf(cell.id, cell.rect));
      cursor = cell.rect.y1;
    }
    if (cursor < cy1) parts.push(pushHall({ ...rect, y0: cursor, y1: cy1 }));
    return chain(rect, 'y', parts);
  });
  const fixedCoreRect: Rect = { x0: fixedX[0], y0: cy0, x1: fixedX[1], y1: cy1 };
  const fixedCore = chain(fixedCoreRect, 'x', fixedColumns);

  const coreDepth = cy1 - cy0;
  let farColumn: Placed | null = null;
  if (farW > 0) {
    if (!far.length) return fail(`bên xa lõi rộng ${farW} mà không có phòng`);
    farColumn = stackAlong(
      { x0: farX[0], y0: cy0, x1: farX[1], y1: cy1 },
      'y',
      byY(far),
      env.floorWallCm,
    );
    if (!farColumn) return fail(`không xếp được ${far.length} phòng ở bên xa lõi`);
  }
  // Vùng trống bên lõi, KHÔNG kể V khi V là dải dọc xuyên suốt (hai hàng): V đứng riêng thành một cột.
  const vInCore = variant.v && !anyMid;
  const freeStart = vSide === 'hi' ? (variant.v && !vInCore ? vx1 : frame.coreX1) : f.x0;
  const freeEnd = vSide === 'hi' ? f.x1 : variant.v && !vInCore ? vx0 : frame.coreX0;
  const freeCoreW = freeEnd - freeStart;
  const parts: {
    kind: 'v' | 'service' | 'mid' | 'landing';
    weight: number;
    min: number;
    fixed?: number;
  }[] = [];
  if (vInCore) parts.push({ kind: 'v', weight: 0, min: cw, fixed: cw });
  if (serviceOrdered.length) {
    const serviceMin = Math.max(...serviceOrdered.map((item) => item.primary.techMin));
    const need = serviceOrdered.reduce(
      (sum, item) =>
        sum +
        Math.max(
          item.weight * 10_000,
          needWidth(item.primary, coreDepth, env.floorWallCm) * Math.max(1, coreDepth),
        ),
      0,
    );
    parts.push({
      kind: 'service',
      weight: 0,
      min: serviceMin,
      fixed: Math.max(serviceMin, ceil5(need / Math.max(1, coreDepth))),
    });
  }
  if (midOrdered.length) {
    parts.push({
      kind: 'mid',
      weight: midOrdered.reduce((sum, item) => sum + item.weight, 0),
      min: Math.max(...midOrdered.map((item) => item.primary.techMin)),
    });
  }
  if (freeCoreW > 0 && parts.length === 0) {
    // Không gì lấp vùng trống bên lõi: V đứng riêng (hai hàng) thì phần ấy thành sảnh; không có V thì bỏ.
    if (!variant.v) return fail(`bên lõi rộng ${freeCoreW} mà không có gì lấp`);
    parts.push({ kind: 'landing', weight: 1, min: MIN_CELL_CM });
  }
  if (freeCoreW <= 0 && parts.length > 0)
    return fail('bên lõi không còn chỗ cho cột phụ trợ / túi giữa');
  let freeCore: Placed | null = null;
  if (freeCoreW > 0) {
    // Từ lõi ra tường: V trước, rồi cột phụ trợ, rồi túi giữa. Phía `lo` thì lật thứ tự.
    const ordered = vSide === 'hi' ? parts : [...parts].reverse();
    let lengths = splitLengths(freeStart, freeCoreW, ordered);
    if (!lengths)
      return fail(
        `bên lõi rộng ${freeCoreW} sâu ${coreDepth} không đủ cho ${ordered.map((p) => `${p.kind}≥${p.min}`).join(' ')}`,
      );
    if (!ordered.some((p) => p.kind === 'mid' || p.kind === 'landing')) {
      // Không túi giữa: phần dư rơi về cột phụ trợ, không có thì về V (sảnh tầng rộng hơn).
      const spare = freeCoreW - lengths.reduce((a, b) => a + b, 0);
      const serviceIdx = ordered.findIndex((p) => p.kind === 'service');
      const sink = serviceIdx >= 0 ? serviceIdx : ordered.findIndex((p) => p.kind === 'v');
      if (spare > 0 && sink >= 0) lengths = lengths.map((l, i) => (i === sink ? l + spare : l));
    }
    const freeRect: Rect = { x0: freeStart, y0: cy0, x1: freeEnd, y1: cy1 };
    const rects = slices(freeRect, 'x', lengths);
    const pieces: Placed[] = [];
    for (let i = 0; i < ordered.length; i += 1) {
      const part = ordered[i]!;
      const rect = rects[i]!;
      if (part.kind === 'v' || part.kind === 'landing') pieces.push(pushHall(rect));
      else {
        const placed = stackAlong(
          rect,
          'y',
          part.kind === 'service' ? serviceOrdered : midOrdered,
          env.floorWallCm,
        );
        if (!placed) return fail(`không xếp được ${part.kind} dọc lõi`);
        pieces.push(placed);
      }
    }
    freeCore = chain(freeRect, 'x', pieces);
  }

  // ── Ghép ───────────────────────────────────────────────────────────────────────────────
  const rows: Placed[] = [];
  if (frontBuilt.kind === 'row') rows.push(frontBuilt.placed);
  if (frontBuilt.kind === 'split') {
    rows.push(frontBuilt.rowA);
    rows.push(pushHall(frontBuilt.hall));
  }
  if (variant.hf === 'edge') rows.push(pushHall({ x0: f.x0, y0: cy0 - cw, x1: f.x1, y1: cy0 }));

  if (!anyMid) {
    const coreRect: Rect = { x0: f.x0, y0: cy0, x1: f.x1, y1: cy1 };
    const farPart = farColumn ? [farColumn] : [];
    const coreChain =
      vSide === 'hi'
        ? [...farPart, fixedCore, ...(freeCore ? [freeCore] : [])]
        : [...(freeCore ? [freeCore] : []), fixedCore, ...farPart];
    rows.push(chain(coreRect, 'x', coreChain));
  } else {
    // Khối giữa: ba cột dọc — [cột ô cố định + mảnh hàng trong] [V xuyên suốt] [vùng trống + mảnh hàng trong].
    const zoneY0 = frontBuilt.kind === 'split' ? frontBuilt.hall.y1 : cy0;
    const zoneY1 = backBuilt.kind === 'split' ? backBuilt.hall.y0 : cy1;
    const stripOf = (
      x0: number,
      x1: number,
      top: { placed: Placed | null; rect: Rect } | null,
      core: Placed | null,
      bottom: { placed: Placed | null; rect: Rect } | null,
    ): Placed => {
      const rect: Rect = { x0, y0: zoneY0, x1, y1: zoneY1 };
      const pieces: Placed[] = [];
      if (top) pieces.push(top.placed ?? pushHall(top.rect));
      if (core) pieces.push(core);
      else pieces.push(pushHall({ x0, y0: cy0, x1, y1: cy1 }));
      if (bottom) pieces.push(bottom.placed ?? pushHall(bottom.rect));
      return chain(rect, 'y', pieces);
    };
    const topFixed =
      frontBuilt.kind === 'split' ? { placed: frontBuilt.fixed, rect: frontBuilt.fixedRect } : null;
    const topFree =
      frontBuilt.kind === 'split' ? { placed: frontBuilt.free, rect: frontBuilt.freeRect } : null;
    const bottomFixed =
      backBuilt.kind === 'split' ? { placed: backBuilt.fixed, rect: backBuilt.fixedRect } : null;
    const bottomFree =
      backBuilt.kind === 'split' ? { placed: backBuilt.free, rect: backBuilt.freeRect } : null;
    const fixedStrip = stripOf(fixedX[0], fixedX[1], topFixed, fixedCore, bottomFixed);
    const vStrip = pushHall({ x0: vx0, y0: zoneY0, x1: vx1, y1: zoneY1 });
    const freeStrip =
      freeEnd > freeStart ? stripOf(freeStart, freeEnd, topFree, freeCore, bottomFree) : null;
    const middleRect: Rect = { x0: f.x0, y0: zoneY0, x1: f.x1, y1: zoneY1 };
    const strips =
      vSide === 'hi'
        ? [fixedStrip, vStrip, ...(freeStrip ? [freeStrip] : [])]
        : [...(freeStrip ? [freeStrip] : []), vStrip, fixedStrip];
    rows.push(chain(middleRect, 'x', strips));
  }

  if (variant.hb === 'edge') rows.push(pushHall({ x0: f.x0, y0: cy1, x1: f.x1, y1: cy1 + cw }));
  if (backBuilt.kind === 'split') {
    rows.push(pushHall(backBuilt.hall));
    rows.push(backBuilt.rowA);
  }
  if (backBuilt.kind === 'row') rows.push(backBuilt.placed);
  const placed = chain(f, 'y', rows);

  // ── Gán mã hành lang; bất biến lối vào ─────────────────────────────────────────────────
  const named = nameHallSegments(placed, hallSegments, frame.corridorItems, input);
  if (!named) return fail('không gán được mã hành lang');
  const leafById = named.leafById ?? env.leafById;
  if (!accessHolds(named.placed, leafById, input, frame.stairKey)) return fail('lối vào');
  return {
    placed: named.placed,
    ...(named.program ? { program: named.program } : {}),
    ...(named.leafById ? { leafById: named.leafById } : {}),
  };
}

/**
 * Một dải phòng: các cột theo trục ngang, mỗi cột một cụm. `hallSide` là cạnh của dải giáp hành lang / lõi
 * (`y0` = dải sau; `y1` = dải trước) — ban công áp cạnh đối diện.
 */
export function bandPlaced(
  rect: Rect,
  clusters: readonly Cluster[],
  hallSide: 'y0' | 'y1',
  input: SkeletonInput,
  vSide: 'lo' | 'hi',
): Placed | null {
  const depth = rect.y1 - rect.y0;
  const parts = bandParts(rect, clusters, input);
  const lengths = splitLengths(rect.x0, rect.x1 - rect.x0, parts);
  if (!lengths) {
    input.trace?.(
      `  khung t${input.level}: dải ${hallSide === 'y1' ? 'trước' : 'sau'} rộng ${rect.x1 - rect.x0} sâu ${depth} không chứa: ${clusters
        .map((c, i) => `${c.item.key}≥${parts[i]!.min}`)
        .join(' ')}`,
    );
    return null;
  }
  const columns = slices(rect, 'x', lengths);
  const placedColumns: Placed[] = [];
  for (let i = 0; i < clusters.length; i += 1) {
    const column = columnPlaced(columns[i]!, clusters[i]!, hallSide, input, vSide, {
      first: i === 0,
      last: i === clusters.length - 1,
    });
    if (!column) return null;
    placedColumns.push(column);
  }
  return chain(rect, 'x', placedColumns);
}

/**
 * Phần của từng cột trong một dải phòng `rect` (trọng số + bề ngang tối thiểu) — cùng phép đo `bandPlaced` dùng để
 * chia, tách riêng để khung hai hàng (T179) đo được dải còn thiếu bao nhiêu mà không dựng cây.
 */
export function bandParts(
  rect: Rect,
  clusters: readonly Cluster[],
  input: SkeletonInput,
): { weight: number; min: number }[] {
  const depth = rect.y1 - rect.y0;
  const wall = input.env.floorWallCm;
  return clusters.map((cluster) => {
    const parent = cluster.item.primary;
    // Phòng mẹ không hẹp dưới cạnh dùng được, và không dài quá tỉ lệ dùng được so với chiều sâu dải.
    // Ban công áp mặt trước / sau lấy một dải theo chiều sâu (phần thân phòng mẹ ngắn đi); áp mặt bên
    // lấy một dải theo bề ngang (cột rộng thêm).
    const faceBalconies = cluster.balconies.filter((b) => b.side === 'y0' || b.side === 'y1');
    const sideBalconies = cluster.balconies.filter((b) => b.side === 'x0' || b.side === 'x1');
    const balconyDepth = faceBalconies.reduce(
      (sum, b) => sum + balconyThickness(b.leaf, (rect.x1 - rect.x0) / 2, b.side, input),
      0,
    );
    const bodyDepth = Math.max(1, depth - balconyDepth);
    const parentMin = Math.max(
      parent.techMin,
      parent.aspectHard ? ceil5(bodyDepth / parent.aspectHard) : 0,
      needWidth(parent, bodyDepth, wall),
    );
    const min =
      parentMin +
      cluster.item.children.reduce(
        (sum, kid) => sum + Math.max(kid.techMin, needWidth(kid, bodyDepth, wall)),
        0,
      ) +
      sideBalconies.reduce((sum, b) => sum + balconyThickness(b.leaf, bodyDepth, b.side, input), 0);
    const weight =
      cluster.item.weight + cluster.balconies.reduce((sum, b) => sum + b.leaf.target, 0);
    return { weight, min };
  });
}

/** Một cột của dải: [ban công áp mặt thoáng] rồi [dải WC khép kín | phòng mẹ]. */
function columnPlaced(
  rect: Rect,
  cluster: Cluster,
  hallSide: 'y0' | 'y1',
  input: SkeletonInput,
  vSide: 'lo' | 'hi',
  at: { first: boolean; last: boolean },
): Placed | null {
  const { item } = cluster;
  const faceSide: Side = hallSide === 'y1' ? 'y0' : 'y1';

  // Ban công: dải áp đúng mặt đã chọn — mặt trước / sau của dải này, hay mặt bên của cột đầu / cuối.
  let body = rect;
  const outer: { placed: Placed; axis: 'x' | 'y'; side: Side }[] = [];
  const ordered = [...cluster.balconies].sort((p, q) => {
    const rank = (b: { side: Side }) => (b.side === faceSide ? 0 : 1);
    return rank(p) - rank(q) || p.leaf.id.localeCompare(q.leaf.id);
  });
  for (const { leaf: balcony, side } of ordered) {
    if (side === 'y0' || side === 'y1') {
      if (side !== faceSide) return null;
    } else if ((side === 'x0' && !at.first) || (side === 'x1' && !at.last)) return null;
    const axis: 'x' | 'y' = side === 'y0' || side === 'y1' ? 'y' : 'x';
    const along = axis === 'y' ? body.x1 - body.x0 : body.y1 - body.y0;
    const thick = balconyThickness(balcony, along, side, input);
    const remaining = (axis === 'y' ? body.y1 - body.y0 : body.x1 - body.x0) - thick;
    if (remaining < item.primary.techMin) return null;
    let strip: Rect;
    if (side === 'y0') {
      strip = { ...body, y1: body.y0 + thick };
      body = { ...body, y0: body.y0 + thick };
    } else if (side === 'y1') {
      strip = { ...body, y0: body.y1 - thick };
      body = { ...body, y1: body.y1 - thick };
    } else if (side === 'x0') {
      strip = { ...body, x1: body.x0 + thick };
      body = { ...body, x0: body.x0 + thick };
    } else {
      strip = { ...body, x0: body.x1 - thick };
      body = { ...body, x1: body.x1 - thick };
    }
    outer.push({ placed: leaf(balcony.id, strip), axis, side });
  }

  // Phòng khép kín: dải dọc một bên phòng mẹ, bên gần khu ướt tầng dưới hơn (hoà: phía lõi / V).
  let inner: Placed = leaf(item.key, body);
  if (item.children.length) {
    const kids = [...item.children].sort((p, q) => q.target - p.target || p.id.localeCompare(q.id));
    const bodyDepth = body.y1 - body.y0;
    const strips = kids.map((kid) => ({
      weight: 0,
      min: kid.techMin,
      fixed: Math.max(
        kid.techMin,
        ceil5((kid.target * 10_000) / Math.max(1, bodyDepth)),
        needWidth(kid, bodyDepth, input.env.floorWallCm),
      ),
    }));
    const parentPart = {
      weight: 1,
      min: Math.max(
        item.primary.techMin,
        needWidth(item.primary, bodyDepth, input.env.floorWallCm),
      ),
    };
    const towardsCore: 'x0' | 'x1' = vSide === 'hi' ? 'x0' : 'x1';
    const score = (side: 'x0' | 'x1') => {
      const first = strips[0]!.fixed;
      const strip: Rect =
        side === 'x0' ? { ...body, x1: body.x0 + first } : { ...body, x0: body.x1 - first };
      const wet = kids.some((kid) => kid.wet);
      const over = wet && input.avoidWetOver.some((r) => overlapArea(r, strip) > 0) ? 1e9 : 0;
      const near = input.wetBelow.length
        ? Math.min(...input.wetBelow.map((r) => centreDistance(r, strip)))
        : side === towardsCore
          ? 0
          : 1;
      return over + near;
    };
    const side: 'x0' | 'x1' = score('x0') <= score('x1') ? 'x0' : 'x1';
    const parts = side === 'x0' ? [...strips, parentPart] : [parentPart, ...strips];
    const lengths = splitLengths(body.x0, body.x1 - body.x0, parts);
    if (!lengths) return null;
    const rects = slices(body, 'x', lengths);
    const ids =
      side === 'x0' ? [...kids.map((k) => k.id), item.key] : [item.key, ...kids.map((k) => k.id)];
    inner = chain(
      body,
      'x',
      ids.map((id, i) => leaf(id, rects[i]!)),
    );
  }

  // Ghép ban công quanh phần thân, từ dải trong ra dải ngoài.
  let placed = inner;
  let current = body;
  for (const strip of [...outer].reverse()) {
    const union: Rect = {
      x0: Math.min(current.x0, strip.placed.rect.x0),
      y0: Math.min(current.y0, strip.placed.rect.y0),
      x1: Math.max(current.x1, strip.placed.rect.x1),
      y1: Math.max(current.y1, strip.placed.rect.y1),
    };
    const stripFirst = strip.side === 'y0' || strip.side === 'x0';
    placed = chain(union, strip.axis, stripFirst ? [strip.placed, placed] : [placed, strip.placed]);
    current = union;
  }
  return placed;
}

/** Xếp các lá dọc một trục trong một chữ nhật theo diện tích, mỗi lá không dưới cạnh kỹ thuật. */
export function stackAlong(
  rect: Rect,
  axis: 'x' | 'y',
  items: readonly PackItem[],
  wall: number,
): Placed | null {
  if (items.length === 0) return null;
  const across = axis === 'y' ? rect.x1 - rect.x0 : rect.y1 - rect.y0;
  if (items.some((item) => item.primary.techMin > across)) return null;
  const total = axis === 'y' ? rect.y1 - rect.y0 : rect.x1 - rect.x0;
  const lengths = splitLengths(
    axis === 'y' ? rect.y0 : rect.x0,
    total,
    items.map((item) => ({
      weight: item.weight,
      min: Math.max(item.primary.techMin, needWidth(item.primary, across, wall)),
    })),
  );
  if (!lengths) return null;
  const rects = slices(rect, axis, lengths);
  return chain(
    rect,
    axis,
    items.map((item, i) => leaf(item.key, rects[i]!)),
  );
}

/**
 * Đặt mã thật cho các đoạn hành lang: lá hành lang của tầng nhận đoạn (lớn nhận lớn); thiếu lá thì thêm không
 * gian mới vào chương trình (như V-29); thừa lá thì chia đoạn lớn nhất cho các lá còn lại.
 */
export function nameHallSegments(
  placed: Placed,
  segments: readonly Rect[],
  corridorItems: readonly PackItem[],
  input: SkeletonInput,
): { placed: Placed; program?: AiSpaceProgram; leafById?: ReadonlyMap<string, PackLeaf> } | null {
  if (segments.length === 0) return corridorItems.length ? null : { placed };
  const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0);
  const indexed = segments
    .map((rect, index) => ({ rect, index }))
    .sort((p, q) => area(q.rect) - area(p.rect) || p.index - q.index);
  const items = [...corridorItems].sort(
    (p, q) => q.weight - p.weight || p.key.localeCompare(q.key),
  );
  const template = items[0]?.primary ?? templateHall(input);
  const type = template.types[0] ?? input.corridorType;
  const names = new Map<number, string>();
  const leafById = new Map(input.env.leafById);
  let program = input.program;
  let changed = false;
  indexed.forEach((seg, i) => {
    const item = items[i];
    if (item) {
      names.set(seg.index, item.key);
      return;
    }
    const id = nextSpaceId(program, type);
    const target = round1(area(seg.rect) / 10_000);
    leafById.set(id, { ...template, id, target, areaFloor: null, parent: null, zoneWeight: 0 });
    program = {
      ...program,
      spaces: [
        ...program.spaces,
        { id, type, level: input.level, target_area_m2: target, ensuite_of: null },
      ],
    };
    changed = true;
    names.set(seg.index, id);
  });
  let result = placed;
  const spare = items.slice(indexed.length);
  if (spare.length) {
    const largest = indexed[0]!;
    const rect = largest.rect;
    const axis: 'x' | 'y' = rect.x1 - rect.x0 >= rect.y1 - rect.y0 ? 'x' : 'y';
    const ids = [names.get(largest.index)!, ...spare.map((item) => item.key)];
    const lengths = splitLengths(
      axis === 'x' ? rect.x0 : rect.y0,
      axis === 'x' ? rect.x1 - rect.x0 : rect.y1 - rect.y0,
      ids.map((id) => ({
        weight: Math.max(0.1, leafById.get(id)?.target ?? 1),
        min: input.corridorWidth.inner,
      })),
    );
    if (!lengths) return null;
    const rects = slices(rect, axis, lengths);
    result = replaceLeaf(
      result,
      hallPlaceholder(largest.index),
      chain(
        rect,
        axis,
        ids.map((id, i) => leaf(id, rects[i]!)),
      ),
    );
    names.delete(largest.index);
  }
  for (const [index, id] of names) {
    result = replaceLeaf(result, hallPlaceholder(index), leaf(id, segments[index]!));
  }
  return { placed: result, ...(changed ? { program, leafById } : {}) };
}

/** Lá hành lang mẫu khi tầng không có lá hành lang nào: đi xuyên được, cạnh kỹ thuật bằng bề rộng dải. */
function templateHall(input: SkeletonInput): PackLeaf {
  return {
    id: '',
    types: [input.corridorType],
    target: 0,
    techMin: input.corridorWidth.inner,
    pref: null,
    aspectMax: 99,
    aspectHard: null,
    areaFloor: null,
    zone: 'center',
    street: false,
    role: 'hub',
    needsOpenFace: false,
    noStairDoor: false,
    parent: null,
    stair: false,
    wet: false,
    zoneWeight: 0,
    hostTypes: null,
  };
}

function replaceLeaf(node: Placed, id: string, replacement: Placed): Placed {
  if (node.kind === 'leaf') return node.id === id ? replacement : node;
  const a = replaceLeaf(node.a, id, replacement);
  const b = replaceLeaf(node.b, id, replacement);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/**
 * Bất biến lối vào, đo trên các ô theo tim: phòng cần cửa chạm (≥ đoạn đặt cửa) một phòng đi xuyên được, phòng
 * mẹ của nó, hay một loại được phép phục vụ nó; ô thang chạm một phòng đi xuyên được. Chỉ lọc chỗ CHẮC CHẮN
 * hỏng — cổng và `deriveDoors` vẫn đo lại đầy đủ.
 */
export function accessHolds(
  placed: Placed,
  leafById: ReadonlyMap<string, PackLeaf>,
  input: SkeletonInput,
  stairKey: string,
): boolean {
  const cells = leaves(placed);
  const rectOf = new Map(cells.map((c) => [c.id, c.rect]));
  const hubs = cells.filter((c) => leafById.get(c.id)?.role === 'hub');
  const shared = (a: string, b: string) => {
    const ra = rectOf.get(a);
    const rb = rectOf.get(b);
    const la = leafById.get(a);
    const lb = leafById.get(b);
    if (!ra || !rb || !la || !lb) return false;
    return sharedEdge(ra, rb) >= input.env.doorShared(la, lb);
  };
  for (const cell of cells) {
    const l = leafById.get(cell.id);
    if (!l) {
      input.trace?.(`  khung: ô "${cell.id}" không có lá`);
      return false;
    }
    if (l.role === 'hub' || l.role === 'open') continue;
    if (l.parent && rectOf.has(l.parent) && shared(cell.id, l.parent)) continue;
    const viaHub = hubs.some((hub) => {
      if (!shared(cell.id, hub.id)) return false;
      return !(leafById.get(hub.id)!.stair && l.noStairDoor);
    });
    if (viaHub) continue;
    const viaHost =
      l.hostTypes !== null &&
      cells.some((other) => {
        const ol = leafById.get(other.id);
        return !!ol && ol.types.some((type) => l.hostTypes!.has(type)) && shared(cell.id, other.id);
      });
    if (viaHost) continue;
    input.trace?.(
      `  khung: "${cell.id}" ${JSON.stringify(cell.rect)} cha=${l.parent} không chạm hành lang / khu chung; kề: ${cells
        .filter((o) => o.id !== cell.id && sharedEdge(o.rect, cell.rect) > 0)
        .map((o) => `${o.id}:${sharedEdge(o.rect, cell.rect)}`)
        .join(' ')}`,
    );
    return false;
  }
  const stairRect = rectOf.get(stairKey);
  const stairLeaf = leafById.get(stairKey);
  if (stairRect && stairLeaf) {
    const ok = hubs.some((hub) => {
      const hl = leafById.get(hub.id)!;
      return (
        hub.id !== stairKey &&
        !hl.stair &&
        sharedEdge(stairRect, hub.rect) >= input.env.doorShared(stairLeaf, hl)
      );
    });
    if (!ok) {
      input.trace?.(`  khung: ô thang "${stairKey}" không chạm hành lang / khu chung`);
      return false;
    }
  }
  return true;
}

function nextSpaceId(program: AiSpaceProgram, type: string): string {
  const pattern = new RegExp(`^${type}_(\\d+)$`);
  const used = program.spaces
    .map((s) => pattern.exec(s.id)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `${type}_${Math.max(0, ...used) + 1}`;
}

export function inside(r: Rect, f: Rect): boolean {
  return r.x0 >= f.x0 && r.y0 >= f.y0 && r.x1 <= f.x1 && r.y1 <= f.y1 && r.x1 > r.x0 && r.y1 > r.y0;
}

function overlapArea(a: Rect, b: Rect): number {
  return (
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
  );
}

function centreDistance(a: Rect, b: Rect): number {
  return Math.hypot((a.x0 + a.x1 - b.x0 - b.x1) / 2, (a.y0 + a.y1 - b.y0 - b.y1) / 2);
}

export function ceil5(value: number): number {
  return Math.ceil(value / MODULE_CM) * MODULE_CM;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
