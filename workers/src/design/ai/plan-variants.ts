/**
 * Biến thể của ý định cả nhà mà chương trình tự thử trước khi bác (T94, B2 bước 1 — Haan duyệt 27/09/2026,
 * `doc/design/THIET_KE_B2.md` mục 8). Hàm THUẦN trên ý định (mã phòng của mô hình, bản phác thô) — không
 * xếp, không kiểm; `evaluateHouseBest` (`plan.ts`) đưa từng biến thể qua `evaluateHouse` và giữ cái tốt nhất.
 *
 * 1. `retargetIntent` — tổng diện tích mục tiêu mô hình khai cho tầng GIỮ NGUYÊN, chia lại: mỗi phòng mức
 *    tối thiểu + phần dư chia theo tỉ lệ mức tối thiểu, không vượt mức tối đa nghề. Mô hình tự đặt mục tiêu dồn phần dư vào phòng khách, gara; bước
 *    căn vách theo diện tích bám mục tiêu nên phòng ngủ phía sau vẽ sát sàn, không còn chỗ cho hành lang.
 *    Đo trên 105 vòng thật: một mình bước này ra 5 mặt bằng (trước: 0).
 * 2. `hallVariants` — chèn một dải hành lang 2 ô vào một ĐƯỜNG CẮT SẠCH của bản phác (không phòng nào vắt
 *    qua). Giữ nguyên tôpô mô hình vẽ; bước nắn co các hàng theo tỉ lệ để trả chỗ cho dải.
 */

import type { HouseIntent } from './house';

/** Loại phòng giữ nguyên mục tiêu mô hình khai: lõi, giao thông, ngoài trời. */
const KEEP_TARGET = new Set([
  'stair',
  'elevator',
  'light_well',
  'circulation',
  'core',
  'balcony',
  'terrace',
  'porch',
  'courtyard',
]);

export interface RetargetOptions {
  floors: number;
  /** Dòng đầu bài có diện tích tối thiểu: loại, tầng ghim (`null` = tầng nào cũng được), m². */
  briefRows: readonly { type: string; floor: number | null; area_m2: number | null }[];
  /** Mức nghề theo loại phòng. */
  norms?: ReadonlyMap<string, { min: number; max: number }> | null;
  /** Diện tích chỗ để xe theo số xe đầu bài khai. */
  garageMinM2?: number | null;
}

/** Mức tối thiểu của từng phòng: sàn đầu bài (ghép lớn với lớn như cổng danh mục), gara, mức nghề. */
export function roomMinimums(intent: HouseIntent, opts: RetargetOptions): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, number[]>();
  for (const row of opts.briefRows) {
    if (typeof row.area_m2 !== 'number') continue;
    const key = `${row.type}@${row.floor ?? '*'}`;
    groups.set(key, [...(groups.get(key) ?? []), row.area_m2]);
  }
  for (const [key, areas] of groups) {
    const [type, floorKey] = key.split('@') as [string, string];
    const floor = floorKey === '*' ? null : Number(floorKey);
    const rooms = intent.rooms
      .filter(
        (room) =>
          room.type === type && (floor === null || room.level === floor) && !out.has(room.id),
      )
      .sort((a, b) => b.target_area_m2 - a.target_area_m2);
    [...areas]
      .sort((a, b) => b - a)
      .forEach((area, i) => {
        const room = rooms[i];
        if (room) out.set(room.id, area);
      });
  }
  for (const room of intent.rooms) {
    if (out.has(room.id)) continue;
    if (room.type === 'garage' && opts.garageMinM2) out.set(room.id, opts.garageMinM2);
    else {
      const norm = opts.norms?.get(room.type)?.min;
      if (typeof norm === 'number') out.set(room.id, norm);
    }
  }
  return out;
}

/**
 * Mục tiêu mới: mức tối thiểu + phần dư (tổng mục tiêu mô hình khai trừ tổng mức tối thiểu) chia theo tỉ lệ
 * mức tối thiểu, chặn ở mức tối đa nghề (phần bị chặn chia lại cho phòng còn chỗ). Không còn dư thì mục
 * tiêu = mức tối thiểu. `null` khi không đổi gì.
 */
export function retargetIntent(intent: HouseIntent, opts: RetargetOptions): HouseIntent | null {
  const mins = roomMinimums(intent, opts);
  const rooms = intent.rooms.map((room) => ({ ...room }));
  let changed = false;
  for (let level = 1; level <= opts.floors; level += 1) {
    const onLevel = rooms.filter((room) => room.level === level);
    const flex = onLevel.filter(
      (room) => !KEEP_TARGET.has(room.type) && !room.ensuite_of && mins.has(room.id),
    );
    if (!flex.length) continue;
    const min = flex.map((room) => mins.get(room.id)!);
    const max = flex.map((room) => opts.norms?.get(room.type)?.max ?? Infinity);
    // GIỮ tổng mục tiêu mô hình khai cho các phòng này, chỉ CHIA LẠI: phần dư mô hình dồn vào phòng khách,
    // gara rải theo tỉ lệ mức tối thiểu. Ước sức chứa từ sàn xây được thì quá bi quan (mặt bằng thật đạt
    // ~200 m² lọt lòng trên sàn 192 m²) và phần dư ra 0.
    let spare =
      flex.reduce((sum, room) => sum + room.target_area_m2, 0) - min.reduce((s, m) => s + m, 0);
    const target = [...min];
    // Rót phần dư: theo tỉ lệ mức tối thiểu, phòng chạm trần thì thôi nhận, phần thừa rót tiếp.
    for (let pass = 0; pass < flex.length && spare > 0.05; pass += 1) {
      const open = flex.map((_, i) => i).filter((i) => target[i]! < max[i]!);
      const weight = open.reduce((s, i) => s + min[i]!, 0);
      if (!open.length || weight <= 0) break;
      let used = 0;
      for (const i of open) {
        const add = Math.min((spare * min[i]!) / weight, max[i]! - target[i]!);
        target[i] = target[i]! + add;
        used += add;
      }
      spare -= used;
      if (used < 0.05) break;
    }
    flex.forEach((room, i) => {
      const next = Math.round(target[i]! * 10) / 10;
      if (Math.abs(next - room.target_area_m2) >= 0.1) {
        room.target_area_m2 = next;
        changed = true;
      }
    });
  }
  return changed ? { ...intent, rooms } : null;
}

/**
 * Biến thể thứ hai: mục tiêu mỗi phòng ĐÚNG BẰNG mức tối thiểu lớn nhất của loại ấy trên tầng — phòng cùng
 * loại cùng tầng bằng nhau, phòng mô hình khai to (phòng khách) co về mức, phần dư để bộ xếp tự rải. Bộ xếp rất nhạy với mục tiêu: đo trên lượt 5aba737d, phòng
 * ngủ tầng 1 cùng 25 m² (thay vì 25 / 15) là đủ để cả nhà qua cổng. `null` khi không đổi gì.
 */
export function equalizeByType(intent: HouseIntent, opts: RetargetOptions): HouseIntent | null {
  const mins = roomMinimums(intent, opts);
  const top = new Map<string, number>();
  for (const room of intent.rooms) {
    const min = mins.get(room.id);
    if (min === undefined || KEEP_TARGET.has(room.type) || room.ensuite_of) continue;
    const key = `${room.type}@${room.level}`;
    top.set(key, Math.max(top.get(key) ?? 0, min));
  }
  let changed = false;
  const rooms = intent.rooms.map((room) => {
    const want = top.get(`${room.type}@${room.level}`);
    if (want === undefined || KEEP_TARGET.has(room.type) || room.ensuite_of) return room;
    const next = want;
    if (next === room.target_area_m2) return room;
    changed = true;
    return { ...room, target_area_m2: next };
  });
  return changed ? { ...intent, rooms } : null;
}

type Cells = string[][];

function gridOf(rows: readonly string[]): Cells {
  const tokens = rows
    .map((row) => row.trim().split(/\s+/).filter(Boolean))
    .filter((row) => row.length);
  const width = Math.max(0, ...tokens.map((row) => row.length));
  return tokens.map((row) => [...row, ...Array<string>(width - row.length).fill('.')]);
}

const empty = (id: string | undefined) => !id || /^\.+$/.test(id);

/** Đường cắt sạch: ngang (giữa hàng i-1 và i), dọc (giữa cột j-1 và j) — không phòng nào vắt qua. */
export function cleanCuts(rows: readonly string[]): { h: number[]; v: number[] } {
  const g = gridOf(rows);
  const h: number[] = [];
  const v: number[] = [];
  for (let i = 1; i < g.length; i += 1) {
    const row = g[i]!;
    const above = g[i - 1]!;
    if (row.every((id, j) => empty(id) || empty(above[j]) || above[j] !== id)) h.push(i);
  }
  const cols = g[0]?.length ?? 0;
  for (let j = 1; j < cols; j += 1) {
    if (g.every((row) => empty(row[j]) || empty(row[j - 1]) || row[j - 1] !== row[j])) v.push(j);
  }
  return { h, v };
}

/** Chèn dải hành lang `id` dày `t` ô vào đường cắt; ô ngoài khối nhà (hai bên đều «.») giữ «.». */
export function insertHall(
  rows: readonly string[],
  cut: { axis: 'h' | 'v'; at: number },
  id: string,
  t = 2,
): string[] {
  const g = gridOf(rows);
  let out: Cells;
  if (cut.axis === 'h') {
    const band = g[cut.at]!.map((cell, j) => (empty(cell) && empty(g[cut.at - 1]![j]) ? '.' : id));
    out = [
      ...g.slice(0, cut.at),
      ...Array.from({ length: t }, () => [...band]),
      ...g.slice(cut.at),
    ];
  } else {
    out = g.map((row) => {
      const cell = empty(row[cut.at]) && empty(row[cut.at - 1]) ? '.' : id;
      return [...row.slice(0, cut.at), ...Array<string>(t).fill(cell), ...row.slice(cut.at)];
    });
  }
  return out.map((row) => row.join(' '));
}

/** Mọi biến thể «chèn hành lang» của một tầng, tối đa `limit` (cắt ngang trước, rồi dọc). */
export function hallVariants(
  intent: HouseIntent,
  level: number,
  id: string,
  limit = 12,
): { key: string; intent: HouseIntent }[] {
  const sketch = intent.sketches?.find((s) => s.level === level);
  if (!sketch) return [];
  const cuts = cleanCuts(sketch.rows);
  const all = [
    ...cuts.h.map((at) => ({ axis: 'h' as const, at })),
    ...cuts.v.map((at) => ({ axis: 'v' as const, at })),
  ].slice(0, limit);
  return all.map((cut) => ({
    key: `${cut.axis === 'h' ? 'ngang' : 'dọc'}@${cut.at}`,
    intent: {
      ...intent,
      rooms: [
        ...intent.rooms,
        { id, type: 'circulation', level, target_area_m2: 10, ensuite_of: null },
      ] as HouseIntent['rooms'],
      sketches: (intent.sketches ?? []).map((s) =>
        s.level === level ? { ...s, rows: insertHall(s.rows, cut, id) } : s,
      ),
    },
  }));
}
