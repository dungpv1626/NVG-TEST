/**
 * Bậc tam cấp ngoài cửa chính — CHƯƠNG TRÌNH đặt, mô hình không khai (T70, Q-51, 23/09/2026).
 *
 * Đo trên HS-04/05/06 (`doc/design/13-ho-so-thuc-te.md` 13.16.2): mặt bậc giữ 300, số bậc = chênh
 * cốt ÷ ~150 làm tròn lên, bậc đặt ngay ngoài cửa chính. «Tam cấp» là tên gọi, không phải số bậc.
 *
 * Ba ranh giới, cùng lẽ với T65:
 *  · **Chỉ vẽ khi đầu bài cho số** — số bậc gia chủ khai, hoặc cốt nền cao hơn đường bao nhiêu.
 *    Không có thì không vẽ (`EntryStepsDemand` = `null`): cốt nền là số khảo sát, không đoán được.
 *  · **Không vẽ ra ngoài thửa, không đè lên nhà.** Sân trước không đủ sâu thì không vẽ và NÓI RA —
 *    bậc lùi vào trong nhà hay bớt bậc là quyết định của kiến trúc sư, không phải của chương trình.
 *  · **Không chặn phương án.** Mọi chỗ không vẽ được là ghi chú, không phải lỗi cổng: bậc tam cấp
 *    không làm mặt bằng sai công năng, và nó không đáng một lượt gọi mô hình.
 *
 * Hàm THUẦN, tất định.
 */

import type { AiFloorPlanLevel } from '@nvg/shared/design';
import type { EntryStepNorms } from '../kb/construction';
import type { Face } from '../kb/site-context';
import type { EntryStepsDemand } from './brief-demands';
import { rectsOverlap, toRect, type Pt, type Rect } from './draw/geometry';
import type { DrawNote } from './draw/notes';
import { prepareWalls } from './draw/walls';
import { doorLinks } from './plan-check';

type EntryStep = NonNullable<AiFloorPlanLevel['entry_steps']>[number];
type Axis = EntryStep['down'];

/** Chiều ra ngoài → mặt thửa. Gốc toạ độ ở góc trước-trái, y chạy vào sâu thửa. */
const FACE_OF: Record<Axis, Face> = { '-y': 'front', '+y': 'back', '-x': 'left', '+x': 'right' };

/** Dung sai so mép, cm — toạ độ tường nằm trên lưới nửa centimet. */
const SLACK_CM = 1;

export interface EntryStepsInput {
  /** Tầng 1 đã có tường và cửa (sau `levelFromRooms`). */
  level: AiFloorPlanLevel;
  demand: EntryStepsDemand | null;
  norms: EntryStepNorms | undefined;
  /** Ô thửa chưa trừ khoảng lùi, cm. `null` = không kiểm ranh (chỉ phép thử dựng ngữ cảnh tay). */
  lotCm: Rect | null;
  /** Mặt lối vào chính đầu bài khai; `null` = lấy cửa ra ngoài rộng nhất. */
  mainFace: Face | null;
}

export interface EntryStepsResult {
  steps: EntryStep[];
  notes: DrawNote[];
}

/** Số bậc: gia chủ khai thì lấy nguyên, không thì chênh cốt ÷ cổ bậc, làm tròn LÊN. */
export function entryStepCount(demand: EntryStepsDemand, norms: EntryStepNorms): number | null {
  if (demand.count !== null) return demand.count;
  if (demand.dropM === null || demand.dropM <= 0) return null;
  // Trừ một phần nhỏ trước khi làm tròn lên: 0,45 ÷ 0,15 trong dấu phẩy động là 3,0000000004.
  return Math.max(1, Math.ceil(demand.dropM / norms.riser_m - 1e-9));
}

export function placeEntrySteps(input: EntryStepsInput): EntryStepsResult {
  const { demand, norms, level } = input;
  const notes: DrawNote[] = [];
  const none = (code?: string, message?: string): EntryStepsResult => ({
    steps: [],
    notes: code && message ? [...notes, { code, message }] : notes,
  });
  if (!demand || !norms) return none();

  const count = entryStepCount(demand, norms);
  if (count === null) return none();
  if (count > norms.max_count) {
    return none(
      'entry_steps_too_many',
      `Chênh cốt nền ${metres(demand.dropM ?? 0)} cần ${count} bậc, quá ${norms.max_count} bậc của một dãy bậc tam cấp — mặt bằng chưa vẽ bậc. Lối lên cao như vậy cần kiến trúc sư thiết kế riêng (thang ngoài nhà, chiếu nghỉ).`,
    );
  }

  const door = mainDoor(level, input.mainFace);
  if (!door) {
    return none(
      'entry_steps_no_door',
      'Không tìm thấy cửa chính mở thẳng ra ngoài ở tầng 1 (cửa có thể mở ra hiên hay sân trong) — mặt bằng chưa vẽ bậc tam cấp.',
    );
  }

  const going = Math.round(norms.going_m * 100);
  const depth = count * going;
  const width = Math.max(norms.width_min_m * 100, door.w + norms.width_over_door_m * 100);
  const alongX = door.out[0] !== 0;
  const sign = alongX ? door.out[0] : door.out[1];
  const face = alongX ? door.face[0] : door.face[1];
  const lateral = alongX ? door.face[1] : door.face[0];
  const far = face + sign * depth;
  let from = lateral - width / 2;
  let to = lateral + width / 2;

  // Cửa sát ranh bên: trượt dãy bậc vào trong thửa thay vì vẽ lấn sang nhà bên cạnh.
  const lot = input.lotCm;
  if (lot) {
    const [lo, hi] = alongX ? [lot.y0, lot.y1] : [lot.x0, lot.x1];
    if (to - from > hi - lo + SLACK_CM) {
      return none(
        'entry_steps_no_room',
        `Thửa chỉ rộng ${metres((hi - lo) / 100)} ở mặt có cửa chính, không đủ cho lối lên ${metres(width / 100)} — mặt bằng chưa vẽ bậc tam cấp.`,
      );
    }
    if (from < lo) [from, to] = [lo, lo + width];
    if (to > hi) [from, to] = [hi - width, hi];
  }

  const rect = snap(
    alongX
      ? { x0: Math.min(face, far), x1: Math.max(face, far), y0: from, y1: to }
      : { x0: from, x1: to, y0: Math.min(face, far), y1: Math.max(face, far) },
  );
  const where = FACE_WORD[FACE_OF[door.down]];

  if (lot) {
    const room = sign > 0 ? (alongX ? lot.x1 : lot.y1) - face : face - (alongX ? lot.x0 : lot.y0);
    if (room + SLACK_CM < depth) {
      return none(
        'entry_steps_no_room',
        `Sân ${where} chỉ còn ${metres(Math.max(0, room) / 100)} ngoài cửa chính, không đủ ${count} bậc tam cấp sâu ${metres(depth / 100)} — mặt bằng chưa vẽ bậc. Kiến trúc sư quyết: lùi bậc vào trong nhà, hay bớt bậc bằng cách hạ cốt nền.`,
      );
    }
  }
  const inset = {
    x0: rect.x0 + SLACK_CM,
    y0: rect.y0 + SLACK_CM,
    x1: rect.x1 - SLACK_CM,
    y1: rect.y1 - SLACK_CM,
  };
  if (level.rooms.some((item) => rectsOverlap(toRect(item.rect), inset))) {
    return none(
      'entry_steps_blocked',
      `Ngoài cửa chính mặt ${where} là một phần khác của nhà — mặt bằng chưa vẽ bậc tam cấp.`,
    );
  }

  if (demand.count === null) {
    notes.push({
      code: 'entry_steps_from_road',
      message: `Bậc tam cấp: ${count} bậc, suy từ cốt nền cao hơn tim đường ${metres(demand.dropM ?? 0)} chia cổ bậc ${metres(norms.riser_m)}. Sân lát cao hơn đường thì bớt bậc — kiểm lại khi có cốt sân.`,
    });
  }
  return {
    steps: [
      {
        id: 'es1',
        rect: [rect.x0, rect.y0, rect.x1, rect.y1],
        down: door.down,
        risers: count,
        going,
      },
    ],
    notes,
  };
}

interface MainDoor {
  w: number;
  /** Điểm giữa lỗ cửa trên MẶT NGOÀI tường. */
  face: Pt;
  out: Pt;
  down: Axis;
}

/**
 * Cửa chính = cửa có một phía là ngoài nhà, không phải cửa để xe hay cổng — cùng định nghĩa với
 * `stairsFacingEntry` (`rule-warnings.ts`). Có mặt lối vào đầu bài khai thì ưu tiên cửa trên mặt
 * ấy (không có cửa nào trên đó thì xét mọi cửa); trong số đó lấy cửa rộng nhất, hoà thì cửa khai
 * trước.
 */
function mainDoor(level: AiFloorPlanLevel, mainFace: Face | null): MainDoor | null {
  const walls = prepareWalls(level.walls);
  const byId = new Map(walls.map((wall) => [wall.id, wall]));
  const rooms = level.rooms.map((room) => toRect(room.rect));
  const inside = (p: Pt) =>
    rooms.some(
      (r) =>
        p[0] >= r.x0 - SLACK_CM &&
        p[0] <= r.x1 + SLACK_CM &&
        p[1] >= r.y0 - SLACK_CM &&
        p[1] <= r.y1 + SLACK_CM,
    );
  const candidates: MainDoor[] = [];
  for (const link of doorLinks(level, walls)) {
    if (!link.toOutside || link.rooms.length !== 1) continue;
    const door = (level.doors ?? []).find((item) => item.id === link.id);
    if (!door || door.kind === 'garage' || door.kind === 'gate') continue;
    const wall = byId.get(door.wall);
    if (!wall) continue;
    const reach = wall.t / 2 + SLACK_CM;
    const out = [1, -1]
      .map((s): Pt => [wall.n[0] * s, wall.n[1] * s])
      .find((dir) => !inside([link.at[0] + dir[0] * reach, link.at[1] + dir[1] * reach]));
    const down = out ? axisOf(out) : null;
    if (!out || !down) continue;
    candidates.push({
      w: door.w,
      face: [link.at[0] + out[0] * (wall.t / 2), link.at[1] + out[1] * (wall.t / 2)],
      out,
      down,
    });
  }
  const pool = mainFace ? candidates.filter((door) => FACE_OF[door.down] === mainFace) : candidates;
  const chosen = (pool.length ? pool : candidates).reduce<MainDoor | null>(
    (best, door) => (!best || door.w > best.w ? door : best),
    null,
  );
  return chosen;
}

function axisOf(v: Pt): Axis | null {
  if (Math.abs(v[0]) > 0.9) return v[0] > 0 ? '+x' : '-x';
  if (Math.abs(v[1]) > 0.9) return v[1] > 0 ? '+y' : '-y';
  return null;
}

const FACE_WORD: Record<Face, string> = {
  front: 'trước',
  back: 'sau',
  left: 'bên trái',
  right: 'bên phải',
};

/** Hợp đồng đo trên lưới nửa centimet. */
function snap(r: Rect): Rect {
  const half = (n: number) => Math.round(n * 2) / 2;
  return { x0: half(r.x0), y0: half(r.y0), x1: half(r.x1), y1: half(r.y1) };
}

function metres(m: number): string {
  return `${m
    .toFixed(2)
    .replace(/\.?0+$/, '')
    .replace('.', ',')} m`;
}
