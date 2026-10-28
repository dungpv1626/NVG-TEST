/**
 * Dời vách trên bản phác lưới (T177, 28/10/2026) — chương trình tự sửa hai lỗi bản phác lặp đi lặp lại khi tầng
 * còn diện tích dư: phòng không có lối vào (`sketch_room_no_access`) và phòng hụt sàn đầu bài
 * (`arrange_room_below_brief_area`).
 *
 * Bối cảnh: ba lượt thật hồ sơ NVO-TK-2026-9272 (biệt thự 15 × 20 m, 2 tầng; GPT-5.6 Terra hai lượt, Gemini 3.1 Pro
 * một lượt) đều qua tầng 1 rồi hỏng ở tầng 2 vì đúng hai lỗi ấy, đổi qua đổi lại giữa các lượt sửa — trong khi tầng 2
 * rộng ~192 m², đầu bài đòi ~150 m², phần dư nằm gần hết ở hành lang mô hình vẽ rộng 3–4 ô.
 *
 * Ba phép biến đổi, mỗi phép giữ MỌI phòng là chữ nhật:
 *  · `wall`  — dời một đoạn vách thẳng một ô lưới. Đoạn vách là đoạn nhỏ nhất trên một đường lưới mà mọi phòng chạm nó
 *    từ hai phía đều có TRỌN cạnh nằm trên đoạn: phòng một phía rộng thêm một dải, phòng phía kia hẹp đi một dải.
 *  · `notch` — phòng áp cạnh một hành lang (cạnh phòng ngắn hơn cạnh hành lang, chung một đầu) lấn vào hành lang một
 *    dải; phần hành lang còn lại hình chữ L tách thành hai đoạn hành lang chữ nhật (một đoạn mới).
 *  · `stub`  — phòng nhường trọn một dải bề rộng `stubCells` dọc một cạnh thành đoạn hành lang mới, nối hành lang /
 *    khu chung sẵn có tới phòng mất lối vào ở đầu kia.
 * Đoạn hành lang mới mang mã tạm `<hành lang gốc>#n` (`stub` từ phòng: `<hành lang kề>#n`); bên gọi đặt mã thật.
 *
 * Tìm kiếm: tham lam theo điểm từ điển (`score`, bên gọi tính — phòng mất lối vào, phần hụt sàn đầu bài…), mỗi bước
 * chọn phép giảm điểm nhiều nhất, dừng khi không phép nào giảm điểm hoặc hết `maxMoves`. Phòng hẹp đi phải qua
 * `shrinkOk` (bên gọi: còn trên mức tối thiểu của nó, hành lang còn đủ bề rộng lọt lòng). Không thêm, không bớt phòng
 * nào; không đụng ô ngoài khối nhà; ô thang, thang máy, giếng trời, phòng gộp mở không đổi (bên gọi quyết `movable`).
 *
 * Hàm THUẦN, tất định: mọi thứ tự có khoá cuối là chỉ số lưới / mã phòng. Không import gì của bộ giải nội bộ đã gỡ.
 */

import type { SketchGrid } from './sketch';

/** Chữ nhật ô, chỉ số đầu gồm, chỉ số cuối KHÔNG gồm. */
export interface CellBox {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

/** Một phép sửa đã áp. */
export interface RepairMove {
  kind: 'wall' | 'notch' | 'stub';
  grown: string[];
  shrunk: string[];
  /** Đoạn hành lang mới (mã tạm). */
  added: string[];
}

export interface RepairRules {
  /** Phòng được dời vách (cả rộng thêm lẫn hẹp đi) — mã tạm của đoạn hành lang mới đã quy về mã gốc. */
  movable: (id: string) => boolean;
  /** Phòng là hành lang (mã gốc). */
  corridor: (id: string) => boolean;
  /** Phòng `id` (mã gốc) hẹp lại còn `box` có còn dùng được không — cũng dùng cho đoạn hành lang mới. */
  shrinkOk: (id: string, box: CellBox) => boolean;
  /** Điểm từ điển của một lưới — nhỏ hơn là tốt hơn. */
  score: (grid: SketchGrid) => readonly number[];
  maxMoves: number;
  /** Số đoạn hành lang mới tối đa (`notch`, `stub`); 0 = chỉ dời vách. */
  maxNewCorridors: number;
  /** Bề rộng đoạn hành lang `stub`, ô. */
  stubCells: number;
  /** Số trạng thái giữ mỗi bước — 1 = tham lam. */
  beam?: number;
  /** Số bước liền không tốt hơn trạng thái tốt nhất thì dừng. */
  patience?: number;
}

export interface RepairResult {
  grid: SketchGrid;
  moves: RepairMove[];
  score: readonly number[];
}

type Boxes = Map<string, CellBox & { cells: number }>;

/** Mã gốc của một ô: đoạn hành lang mới `x#n` thuộc hành lang `x`. */
export function baseId(id: string): string {
  const at = id.indexOf('#');
  return at < 0 ? id : id.slice(0, at);
}

export function cellBoxes(grid: SketchGrid): Boxes {
  const out: Boxes = new Map();
  grid.cells.forEach((row, r) =>
    row.forEach((id, c) => {
      if (id === null) return;
      const box = out.get(id);
      if (!box) out.set(id, { c0: c, r0: r, c1: c + 1, r1: r + 1, cells: 1 });
      else {
        box.c0 = Math.min(box.c0, c);
        box.r0 = Math.min(box.r0, r);
        box.c1 = Math.max(box.c1, c + 1);
        box.r1 = Math.max(box.r1, r + 1);
        box.cells += 1;
      }
    }),
  );
  return out;
}

const isRect = (box: CellBox & { cells: number }) =>
  (box.c1 - box.c0) * (box.r1 - box.r0) === box.cells;

interface Candidate {
  grid: SketchGrid;
  move: RepairMove;
}

const copyCells = (grid: SketchGrid) => grid.cells.map((row) => [...row]);

function fill(cells: (string | null)[][], box: CellBox, id: string): void {
  for (let r = box.r0; r < box.r1; r += 1)
    for (let c = box.c0; c < box.c1; c += 1) cells[r]![c] = id;
}

function nextPiece(grid: SketchGrid, parent: string): string {
  let n = 1;
  const used = new Set(grid.cells.flat());
  while (used.has(`${parent}#${n}`)) n += 1;
  return `${parent}#${n}`;
}

/** Mọi phép dời vách hợp lệ về hình, theo thứ tự tất định. */
function wallCandidates(grid: SketchGrid, boxes: Boxes, rules: RepairRules): Candidate[] {
  const out: Candidate[] = [];
  const movable = (id: string) => rules.movable(baseId(id));
  for (const axis of ['row', 'col'] as const) {
    const perpCount = axis === 'col' ? grid.cols : grid.rows;
    const alongCount = axis === 'col' ? grid.rows : grid.cols;
    const at = (along: number, perp: number) =>
      (axis === 'col' ? grid.cells[along]?.[perp] : grid.cells[perp]?.[along]) ?? null;
    const alongOf = (box: CellBox) => (axis === 'col' ? [box.r0, box.r1] : [box.c0, box.c1]);
    const perpOf = (box: CellBox) => (axis === 'col' ? [box.c0, box.c1] : [box.r0, box.r1]);
    for (let line = 1; line < perpCount; line += 1) {
      const seen = new Set<string>();
      for (let seed = 0; seed < alongCount; seed += 1) {
        const a = at(seed, line - 1);
        const b = at(seed, line);
        if (a === null || b === null || a === b) continue;
        let from = seed;
        let to = seed + 1;
        let ok = true;
        for (let grew = true; grew && ok;) {
          grew = false;
          for (let x = from; x < to; x += 1) {
            const lo = at(x, line - 1);
            const hi = at(x, line);
            if (lo === null || hi === null || lo === hi) {
              ok = false;
              break;
            }
            for (const id of [lo, hi]) {
              const [s, e] = alongOf(boxes.get(id)!);
              if (s! < from || e! > to) {
                from = Math.min(from, s!);
                to = Math.max(to, e!);
                grew = true;
              }
            }
          }
        }
        if (!ok) continue;
        const key = `${from}:${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const lows = new Set<string>();
        const highs = new Set<string>();
        for (let x = from; x < to && ok; x += 1) {
          const lo = at(x, line - 1)!;
          const hi = at(x, line)!;
          const lb = boxes.get(lo)!;
          const hb = boxes.get(hi)!;
          if (!isRect(lb) || !isRect(hb) || !movable(lo) || !movable(hi)) ok = false;
          else if (perpOf(lb)[1] !== line || perpOf(hb)[0] !== line) ok = false;
          lows.add(lo);
          highs.add(hi);
        }
        if (!ok) continue;
        const depth = (ids: Set<string>) =>
          Math.min(
            ...[...ids].map((id) => {
              const [s, e] = perpOf(boxes.get(id)!);
              return e! - s!;
            }),
          );
        const shift = (dir: 1 | -1) => {
          const cells = copyCells(grid);
          for (let x = from; x < to; x += 1) {
            if (axis === 'col') {
              if (dir === 1) cells[x]![line] = cells[x]![line - 1]!;
              else cells[x]![line - 1] = cells[x]![line]!;
            } else if (dir === 1) cells[line]![x] = cells[line - 1]![x]!;
            else cells[line - 1]![x] = cells[line]![x]!;
          }
          return { ...grid, cells };
        };
        const lowIds = [...lows].sort();
        const highIds = [...highs].sort();
        if (depth(highs) > 1) {
          out.push({
            grid: shift(1),
            move: { kind: 'wall', grown: lowIds, shrunk: highIds, added: [] },
          });
        }
        if (depth(lows) > 1) {
          out.push({
            grid: shift(-1),
            move: { kind: 'wall', grown: highIds, shrunk: lowIds, added: [] },
          });
        }
      }
    }
  }
  return out;
}

type Side = 'top' | 'bottom' | 'left' | 'right';
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

/** Dải `depth` ô của `box` sát cạnh `side`. */
function strip(box: CellBox, side: Side, depth: number): CellBox {
  if (side === 'top') return { ...box, r1: box.r0 + depth };
  if (side === 'bottom') return { ...box, r0: box.r1 - depth };
  if (side === 'left') return { ...box, c1: box.c0 + depth };
  return { ...box, c0: box.c1 - depth };
}

function minus(box: CellBox, side: Side, depth: number): CellBox {
  if (side === 'top') return { ...box, r0: box.r0 + depth };
  if (side === 'bottom') return { ...box, r1: box.r1 - depth };
  if (side === 'left') return { ...box, c0: box.c0 + depth };
  return { ...box, c1: box.c1 - depth };
}

const depthOf = (box: CellBox, side: Side) =>
  side === 'top' || side === 'bottom' ? box.r1 - box.r0 : box.c1 - box.c0;

/** Phòng lấn một dải vào hành lang kề (`notch`). */
function notchCandidates(grid: SketchGrid, boxes: Boxes, rules: RepairRules): Candidate[] {
  const out: Candidate[] = [];
  for (const [corridorId, corridor] of [...boxes].sort((p, q) => p[0].localeCompare(q[0]))) {
    if (!rules.corridor(baseId(corridorId)) || !isRect(corridor)) continue;
    if (!rules.movable(baseId(corridorId))) continue;
    for (const [roomId, room] of [...boxes].sort((p, q) => p[0].localeCompare(q[0]))) {
      if (roomId === corridorId || rules.corridor(baseId(roomId))) continue;
      if (!isRect(room) || !rules.movable(baseId(roomId))) continue;
      // Phòng áp cạnh nào của hành lang; cạnh phòng nằm trọn trên cạnh hành lang, ngắn hơn, chung một đầu.
      let side: Side | null = null;
      let lo = 0;
      let hi = 0;
      let cLo = 0;
      let cHi = 0;
      if (room.r1 === corridor.r0 || room.r0 === corridor.r1) {
        side = room.r1 === corridor.r0 ? 'top' : 'bottom';
        [lo, hi, cLo, cHi] = [room.c0, room.c1, corridor.c0, corridor.c1];
      } else if (room.c1 === corridor.c0 || room.c0 === corridor.c1) {
        side = room.c1 === corridor.c0 ? 'left' : 'right';
        [lo, hi, cLo, cHi] = [room.r0, room.r1, corridor.r0, corridor.r1];
      }
      if (!side || lo < cLo || hi > cHi || hi - lo === cHi - cLo) continue;
      if (lo !== cLo && hi !== cHi) continue;
      if (depthOf(corridor, side) < 2) continue;
      const vertical = side === 'top' || side === 'bottom';
      const taken: CellBox = vertical
        ? { ...strip(corridor, side, 1), c0: lo, c1: hi }
        : { ...strip(corridor, side, 1), r0: lo, r1: hi };
      // Hai cách tách chữ L còn lại thành hai chữ nhật: cắt vuông góc ở đầu phòng, hoặc cắt song song cách mép một ô.
      const rest = minus(corridor, side, 1);
      const beside: CellBox = vertical
        ? lo === cLo
          ? { ...corridor, c0: hi }
          : { ...corridor, c1: lo }
        : lo === cLo
          ? { ...corridor, r0: hi }
          : { ...corridor, r1: lo };
      const under: CellBox = vertical ? { ...rest, c0: lo, c1: hi } : { ...rest, r0: lo, r1: hi };
      const sliver: CellBox = vertical
        ? { ...strip(corridor, side, 1), ...(lo === cLo ? { c0: hi } : { c1: lo }) }
        : { ...strip(corridor, side, 1), ...(lo === cLo ? { r0: hi } : { r1: lo }) };
      const splits: [CellBox, CellBox][] = [
        [beside, under],
        [rest, sliver],
      ];
      const piece = nextPiece(grid, baseId(corridorId));
      for (const [keep, cut] of splits) {
        const a = { ...keep };
        const b = { ...cut };
        const [main, extra] =
          (a.c1 - a.c0) * (a.r1 - a.r0) >= (b.c1 - b.c0) * (b.r1 - b.r0) ? [a, b] : [b, a];
        if (
          !rules.shrinkOk(baseId(corridorId), main) ||
          !rules.shrinkOk(baseId(corridorId), extra)
        ) {
          continue;
        }
        const cells = copyCells(grid);
        fill(cells, taken, roomId);
        fill(cells, main, corridorId);
        fill(cells, extra, piece);
        out.push({
          grid: { ...grid, cells },
          move: { kind: 'notch', grown: [roomId], shrunk: [corridorId], added: [piece] },
        });
        break;
      }
    }
  }
  return out;
}

/** Phòng nhường một dải thành đoạn hành lang mới (`stub`), đầu dải chạm một hành lang sẵn có. */
function stubCandidates(grid: SketchGrid, boxes: Boxes, rules: RepairRules): Candidate[] {
  const out: Candidate[] = [];
  const w = rules.stubCells;
  for (const [roomId, room] of [...boxes].sort((p, q) => p[0].localeCompare(q[0]))) {
    if (rules.corridor(baseId(roomId)) || !isRect(room) || !rules.movable(baseId(roomId))) continue;
    for (const side of SIDES) {
      if (depthOf(room, side) - w < 2) continue;
      const band = strip(room, side, w);
      const left = minus(room, side, w);
      if (!rules.shrinkOk(baseId(roomId), left)) continue;
      // Đầu dải phải chạm một hành lang: hàng / cột ngay ngoài hai đầu dải.
      const vertical = side === 'left' || side === 'right';
      const ends: (string | null)[] = [];
      if (vertical) {
        for (let c = band.c0; c < band.c1; c += 1) {
          ends.push(grid.cells[band.r0 - 1]?.[c] ?? null, grid.cells[band.r1]?.[c] ?? null);
        }
      } else {
        for (let r = band.r0; r < band.r1; r += 1) {
          ends.push(grid.cells[r]?.[band.c0 - 1] ?? null, grid.cells[r]?.[band.c1] ?? null);
        }
      }
      const host = [...new Set(ends)]
        .filter((id): id is string => !!id && rules.corridor(baseId(id)))
        .sort()[0];
      if (!host) continue;
      if (!rules.shrinkOk(baseId(host), band)) continue;
      const piece = nextPiece(grid, baseId(host));
      const cells = copyCells(grid);
      fill(cells, band, piece);
      out.push({
        grid: { ...grid, cells },
        move: { kind: 'stub', grown: [], shrunk: [roomId], added: [piece] },
      });
    }
  }
  return out;
}

function less(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Math.abs(x - y) > 1e-9) return x < y;
  }
  return false;
}

/**
 * Tìm theo chùm (`beam` trạng thái tốt nhất mỗi bước; 1 = tham lam), tối đa `maxMoves` bước, dừng khi không trạng
 * thái nào tốt hơn trạng thái tốt nhất đã gặp trong `patience` bước liền. `null` khi không phép nào giảm được điểm.
 * Bên gọi tự quyết kết quả có đủ tốt không (vd lỗi đã hết) — hàm này chỉ trả lưới điểm thấp nhất tìm được.
 */
export function repairSketchGrid(grid: SketchGrid, rules: RepairRules): RepairResult | null {
  interface State {
    grid: SketchGrid;
    score: readonly number[];
    moves: RepairMove[];
    added: number;
  }
  const key = (g: SketchGrid) => g.cells.map((row) => row.join(',')).join('|');
  const start: State = { grid, score: rules.score(grid), moves: [], added: 0 };
  let best = start;
  let frontier = [start];
  const seen = new Set([key(grid)]);
  const beam = Math.max(1, rules.beam ?? 1);
  let stale = 0;
  for (let step = 0; step < rules.maxMoves && frontier.length; step += 1) {
    if (best.score.every((x) => x <= 0)) break;
    const next: State[] = [];
    for (const state of frontier) {
      const boxes = cellBoxes(state.grid);
      const candidates = [
        ...wallCandidates(state.grid, boxes, rules),
        ...(state.added < rules.maxNewCorridors
          ? [
              ...notchCandidates(state.grid, boxes, rules),
              ...stubCandidates(state.grid, boxes, rules),
            ]
          : []),
      ];
      for (const candidate of candidates) {
        const k = key(candidate.grid);
        if (seen.has(k)) continue;
        if (candidate.move.kind === 'wall') {
          const after = cellBoxes(candidate.grid);
          if (candidate.move.shrunk.some((id) => !rules.shrinkOk(baseId(id), after.get(id)!))) {
            continue;
          }
        }
        seen.add(k);
        next.push({
          grid: candidate.grid,
          score: rules.score(candidate.grid),
          moves: [...state.moves, candidate.move],
          added: state.added + candidate.move.added.length,
        });
      }
    }
    // Tham lam (`beam` 1) chỉ đi tiếp khi điểm giảm — như bản đầu; chùm rộng hơn được đi qua chỗ bằng.
    next.sort((p, q) =>
      less(p.score, q.score) ? -1 : less(q.score, p.score) ? 1 : p.moves.length - q.moves.length,
    );
    frontier = (beam === 1 ? next.filter((s) => less(s.score, frontier[0]!.score)) : next).slice(
      0,
      beam,
    );
    if (frontier[0] && less(frontier[0].score, best.score)) {
      best = frontier[0];
      stale = 0;
    } else if ((stale += 1) >= (rules.patience ?? 1)) break;
  }
  return best.moves.length ? { grid: best.grid, moves: best.moves, score: best.score } : null;
}
