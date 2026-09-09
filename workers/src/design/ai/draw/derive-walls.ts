/**
 * Suy tường từ chữ nhật phòng — lưới an toàn của quyết định T19.
 *
 * Khi nào chạy: mô hình khai tường sai, đã cho SỬA một lượt, và sau lượt ấy chỉ còn nhóm lỗi
 * tường (`PlanCheckResult.wallOnly`). Lúc đó bỏ tường của mô hình và tự dựng lại: cạnh chung
 * giữa hai phòng thành vách ngăn, cạnh biên thành tường bao.
 *
 * Vì sao không trả về một tờ vẽ hỏng rồi bắt bấm lại: mỗi lượt bấm lại là một lượt gọi tính
 * tiền, và cái mô hình sai ở đây là phần MÁY suy được — vị trí tường suy từ chính chữ nhật
 * phòng mà mô hình đã khai đúng. Đổi lại, chỗ suy hộ phải NHÌN THẤY: `generator.walls_derived`
 * bật, và tờ vẽ in dòng «Tường do chương trình suy từ phòng, không phải của AI»
 * (`AI_DISCLAIMERS.wallsDerived`).
 *
 * Giới hạn đã biết và chấp nhận: tường suy ra chỉ có hai bề dày (bao và ngăn), không có tường
 * chịu lực dày riêng, và cột thì không có. Mọi bức nằm GIỮA hai phòng đều mang loại `p`, kể cả
 * khi một bên là ban công hay giếng trời — chương trình không đọc được từ chữ nhật rằng bên
 * kia là ngoài trời. Trên tờ vẽ hai loại ấy trông y hệt nhau (chỉ `r` vẽ khác), nên chỗ này
 * không làm sai bản vẽ; nó chỉ khiến một cửa sổ hợp lệ bị đọc thành "cửa sổ trên vách ngăn"
 * nếu ai đó đem kết quả đã suy tường đi kiểm lại. Đây là bản phác tham khảo, không phải hồ sơ
 * kết cấu — nhánh AI không sinh kết cấu (CLAUDE.md 8.2 điểm 9).
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import type { ConstructionNorms } from '../../kb/construction';
import { toRect, type Interval, type Rect } from './geometry';
import { DrawNotes, type DrawNote } from './notes';
import { prepareWalls } from './walls';

/** Khe giữa hai phòng rộng hơn mức này thì không phải một bức vách, mà là chỗ nào đó chưa khai. */
const MAX_PARTITION_GAP_CM = 40;

/** Hai cạnh phòng lệch nhau dưới mức này coi như thẳng hàng. */
const ALIGN_TOLERANCE_CM = 2;

type Wall = AiFloorPlanLevel['walls'][number];

interface Face {
  axis: 'x' | 'y';
  /** Toạ độ mặt phẳng chứa cạnh. */
  line: number;
  /** Phần cạnh chưa được dùng — trừ dần khi ghép được vách ngăn. */
  free: Interval[];
  /** +1 khi phần ngoài phòng nằm ở phía toạ độ LỚN hơn `line`. */
  outward: number;
}

export interface DerivedLevel {
  level: AiFloorPlanLevel;
  notes: DrawNote[];
}

/**
 * Dựng lại toàn bộ tường của một tầng từ chữ nhật phòng, và giữ lại những lỗ mở còn đặt được.
 *
 * Cửa và cửa sổ của mô hình được ánh xạ sang tường mới theo VỊ TRÍ THẬT (điểm giữa lỗ mở trong
 * hệ toạ độ của tầng), không theo mã tường — mã tường cũ vừa bị bỏ. Lỗ nào không còn tường nào
 * chứa thì bỏ, kèm một dòng ghi chú: mất một ô cửa sổ còn hơn vẽ nó lơ lửng giữa phòng.
 */
export function deriveWalls(level: AiFloorPlanLevel, norms: ConstructionNorms): DerivedLevel {
  const notes = new DrawNotes();
  const exteriorT = Math.round(norms.walls.exterior_m * 100);
  const partitionT = Math.round(norms.walls.partition_m * 100);

  const faces = facesOf(level.rooms.map((room) => toRect(room.rect)));
  const walls: Wall[] = [];
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `dw${counter}`;
  };

  // Vách ngăn: hai mặt phòng quay vào nhau, cách nhau một khe hẹp.
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
      const thickness = gap > ALIGN_TOLERANCE_CM ? Math.round(gap) : partitionT;
      const centre = (near.line + far.line) / 2;
      for (const span of shared) {
        walls.push(segment(nextId(), near.axis, centre, span, thickness, 'p'));
      }
      near.free = subtract(near.free, shared);
      far.free = subtract(far.free, shared);
    }
  }

  // Phần cạnh còn lại giáp ngoài trời: tường bao, tim lùi ra ngoài nửa bề dày.
  for (const face of faces) {
    for (const span of face.free) {
      const centre = face.line + face.outward * (exteriorT / 2);
      walls.push(segment(nextId(), face.axis, centre, span, exteriorT, 'e'));
    }
  }

  if (walls.length === 0) {
    notes.add(
      'walls_not_derivable',
      'Không suy được tường từ chữ nhật phòng của tầng này — tầng không có phòng nào hợp lệ.',
    );
    return { level, notes: notes.list() };
  }

  const remapped = remapOpenings(level, walls, notes);
  return {
    level: { ...level, walls, doors: remapped.doors, windows: remapped.windows },
    notes: notes.list(),
  };
}

/** Bốn mặt của mỗi phòng, mỗi mặt ban đầu còn trống toàn bộ chiều dài. */
function facesOf(rects: readonly Rect[]): Face[] {
  const faces: Face[] = [];
  for (const rect of rects) {
    faces.push({ axis: 'x', line: rect.y0, outward: -1, free: [{ from: rect.x0, to: rect.x1 }] });
    faces.push({ axis: 'x', line: rect.y1, outward: 1, free: [{ from: rect.x0, to: rect.x1 }] });
    faces.push({ axis: 'y', line: rect.x0, outward: -1, free: [{ from: rect.y0, to: rect.y1 }] });
    faces.push({ axis: 'y', line: rect.x1, outward: 1, free: [{ from: rect.y0, to: rect.y1 }] });
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
  kind: Wall['k'],
): Wall {
  const a: [number, number] =
    axis === 'x' ? [round(span.from), round(centre)] : [round(centre), round(span.from)];
  const b: [number, number] =
    axis === 'x' ? [round(span.to), round(centre)] : [round(centre), round(span.to)];
  return { id, a, b, t: thickness, k: kind };
}

/** Hợp đồng khai toạ độ là số NGUYÊN centimet — tim vách rơi vào nửa cm thì làm tròn ở đây. */
function round(value: number): number {
  return Math.round(value);
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

/** Đưa cửa và cửa sổ của mô hình sang hệ tường mới, theo vị trí thật của điểm giữa lỗ mở. */
function remapOpenings(
  level: AiFloorPlanLevel,
  walls: readonly Wall[],
  notes: DrawNotes,
): { doors: AiFloorPlanLevel['doors']; windows: AiFloorPlanLevel['windows'] } {
  const before = new Map(prepareWalls(level.walls).map((wall) => [wall.id, wall]));
  const after = prepareWalls(walls);

  const relocate = (
    id: string,
    wallId: string,
    at: number,
    width: number,
    kind: string,
  ): { wall: string; at: number } | null => {
    const source = before.get(wallId);
    if (!source) return null;
    const midpoint: [number, number] = [
      source.a[0] + source.u[0] * (at + width / 2),
      source.a[1] + source.u[1] * (at + width / 2),
    ];

    for (const wall of after) {
      // CÙNG PHƯƠNG trước đã. Thiếu phép này thì một bức vuông góc đi ngang qua điểm giữa lỗ
      // mở cũng lọt, và cửa bị xoay 90° trên tờ vẽ mà không có lỗi nào nổ ra.
      const parallel = Math.abs(wall.u[0] * source.u[0] + wall.u[1] * source.u[1]);
      if (parallel < 0.999) continue;
      // Cùng phương và đi qua điểm giữa lỗ mở: chiếu lên tim tường rồi đo lệch ngang.
      const alongAxis =
        (midpoint[0] - wall.a[0]) * wall.u[0] + (midpoint[1] - wall.a[1]) * wall.u[1];
      const acrossAxis =
        (midpoint[0] - wall.a[0]) * wall.n[0] + (midpoint[1] - wall.a[1]) * wall.n[1];
      if (Math.abs(acrossAxis) > wall.t / 2 + MAX_PARTITION_GAP_CM / 2) continue;
      if (alongAxis < width / 2 || alongAxis > wall.length - width / 2) continue;
      return { wall: wall.id, at: Math.round(alongAxis - width / 2) };
    }

    notes.add(
      'opening_dropped_after_derive',
      `${kind} "${id}" không còn đặt được sau khi chương trình suy lại tường — đã bỏ khỏi tờ vẽ.`,
    );
    return null;
  };

  const doors = (level.doors ?? []).flatMap((door) => {
    const placed = relocate(door.id, door.wall, door.at, door.w, 'Cửa');
    return placed ? [{ ...door, wall: placed.wall, at: placed.at }] : [];
  });
  const windows = (level.windows ?? []).flatMap((window) => {
    const placed = relocate(window.id, window.wall, window.at, window.w, 'Cửa sổ');
    return placed ? [{ ...window, wall: placed.wall, at: placed.at }] : [];
  });
  return { doors, windows };
}
