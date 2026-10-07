/**
 * Mặt bằng mái (Haan chốt 04/10/2026: «luôn vẽ tầng mái»; bàn giao v5 mục 0 và T2).
 *
 * Mái là phần `roof` riêng của artifact, KHÔNG phải một tầng của `levels`: không cửa sổ, không chấm điểm, không
 * vào mặt đứng như một tầng thêm. Hình học do chương trình quyết:
 *  · sàn mái = các phòng KHÔNG ngoài trời của tầng trên cùng (ban công tầng trên không có sàn mái đè lên);
 *  · tum thang = ô thang tầng trên cùng + một chiếu tới (`kb/roof_plan.yaml` `stair_head.landing_m`) ở cạnh quay
 *    ra phần mái rộng nhất — cửa tum mở về phía ấy;
 *  · khu mô hình vẽ (rect ở `knowledge.roof_level`) được cắt gọn vào sàn mái và tránh tum;
 *  · khu đầu bài đòi mà mô hình không vẽ thì chương trình tự đặt: bồn nước + năng lượng mặt trời đè lên khu ướt
 *    tầng dưới (`over_wet`), sân thượng là mảng lớn nhất trước cửa tum, khu khác áp mép sau / mặt kín.
 * Phần còn lại là mái bằng, vẽ làm nền. Tệp thuần.
 */
import type { AiFloorPlan, AiFloorPlanLevel } from '@nvg/shared/design';
import type { RoofPlanSpec, RoofZoneSpec } from '../kb/roof-plan';
import { bboxOfPoints, pointInPolygon, toPt, toRect, type Rect } from './draw/geometry';
import type { HouseRoom } from './house';

export type AiFloorPlanRoof = NonNullable<AiFloorPlan['roof']>;
type Side = '+x' | '-x' | '+y' | '-y';

/** Lưới dò chỗ đặt khu, cm — đủ mịn cho khu 1,2 m, đủ thô để dò nhanh. */
const STEP_CM = 50;

export interface RoofInput {
  /** Tầng trên cùng đã xếp. */
  top: AiFloorPlanLevel;
  spec: RoofPlanSpec;
  /** Mã khu đầu bài đòi (`requiredRoofZones`). */
  required: readonly string[];
  /** Phòng mô hình khai ở tầng mái (rect mm, gốc ở góc trước-trái khối xây được). */
  modelRooms: readonly HouseRoom[];
  /** Góc trước-trái khối xây được, cm — để đổi rect mm của mô hình về toạ độ bản vẽ. */
  origin: { x: number; y: number };
  /** Loại phòng ngoài trời (`kb/room_vocabulary.yaml` nhóm `outdoor`). */
  outdoor: ReadonlySet<string>;
  /** Loại phòng ướt — nơi bồn nước, năng lượng mặt trời nên đè lên. */
  wet: ReadonlySet<string>;
}

const area = (r: Rect) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
const overlap = (a: Rect, b: Rect): Rect => ({
  x0: Math.max(a.x0, b.x0),
  y0: Math.max(a.y0, b.y0),
  x1: Math.min(a.x1, b.x1),
  y1: Math.min(a.y1, b.y1),
});
const overlapArea = (a: Rect, b: Rect) => {
  const o = overlap(a, b);
  return o.x1 > o.x0 && o.y1 > o.y0 ? area(o) : 0;
};
const asArray = (r: Rect): [number, number, number, number] => [r.x0, r.y0, r.x1, r.y1];
const m2 = (cm2: number) => Math.round(cm2 / 1000) / 10;

export function buildRoof(input: RoofInput): AiFloorPlanRoof {
  const { top, spec } = input;
  const notes: string[] = [];
  // Rect phòng là mặt TRONG tường; nới nửa bề dày vách để các phòng liền nhau thành sàn liền.
  const partitions = top.walls.filter((wall) => wall.k === 'p').map((wall) => wall.t);
  const half = partitions.length ? Math.min(...partitions) / 2 : 0;
  const grown = (r: Rect): Rect => ({
    x0: r.x0 - half,
    y0: r.y0 - half,
    x1: r.x1 + half,
    y1: r.y1 + half,
  });
  const outline = top.outline.map(toPt);
  const bbox = bboxOfPoints(outline);
  // Sàn mái = trong đường bao tầng trên cùng, trừ phòng ngoài trời (ban công tầng trên không có sàn mái đè lên).
  const open = top.rooms
    .filter((room) => input.outdoor.has(room.type))
    .map((room) => grown(toRect(room.rect)));
  const inside = (r: Rect) => {
    const xs = [r.x0, (r.x0 + r.x1) / 2, r.x1];
    const ys = [r.y0, (r.y0 + r.y1) / 2, r.y1];
    return (
      xs.every((x) => ys.every((y) => pointInPolygon([x, y], outline, 1))) &&
      open.every((o) => overlapArea(r, o) === 0)
    );
  };

  // Tum thang: ô thang tầng trên cùng (khai ở `stairs`, hoặc phòng loại thang khi tầng ấy chỉ có vế tới).
  const stairRoom = top.rooms.find((item) => item.type === 'stair');
  const stairRect = top.stairs?.[0]
    ? toRect(top.stairs[0].rect)
    : stairRoom
      ? grown(toRect(stairRoom.rect))
      : null;
  let head: AiFloorPlanRoof['stair_head'] = null;
  const taken: Rect[] = [];
  if (stairRect) {
    const stair = stairRect;
    const landing = Math.round(spec.stairHead.landingM * 100);
    const room: Record<Side, number> = {
      '+x': bbox.x1 - stair.x1,
      '-x': stair.x0 - bbox.x0,
      '+y': bbox.y1 - stair.y1,
      '-y': stair.y0 - bbox.y0,
    };
    const side = (Object.keys(room) as Side[]).sort((p, q) => room[q] - room[p])[0]!;
    const grow = Math.min(landing, Math.max(0, room[side]));
    const rect: Rect = { ...stair };
    if (side === '+x') rect.x1 += grow;
    if (side === '-x') rect.x0 -= grow;
    if (side === '+y') rect.y1 += grow;
    if (side === '-y') rect.y0 -= grow;
    head = { rect: asArray(rect), stair: asArray(stair), door_side: side };
    taken.push(rect);
  }

  const zones: AiFloorPlanRoof['zones'] = [];
  const specOf = new Map(spec.zones.map((zone) => [zone.code, zone]));
  let n = 0;
  const nextId = (code: string) => `roof_${code}_${(n += 1)}`;

  // Khu mô hình vẽ: cắt vào hình bao sàn mái, tránh tum và khu đã có.
  for (const room of input.modelRooms) {
    const zone = specOf.get(room.type);
    if (!zone || !room.rect) continue;
    const [x, y, w, h] = room.rect;
    let rect: Rect = overlap(
      {
        x0: input.origin.x + x / 10,
        y0: input.origin.y + y / 10,
        x1: input.origin.x + (x + w) / 10,
        y1: input.origin.y + (y + h) / 10,
      },
      bbox,
    );
    for (const other of taken) rect = trimOff(rect, other);
    const minSide = zone.minSideM * 100;
    if (rect.x1 - rect.x0 < minSide * 0.8 || rect.y1 - rect.y0 < minSide * 0.8 || !inside(rect)) {
      notes.push(`Khu «${zone.vi}» mô hình vẽ không nằm gọn trên sàn mái — chương trình đặt lại.`);
      continue;
    }
    zones.push({
      id: nextId(zone.code),
      type: zone.code,
      name: zone.vi,
      rect: asArray(rect),
      placed_by: 'model',
    });
    taken.push(rect);
  }

  // Khu đầu bài đòi mà còn thiếu: thiết bị trước, sân thượng sau cùng (lấy mảng lớn nhất trước cửa tum).
  const have = new Set(zones.map((zone) => zone.type));
  const missing = input.required
    .filter((code) => !have.has(code))
    .map((code) => specOf.get(code)!)
    .sort((p, q) => Number(p.code === 'terrace') - Number(q.code === 'terrace'));
  const wetRects = top.rooms
    .filter((room) => input.wet.has(room.type))
    .map((room) => grown(toRect(room.rect)));
  const door = head ? doorStrip(toRect(head.rect), head.door_side as Side) : null;
  for (const zone of missing) {
    const rect =
      zone.code === 'terrace' && door
        ? largestFrom(door, bbox, taken, inside, zone)
        : bestSpot(zone, bbox, taken, inside, wetRects, door);
    if (!rect) {
      notes.push(
        `Không còn chỗ trên sàn mái cho khu «${zone.vi}» đầu bài đòi — cần kiến trúc sư bố trí.`,
      );
      continue;
    }
    zones.push({
      id: nextId(zone.code),
      type: zone.code,
      name: zone.vi,
      rect: asArray(rect),
      placed_by: 'program',
    });
    taken.push(rect);
    notes.push(`Chương trình tự đặt khu «${zone.vi}» (${m2(area(rect))} m²) vì phương án chưa có.`);
  }

  return {
    level: top.level + 1,
    outline: top.outline,
    stair_head: head,
    zones,
    ...(notes.length ? { notes: notes.slice(0, 16) } : {}),
  };
}

/** Cắt `r` khỏi `other` theo trục mất ít diện tích nhất; nằm gọn trong `other` thì trả rect rỗng. */
function trimOff(r: Rect, other: Rect): Rect {
  if (overlapArea(r, other) === 0) return r;
  const options: Rect[] = [
    { ...r, x1: Math.min(r.x1, other.x0) },
    { ...r, x0: Math.max(r.x0, other.x1) },
    { ...r, y1: Math.min(r.y1, other.y0) },
    { ...r, y0: Math.max(r.y0, other.y1) },
  ].filter((o) => o.x1 > o.x0 && o.y1 > o.y0);
  return options.sort((p, q) => area(q) - area(p))[0] ?? { x0: r.x0, y0: r.y0, x1: r.x0, y1: r.y0 };
}

/** Dải 1 m ngay trước cửa tum — khu thiết bị không được chắn lối ra. */
function doorStrip(head: Rect, side: Side): Rect {
  const d = 100;
  if (side === '+x') return { x0: head.x1, y0: head.y0, x1: head.x1 + d, y1: head.y1 };
  if (side === '-x') return { x0: head.x0 - d, y0: head.y0, x1: head.x0, y1: head.y1 };
  if (side === '+y') return { x0: head.x0, y0: head.y1, x1: head.x1, y1: head.y1 + d };
  return { x0: head.x0, y0: head.y0 - d, x1: head.x1, y1: head.y0 };
}

const free = (r: Rect, taken: readonly Rect[]) => taken.every((t) => overlapArea(r, t) === 0);

/** Chỗ đặt khu thiết bị / sân phơi: đủ cỡ tối thiểu, trên sàn mái, không chắn cửa tum; ưu tiên khu ướt và mép. */
function bestSpot(
  zone: RoofZoneSpec,
  bbox: Rect,
  taken: readonly Rect[],
  inside: (r: Rect) => boolean,
  wet: readonly Rect[],
  door: Rect | null,
): Rect | null {
  const side = Math.ceil((zone.minSideM * 100) / STEP_CM) * STEP_CM;
  const long = Math.max(side, Math.ceil((zone.minM2 * 10_000) / side / STEP_CM) * STEP_CM);
  let best: { rect: Rect; score: number } | null = null;
  for (const [w, h] of [
    [long, side],
    [side, long],
  ] as const) {
    for (let y = bbox.y0; y + h <= bbox.y1; y += STEP_CM) {
      for (let x = bbox.x0; x + w <= bbox.x1; x += STEP_CM) {
        const rect = { x0: x, y0: y, x1: x + w, y1: y + h };
        if (!inside(rect) || !free(rect, taken) || (door && overlapArea(rect, door) > 0)) continue;
        // Đè khu ướt (cấp thoát nước ngắn), rồi áp mép khối (không chiếm giữa sân thượng), rồi về phía sau.
        const wetShare = zone.overWet
          ? wet.reduce((s, r) => s + overlapArea(rect, r), 0) / area(rect)
          : 0;
        const edge =
          Number(rect.x0 === bbox.x0) + Number(rect.x1 === bbox.x1) + Number(rect.y1 === bbox.y1);
        const back = (rect.y1 - bbox.y0) / Math.max(1, bbox.y1 - bbox.y0);
        const score = wetShare * 4 + edge + back;
        if (!best || score > best.score) best = { rect, score };
      }
    }
  }
  return best?.rect ?? null;
}

/** Sân thượng: chữ nhật lớn nhất chạm dải trước cửa tum, trên sàn mái, không đè khu khác. */
function largestFrom(
  door: Rect,
  bbox: Rect,
  taken: readonly Rect[],
  inside: (r: Rect) => boolean,
  zone: RoofZoneSpec,
): Rect | null {
  let best: Rect | null = null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = bbox.x0; x <= bbox.x1; x += STEP_CM) xs.push(x);
  for (let y = bbox.y0; y <= bbox.y1; y += STEP_CM) ys.push(y);
  // Mép khối, mép khu đã đặt và mép dải trước cửa: sân thượng áp sát tum và khu bên cạnh, không hở một khe lưới.
  for (const r of [bbox, door, ...taken]) {
    xs.push(r.x0, r.x1);
    ys.push(r.y0, r.y1);
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  for (const x0 of xs)
    for (const x1 of xs) {
      if (x1 <= x0) continue;
      for (const y0 of ys)
        for (const y1 of ys) {
          if (y1 <= y0) continue;
          const rect = { x0, y0, x1, y1 };
          if (best && area(rect) <= area(best)) continue;
          if (overlapArea(rect, door) < area(door) * 0.5) continue;
          if (!free(rect, taken) || !inside(rect)) continue;
          best = rect;
        }
    }
  const min = zone.minSideM * 100;
  return best && best.x1 - best.x0 >= min && best.y1 - best.y0 >= min ? best : null;
}

/**
 * Mái nhìn như một «tầng» chỉ để VẼ (dùng lại nguyên bộ vẽ tờ mặt bằng — khung tên, kích thước, nhãn): tường chắn
 * mái (`r`) quanh đường bao, tường tum (`e`) với một cửa ra sân thượng, khu mái là «phòng» có nhãn. Không bao
 * giờ lưu, không vào cổng hay thước chấm.
 */
export function roofDrawingLevel(
  roof: AiFloorPlanRoof,
  walls: { exteriorCm: number; parapetCm: number; doorCm: number },
): AiFloorPlanLevel {
  const outline = roof.outline.map(toPt);
  const levelWalls: AiFloorPlanLevel['walls'] = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    return { id: `roof_w${i + 1}`, a: [a[0], a[1]], b: [b[0], b[1]], t: walls.parapetCm, k: 'r' };
  });
  const doors: NonNullable<AiFloorPlanLevel['doors']> = [];
  const rooms: AiFloorPlanLevel['rooms'] = roof.zones.map((zone) => ({
    id: zone.id,
    type: zone.type,
    rect: zone.rect,
    area_m2: m2(area(toRect(zone.rect))),
    label: zone.name,
  }));
  if (roof.stair_head) {
    const r = toRect(roof.stair_head.rect);
    const corners: [number, number][] = [
      [r.x0, r.y0],
      [r.x1, r.y0],
      [r.x1, r.y1],
      [r.x0, r.y1],
    ];
    const sides: Side[] = ['-y', '+x', '+y', '-x'];
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 4]!;
      const id = `roof_tum${i + 1}`;
      levelWalls.push({ id, a, b, t: walls.exteriorCm, k: 'e' });
      if (sides[i] === roof.stair_head!.door_side) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const w = Math.min(walls.doorCm, len - 20);
        if (w > 40)
          doors.push({
            id: 'roof_d1',
            wall: id,
            at: Math.round((len - w) / 2),
            w,
            hinge: 'a',
            side: 'l',
            kind: 'single',
          });
      }
    });
    rooms.push({
      id: 'roof_stair_head',
      type: 'stair',
      rect: roof.stair_head.rect,
      area_m2: m2(area(r)),
      label: 'Tum thang',
    });
  }
  return {
    level: roof.level,
    name: 'Mái',
    // Chiều cao tầng không có nghĩa với mái; bộ vẽ tờ mặt bằng không đọc nó.
    h: 0,
    outline: roof.outline,
    walls: levelWalls,
    rooms,
    doors,
    windows: [],
    // Không khai `stairs`: bộ vẽ tự chép ô thang tầng ngay dưới (`stairsArrivingAt`) — vế cuối lên tới tum.
  };
}
