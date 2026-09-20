/**
 * KHUNG mặt đứng suy từ mặt bằng đã chọn (T59) — phần dữ liệu KHOÁ của `ai_facade_concept`.
 *
 * T16 chốt: mô hình chỉ TRANG TRÍ mặt đứng. Bề rộng, cao độ từng tầng, lỗ mở mặt trước và ban
 * công là của mặt bằng; chương trình suy ra ở đây, mô hình nhận để vẽ cho đúng và không được sửa.
 * Nhờ vậy mặt bằng, mặt đứng và ảnh nói cùng một ngôi nhà. Muốn đổi lỗ mở thì sửa mặt bằng.
 *
 * ── Thế nào là «nhìn thấy từ đường» ──────────────────────────────────────────────────────
 * Đường nằm ở phía `y` nhỏ (hợp đồng `design-brief`). Một bức tường ngang được coi là nằm trên
 * mặt đứng khi điểm ngay TRƯỚC nó (phía đường) là ngoài trời: nằm ngoài hình bao tầng đó, hoặc
 * nằm trong một ban công / sân thượng. Một phép thử ấy bắt đủ ba ca:
 *  · tường mặt tiền trên cạnh hình bao — trước nó là ngoài hình bao;
 *  · tường lùi sau ban công — trước nó là ban công, nên cửa ra ban công hiện sau lan can;
 *    «ban công» ở đây là nhóm `outdoor` của `kb/room_vocabulary.yaml`, không viết cứng mã phòng;
 *  · tường của hốc lõm, sảnh lùi — trước nó là ngoài hình bao.
 * Và loại đúng hai ca phải loại: tường sau nhà và tường quanh giếng trời giữa nhà — trước chúng là
 * phòng hoặc khoảng trống kín bên trong, không nhìn thấy từ đường.
 *
 * Giới hạn đã biết: mặt đứng là hình chiếu phẳng, không có chiều sâu — cửa sau ban công và cửa
 * trên tường mặt tiền vẽ trên cùng một mặt phẳng. Đủ cho tờ ý tưởng; bản vẽ kỹ thuật vẽ lại trong CAD.
 */

import type { AiFacadeBrief, AiFacadeConcept, AiFloorPlan } from '@nvg/shared/design';
import type { ConstructionNorms } from '../../kb/construction';
import { pointInPolygon, toPt, toRect, type Pt } from '../draw/geometry';

type Level = AiFloorPlan['levels'][number];
export type FacadeOpening = AiFacadeConcept['openings_front'][number];
export type FacadeBalcony = NonNullable<AiFacadeConcept['balconies']>[number];
export type FacadeLevel = AiFacadeConcept['elevation']['levels'][number];

export interface FacadeFrame {
  /** Mép trái và phải của khối xây nhìn từ đường — hợp của mọi tầng. */
  x0: number;
  x1: number;
  width: number;
  /** Cốt vỉa hè so với ±0.000 (sàn tầng 1), cm — âm. */
  groundZ: number;
  levels: FacadeLevel[];
  /** Cao độ mặt sàn mái = đỉnh tầng trên cùng, cm. */
  roofZ: number;
  /** Tường chắn mái mặc định, cm (`kb/construction_norms.yaml`). */
  parapetDefault: number;
  openings: FacadeOpening[];
  balconies: FacadeBalcony[];
  /** Nhà có sân trước (khối xây lùi khỏi ranh mặt tiền) — không có thì không vẽ được cổng và rào. */
  frontYard: boolean;
}

export class FacadeFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FacadeFrameError';
  }
}

/** Điểm thử đặt trước mặt ngoài của tường bao đúng khoảng này, cm. */
const PROBE_CM = 5;
/** Tường lệch trục ngang quá mức này thì không coi là tường ngang. */
const AXIS_TOLERANCE_CM = 1;
/** Bước qua mép trước của một ban công: dày hơn tường bao dày nhất (22 cm) cộng điểm thử. */
const RAIL_STEP_CM = 30;

const cm = (metres: number) => Math.round(metres * 100);
/** Về lưới nửa centimet của hợp đồng. */
const half = (value: number) => Math.round(value * 2) / 2;

/**
 * Cửa CHÍNH trên mặt đứng: cửa đi (`kind: door`) rộng nhất của tầng thấp nhất có cửa đi mặt trước.
 * Một quy tắc, dùng chung cho khung (áp chiều cao phiếu) và bộ vẽ (chia cánh theo phiếu).
 */
export function mainDoorOf(openings: readonly FacadeOpening[]): FacadeOpening | null {
  if (!openings.length) return null;
  // Tầng thấp nhất của NHÀ, không phải tầng thấp nhất CÓ CỬA ĐI: nhà phố mà mặt tiền tầng 1 chỉ có
  // cửa cuốn thì không có cửa chính trên mặt đứng, và cửa ra ban công tầng 2 là cửa PHỤ. Lấy nhầm
  // thì chiều cao, vật liệu và kiểu chia cánh của «cửa chính» trong phiếu rơi lên cửa ban công.
  const lowest = Math.min(...openings.map((o) => o.level));
  const doors = openings.filter((o) => o.kind === 'door' && o.level === lowest);
  return doors.sort((a, b) => b.w - a.w || a.x - b.x)[0] ?? null;
}

/**
 * `outdoor` là nhóm `outdoor` của `kb/room_vocabulary.yaml` — cùng tập mà `plan-geometry.ts` dùng
 * để dựng lan can.
 *
 * `brief` là phiếu yêu cầu của kỹ sư (Đợt F2). Chương trình áp thẳng ba loại số đo trong phiếu: cốt
 * sàn tầng 1, tường chắn mái, chiều cao cửa đi. Bề rộng cửa KHÔNG đổi — nó là của mặt bằng (T16).
 */
export function facadeFrame(
  plan: AiFloorPlan,
  norms: ConstructionNorms,
  outdoor: ReadonlySet<string>,
  brief: AiFacadeBrief | null = null,
): FacadeFrame {
  if (!norms.facade) {
    throw new FacadeFrameError('Thiếu mục "facade" trong kb/construction_norms.yaml.');
  }
  const levels = [...plan.levels].sort((a, b) => a.level - b.level);
  if (levels.length === 0) throw new FacadeFrameError('Mặt bằng không có tầng nào.');

  let z = 0;
  const frameLevels: FacadeLevel[] = [];
  const openings: FacadeOpening[] = [];
  const balconies: FacadeBalcony[] = [];
  let minFrontY = Infinity;

  for (const level of levels) {
    const outline = level.outline.map(toPt);
    const xs = outline.map(([x]) => x);
    frameLevels.push({
      level: level.level,
      z: half(z),
      h: level.h,
      x0: half(Math.min(...xs)),
      x1: half(Math.max(...xs)),
    });
    for (const [, y] of outline) minFrontY = Math.min(minFrontY, y);
    openings.push(...levelOpenings(level, outline, norms, outdoor));
    balconies.push(...levelBalconies(level, outline, outdoor));
    z += level.h;
  }

  const x0 = Math.min(...frameLevels.map((l) => l.x0));
  const x1 = Math.max(...frameLevels.map((l) => l.x1));
  const sorted = openings.sort((a, b) => a.level - b.level || a.x - b.x);
  const main = mainDoorOf(sorted);
  const heighted = sorted.map((o) => {
    if (o.kind !== 'door') return o;
    const h = o === main ? brief?.main_door.h_cm : brief?.side_door.h_cm;
    if (typeof h !== 'number') return o;
    // Kẹp vào chiều cao tầng: phiếu cho tới 600 cm, mà cửa cao hơn tầng vẽ ra ô cửa xuyên sàn tầng
    // trên và chồng lên lỗ mở ở đó. Kẹp im lặng chứ không bỏ yêu cầu — kỹ sư vẫn được cửa cao nhất
    // tầng ấy chứa nổi.
    const level = frameLevels.find((l) => l.level === o.level);
    const room = level ? half(level.h - o.sill) : h;
    return { ...o, h: half(Math.max(0, Math.min(h, room))) };
  });
  return {
    x0,
    x1,
    width: half(x1 - x0),
    groundZ: -(brief?.ground_raise_cm ?? cm(norms.facade.ground_floor_raise_m)),
    levels: frameLevels,
    roofZ: half(z),
    parapetDefault: brief?.roof.parapet_cm ?? cm(norms.facade.parapet_height_m),
    openings: heighted,
    balconies,
    frontYard: minFrontY > 0,
  };
}

/**
 * Tường ngang có mặt trước là ngoài trời — xem chú thích đầu tệp.
 *
 * Gặp ban công thì đi tiếp qua nó về phía đường: tường sau một ban công chỉ nhìn thấy khi chính
 * ban công ấy mở ra đường. Một sân thượng sau nhà nằm TRƯỚC bức tường sau (theo trục `y`) nhưng
 * trước nó nữa là cả ngôi nhà.
 *
 * Lan can (`throughOutdoor = false`) chỉ tính khi ngay trước nó là ngoài hình bao: lan can sau của
 * sân thượng có ban công… của chính nó ở phía trước, và không nằm trên mặt tiền.
 */
function facesStreet(
  level: Level,
  outline: readonly Pt[],
  outdoor: ReadonlySet<string>,
  wall: Level['walls'][number],
  x: number,
  throughOutdoor = true,
): boolean {
  const [ax, ay] = toPt(wall.a);
  const [bx, by] = toPt(wall.b);
  if (Math.abs(ay - by) > AXIS_TOLERANCE_CM || Math.abs(ax - bx) <= AXIS_TOLERANCE_CM) return false;
  let y = Math.min(ay, by) - wall.t / 2 - PROBE_CM;
  for (let hop = 0; hop < level.rooms.length + 1; hop += 1) {
    if (!pointInPolygon([x, y], outline)) return true;
    if (!throughOutdoor) return false;
    const room = level.rooms.find((candidate) => {
      if (!outdoor.has(candidate.type)) return false;
      const r = toRect(candidate.rect);
      return x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
    });
    if (!room) return false;
    // Bước qua ban công và lan can (hay tường) phía trước nó.
    y = toRect(room.rect).y0 - RAIL_STEP_CM;
  }
  return false;
}

/** Mép trái (nhìn từ đường) của một ô cửa neo `at` từ đầu `a` của tường ngang. */
function leftEdge(wall: Level['walls'][number], at: number, w: number): number {
  const [ax] = toPt(wall.a);
  const [bx] = toPt(wall.b);
  return bx >= ax ? ax + at : ax - at - w;
}

function levelOpenings(
  level: Level,
  outline: readonly Pt[],
  norms: ConstructionNorms,
  outdoor: ReadonlySet<string>,
) {
  const walls = new Map(level.walls.filter((w) => w.k === 'e').map((w) => [w.id, w]));
  const out: FacadeOpening[] = [];

  for (const door of level.doors ?? []) {
    const wall = walls.get(door.wall);
    if (!wall) continue;
    const x = leftEdge(wall, door.at, door.w);
    if (!facesStreet(level, outline, outdoor, wall, x + door.w / 2)) continue;
    const normName = norms.openingRules.door_by_kind[door.kind] ?? 'door';
    const height = norms.openings[normName]?.height_m ?? norms.openings.door?.height_m;
    if (height === undefined) {
      throw new FacadeFrameError(`Quy cách cửa "${normName}" thiếu chiều cao.`);
    }
    out.push({
      level: level.level,
      x: half(x),
      w: door.w,
      sill: 0,
      h: cm(height),
      kind:
        door.kind === 'garage' || door.kind === 'gate' || door.kind === 'opening'
          ? door.kind
          : 'door',
    });
  }

  const windowNorm = norms.openings.window;
  for (const win of level.windows ?? []) {
    const wall = walls.get(win.wall);
    if (!wall) continue;
    const x = leftEdge(wall, win.at, win.w);
    if (!facesStreet(level, outline, outdoor, wall, x + win.w / 2)) continue;
    const sill = win.sill ?? (windowNorm?.sill_m !== undefined ? cm(windowNorm.sill_m) : null);
    const h = win.h ?? (windowNorm?.height_m !== undefined ? cm(windowNorm.height_m) : null);
    if (sill === null || h === null) {
      throw new FacadeFrameError('Quy cách cửa sổ thiếu cao độ bệ hoặc chiều cao.');
    }
    out.push({ level: level.level, x: half(x), w: win.w, sill, h, kind: 'window' });
  }
  return out;
}

/** Lan can ngang trên mặt trước, gộp các đoạn liền nhau của cùng một tầng. */
function levelBalconies(
  level: Level,
  outline: readonly Pt[],
  outdoor: ReadonlySet<string>,
): FacadeBalcony[] {
  const spans = level.walls
    .filter((w) => w.k === 'r')
    .map((w) => ({ wall: w, a: toPt(w.a)[0], b: toPt(w.b)[0] }))
    .filter(({ wall, a, b }) => facesStreet(level, outline, outdoor, wall, (a + b) / 2, false))
    .map(({ a, b }) => [Math.min(a, b), Math.max(a, b)] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + AXIS_TOLERANCE_CM) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged.map(([a, b]) => ({
    level: level.level,
    x0: half(a),
    x1: half(b),
    depth: 0,
    railing: null,
  }));
}
