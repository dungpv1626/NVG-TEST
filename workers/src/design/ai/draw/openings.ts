/**
 * Cửa và cửa sổ: khoét lỗ trên tường, rồi vẽ ký hiệu.
 *
 * Ký hiệu cửa trên mặt bằng nói ba điều mà một ô trống không nói được: cửa rộng bao nhiêu, bản
 * lề ở đầu nào, và cánh quét về phía nào. Chỉ huy trưởng đọc đúng ba điều đó để biết cửa có
 * đập vào tủ bếp hay không — nên đây là phần không được vẽ tượng trưng.
 *
 * ⚠️ Hợp đồng đo `at` từ đầu `a` của TIM tường tới MÉP GẦN của lỗ. Mọi phép ở đây bám theo
 * đúng quy ước ấy; đổi sang hệ đã kéo dài (nối góc) là việc của `solidRuns`.
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import { along, addVec, bboxOfPoints, type Interval, type Pt, type Rect } from './geometry';
import { DrawNotes } from './notes';
import { arcPath, CLS, polylinePath, tag } from './svg';
import type { Paper } from './units';
import type { WallGeom, WallHoles } from './walls';

/** Nét đứt của cổng và cửa để xe, mm giấy — chúng là cửa cuốn hoặc cửa đẩy, không có cung quét. */
const SHUTTER_DASH = '2 1.5';

type Door = NonNullable<AiFloorPlanLevel['doors']>[number];
type Window = NonNullable<AiFloorPlanLevel['windows']>[number];

export interface OpeningsResult {
  /** Lỗ mở theo từng bức tường — đầu vào của `renderWalls`. */
  holes: WallHoles;
  svg: string;
}

/**
 * Khoét lỗ và vẽ ký hiệu cho toàn bộ cửa + cửa sổ của một tầng.
 *
 * KHOAN DUNG: lỗ mở nằm ngoài chiều dài tường thì kẹp lại và ghi một dòng ở `notes`, không
 * ném. Dữ liệu tới đây đã qua schema và qua bộ kiểm; thứ còn sót là chỗ mô hình lệch vài
 * centimet, và bỏ cả tờ vẽ vì vài centimet là đánh đổi sai.
 */
export function renderOpenings(
  level: AiFloorPlanLevel,
  walls: readonly WallGeom[],
  paper: Paper,
  notes: DrawNotes,
): OpeningsResult {
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const holes: WallHoles = new Map();
  const jambs: string[] = [];
  const leaves: string[] = [];
  const glass: string[] = [];
  const shutters: string[] = [];

  const addHole = (wallId: string, hole: Interval): void => {
    const list = holes.get(wallId);
    if (list) list.push(hole);
    else holes.set(wallId, [hole]);
  };

  for (const door of level.doors ?? []) {
    const wall = byId.get(door.wall);
    if (!wall) {
      notes.add(
        'opening_wall_missing',
        `Cửa "${door.id}" ghi nằm trên tường "${door.wall}" nhưng tầng này không có tường đó — đã bỏ qua khi vẽ.`,
      );
      continue;
    }
    const span = clampSpan(door.id, door.at, door.w, wall, notes);
    if (!span) continue;
    addHole(wall.id, span);
    jambs.push(...jambLines(wall, span, paper));

    if (door.kind === 'garage' || door.kind === 'gate') {
      // Cửa cuốn và cổng không có cung quét — một nét đứt suốt lỗ mở là đúng cách hồ sơ NVG
      // thể hiện chúng. Không ghi thêm nhãn: tên phòng ("Để xe") đã nói, và một chữ nữa ở
      // đúng chỗ hẹp nhất của tờ vẽ chỉ che mất nét.
      shutters.push(shutterLine(wall, span, paper));
    } else if (door.kind === 'sliding') {
      shutters.push(slidingPanel(wall, span, door.side ?? 'l', paper));
    } else if (door.kind === 'single' || door.kind === 'double') {
      leaves.push(...leafSymbols(door, wall, span, paper));
    }
    // `opening` — ô thông không cánh: chỉ có má cửa, đã vẽ ở trên.
  }

  for (const window of level.windows ?? []) {
    const wall = byId.get(window.wall);
    if (!wall) {
      notes.add(
        'opening_wall_missing',
        `Cửa sổ "${window.id}" ghi nằm trên tường "${window.wall}" nhưng tầng này không có tường đó — đã bỏ qua khi vẽ.`,
      );
      continue;
    }
    const span = clampSpan(window.id, window.at, window.w, wall, notes);
    if (!span) continue;
    addHole(wall.id, span);
    jambs.push(...jambLines(wall, span, paper));
    glass.push(...glassLines(wall, span, paper));
  }

  const parts: string[] = [];
  if (jambs.length) parts.push(tag('path', { class: CLS.opening, d: jambs.join(' ') }));
  if (glass.length) parts.push(tag('path', { class: CLS.window, d: glass.join(' ') }));
  if (leaves.length) parts.push(tag('path', { class: CLS.doorLeaf, d: leaves.join(' ') }));
  if (shutters.length) {
    parts.push(
      tag('path', { class: CLS.doorLeaf, d: shutters.join(' '), 'stroke-dasharray': SHUTTER_DASH }),
    );
  }
  return { holes, svg: parts.join('') };
}

/** Kẹp lỗ mở vào trong chiều dài tường. Trả `null` khi không còn gì để vẽ. */
function clampSpan(
  id: string,
  at: number,
  width: number,
  wall: WallGeom,
  notes: DrawNotes,
): Interval | null {
  if (width <= 0 || wall.length <= 0) {
    notes.add('opening_zero_width', `Lỗ mở "${id}" có bề rộng bằng 0 — đã bỏ qua khi vẽ.`);
    return null;
  }
  const clampedWidth = Math.min(width, wall.length);
  const from = Math.max(0, Math.min(at, wall.length - clampedWidth));
  const to = from + clampedWidth;
  if (from !== at || clampedWidth !== width) {
    notes.add(
      'opening_clamped',
      `Lỗ mở "${id}" nằm ngoài đoạn tường "${wall.id}" (khai tại ${at} cm, rộng ${width} cm; tường dài ${Math.round(wall.length)} cm) — đã kẹp vào trong tường để vẽ.`,
    );
  }
  return { from, to };
}

/** Hai má cửa: nét cắt ngang hết bề dày tường ở hai đầu lỗ mở. */
function jambLines(wall: WallGeom, span: Interval, paper: Paper): string[] {
  const half = wall.t / 2;
  return [span.from, span.to].map((distance) => {
    const centre = along(wall.a, wall.u, distance);
    return polylinePath(
      [paper.p(addVec(centre, wall.n, -half)), paper.p(addVec(centre, wall.n, half))],
      false,
    );
  });
}

/** Cửa sổ: hai nét kính ở ±t/4, chạy suốt lỗ mở. */
function glassLines(wall: WallGeom, span: Interval, paper: Paper): string[] {
  const quarter = wall.t / 4;
  const start = along(wall.a, wall.u, span.from);
  const end = along(wall.a, wall.u, span.to);
  return [quarter, -quarter].map((offset) =>
    polylinePath(
      [paper.p(addVec(start, wall.n, offset)), paper.p(addVec(end, wall.n, offset))],
      false,
    ),
  );
}

/** Cửa cuốn, cổng: một nét suốt lỗ mở, đặt trên tim tường. */
function shutterLine(wall: WallGeom, span: Interval, paper: Paper): string {
  return polylinePath(
    [paper.p(along(wall.a, wall.u, span.from)), paper.p(along(wall.a, wall.u, span.to))],
    false,
  );
}

/** Cửa trượt: cánh nằm sát một mặt tường, lệch khỏi tim nửa bề dày. */
function slidingPanel(wall: WallGeom, span: Interval, side: 'l' | 'r', paper: Paper): string {
  const offset = (side === 'l' ? 1 : -1) * (wall.t / 2);
  const start = addVec(along(wall.a, wall.u, span.from), wall.n, offset);
  const end = addVec(along(wall.a, wall.u, span.to), wall.n, offset);
  return polylinePath([paper.p(start), paper.p(end)], false);
}

/**
 * Cánh cửa mở quay: cánh vuông góc với tường + cung quét một phần tư.
 *
 * `hinge` là đầu tường mang bản lề, `side` là phía cánh quét về khi đứng ở `a` nhìn về `b` —
 * `l` là bên trái, tức phía pháp tuyến trái `n`. Cửa hai cánh có hai bản lề ở hai đầu, mỗi
 * cánh rộng nửa lỗ.
 */
function leafSymbols(door: Door, wall: WallGeom, span: Interval, paper: Paper): string[] {
  const sideSign = (door.side ?? 'l') === 'l' ? 1 : -1;
  const width = span.to - span.from;

  const swing = (hingeAt: number, leafWidth: number, towards: 1 | -1): string[] => {
    const hinge = along(wall.a, wall.u, hingeAt);
    const tip = addVec(hinge, wall.n, sideSign * leafWidth);
    const shut = along(wall.a, wall.u, hingeAt + towards * leafWidth);
    return [
      polylinePath([paper.p(hinge), paper.p(tip)], false),
      arcPath(paper.p(tip), paper.p(shut), paper.p(hinge), paper.len(leafWidth)),
    ];
  };

  if (door.kind === 'double') {
    return [...swing(span.from, width / 2, 1), ...swing(span.to, width / 2, -1)];
  }
  return (door.hinge ?? 'a') === 'b' ? swing(span.to, width, -1) : swing(span.from, width, 1);
}

/**
 * Vùng cánh cửa quét, toạ độ THẬT — hình vuông cạnh bằng bề rộng lỗ mở, phía cánh mở vào.
 *
 * Bộ ghi tên phòng tránh những vùng này: ở khu vệ sinh 4 m², tên phòng đặt giữa phòng đè đúng lên
 * cung cửa (tờ vẽ 13/09/2026).
 */
export function doorSwingZones(level: AiFloorPlanLevel, walls: readonly WallGeom[]): Rect[] {
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const zones: Rect[] = [];
  for (const door of level.doors ?? []) {
    if (door.kind !== 'single' && door.kind !== 'double') continue;
    const wall = byId.get(door.wall);
    if (!wall || door.w <= 0) continue;
    const sideSign = (door.side ?? 'l') === 'l' ? 1 : -1;
    const from = Math.max(0, Math.min(door.at, wall.length - door.w));
    const reach = door.kind === 'double' ? door.w / 2 : door.w;
    const points = [from, from + door.w].flatMap((distance) => {
      const onWall = along(wall.a, wall.u, distance);
      return [onWall, addVec(onWall, wall.n, sideSign * reach)];
    });
    zones.push(bboxOfPoints(points));
  }
  return zones;
}
