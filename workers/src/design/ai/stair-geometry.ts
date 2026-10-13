/**
 * Hình học thang bộ theo LOẠI (T105, Haan 30/09/2026 — tài liệu «Các loại thang bộ phổ biến — ký hiệu mặt bằng»,
 * `doc/design/thang-bo-mat-bang.pdf`). MỘT chỗ biết hình dạng từng loại: bộ xếp đọc kích thước tối thiểu của ô thang,
 * bộ vẽ đọc bố cục bậc, chiếu nghỉ, giếng và đường đi. Hàm THUẦN, đơn vị cm, không đọc kho tri thức.
 *
 * Quy ước khung (cùng quy ước với `draw/stairs.ts`): `up` là chiều đi lên của VẾ ĐẦU; trục ngang `across = [−up.y,
 * up.x]`; gốc là góc ô thang mà đi theo `up` và theo `across` từ đó thì luôn ở trong ô. Toạ độ cục bộ (s dọc `up`,
 * t dọc `across`). Vế đầu nằm ở dải t nhỏ, sát gốc; lối vào thang ở cạnh sau lưng bậc 1 (s = 0), phía dải ấy.
 *
 * Đánh số theo tài liệu: bậc 1 ở chân thang, chiếu nghỉ MANG một số (số bậc tính tại đó), số cuối là bậc cuối trước sàn
 * tầng trên. Tầng cao 3,6 m, cổ bậc 171 → 21 cổ bậc → số 1…20: thang U = 1–10, chiếu nghỉ 11, 12–20.
 */

import type { StairShape as StairShapeCode } from '../kb/construction';
import type { Pt } from './draw/geometry';

export type { StairShapeCode };

export interface StairParams {
  shape: StairShapeCode;
  /** Số cổ bậc của tầng (số bậc cao). */
  risers: number;
  /** Mặt bậc, cm. */
  going: number;
  /** Bề rộng vế thông thuỷ, cm. */
  flightWidth: number;
  /** Chiều sâu chiếu nghỉ, cm (chiếu nghỉ góc của L / ba vế vuông cạnh bằng bề rộng vế). */
  landing: number;
  /** Giếng giữa hai vế song song, cm. */
  gap: number;
}

/** Số chiếu nghỉ của mỗi loại. */
function landingCount(shape: StairShapeCode): number {
  return shape === 'ba_ve' ? 2 : 1;
}

/** Số vế của mỗi loại — ghi vào `stairs[].flights` của artifact. */
export function shapeFlights(shape: StairShapeCode): number {
  return shape === 'ba_ve' ? 3 : 2;
}

/** Số bậc (mặt bậc) từng vế: số vị trí đánh số = cổ bậc − 1, trừ chiếu nghỉ, chia đều, vế trước nhận phần dư. */
export function stairSplit(shape: StairShapeCode, risers: number): number[] {
  const flights = shapeFlights(shape);
  const treads = Math.max(flights, risers - 1 - landingCount(shape));
  const base = Math.floor(treads / flights);
  const extra = treads - base * flights;
  return Array.from({ length: flights }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Kích thước LỌT LÒNG nhỏ nhất của ô thang: `along` dọc vế đầu, `across` ngang. Tầng 3,6 m (21 cổ bậc, mặt bậc 26,
 * vế 100): U 360 × 215, U rộng 410 × 280, L 360 × 334, ba vế 256 × 356, thẳng 594 × 100 — cộng tường 11 × 2 ra đúng
 * số của tài liệu.
 */
export function stairNeed(p: StairParams): { along: number; across: number } {
  const f = stairSplit(p.shape, p.risers);
  const b = p.going;
  const w = p.flightWidth;
  switch (p.shape) {
    case 'thang_thang':
      return { along: Math.ceil((f[0]! + f[1]!) * b + p.landing), across: w };
    case 'chu_l':
      return { along: Math.ceil(f[0]! * b + w), across: Math.ceil(f[1]! * b + w) };
    case 'ba_ve':
      return {
        along: Math.ceil(Math.max(f[0]!, f[2]!) * b + w),
        across: Math.ceil(2 * w + f[1]! * b),
      };
    case 'chu_u':
    case 'chu_u_rong':
      return {
        along: Math.ceil(Math.max(f[0]!, f[1]!) * b + p.landing),
        across: Math.ceil(2 * w + p.gap),
      };
  }
}

/** Ô thang `along × across` (lọt lòng, cm) có vừa loại thang này không, sai số 1 cm. */
export function stairFits(p: StairParams, along: number, across: number): boolean {
  const need = stairNeed(p);
  return along + 1 >= need.along && across + 1 >= need.across;
}

export interface StairPiece {
  /** Số in trên bậc / chiếu nghỉ. */
  n: number;
  /** Đa giác theo toạ độ thật. */
  poly: Pt[];
  centre: Pt;
  landing: boolean;
}

export interface StairLayout {
  pieces: StairPiece[];
  /** Giếng thang (U có khe, ba vế) — đa giác thật, `null` khi không có. */
  well: Pt[] | null;
  /** Đường đi: từ tâm bậc 1 qua các vế và chiếu nghỉ tới tâm bậc cuối. */
  path: Pt[];
  /**
   * Cạnh ô thang mà người đi hết thang bước ra ở tầng TRÊN — `start` = cạnh sau lưng bậc 1 (U, ba vế), `end` = cạnh
   * đối diện (thẳng), `across` = cạnh xa theo trục ngang (L).
   */
  arrival: 'start' | 'end' | 'across';
}

const AXIS: Record<string, Pt> = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };

/** Phía ô thang người bước ra ở tầng trên, theo loại. */
export function stairArrival(shape: StairShapeCode): StairLayout['arrival'] {
  if (shape === 'thang_thang') return 'end';
  if (shape === 'chu_l') return 'across';
  return 'start';
}

/** Phần ô thang dư so với vế + chiếu nghỉ, cm — 0 khi ô vừa khít hay ngắn hơn. */
function floorSpare(length: number, need: number): number {
  return Math.max(0, Math.floor(length - need));
}

/**
 * Bố cục vẽ của một ô thang `rect` (x0, y0, x1, y1 — lọt lòng, cm) với vế đầu đi theo `up`. Phần ô dư so với mức tối
 * thiểu: thang U và ba vế dồn về đầu bậc 1 thành sàn (T160 — vào và ra cùng đầu ấy); thang L dồn vào chiếu nghỉ, thang
 * thẳng vào chiếu nghỉ giữa, như tài liệu vẽ.
 */
export function stairLayout(
  p: StairParams,
  rect: readonly [number, number, number, number],
  upKey: string,
): StairLayout {
  const [x0, y0, x1, y1] = rect;
  const up = AXIS[upKey] ?? [0, 1];
  const across: Pt = [-up[1], up[0]];
  const horizontal = up[0] !== 0;
  const A = horizontal ? x1 - x0 : y1 - y0;
  const C = horizontal ? y1 - y0 : x1 - x0;
  const stepX = up[0] !== 0 ? up[0] : across[0];
  const stepY = up[1] !== 0 ? up[1] : across[1];
  const origin: Pt = [stepX > 0 ? x0 : x1, stepY > 0 ? y0 : y1];
  const at = (s: number, t: number): Pt => [
    origin[0] + up[0] * s + across[0] * t,
    origin[1] + up[1] * s + across[1] * t,
  ];
  const box = (s0: number, s1: number, t0: number, t1: number): Pt[] => [
    at(s0, t0),
    at(s1, t0),
    at(s1, t1),
    at(s0, t1),
  ];
  const f = stairSplit(p.shape, p.risers);
  const b = p.going;
  const pieces: StairPiece[] = [];
  let n = 0;
  const step = (s0: number, s1: number, t0: number, t1: number, landing = false) => {
    n += 1;
    pieces.push({
      n,
      poly: box(s0, s1, t0, t1),
      centre: at((s0 + s1) / 2, (t0 + t1) / 2),
      landing,
    });
  };

  switch (p.shape) {
    case 'thang_thang': {
      const mid = Math.max(0, A - (f[0]! + f[1]!) * b);
      for (let k = 0; k < f[0]!; k += 1) step(k * b, (k + 1) * b, 0, C);
      step(f[0]! * b, f[0]! * b + mid, 0, C, true);
      const s2 = f[0]! * b + mid;
      for (let k = 0; k < f[1]!; k += 1) step(s2 + k * b, s2 + (k + 1) * b, 0, C);
      return {
        pieces,
        well: null,
        path: [at(b / 2, C / 2), at(A - b / 2, C / 2)],
        arrival: 'end',
      };
    }
    case 'chu_u':
    case 'chu_u_rong': {
      const lane = Math.max(1, (C - p.gap) / 2);
      // Ô dư dồn về đầu bậc 1 thành sàn đứng trước thang / sàn bước ra (T160, Haan chấm d084a46e: «chiếu nghỉ thì quá
      // rộng»): ô 4,89 m cho thang cần 4,1 m vẽ chiếu nghỉ 2,26 m. Thang U vào và ra cùng đầu ấy, nên phần sàn ấy là chỗ
      // người đứng, không phải chiếu nghỉ.
      const spare = floorSpare(A, f[0]! * b + p.landing);
      const top = spare + f[0]! * b;
      for (let k = 0; k < f[0]!; k += 1) step(spare + k * b, spare + (k + 1) * b, 0, lane);
      step(top, A, 0, C, true);
      for (let k = 0; k < f[1]!; k += 1) step(top - (k + 1) * b, top - k * b, C - lane, C);
      const low = top - f[1]! * b;
      const turn = (top + A) / 2;
      return {
        pieces,
        well: C - 2 * lane > 1 ? box(Math.min(spare, low), top, lane, C - lane) : null,
        path: [
          at(b / 2, lane / 2),
          at(turn, lane / 2),
          at(turn, C - lane / 2),
          at(low + b / 2, C - lane / 2),
        ],
        arrival: 'start',
      };
    }
    case 'chu_l': {
      const lane = Math.max(1, C - f[1]! * b);
      const top = f[0]! * b;
      for (let k = 0; k < f[0]!; k += 1) step(k * b, (k + 1) * b, 0, lane);
      step(top, A, 0, lane, true);
      for (let k = 0; k < f[1]!; k += 1) step(top, A, lane + k * b, lane + (k + 1) * b);
      const turn = (top + A) / 2;
      return {
        pieces,
        well: null,
        path: [at(b / 2, lane / 2), at(turn, lane / 2), at(turn, C - b / 2)],
        arrival: 'across',
      };
    }
    case 'ba_ve': {
      const lane = Math.max(1, (C - f[1]! * b) / 2);
      // Như thang U: vào và ra cùng đầu, ô dư thành sàn ở đầu ấy (T160).
      const spare = floorSpare(A, f[0]! * b + p.landing);
      const top = spare + f[0]! * b;
      for (let k = 0; k < f[0]!; k += 1) step(spare + k * b, spare + (k + 1) * b, 0, lane);
      step(top, A, 0, lane, true);
      for (let k = 0; k < f[1]!; k += 1) step(top, A, lane + k * b, lane + (k + 1) * b);
      step(top, A, C - lane, C, true);
      for (let k = 0; k < f[2]!; k += 1) step(top - (k + 1) * b, top - k * b, C - lane, C);
      const turn = (top + A) / 2;
      const low = top - f[2]! * b;
      return {
        pieces,
        well: box(Math.max(spare, low), top, lane, C - lane),
        path: [
          at(b / 2, lane / 2),
          at(turn, lane / 2),
          at(turn, C - lane / 2),
          at(low + b / 2, C - lane / 2),
        ],
        arrival: 'start',
      };
    }
  }
}

/**
 * Chiều dài phần gầm dùng được ở ĐẦU CAO của thang thẳng (cm, tính từ đầu cao lùi vào): phần sàn mà mặt bậc phía trên
 * cao từ `useHeightCm` trở lên (WC gầm thang, T116 — Haan: «với nhà ống có thể tận dụng gầm cầu thang làm nhà vệ sinh
 * nhỏ»). Đường dốc đi qua mũi bậc: vế 1 lên `riser` mỗi `going`, chiếu nghỉ giữa phẳng, vế 2 lên tiếp. Loại khác → 0.
 */
export function underStairCm(p: StairParams, storeyCm: number, useHeightCm: number): number {
  if (p.shape !== 'thang_thang' || p.risers <= 0) return 0;
  const [f0 = 0] = stairSplit(p.shape, p.risers);
  const riser = storeyCm / p.risers;
  const along = stairNeed(p).along;
  const heightAt = (d: number) => {
    const first = f0 * p.going;
    if (d <= first) return (d / p.going) * riser;
    if (d <= first + p.landing) return f0 * riser;
    return f0 * riser + ((d - first - p.landing) / p.going) * riser;
  };
  for (let d = 0; d <= along; d += 1) {
    if (heightAt(d) >= useHeightCm) return Math.floor((along - d) / 10) * 10;
  }
  return 0;
}
