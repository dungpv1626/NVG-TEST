/**
 * Tường: từ TIM tường của hợp đồng ra đa giác đặc trên tờ vẽ.
 *
 * Hai việc, và cả hai đều là chỗ bản vẽ dễ trông sai nhất:
 *
 *  1. **Nối góc.** Tường khai theo tim, nên hai bức gặp nhau ở góc để hở một ô vuông đúng
 *     bằng nửa bề dày. Kéo dài đầu tường ra bằng nửa bề dày của bức nó chạm thì góc liền.
 *  2. **Cắt lỗ mở.** Chỗ có cửa thì tường phải ĐỨT, không phải vẽ đè một hình trắng lên. Vẽ
 *     đè trông giống nhau trên màn hình nhưng sai khi in trên nền không trắng, và sai hẳn khi
 *     tờ vẽ được rasterise để làm ảnh tham chiếu.
 *
 * Lan can (`k: 'r'`) không tô đặc: hai nét mảnh song song. Nó là lan can ban công, và vẽ nó
 * đặc như tường thì ban công đọc thành một cái hộp kín (cùng lý lẽ với mục `outdoor` của
 * `kb/construction_norms.yaml`).
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import {
  along,
  addVec,
  distanceToSegment,
  normalOf,
  subtractIntervals,
  toPt,
  unitAlong,
  type Interval,
  type Pt,
} from './geometry';
import { CLS, polylinePath, tag } from './svg';
import type { Paper } from './units';

/** Sai lệch cho phép khi hỏi "hai bức tường này có chạm nhau không", cm. */
export const TOUCH_TOLERANCE_CM = 1;

export type WallInput = AiFloorPlanLevel['walls'][number];

export interface WallGeom {
  id: string;
  kind: WallInput['k'];
  /** Tim tường, nguyên văn hợp đồng. */
  a: Pt;
  b: Pt;
  /** Bề dày, cm. */
  t: number;
  /** Véc-tơ đơn vị dọc tường, chiều `a → b`. */
  u: Pt;
  /** Pháp tuyến trái của `u`. */
  n: Pt;
  /** Chiều dài tim, cm. */
  length: number;
  /** Đầu tường sau khi kéo dài để nối góc. */
  origin: Pt;
  /** Chiều dài sau khi kéo dài hai đầu, cm. */
  drawnLength: number;
  /** Đoạn đã kéo dài ở đầu `a` — cộng vào `at` của lỗ mở để đổi sang hệ đã kéo dài. */
  headExtension: number;
}

/**
 * Chuẩn bị hình học của mọi bức tường trong một tầng.
 *
 * Tính một lần rồi dùng chung cho tường, cửa, cửa sổ và bộ kiểm — nếu mỗi nơi tự tính lại
 * pháp tuyến thì sớm muộn hai nơi sẽ chọn hai chiều pháp tuyến khác nhau, và cánh cửa mở
 * ngược so với má cửa mà không ai thấy sai ở đâu.
 */
export function prepareWalls(walls: readonly WallInput[]): WallGeom[] {
  const raw = walls.map((wall) => {
    const a = toPt(wall.a);
    const b = toPt(wall.b);
    const u = unitAlong(a, b);
    return {
      id: wall.id,
      kind: wall.k,
      a,
      b,
      t: wall.t,
      u,
      n: normalOf(u),
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
    };
  });

  return raw.map((wall) => {
    const headExtension = extensionAt(wall.a, wall.id, raw);
    const tailExtension = extensionAt(wall.b, wall.id, raw);
    return {
      ...wall,
      origin: along(wall.a, wall.u, -headExtension),
      drawnLength: wall.length + headExtension + tailExtension,
      headExtension,
    };
  });
}

/**
 * Kéo dài bao nhiêu ở một đầu tường: nửa bề dày của bức DÀY NHẤT mà đầu này chạm tới.
 *
 * "Chạm" đo bằng khoảng cách tới TIM bức kia, cho phép lệch tới nửa bề dày của nó cộng dung
 * sai. Nhờ vậy cùng một phép tính phục vụ cả ba kiểu gặp nhau: hai đầu tường trùng điểm, đầu
 * tường đâm vào giữa bức khác (chữ T), và đầu tường dừng ở MẶT bức khác thay vì ở tim — kiểu
 * cuối là kiểu mô hình hay khai nhất.
 */
function extensionAt(
  point: Pt,
  selfId: string,
  walls: ReadonlyArray<{ id: string; a: Pt; b: Pt; t: number }>,
): number {
  let extension = 0;
  for (const other of walls) {
    if (other.id === selfId) continue;
    const gap = distanceToSegment(point, other.a, other.b);
    if (gap <= other.t / 2 + TOUCH_TOLERANCE_CM) extension = Math.max(extension, other.t / 2);
  }
  return extension;
}

/** Lỗ mở trên một bức, đo từ đầu `a` của tim tường — khoá là mã tường. */
export type WallHoles = Map<string, Interval[]>;

/**
 * Các đoạn ĐẶC còn lại của một bức sau khi trừ lỗ mở, trong hệ đã kéo dài (gốc `origin`).
 *
 * Phần kéo dài để nối góc không bao giờ bị cắt: nó nằm bên trong bức tường vuông góc, và cắt
 * ở đó là khoét một lỗ ngay giữa góc nhà.
 */
export function solidRuns(wall: WallGeom, holes: readonly Interval[]): Interval[] {
  const shifted = holes.map((hole) => ({
    from: hole.from + wall.headExtension,
    to: hole.to + wall.headExtension,
  }));
  return subtractIntervals(wall.drawnLength, shifted);
}

/** Bốn đỉnh của một đoạn tường đặc, toạ độ THẬT, theo thứ tự: hai mặt bên rồi vòng lại. */
export function runCorners(wall: WallGeom, run: Interval): [Pt, Pt, Pt, Pt] {
  const half = wall.t / 2;
  const start = along(wall.origin, wall.u, run.from);
  const end = along(wall.origin, wall.u, run.to);
  return [
    addVec(start, wall.n, -half),
    addVec(end, wall.n, -half),
    addVec(end, wall.n, half),
    addVec(start, wall.n, half),
  ];
}

/**
 * Vẽ toàn bộ tường của một tầng.
 *
 * Gộp mọi đoạn đặc vào MỘT thẻ `<path>` nhiều đường con: một tầng nhà phố có tới vài trăm
 * đoạn, và một thẻ mỗi đoạn thì riêng phần thuộc tính đã dài hơn cả hình.
 */
export function renderWalls(walls: readonly WallGeom[], holes: WallHoles, paper: Paper): string {
  const solid: string[] = [];
  const railing: string[] = [];

  for (const wall of walls) {
    const runs = solidRuns(wall, holes.get(wall.id) ?? []);
    for (const run of runs) {
      if (run.to - run.from <= 0) continue;
      const [nearStart, nearEnd, farEnd, farStart] = runCorners(wall, run);
      if (wall.kind === 'r') {
        // Lan can: hai nét mảnh ở hai mặt, không tô ruột.
        railing.push(polylinePath([paper.p(nearStart), paper.p(nearEnd)], false));
        railing.push(polylinePath([paper.p(farStart), paper.p(farEnd)], false));
      } else {
        solid.push(
          polylinePath(
            [nearStart, nearEnd, farEnd, farStart].map((point) => paper.p(point)),
            true,
          ),
        );
      }
    }
  }

  const parts: string[] = [];
  if (solid.length) parts.push(tag('path', { class: CLS.wall, d: solid.join(' ') }));
  if (railing.length) parts.push(tag('path', { class: CLS.railing, d: railing.join(' ') }));
  return parts.join('');
}
