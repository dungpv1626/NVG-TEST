/**
 * Suy tường từ chữ nhật phòng — cạnh chung thành vách ngăn, cạnh biên thành tường bao.
 *
 * Từ 12/09/2026 (T23) đây là đường DUY NHẤT tường của nhánh AI ra đời: mô hình không khai tường
 * nữa. Trước đó nó là lưới an toàn của T19, chỉ chạy khi mô hình khai tường sai và đã cho sửa một
 * lượt. Lý lẽ thì không đổi, chỉ mạnh thêm — vị trí tường suy được TẤT ĐỊNH từ chính chữ nhật
 * phòng, nên hỏi mô hình là trả tiền cho thứ đã biết và mở ra một cách sai mới.
 *
 * Đổi lại, chỗ suy hộ phải NHÌN THẤY: `generator.walls_derived` luôn bật, và tờ vẽ in dòng
 * «Tường do chương trình suy từ phòng, không phải của AI» (`AI_DISCLAIMERS.wallsDerived`).
 *
 * ── Bốn loại cạnh, và vì sao phải phân biệt ─────────────────────────────────────────
 *
 * | Hai bên cạnh                  | Loại tường | Vì sao                                         |
 * | ----------------------------- | ---------- | ---------------------------------------------- |
 * | hai phòng trong nhà           | `p` vách   | vách ngăn, không có cửa sổ                     |
 * | một phòng trong, một ngoài    | `e` bao    | đây là ranh trong–ngoài, CÓ cửa sổ             |
 * | hai phòng ngoài trời          | `r` lan can| hai ban công cạnh nhau                         |
 * | cạnh biên của phòng trong nhà | `e` bao    | giáp ngoài trời hoặc giáp ranh đất             |
 * | cạnh biên của phòng ngoài trời| `r` lan can| mép ban công là lan can, không phải tường      |
 *
 * Phân biệt `e` với `p` KHÔNG phải chuyện thẩm mỹ: phép đối chiếu mặt thoáng
 * (`ai/rule-warnings.ts`) chỉ tính cửa sổ trên tường `e`. Gộp tất cả thành `p` thì mọi cửa sổ mở
 * ra ban công hoặc ra giếng trời biến mất khỏi phép đo, và cảnh báo «phòng ngủ không có cửa sổ»
 * nổ ra trên một mặt bằng đúng.
 *
 * Giới hạn đã biết và chấp nhận: chỉ hai bề dày (bao và ngăn), không có tường chịu lực dày riêng,
 * không có cột. Đây là bản phác tham khảo, không phải hồ sơ kết cấu (CLAUDE.md 8.2 điểm 9).
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import type { ConstructionNorms } from '../../kb/construction';
import type { Interval, Rect } from './geometry';

/** Khe giữa hai phòng rộng hơn mức này thì không phải một bức vách, mà là chỗ nào đó chưa khai. */
const MAX_PARTITION_GAP_CM = 40;

/** Hai cạnh phòng lệch nhau dưới mức này coi như thẳng hàng. */
const ALIGN_TOLERANCE_CM = 2;

export type DerivedWall = AiFloorPlanLevel['walls'][number];

/** Một phòng, chỉ với hai điều việc suy tường cần biết. */
export interface WallSourceRoom {
  rect: Rect;
  /** Phòng thuộc nhóm `outdoor` của `kb/room_vocabulary.yaml` — ban công, sân thượng, giếng trời. */
  outdoor: boolean;
}

interface Face {
  axis: 'x' | 'y';
  /** Toạ độ mặt phẳng chứa cạnh. */
  line: number;
  /** Phần cạnh chưa được dùng — trừ dần khi ghép được vách ngăn. */
  free: Interval[];
  /** +1 khi phần ngoài phòng nằm ở phía toạ độ LỚN hơn `line`. */
  outward: number;
  outdoor: boolean;
  /** Hai đầu cạnh ban đầu — để nhận ra phần còn lại nằm GIỮA cạnh (ô giao tường), không ở đầu. */
  span: Interval;
}

/**
 * Toàn bộ tường của một tầng, suy từ chữ nhật phòng.
 *
 * Trả mảng RỖNG khi không phòng nào hợp lệ — nơi gọi ghi một dòng ghi chú, chứ không ném: một tờ
 * vẽ thiếu tường kèm lời giải thích vẫn nói được nhiều hơn một lỗi máy chủ.
 */
export function deriveWallsFromRooms(
  rooms: readonly WallSourceRoom[],
  norms: ConstructionNorms,
): DerivedWall[] {
  const exteriorT = Math.round(norms.walls.exterior_m * 100);
  const partitionT = Math.round(norms.walls.partition_m * 100);

  const faces = facesOf(rooms);
  const walls: DerivedWall[] = [];
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `dw${counter}`;
  };

  // Vách giữa hai phòng: hai mặt phòng quay vào nhau, cách nhau một khe hẹp.
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      const first = faces[i];
      const second = faces[j];
      if (!first || !second) continue;
      if (first.axis !== second.axis || first.outward === second.outward) continue;
      const near = first.outward > 0 ? first : second;
      const far = first.outward > 0 ? second : first;
      const gap = far.line - near.line;
      if (gap < -ALIGN_TOLERANCE_CM || gap > MAX_PARTITION_GAP_CM) continue;

      const shared = intersect(near.free, far.free);
      if (shared.length === 0) continue;
      const bothOutdoor = near.outdoor && far.outdoor;
      const mixed = near.outdoor !== far.outdoor;
      const kind: DerivedWall['k'] = bothOutdoor ? 'r' : mixed ? 'e' : 'p';
      const thickness =
        gap > ALIGN_TOLERANCE_CM ? Math.round(gap) : kind === 'e' ? exteriorT : partitionT;
      const centre = (near.line + far.line) / 2;
      for (const span of shared) {
        walls.push(segment(nextId(), near.axis, centre, span, thickness, kind));
      }
      near.free = subtract(near.free, shared);
      far.free = subtract(far.free, shared);
    }
  }

  // Phần cạnh còn lại giáp ngoài trời: tường bao (hoặc lan can), tim lùi ra ngoài nửa bề dày.
  for (const face of faces) {
    const kind: DerivedWall['k'] = face.outdoor ? 'r' : 'e';
    const thickness = face.outdoor ? partitionT : exteriorT;
    for (const span of face.free) {
      // Mẩu nằm GIỮA cạnh và ngắn hơn một bề dày tường là ô giao của hai vách vuông góc (phòng trên
      // dài suốt, hai phòng dưới cách nhau một vách) — không phải chỗ giáp ngoài trời. Suy nó thành
      // tường bao là cắm một mẩu tường 22 cm vào giữa ngã ba (tờ vẽ 13/09/2026).
      const inside =
        span.from > face.span.from + ALIGN_TOLERANCE_CM &&
        span.to < face.span.to - ALIGN_TOLERANCE_CM;
      if (inside && span.to - span.from <= exteriorT + ALIGN_TOLERANCE_CM) continue;
      const centre = face.line + face.outward * (thickness / 2);
      walls.push(segment(nextId(), face.axis, centre, span, thickness, kind));
    }
  }

  return joinEnds(mergeCollinear(walls), Math.max(exteriorT, partitionT));
}

/**
 * Nối hai đoạn cùng một bức bị cắt đôi ở ô giao tường — cùng trục, cùng tim, cùng bề dày, cùng loại,
 * cách nhau không quá một bề dày tường.
 *
 * Mỗi đoạn vách suy từ đúng một cặp phòng, nên bức vách dài suốt dưới một phòng lớn bị chặt thành
 * nhiều đoạn ở mỗi chỗ phòng bên kia đổi. Để nguyên thì mỗi chỗ chặt là một khe trống trên tờ vẽ.
 */
function mergeCollinear(walls: DerivedWall[]): DerivedWall[] {
  const out: DerivedWall[] = [];
  const key = (wall: DerivedWall) =>
    `${xy(wall.a)[1] === xy(wall.b)[1] ? 'x' : 'y'}|${xy(wall.a)[1] === xy(wall.b)[1] ? xy(wall.a)[1] : xy(wall.a)[0]}|${wall.t}|${wall.k}`;
  const groups = new Map<string, DerivedWall[]>();
  for (const wall of walls) groups.set(key(wall), [...(groups.get(key(wall)) ?? []), wall]);
  for (const group of groups.values()) {
    const horizontal = xy(group[0]!.a)[1] === xy(group[0]!.b)[1];
    const along = (wall: DerivedWall) =>
      horizontal
        ? {
            from: Math.min(xy(wall.a)[0], xy(wall.b)[0]),
            to: Math.max(xy(wall.a)[0], xy(wall.b)[0]),
          }
        : {
            from: Math.min(xy(wall.a)[1], xy(wall.b)[1]),
            to: Math.max(xy(wall.a)[1], xy(wall.b)[1]),
          };
    const sorted = [...group].sort((p, q) => along(p).from - along(q).from);
    let current = sorted[0]!;
    for (const next of sorted.slice(1)) {
      const a = along(current);
      const b = along(next);
      if (b.from - a.to <= current.t + ALIGN_TOLERANCE_CM) {
        const to = Math.max(a.to, b.to);
        current = {
          ...current,
          b: horizontal ? [to, xy(current.a)[1]] : [xy(current.a)[0], to],
          a: horizontal ? [a.from, xy(current.a)[1]] : [xy(current.a)[0], a.from],
        };
      } else {
        out.push(current);
        current = next;
      }
    }
    out.push(current);
  }
  // Giữ thứ tự xuất hiện của đoạn đầu mỗi bức để mã tường ổn định giữa hai lần dựng.
  const order = new Map(walls.map((wall, index) => [wall.id, index]));
  return out.sort((p, q) => order.get(p.id)! - order.get(q.id)!);
}

/**
 * Kéo đầu tường tới TIM bức vuông góc nó chạm.
 *
 * Tường suy từ mặt phòng dừng ở MẶT bức kia, nên ô vuông giao nhau không thuộc bức nào: góc nhà hở
 * một khấc, ngã ba hở một lỗ. `draw/walls.ts` nối góc và ngã ba theo quy ước «đầu tường nằm ở tim
 * bức kia» — đúng quy ước này thì cả góc chữ L lẫn ngã ba chữ T đều liền nét.
 */
function joinEnds(walls: DerivedWall[], maxThickness: number): DerivedWall[] {
  const horizontal = (wall: DerivedWall) => xy(wall.a)[1] === xy(wall.b)[1];
  const reach = maxThickness / 2 + maxThickness / 2 + ALIGN_TOLERANCE_CM;
  return walls.map((wall) => {
    const h = horizontal(wall);
    const centre = h ? xy(wall.a)[1] : xy(wall.a)[0];
    const lo = h ? Math.min(xy(wall.a)[0], xy(wall.b)[0]) : Math.min(xy(wall.a)[1], xy(wall.b)[1]);
    const hi = h ? Math.max(xy(wall.a)[0], xy(wall.b)[0]) : Math.max(xy(wall.a)[1], xy(wall.b)[1]);
    let from = lo;
    let to = hi;
    for (const other of walls) {
      if (other === wall || horizontal(other) === h) continue;
      const line = h ? xy(other.a)[0] : xy(other.a)[1];
      const otherLo = h
        ? Math.min(xy(other.a)[1], xy(other.b)[1])
        : Math.min(xy(other.a)[0], xy(other.b)[0]);
      const otherHi = h
        ? Math.max(xy(other.a)[1], xy(other.b)[1])
        : Math.max(xy(other.a)[0], xy(other.b)[0]);
      const slack = wall.t / 2 + ALIGN_TOLERANCE_CM;
      if (centre < otherLo - slack || centre > otherHi + slack) continue;
      if (line < lo && lo - line <= reach) from = Math.min(from, line);
      if (line > hi && line - hi <= reach) to = Math.max(to, line);
    }
    if (from === lo && to === hi) return wall;
    return h
      ? { ...wall, a: [from, centre], b: [to, centre] }
      : { ...wall, a: [centre, from], b: [centre, to] };
  });
}

/** Bốn mặt của mỗi phòng, mỗi mặt ban đầu còn trống toàn bộ chiều dài. */
function facesOf(rooms: readonly WallSourceRoom[]): Face[] {
  const faces: Face[] = [];
  for (const { rect, outdoor } of rooms) {
    const xs = { from: rect.x0, to: rect.x1 };
    const ys = { from: rect.y0, to: rect.y1 };
    faces.push({ axis: 'x', line: rect.y0, outward: -1, outdoor, free: [xs], span: xs });
    faces.push({ axis: 'x', line: rect.y1, outward: 1, outdoor, free: [xs], span: xs });
    faces.push({ axis: 'y', line: rect.x0, outward: -1, outdoor, free: [ys], span: ys });
    faces.push({ axis: 'y', line: rect.x1, outward: 1, outdoor, free: [ys], span: ys });
  }
  return faces;
}

/** Một đoạn tường: `axis: 'x'` là tường chạy ngang, tim ở `centre` theo trục y. */
function segment(
  id: string,
  axis: 'x' | 'y',
  centre: number,
  span: Interval,
  thickness: number,
  kind: DerivedWall['k'],
): DerivedWall {
  const a: [number, number] =
    axis === 'x' ? [round(span.from), round(centre)] : [round(centre), round(span.from)];
  const b: [number, number] =
    axis === 'x' ? [round(span.to), round(centre)] : [round(centre), round(span.to)];
  return { id, a, b, t: thickness, k: kind };
}

/**
 * Hợp đồng artifact cho phép lưới nửa centimet, và tim vách giữa hai phòng rơi đúng vào đó.
 *
 * Làm tròn về số nguyên thay vì giữ x,5: nửa centimet trên tim tường không đổi được gì trên tờ vẽ
 * ở tỷ lệ 1:70, còn toạ độ nguyên thì đọc được trong nhật ký và trong tệp DXF. Sai số tối đa là
 * 5 mm trên mỗi mặt tường — dưới bề rộng một nét in.
 */
function round(value: number): number {
  return Math.round(value);
}

/** Toạ độ một đầu tường — hợp đồng khai mảng số, luôn đúng hai phần tử. */
function xy(point: readonly number[]): [number, number] {
  return [point[0]!, point[1]!];
}

function intersect(left: readonly Interval[], right: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const a of left) {
    for (const b of right) {
      const from = Math.max(a.from, b.from);
      const to = Math.min(a.to, b.to);
      if (to - from > ALIGN_TOLERANCE_CM) out.push({ from, to });
    }
  }
  return out;
}

function subtract(from: readonly Interval[], holes: readonly Interval[]): Interval[] {
  let current = [...from];
  for (const hole of holes) {
    const next: Interval[] = [];
    for (const span of current) {
      if (hole.to <= span.from || hole.from >= span.to) {
        next.push(span);
        continue;
      }
      if (hole.from - span.from > ALIGN_TOLERANCE_CM) next.push({ from: span.from, to: hole.from });
      if (span.to - hole.to > ALIGN_TOLERANCE_CM) next.push({ from: hole.to, to: span.to });
    }
    current = next;
  }
  return current;
}
