/**
 * Bản phác LƯỚI của mô hình → cây chia đã đặt toạ độ (T48, 16/09/2026 — Haan chốt hướng B).
 *
 * Mô hình vẽ mỗi tầng một lưới ô khoảng một mét, mỗi ô ghi mã phòng chiếm nó (`contracts/ai-house-intent`
 * `sketches`). Lưới là dạng phác KHÔNG chồng lấn và KHÔNG sót sàn theo cấu tạo — hai lỗi cây chia có toạ
 * độ của T37 không chặn được. Tệp này là phần NẮN của bước ấy:
 *
 *   prepareSketch ─► đọc mã, nắn hàng lệch, bỏ mã lạ, bỏ mép «.» ─► vùng từng phòng
 *   sketchTrees   ─► gộp phòng thông nhau ─► lấp ô trống ─► nắn phòng về chữ nhật ─► tách chém
 *                   (guillotine) ─► ba cách căn vách: theo hình vẽ, theo diện tích, trung bình
 *
 * Cây ra đi tiếp đúng đường của mọi ứng viên khác (`arrange/index.ts`): ép mốc, lọc ô hỏng, đặt cửa theo
 * luật đi xuyên, cổng `ai/tree/`, chấm. Bản phác chỉ quyết TÔPÔ và tỉ lệ gợi ý; mọi con số vẫn do chương
 * trình gán, nên nguyên tắc 2 («mô hình không sinh kích thước») giữ ở mức một mét một ô.
 *
 * Không nắn được (phòng thiếu, phòng không về chữ nhật, bố cục chong chóng) thì trả lý do: bộ xếp lấy
 * vùng từ bản phác và xếp như T43. Lý do chỉ tới tay mô hình khi cả tầng không xếp được.
 *
 * Hàm THUẦN, tất định: mọi lựa chọn hoà có khoá cuối là mã phòng hoặc chỉ số ô.
 */

import { rectsShareEdge, type Rect } from '../draw/geometry';
import type { DrawNote } from '../draw/notes';
import type { PlanIssue } from '../plan-check';
import { zoneOfRect, type Zone } from './grid';
import { arrangeIssue } from './issues';
import { leaves, MODULE_CM, pinLeaf, type Axis, type Placed, type Side } from './placed';

/** Ô không xây. */
const EMPTY = '.';
/** Số lượt nắn phòng về chữ nhật tối đa, nhân với số phòng. */
const RESHAPE_PASSES_PER_ROOM = 3;

export interface SketchGrid {
  cols: number;
  rows: number;
  /** `cells[hàng][cột]`: hàng 0 giáp đường (y nhỏ), cột 0 bên trái nhìn từ đường. `null` = không xây. */
  cells: (string | null)[][];
}

export interface PreparedSketch {
  grid: SketchGrid;
  /** Hình bao theo tim tường, cm — đã lùi các mép toàn ô «.» khi được phép. */
  footprint: Rect;
  /** Vùng và mặt đường của từng phòng CÓ trên bản phác, suy từ chữ nhật bao các ô của nó. */
  rooms: Map<string, { zone: Zone; street: boolean }>;
  notes: DrawNote[];
}

export interface PrepareInput {
  rows: readonly string[];
  level: number;
  /** Hình bao tầng: khối xây được (tầng 1) hoặc hình bao tầng dưới (tầng trên). */
  footprint: Rect;
  /** Mã phòng của tầng này — mã khác trên bản phác bị bỏ. */
  known: ReadonlySet<string>;
  /**
   * Mép toàn ô «.»: `shrink` (tầng 1) lùi khối xây, phần bỏ là sân; `fit` (tầng trên) bỏ mép rồi co giãn
   * phần còn lại về đúng hình bao tầng dưới — mô hình vẽ mọi tầng trên cùng một lưới khối nhà, nên sân
   * tầng 1 hiện lại thành mép «.» ở tầng trên.
   */
  trim: 'shrink' | 'fit';
  /** Mặt nào của hình bao là mặt đường. */
  streetSides: readonly Side[];
}

/**
 * Đưa mọi hàng về đúng `cols` ô, thêm/bớt TỪNG ô một ở chỗ làm các phòng ít lệch khỏi chữ nhật nhất.
 *
 * Lượt đo 58688ead (16/09/2026): ba hàng giữa tầng 1 thiếu một ô. Bản cũ lặp ô CUỐI, nên ô thang ở cuối
 * hàng phình sang trái ở đúng ba hàng ấy, bị cắt phần lồi, còn 3 × 3 ô — ngắn hơn 21 bậc cần — và cả
 * bản phác bị bỏ; ba lượt sửa sau đó mô hình gửi lại y nguyên. Mô hình thường quên một ô ở GIỮA hàng,
 * nên chỗ thêm phải chọn theo các hàng đủ ô xung quanh, không mặc định ở cuối.
 *
 * Độ lệch = tổng (diện tích chữ nhật bao − số ô) của mọi phòng. Hai bước: (1) thử cùng MỘT chỗ thêm/bớt
 * cho mọi hàng lệch — mô hình thường chép lỗi xuống cả dải hàng giống nhau, và sửa từng hàng riêng thì
 * kẹt: đổi một hàng làm các hàng chưa sửa lệch thêm; (2) tinh chỉnh từng hàng, chỉ nhận khi bớt lệch.
 * Hoà thì thêm/bớt ở dải cùng mã dài nhất (méo tương đối ít nhất), rồi ô sớm hơn.
 */
export function fitRows(rows: readonly (readonly string[])[], cols: number): string[][] {
  const adjust = (row: readonly string[], at: number): string[] => {
    const next = [...row];
    while (next.length < cols) {
      const i = Math.min(at, next.length - 1);
      next.splice(i, 0, next[i]!);
    }
    while (next.length > cols) next.splice(Math.min(at, next.length - 1), 1);
    return next;
  };
  const runAt = (row: readonly string[], at: number): number => {
    const i = Math.min(at, row.length - 1);
    let from = i;
    let to = i;
    while (from > 0 && row[from - 1] === row[i]) from -= 1;
    while (to < row.length - 1 && row[to + 1] === row[i]) to += 1;
    return to - from + 1;
  };
  const uneven = rows.map((row, i) => (row.length !== cols ? i : -1)).filter((i) => i >= 0);
  const end = Math.max(cols, ...rows.map((row) => row.length));
  const pick = (
    trials: { rows: string[][]; run: number; at: number }[],
  ): { rows: string[][]; waste: number } => {
    let best: { rows: string[][]; waste: number; run: number; at: number } | null = null;
    for (const trial of trials) {
      const waste = shapeWaste(trial.rows);
      if (
        !best ||
        waste < best.waste ||
        (waste === best.waste && trial.run > best.run) ||
        (waste === best.waste && trial.run === best.run && trial.at < best.at)
      ) {
        best = { ...trial, waste };
      }
    }
    return best!;
  };

  // Bước 1: cùng một chỗ cho mọi hàng lệch. `end` = thêm/bớt ở cuối hàng (cách cũ).
  const joint = pick(
    Array.from({ length: end + 1 }, (_, at) => ({
      rows: rows.map((row, i) => (uneven.includes(i) ? adjust(row, at) : [...row])),
      run: uneven.reduce((sum, i) => sum + runAt(rows[i]!, at), 0),
      at,
    })),
  );
  let out = joint.rows;
  let waste = joint.waste;

  // Bước 2: từng hàng, chỉ nhận khi bớt lệch hẳn.
  for (const index of uneven) {
    const source = rows[index]!;
    const best = pick(
      Array.from({ length: end + 1 }, (_, at) => ({
        rows: out.map((row, i) => (i === index ? adjust(source, at) : row)),
        run: runAt(source, at),
        at,
      })),
    );
    if (best.waste < waste) {
      out = best.rows;
      waste = best.waste;
    }
  }
  return out;
}

/** Tổng số ô trong chữ nhật bao của từng mã mà không mang mã ấy. «.» không tính. */
function shapeWaste(rows: readonly (readonly string[])[]): number {
  const boxes = new Map<string, { r0: number; r1: number; c0: number; c1: number; n: number }>();
  rows.forEach((row, r) =>
    row.forEach((token, c) => {
      if (token === EMPTY || /^\.+$/.test(token)) return;
      const box = boxes.get(token);
      if (!box) {
        boxes.set(token, { r0: r, r1: r, c0: c, c1: c, n: 1 });
        return;
      }
      box.r0 = Math.min(box.r0, r);
      box.r1 = Math.max(box.r1, r);
      box.c0 = Math.min(box.c0, c);
      box.c1 = Math.max(box.c1, c);
      box.n += 1;
    }),
  );
  let waste = 0;
  for (const box of boxes.values()) waste += (box.r1 - box.r0 + 1) * (box.c1 - box.c0 + 1) - box.n;
  return waste;
}

/** Đọc, nắn hàng, bỏ mã lạ, lùi mép. `null` khi bản phác không có ô nào đọc được. */
export function prepareSketch(input: PrepareInput): PreparedSketch | null {
  const notes: DrawNote[] = [];
  const where = `tầng ${input.level}`;
  const tokenRows = input.rows
    .map((row) => row.trim().split(/\s+/).filter(Boolean))
    .filter((row) => row.length > 0);
  if (!tokenRows.length) return null;

  // Hàng dài ngắn khác nhau: lấy bề ngang gặp nhiều nhất (hoà thì rộng hơn), nắn hàng lệch ở chỗ ít
  // làm méo phòng nhất (`fitRows`).
  const counts = new Map<number, number>();
  for (const row of tokenRows) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
  const cols = [...counts].sort((p, q) => q[1] - p[1] || q[0] - p[0])[0]![0];
  const reshaped = tokenRows.filter((row) => row.length !== cols).length;
  const unknown = new Set<string>();
  const cells = fitRows(tokenRows, cols).map((fitted) => {
    return fitted.map((token) => {
      if (token === EMPTY || /^\.+$/.test(token)) return null;
      if (input.known.has(token)) return token;
      unknown.add(token);
      return null;
    });
  });
  if (reshaped) {
    notes.push({
      code: 'sketch_row_length',
      message: `Bản phác ${where} có ${reshaped} hàng không đủ ${cols} ô — chương trình thêm hoặc bớt ô ở chỗ giữ phòng vuông vức nhất.`,
    });
  }
  if (unknown.size) {
    notes.push({
      code: 'sketch_unknown_room',
      message: `Bản phác ${where} ghi mã không phải phòng của tầng này (${[...unknown].sort().join(', ')}) — coi là ô trống.`,
    });
  }

  let grid: SketchGrid = { cols, rows: cells.length, cells };
  const full = input.footprint;
  const edgeX = (c: number) => full.x0 + ((full.x1 - full.x0) * c) / grid.cols;
  const edgeY = (r: number) => full.y0 + ((full.y1 - full.y0) * r) / grid.rows;
  let footprint = full;
  const rowUsed = (r: number) => grid.cells[r]!.some((cell) => cell !== null);
  const colUsed = (c: number) => grid.cells.some((row) => row[c] !== null);
  let r0 = 0;
  let r1 = grid.rows;
  let c0 = 0;
  let c1 = grid.cols;
  while (r0 < r1 && !rowUsed(r0)) r0 += 1;
  while (r1 > r0 && !rowUsed(r1 - 1)) r1 -= 1;
  while (c0 < c1 && !colUsed(c0)) c0 += 1;
  while (c1 > c0 && !colUsed(c1 - 1)) c1 -= 1;
  if (r0 >= r1 || c0 >= c1) return null;
  if (r0 > 0 || c0 > 0 || r1 < grid.rows || c1 < grid.cols) {
    if (input.trim === 'shrink') {
      footprint = {
        x0: c0 === 0 ? full.x0 : snap(edgeX(c0)),
        y0: r0 === 0 ? full.y0 : snap(edgeY(r0)),
        x1: c1 === grid.cols ? full.x1 : snap(edgeX(c1)),
        y1: r1 === grid.rows ? full.y1 : snap(edgeY(r1)),
      };
      notes.push({
        code: 'sketch_trimmed',
        message: `Bản phác ${where} để trống mép khối nhà — chương trình lùi khối xây còn ${round1((footprint.x1 - footprint.x0) / 100)} × ${round1((footprint.y1 - footprint.y0) / 100)} m, phần còn lại là sân.`,
      });
    }
    grid = {
      cols: c1 - c0,
      rows: r1 - r0,
      cells: grid.cells.slice(r0, r1).map((row) => row.slice(c0, c1)),
    };
  }

  const rooms = new Map<string, { zone: Zone; street: boolean }>();
  for (const [id, box] of boxes(grid)) {
    const rect = cellRect(grid, footprint, box);
    rooms.set(id, {
      zone: zoneOfRect(footprint, rect),
      street: input.streetSides.some((side) => rect[side] === footprint[side]),
    });
  }
  return { grid, footprint, rooms, notes };
}

export interface SketchTreeInput {
  sketch: PreparedSketch;
  level: number;
  /** Mã phòng → mã LÁ chứa nó (phòng thông nhau gộp một lá). */
  hostOf: ReadonlyMap<string, string>;
  /** Mã mọi lá của tầng, theo thứ tự chương trình. */
  leaves: readonly string[];
  /** Tỉ trọng diện tích của một lá — cùng số bộ chia ô dùng. */
  weight: (leafId: string) => number;
  /** Cạnh ô nhỏ nhất theo tim tường, cm. */
  minCell: number;
  /**
   * Cạnh NHỎ NHẤT của một lá theo trục, cm — chỗ căn vách phải chừa. `box` là chữ nhật lá đang vẽ,
   * đổi sang cm theo lưới, để bên gọi biết lá đang nằm dọc hay nằm ngang (ô thang đi lên theo cạnh
   * dài của nó). Vắng: mọi lá lấy `minCell`.
   */
  minExtent?: (leafId: string, axis: Axis, box: { w: number; h: number }) => number;
  /**
   * Diện tích theo TIM TƯỜNG một lá phải đạt, cm² — sàn đầu bài khai cộng phần tường. 0 = không có mức.
   * Căn vách chừa sẵn chỗ ấy: ba cách căn của lượt 58d9ff66 hỏng lần lượt vì phòng khách hụt 8 m², phòng
   * ngủ hụt 26 cm², và cổng chỉ biết bác chứ không dời được vách.
   */
  needArea?: (leafId: string) => number;
  /** Tỉ lệ dài/rộng lọt lòng tối đa DÙNG ĐƯỢC của một lá; `null` = không áp. */
  maxAspect?: (leafId: string) => number | null;
  /** Mã phòng mẹ của một lá khép kín; `null` khi lá đứng riêng. */
  ensuiteOf?: (leafId: string) => string | null;
  /** Dòng gỡ lỗi — chỉ phép thử dùng. */
  trace?: (line: string) => void;
}

export interface SketchTrees {
  trees: { key: string; placed: Placed }[];
  notes: DrawNote[];
  /** Lý do không dựng được cây nào — rỗng khi `trees` có. */
  issues: PlanIssue[];
}

/** Nắn bản phác thành cây chia, ba cách căn vách. */
export function sketchTrees(input: SketchTreeInput): SketchTrees {
  const notes: DrawNote[] = [];
  const where = `tầng ${input.level}`;
  const { footprint } = input.sketch;
  const leafSet = new Set(input.leaves);
  const cells = input.sketch.grid.cells.map((row) =>
    row.map((id) => {
      if (id === null) return null;
      const host = input.hostOf.get(id) ?? id;
      return leafSet.has(host) ? host : null;
    }),
  );
  const grid: SketchGrid = { ...input.sketch.grid, cells };

  const holes = fillHoles(grid, new Set());
  if (holes > 0) {
    notes.push({
      code: 'sketch_hole_filled',
      message: `Bản phác ${where} để trống ${holes} ô giữa nhà — chương trình nhập vào phòng bên cạnh.`,
    });
  }

  const islands = islandsToStrips(grid, (id, host) => input.ensuiteOf?.(id) === host);
  if (islands.moved.length) {
    notes.push({
      code: 'sketch_island',
      message: `Bản phác ${where}: phòng khép kín ${islands.moved.map((entry) => `"${entry.id}" vẽ lọt giữa "${entry.host}"`).join(', ')} — chương trình chuyển thành dải áp một cạnh phòng mẹ.`,
    });
  }
  if (islands.stuck.length) {
    return {
      trees: [],
      notes,
      issues: [
        arrangeIssue(
          'sketch_island_room',
          `Bản phác ${where} vẽ ${islands.stuck.map((entry) => `"${entry.id}" lọt hẳn trong "${entry.host}"`).join(', ')} — phòng ấy không có cách nào ra ngoài.`,
          { rooms: islands.stuck.map((entry) => entry.id).join(', ') },
        ),
      ],
    };
  }

  const reshaped = rectangularise(grid, input.leaves.length);
  if (input.trace) {
    const short = new Map(
      [...boxes(grid).keys()].map((id, i) => [id, String.fromCharCode(97 + i)]),
    );
    for (const row of grid.cells) {
      input.trace(
        `    | ${row.map((id) => (id === null ? '.' : (short.get(id) ?? '?'))).join(' ')}`,
      );
    }
    input.trace(`    | ${[...short].map(([id, c]) => `${c}=${id}`).join(' ')}`);
    const f = input.sketch.footprint;
    for (const [id, box] of boxes(grid)) {
      const cm = {
        w: ((f.x1 - f.x0) * (box.c1 - box.c0)) / grid.cols,
        h: ((f.y1 - f.y0) * (box.r1 - box.r0)) / grid.rows,
      };
      input.trace(
        `    · ${id} ô ${box.c0}-${box.c1}×${box.r0}-${box.r1} (${countCells(grid, id)}/${area(box)}) vẽ ${Math.round(cm.w)}×${Math.round(cm.h)} cần x≥${input.minExtent?.(id, 'x', cm) ?? 0} y≥${input.minExtent?.(id, 'y', cm) ?? 0} sàn ${Math.round((input.needArea?.(id) ?? 0) / 100)} dm²`,
      );
    }
  }
  const shapes = boxes(grid);
  const crooked = [...shapes].filter(([id, box]) => area(box) !== countCells(grid, id));
  if (crooked.length) {
    return {
      trees: [],
      notes,
      issues: [
        arrangeIssue(
          'sketch_not_rectangular',
          `Bản phác ${where}: phòng ${crooked.map(([id]) => `"${id}"`).join(', ')} không nắn được về hình chữ nhật.`,
          { rooms: crooked.map(([id]) => id).join(', ') },
        ),
      ],
    };
  }
  if (reshaped.length) {
    notes.push({
      code: 'sketch_reshaped',
      message: `Bản phác ${where}: phòng ${reshaped.map((id) => `"${id}"`).join(', ')} không phải chữ nhật — chương trình cắt phần lồi, nhập vào phòng bên cạnh.`,
    });
  }

  const missing = input.leaves.filter((id) => !shapes.has(id));
  if (missing.length) {
    return {
      trees: [],
      notes,
      issues: [
        arrangeIssue(
          'sketch_room_missing',
          `Bản phác ${where} không vẽ phòng ${missing.map((id) => `"${id}"`).join(', ')}.`,
          { rooms: missing.join(', ') },
        ),
      ],
    };
  }

  const root = guillotine(grid, { c0: 0, r0: 0, c1: grid.cols, r1: grid.rows });
  if (!root) {
    return {
      trees: [],
      notes,
      issues: [
        arrangeIssue(
          'sketch_pinwheel',
          `Bản phác ${where} xếp phòng kiểu chong chóng — không có đường chia nào chạy suốt mà không cắt qua phòng.`,
          {},
        ),
      ],
    };
  }

  const trees: { key: string; placed: Placed }[] = [];
  const seen = new Set<string>();
  for (const mode of SIZING_MODES) {
    const sized = place(root, footprint, mode, input);
    if (!sized) continue;
    const placed = repair(sized, input);
    const signature = JSON.stringify(placed);
    if (seen.has(signature)) continue;
    seen.add(signature);
    trees.push({ key: `phac-${mode}`, placed });
  }
  if (!trees.length) {
    return {
      trees,
      notes,
      issues: [
        arrangeIssue(
          'sketch_rooms_too_small',
          `Bản phác ${where} xếp quá nhiều phòng trên một đường chia — khối nhà không đủ chỗ cho ô nhỏ nhất của từng phòng.`,
          {},
        ),
      ],
    };
  }
  return { trees, notes, issues: [] };
}

// ── Lưới ────────────────────────────────────────────────────────────────────────────────

interface Box {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

function boxes(grid: SketchGrid): Map<string, Box> {
  const out = new Map<string, Box>();
  grid.cells.forEach((row, r) =>
    row.forEach((id, c) => {
      if (id === null) return;
      const box = out.get(id);
      if (!box) out.set(id, { c0: c, r0: r, c1: c + 1, r1: r + 1 });
      else {
        box.c0 = Math.min(box.c0, c);
        box.r0 = Math.min(box.r0, r);
        box.c1 = Math.max(box.c1, c + 1);
        box.r1 = Math.max(box.r1, r + 1);
      }
    }),
  );
  return new Map([...out].sort((p, q) => p[0].localeCompare(q[0])));
}

function area(box: Box): number {
  return (box.c1 - box.c0) * (box.r1 - box.r0);
}

function countCells(grid: SketchGrid, id: string): number {
  return grid.cells.reduce((sum, row) => sum + row.filter((cell) => cell === id).length, 0);
}

function cellRect(grid: SketchGrid, footprint: Rect, box: Box): Rect {
  const w = footprint.x1 - footprint.x0;
  const h = footprint.y1 - footprint.y0;
  return {
    x0: footprint.x0 + (w * box.c0) / grid.cols,
    y0: footprint.y0 + (h * box.r0) / grid.rows,
    x1: footprint.x0 + (w * box.c1) / grid.cols,
    y1: footprint.y0 + (h * box.r1) / grid.rows,
  };
}

const NEIGHBOURS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

/**
 * Lấp ô `null` bằng phòng kề — ưu tiên phòng mà ô nằm TRONG chữ nhật bao của nó (lấp khuyết, giữ chữ
 * nhật), rồi phòng kề nhiều cạnh nhất, hoà thì mã nhỏ. `exclude[ô]` = phòng không được nhận lại ô ấy.
 * Trả số ô đã lấp.
 */
function fillHoles(grid: SketchGrid, exclude: ReadonlySet<string>): number {
  let filled = 0;
  for (;;) {
    const box = boxes(grid);
    let progress = false;
    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        if (grid.cells[r]![c] !== null) continue;
        const tally = new Map<string, number>();
        for (const [dr, dc] of NEIGHBOURS) {
          const id = grid.cells[r + dr]?.[c + dc];
          if (id && !exclude.has(`${r},${c},${id}`)) tally.set(id, (tally.get(id) ?? 0) + 1);
        }
        if (!tally.size) continue;
        const inside = (id: string) => {
          const b = box.get(id);
          return b && r >= b.r0 && r < b.r1 && c >= b.c0 && c < b.c1 ? 1 : 0;
        };
        const pick = [...tally].sort(
          (p, q) => inside(q[0]) - inside(p[0]) || q[1] - p[1] || p[0].localeCompare(q[0]),
        )[0]![0];
        grid.cells[r]![c] = pick;
        filled += 1;
        progress = true;
      }
    }
    if (!progress) return filled;
  }
}

/**
 * Phòng vẽ thành ĐẢO — mọi ô kề nó đều của MỘT phòng khác và nó không chạm mép lưới — chuyển thành DẢI
 * áp cạnh gần nhất của phòng mẹ, sâu vừa đủ giữ số ô cũ. Trả các cặp đã chuyển.
 *
 * Vì sao cần: lượt đo 58d9ff66 (16/09/2026, gpt-5) vẽ WC khép kín, kho và WC chung lọt giữa phòng ngủ
 * ông bà. Cây chia không dựng được một phòng có lỗ ở giữa, còn bước nắn chữ nhật thì cắt mất phòng đảo.
 * Trên mặt bằng thật, WC khép kín luôn là một dải áp một cạnh phòng — đúng thứ bộ xếp vẫn dựng.
 */
function islandsToStrips(
  grid: SketchGrid,
  isEnsuite: (id: string, host: string) => boolean,
): { moved: { id: string; host: string }[]; stuck: { id: string; host: string }[] } {
  const moved: { id: string; host: string }[] = [];
  const stuck: { id: string; host: string }[] = [];
  for (;;) {
    const found = findIsland(grid, new Set(stuck.map((entry) => entry.id)));
    if (!found) return { moved, stuck };
    if (!isEnsuite(found.id, found.host)) {
      // Phòng không khép kín mà vẽ lọt giữa phòng khác là lỗi BỐ CỤC của mô hình, không phải chỗ
      // chương trình nắn hộ: đẩy nó ra cạnh nào cũng là tự đặt lại mặt bằng. Lượt 58d9ff66 vẽ WC chung
      // và kho nằm giữa phòng ngủ ông bà.
      stuck.push({ id: found.id, host: found.host });
      continue;
    }
    const { id, host, box, hostBox } = found;
    const cells = countCells(grid, id);
    // Cạnh gần nhất của phòng mẹ: đo từ chữ nhật bao của đảo tới bốn cạnh.
    const sides = [
      { side: 'r0' as const, gap: box.r0 - hostBox.r0 },
      { side: 'r1' as const, gap: hostBox.r1 - box.r1 },
      { side: 'c0' as const, gap: box.c0 - hostBox.c0 },
      { side: 'c1' as const, gap: hostBox.c1 - box.c1 },
    ].sort((p, q) => p.gap - q.gap || p.side.localeCompare(q.side));
    const horizontal = sides[0]!.side.startsWith('r');
    const span = horizontal ? hostBox.c1 - hostBox.c0 : hostBox.r1 - hostBox.r0;
    const depthMax = (horizontal ? hostBox.r1 - hostBox.r0 : hostBox.c1 - hostBox.c0) - 1;
    const depth = Math.max(1, Math.min(depthMax, Math.round(cells / Math.max(1, span))));
    const strip: Box =
      sides[0]!.side === 'r0'
        ? { ...hostBox, r1: hostBox.r0 + depth }
        : sides[0]!.side === 'r1'
          ? { ...hostBox, r0: hostBox.r1 - depth }
          : sides[0]!.side === 'c0'
            ? { ...hostBox, c1: hostBox.c0 + depth }
            : { ...hostBox, c0: hostBox.c1 - depth };
    for (let r = hostBox.r0; r < hostBox.r1; r += 1) {
      for (let c = hostBox.c0; c < hostBox.c1; c += 1) {
        if (grid.cells[r]![c] !== id && grid.cells[r]![c] !== host) continue;
        const inStrip = r >= strip.r0 && r < strip.r1 && c >= strip.c0 && c < strip.c1;
        grid.cells[r]![c] = inStrip ? id : host;
      }
    }
    moved.push({ id, host });
    if (moved.length > grid.rows * grid.cols) return { moved, stuck };
  }
}

/** Phòng đầu tiên bị MỘT phòng khác bao kín, kèm chữ nhật bao của cả hai; `null` khi không có. */
function findIsland(
  grid: SketchGrid,
  skip: ReadonlySet<string>,
): { id: string; host: string; box: Box; hostBox: Box } | null {
  const all = boxes(grid);
  for (const [id, box] of all) {
    if (skip.has(id)) continue;
    if (box.r0 === 0 || box.c0 === 0 || box.r1 === grid.rows || box.c1 === grid.cols) continue;
    const around = new Set<string>();
    for (let r = box.r0; r < box.r1; r += 1) {
      for (let c = box.c0; c < box.c1; c += 1) {
        if (grid.cells[r]![c] !== id) around.add(grid.cells[r]![c] ?? '');
        for (const [dr, dc] of NEIGHBOURS) {
          const other = grid.cells[r + dr]?.[c + dc];
          if (other !== undefined && other !== id) around.add(other ?? '');
        }
      }
    }
    if (around.size !== 1) continue;
    const host = [...around][0]!;
    const hostBox = all.get(host);
    if (!host || !hostBox) continue;
    // Đảo nằm TRONG chữ nhật bao của phòng mẹ. Một phòng mẹ có thể ôm nhiều đảo (lượt 58d9ff66 ôm cả
    // kho lẫn WC chung), nên không đòi phòng mẹ chỉ hở đúng chỗ một đảo.
    if (box.r0 < hostBox.r0 || box.c0 < hostBox.c0 || box.r1 > hostBox.r1 || box.c1 > hostBox.c1) {
      continue;
    }
    return { id, host, box, hostBox };
  }
  return null;
}

/**
 * Ép một phòng về ĐÚNG một chữ nhật theo tim tường (ô thang tầng trên phải chồng khít tầng dưới, T38).
 * Ô cũ của phòng ấy thành ô trống rồi được phòng kề lấp. Trả `true` khi bản phác có đổi.
 */
export function forceSketchRect(sketch: PreparedSketch, id: string, rect: Rect): boolean {
  const { grid } = sketch;
  const { c0, c1, r0, r1 } = cellBox(sketch, rect);
  let changed = false;
  for (let r = 0; r < grid.rows; r += 1) {
    for (let c = 0; c < grid.cols; c += 1) {
      const want = r >= r0 && r < r1 && c >= c0 && c < c1;
      const has = grid.cells[r]![c] === id;
      if (want === has) continue;
      grid.cells[r]![c] = want ? id : null;
      changed = true;
    }
  }
  if (changed) fillHoles(grid, new Set());
  return changed;
}

/** Ô lưới (0-based, cận trên loại trừ) mà `forceSketchRect` sẽ ép — để câu nhắc nói đúng hàng, cột. */
export function forcedCellBox(sketch: PreparedSketch, rect: Rect): Box {
  return cellBox(sketch, rect);
}

/** Mã các phòng đang có ít nhất một ô trên bản phác. */
export function sketchIds(sketch: PreparedSketch): Set<string> {
  const ids = new Set<string>();
  for (const row of sketch.grid.cells) for (const id of row) if (id) ids.add(id);
  return ids;
}

/** Ô lưới mà một chữ nhật theo tim tường phủ — cùng phép làm tròn cho mọi chỗ ép ô. */
function cellBox(sketch: PreparedSketch, rect: Rect): Box {
  const { grid, footprint } = sketch;
  const w = (footprint.x1 - footprint.x0) / grid.cols;
  const h = (footprint.y1 - footprint.y0) / grid.rows;
  const c0 = Math.max(0, Math.min(grid.cols - 1, Math.round((rect.x0 - footprint.x0) / w)));
  const c1 = Math.max(c0 + 1, Math.min(grid.cols, Math.round((rect.x1 - footprint.x0) / w)));
  const r0 = Math.max(0, Math.min(grid.rows - 1, Math.round((rect.y0 - footprint.y0) / h)));
  const r1 = Math.max(r0 + 1, Math.min(grid.rows, Math.round((rect.y1 - footprint.y0) / h)));
  return { c0, r0, c1, r1 };
}

/** Chữ nhật bao của một phòng trên bản phác, theo tim tường (cm). `null` khi phòng không còn ô nào. */
export function sketchRectOf(sketch: PreparedSketch, id: string): Rect | null {
  const box = boxes(sketch.grid).get(id);
  return box ? boxRect(sketch, box) : null;
}

function boxRect(sketch: PreparedSketch, box: Box): Rect {
  const { grid, footprint } = sketch;
  const w = (footprint.x1 - footprint.x0) / grid.cols;
  const h = (footprint.y1 - footprint.y0) / grid.rows;
  return {
    x0: footprint.x0 + box.c0 * w,
    x1: footprint.x0 + box.c1 * w,
    y0: footprint.y0 + box.r0 * h,
    y1: footprint.y0 + box.r1 * h,
  };
}

export interface WetStackInput {
  /** Ô khu vệ sinh của tầng dưới, theo tim tường. */
  below: readonly Rect[];
  /** Mã khu vệ sinh của tầng này. */
  wet: readonly string[];
  /** Lá phòng mẹ khi đây là phòng khép kín; `null` khi không phải. */
  parentOf: (id: string) => string | null;
  /** Sàn lọt lòng tối thiểu đầu bài khai, m²; `null` khi đầu bài không khai. */
  areaFloor: (id: string) => number | null;
  /** Bề dày tường dùng để ước lọt lòng, cm. */
  wallCm: number;
}

/**
 * Nới một phòng thêm MỘT dải ô (một hàng hoặc một cột) lấy của phòng kề (T79). Dải phải là trọn một
 * hàng / cột của phòng cho, để cả hai vẫn là chữ nhật; phòng cho phải còn ít nhất một hàng / cột.
 * `spare(other, remainingCells)` trả phần dư của phòng cho sau khi mất dải (chọn phòng dư nhiều nhất),
 * `null` = không được lấy của phòng ấy (ô lõi, hành lang, phòng sẽ hụt). `null` khi không có dải nào.
 */
export function growSketchRoom(
  sketch: PreparedSketch,
  id: string,
  spare: (other: string, remainingCells: number) => number | null,
): { sketch: PreparedSketch; from: string; cells: number } | null {
  const { grid } = sketch;
  const all = boxes(grid);
  const box = all.get(id);
  if (!box) return null;
  const options: { cells: [number, number][]; from: string; score: number }[] = [];
  const consider = (cells: [number, number][], axis: 'row' | 'col') => {
    if (!cells.length) return;
    if (cells.some(([r, c]) => r < 0 || r >= grid.rows || c < 0 || c >= grid.cols)) return;
    const ids = new Set(cells.map(([r, c]) => grid.cells[r]![c]));
    if (ids.size !== 1) return;
    const from = [...ids][0];
    if (!from || from === id) return;
    const fb = all.get(from);
    if (!fb) return;
    const whole =
      axis === 'row'
        ? fb.c0 === box.c0 && fb.c1 === box.c1 && fb.r1 - fb.r0 >= 2
        : fb.r0 === box.r0 && fb.r1 === box.r1 && fb.c1 - fb.c0 >= 2;
    if (!whole) return;
    const remaining = (fb.c1 - fb.c0) * (fb.r1 - fb.r0) - cells.length;
    const score = spare(from, remaining);
    if (score === null) return;
    options.push({ cells, from, score });
  };
  const cols: number[] = [];
  for (let c = box.c0; c < box.c1; c += 1) cols.push(c);
  const rows: number[] = [];
  for (let r = box.r0; r < box.r1; r += 1) rows.push(r);
  consider(
    cols.map((c) => [box.r0 - 1, c]),
    'row',
  );
  consider(
    cols.map((c) => [box.r1, c]),
    'row',
  );
  consider(
    rows.map((r) => [r, box.c0 - 1]),
    'col',
  );
  consider(
    rows.map((r) => [r, box.c1]),
    'col',
  );
  if (!options.length) return null;
  options.sort((p, q) => q.score - p.score || p.from.localeCompare(q.from));
  const pick = options[0]!;
  const copy = copySketch(sketch);
  for (const [r, c] of pick.cells) copy.grid.cells[r]![c] = id;
  return { sketch: copy, from: pick.from, cells: pick.cells.length };
}

/** Bản sao dùng riêng, để thử một cách chia khác mà không đụng bản gốc. */
export function copySketch(sketch: PreparedSketch): PreparedSketch {
  return {
    grid: { ...sketch.grid, cells: sketch.grid.cells.map((row) => [...row]) },
    footprint: { ...sketch.footprint },
    rooms: new Map(sketch.rooms),
    notes: [...sketch.notes],
  };
}

/**
 * Ép ô khu vệ sinh tầng trên về ĐÚNG ô khu vệ sinh tầng dưới, để trục ống nước thẳng (Q-B, 18/09/2026 —
 * Haan chốt «dời vách tầng trên»). Sửa TẠI CHỖ, trả mã những phòng đã dời.
 *
 * Vì sao phải dời vách chứ không nhắc thêm một lần nữa: ba tầng nhắc đã có sẵn — lời dẫn «Wet rooms sit
 * above wet rooms», khoản phạt `wet` ở bộ xếp, tiêu chí chấm E2 kèm dòng gợi ý sửa — mà đo thật trên
 * mọi bản đã lưu (`3bc3d2ed` và cả bốn bản phác `58688ead`) đều ra E2 = 0. Nâng trọng số phạt 1 → 5
 * không đổi ca nào: chỗ quyết là chính bản phác tầng trên, đúng như ô thang (T38).
 *
 * Khác ô thang ở chỗ KHÔNG ép thẳng lên bản phác đang dùng: đo 18/09/2026 trên bốn bản phác thật của
 * lượt `58688ead` và bản `fd3b0b86`, khu vệ sinh tầng trên nằm cách khu vệ sinh tầng dưới 4–6 m, nên
 * đây là dời cả phòng chứ không phải dịch một vách — làm hỏng bố cục là chuyện có thật. Bên gọi dựng
 * bản phác thứ hai bằng `copySketch` rồi cho cả hai đi qua cổng; bản nào ra mặt bằng tốt hơn thì thắng.
 *
 * Ghép theo tâm gần nhất, mỗi ô tầng dưới nhận nhiều nhất một phòng. Ba điều kiện để không làm hỏng
 * tầng: phòng khép kín phải còn chung vách với phòng mẹ, phòng không tụt dưới sàn đầu bài khai, và
 * không phòng nào bị lấy hết ô.
 */
export function stackWetRooms(sketch: PreparedSketch, input: WetStackInput): string[] {
  const moved: string[] = [];
  const usedRect = new Set<number>();
  const skip = new Set<string>();
  for (;;) {
    const all = boxes(sketch.grid);
    let best: { id: string; to: Rect; gap: number; index: number } | null = null;
    for (const id of [...input.wet].sort()) {
      if (moved.includes(id) || skip.has(id)) continue;
      const box = all.get(id);
      if (!box) continue;
      const now = boxRect(sketch, box);
      input.below.forEach((to, index) => {
        if (usedRect.has(index)) return;
        const gap = Math.hypot(
          (now.x0 + now.x1) / 2 - (to.x0 + to.x1) / 2,
          (now.y0 + now.y1) / 2 - (to.y0 + to.y1) / 2,
        );
        if (!best || gap < best.gap || (gap === best.gap && id < best.id)) {
          best = { id, to, gap, index };
        }
      });
    }
    if (!best) return moved;
    const { id, to, index } = best;
    if (!snapKeepsLevel(sketch, all, id, to, input)) {
      skip.add(id);
      continue;
    }
    usedRect.add(index);
    if (forceSketchRect(sketch, id, to)) moved.push(id);
    else skip.add(id);
  }
}

/** Ba điều kiện của `stackWetRooms` — đọc trên bản phác TRƯỚC khi ép. */
function snapKeepsLevel(
  sketch: PreparedSketch,
  all: Map<string, Box>,
  id: string,
  to: Rect,
  input: WetStackInput,
): boolean {
  const parent = input.parentOf(id);
  if (parent) {
    const box = all.get(parent);
    if (!box || !rectsShareEdge(to, boxRect(sketch, box))) return false;
  }
  const floor = input.areaFloor(id);
  if (floor !== null) {
    const clear =
      (Math.max(0, to.x1 - to.x0 - input.wallCm) * Math.max(0, to.y1 - to.y0 - input.wallCm)) /
      10_000;
    if (clear < floor) return false;
  }
  const box = cellBox(sketch, to);
  const left = new Map<string, number>();
  for (let r = 0; r < sketch.grid.rows; r += 1) {
    for (let c = 0; c < sketch.grid.cols; c += 1) {
      const cell = sketch.grid.cells[r]![c] ?? null;
      if (cell === null || cell === id) continue;
      const taken = r >= box.r0 && r < box.r1 && c >= box.c0 && c < box.c1;
      left.set(cell, (left.get(cell) ?? 0) + (taken ? 0 : 1));
    }
  }
  return [...left.values()].every((count) => count > 0);
}

/**
 * Nắn phòng không chữ nhật: giữ chữ nhật LỚN NHẤT gồm toàn ô của nó, trả phần lồi cho phòng kề (không
 * trả lại chính nó). Lặp tới khi mọi phòng là chữ nhật hoặc hết lượt. Trả mã các phòng đã nắn.
 */
function rectangularise(grid: SketchGrid, rooms: number): string[] {
  const touched = new Set<string>();
  const exclude = new Set<string>();
  const passes = Math.max(1, rooms) * RESHAPE_PASSES_PER_ROOM;
  for (let pass = 0; pass < passes; pass += 1) {
    const crooked = [...boxes(grid)]
      .map(([id, box]) => ({ id, deficit: area(box) - countCells(grid, id) }))
      .filter((entry) => entry.deficit > 0)
      .sort((p, q) => q.deficit - p.deficit || p.id.localeCompare(q.id));
    if (!crooked.length) break;
    const { id } = crooked[0]!;
    // Cách 1: cho phòng ăn trọn khung bao của nó, nếu mọi phòng nhường ô vẫn còn là chữ nhật và không
    // biến mất. Một ô thò sang cột bên (lượt 58d9ff66: phòng ngủ chính) nắn bằng cách cắt thì quay
    // vòng — phòng nhận ô lại thành lồi và trả về.
    if (expandToBox(grid, id)) {
      touched.add(id);
      continue;
    }
    const keep = largestRectangle(grid, id);
    touched.add(id);
    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        if (grid.cells[r]![c] !== id) continue;
        if (r >= keep.r0 && r < keep.r1 && c >= keep.c0 && c < keep.c1) continue;
        grid.cells[r]![c] = null;
        exclude.add(`${r},${c},${id}`);
      }
    }
    fillHoles(grid, exclude);
    // Ô không phòng nào khác nhận được (phòng bị bao kín) thì trả lại: thà còn một phòng lồi, bộ xếp
    // lấy vùng từ bản phác, còn hơn một ô trống giữa nhà.
    for (let r = 0; r < grid.rows; r += 1) {
      for (let c = 0; c < grid.cols; c += 1) {
        if (grid.cells[r]![c] === null && exclude.has(`${r},${c},${id}`)) grid.cells[r]![c] = id;
      }
    }
  }
  return [...touched].sort();
}

/**
 * Cho phòng `id` ăn trọn chữ nhật bao của nó. Chỉ nhận khi mọi phòng bị lấy ô vẫn là chữ nhật đầy và
 * còn ít nhất một ô. Trả `true` khi đã đổi.
 */
function expandToBox(grid: SketchGrid, id: string): boolean {
  const box = boxes(grid).get(id);
  if (!box) return false;
  const before = grid.cells.map((row) => [...row]);
  const donors = new Set<string>();
  for (let r = box.r0; r < box.r1; r += 1) {
    for (let c = box.c0; c < box.c1; c += 1) {
      const cell = grid.cells[r]![c] ?? null;
      if (cell === id) continue;
      if (cell !== null) donors.add(cell);
      grid.cells[r]![c] = id;
    }
  }
  const after = boxes(grid);
  const ok = [...donors].every((donor) => {
    const donorBox = after.get(donor);
    return donorBox !== undefined && area(donorBox) === countCells(grid, donor);
  });
  if (ok) return true;
  grid.cells.splice(0, grid.cells.length, ...before);
  return false;
}

/** Chữ nhật lớn nhất gồm toàn ô `id` — thuật toán cột chồng theo từng hàng. Hoà thì ô trên-trái trước. */
function largestRectangle(grid: SketchGrid, id: string): Box {
  const heights = new Array<number>(grid.cols).fill(0);
  let best: Box = { c0: 0, r0: 0, c1: 0, r1: 0 };
  let bestArea = 0;
  for (let r = 0; r < grid.rows; r += 1) {
    for (let c = 0; c < grid.cols; c += 1) {
      heights[c] = grid.cells[r]![c] === id ? heights[c]! + 1 : 0;
    }
    for (let c = 0; c < grid.cols; c += 1) {
      let minHeight = Infinity;
      for (let end = c; end < grid.cols && heights[end]! > 0; end += 1) {
        minHeight = Math.min(minHeight, heights[end]!);
        const size = minHeight * (end - c + 1);
        if (size > bestArea) {
          bestArea = size;
          best = { c0: c, r0: r - minHeight + 1, c1: end + 1, r1: r + 1 };
        }
      }
    }
  }
  return best;
}

// ── Cây ─────────────────────────────────────────────────────────────────────────────────

type GridNode =
  | { kind: 'leaf'; id: string; box: Box }
  | { kind: 'cut'; axis: Axis; k: number; a: GridNode; b: GridNode; box: Box };

/**
 * Tách chém: tìm đường lưới chạy suốt vùng mà không cắt qua phòng nào. Ưu tiên đường ngang (chia dải
 * trước–sau, cách nhà Việt vẫn xếp), trong cùng trục chọn đường gần giữa nhất. `null` = chong chóng.
 */
function guillotine(grid: SketchGrid, box: Box): GridNode | null {
  const ids = new Set<string>();
  for (let r = box.r0; r < box.r1; r += 1) {
    for (let c = box.c0; c < box.c1; c += 1) ids.add(grid.cells[r]![c]!);
  }
  if (ids.size === 1) return { kind: 'leaf', id: [...ids][0]!, box };
  for (const axis of ['y', 'x'] as const) {
    const lo = axis === 'y' ? box.r0 : box.c0;
    const hi = axis === 'y' ? box.r1 : box.c1;
    const middle = (lo + hi) / 2;
    const lines = Array.from({ length: hi - lo - 1 }, (_, i) => lo + i + 1).sort(
      (p, q) => Math.abs(p - middle) - Math.abs(q - middle) || p - q,
    );
    for (const k of lines) {
      if (!clean(grid, box, axis, k)) continue;
      const [ba, bb]: [Box, Box] =
        axis === 'y'
          ? [
              { ...box, r1: k },
              { ...box, r0: k },
            ]
          : [
              { ...box, c1: k },
              { ...box, c0: k },
            ];
      const a = guillotine(grid, ba);
      const b = a ? guillotine(grid, bb) : null;
      if (a && b) return { kind: 'cut', axis, k, a, b, box };
    }
  }
  return null;
}

/** Đường lưới `k` theo trục không có phòng nào nằm cả hai bên trong vùng. */
function clean(grid: SketchGrid, box: Box, axis: Axis, k: number): boolean {
  const before = new Set<string>();
  const after = new Set<string>();
  for (let r = box.r0; r < box.r1; r += 1) {
    for (let c = box.c0; c < box.c1; c += 1) {
      const id = grid.cells[r]![c]!;
      ((axis === 'y' ? r < k : c < k) ? before : after).add(id);
    }
  }
  for (const id of before) if (after.has(id)) return false;
  return true;
}

/**
 * Ba cách căn một nhát cắt: `hinh` giữ đúng tỉ lệ hình vẽ, `dien-tich` chia theo tỉ trọng diện tích hai
 * bên (bản phác đếm ô lệch vẫn ra phòng đúng m²), `giua` lấy trung bình. Cả ba đi qua cổng, bộ chấm chọn.
 */
const SIZING_MODES = ['hinh', 'dien-tich', 'giua'] as const;
type SizingMode = (typeof SIZING_MODES)[number];

function place(
  node: GridNode,
  rect: Rect,
  mode: SizingMode,
  input: SketchTreeInput,
): Placed | null {
  if (node.kind === 'leaf') return { kind: 'leaf', id: node.id, rect };
  const lo = node.axis === 'x' ? node.box.c0 : node.box.r0;
  const hi = node.axis === 'x' ? node.box.c1 : node.box.r1;
  const drawn = (node.k - lo) / (hi - lo);
  const wa = weightOf(node.a, input.weight);
  const wb = weightOf(node.b, input.weight);
  const byArea = wa + wb > 0 ? wa / (wa + wb) : drawn;
  const share = mode === 'hinh' ? drawn : mode === 'dien-tich' ? byArea : (drawn + byArea) / 2;
  const start = node.axis === 'x' ? rect.x0 : rect.y0;
  const end = node.axis === 'x' ? rect.x1 : rect.y1;
  let minA = minSpan(node.a, node.axis, input, rect);
  let minB = minSpan(node.b, node.axis, input, rect);
  const span = end - start;
  if (minA + minB > span) {
    // Hai bên cộng lại đòi hơn chỗ có: bản phác vẽ một phòng nhỏ hơn mức đầu bài (lượt 58d9ff66 vẽ
    // phòng khách 36 m² cho mức 55 m²). Chia chỗ theo tỉ lệ đòi thay vì bỏ cây — cổng vẫn là nơi
    // quyết nhận hay bác, còn đây chỉ dời vách về phía đang thiếu.
    const factor = span / (minA + minB);
    input.trace?.(
      `    ✂ ${mode}: cắt ${node.axis} trong ${extentText(rect)} cần ${minA} + ${minB} cm, chỉ có ${span} — chia theo tỉ lệ đòi (${branchText(node.a)} | ${branchText(node.b)})`,
    );
    minA = Math.max(input.minCell, Math.floor(minA * factor));
    minB = Math.max(input.minCell, Math.floor(minB * factor));
    if (minA + minB > span) return null;
  }
  const at = Math.min(end - minB, Math.max(start + minA, snap(start + span * share)));
  const [ra, rb]: [Rect, Rect] =
    node.axis === 'x'
      ? [
          { ...rect, x1: at },
          { ...rect, x0: at },
        ]
      : [
          { ...rect, y1: at },
          { ...rect, y0: at },
        ];
  const a = place(node.a, ra, mode, input);
  const b = a ? place(node.b, rb, mode, input) : null;
  return a && b ? { kind: 'cut', axis: node.axis, at, a, b, rect } : null;
}

/**
 * Chỗ tối thiểu một nhánh cần theo trục, cm: lá lấy `minExtent`, nhát cắt cùng trục cộng lại, nhát cắt
 * trục kia lấy nhánh đòi nhiều nhất. Nhờ đó ô thang không bị căn ngắn hơn số bậc ngay từ lúc chia.
 */
function minSpan(node: GridNode, axis: Axis, input: SketchTreeInput, rect: Rect): number {
  if (node.kind === 'cut') {
    if (node.axis === axis) {
      return minSpan(node.a, axis, input, rect) + minSpan(node.b, axis, input, rect);
    }
    // Nhát cắt trục kia: hai nhánh có cạnh vuông góc khác nhau — chia vùng theo đúng tỉ lệ hình vẽ để
    // mức sàn và tỉ lệ của lá nằm sâu không bị đo trên cạnh của cả vùng cha.
    const lo = node.axis === 'x' ? node.box.c0 : node.box.r0;
    const hi = node.axis === 'x' ? node.box.c1 : node.box.r1;
    const start = node.axis === 'x' ? rect.x0 : rect.y0;
    const end = node.axis === 'x' ? rect.x1 : rect.y1;
    const at = start + ((end - start) * (node.k - lo)) / (hi - lo);
    const [ra, rb]: [Rect, Rect] =
      node.axis === 'x'
        ? [
            { ...rect, x1: at },
            { ...rect, x0: at },
          ]
        : [
            { ...rect, y1: at },
            { ...rect, y0: at },
          ];
    return Math.max(minSpan(node.a, axis, input, ra), minSpan(node.b, axis, input, rb));
  }
  const grid = input.sketch.grid;
  const f = input.sketch.footprint;
  const box = {
    w: ((f.x1 - f.x0) * (node.box.c1 - node.box.c0)) / grid.cols,
    h: ((f.y1 - f.y0) * (node.box.r1 - node.box.r0)) / grid.rows,
  };
  // Cạnh vuông góc với nhát cắt đã do các nhát cắt trên quyết: mức sàn và tỉ lệ quy về cạnh này.
  const across = Math.max(1, axis === 'x' ? rect.y1 - rect.y0 : rect.x1 - rect.x0);
  void across;
  return Math.max(input.minCell, input.minExtent?.(node.id, axis, box) ?? 0);
}

/** Số lần dời vách để gỡ phòng hẹp — mỗi lần một phòng, dừng khi hết phòng hỏng hoặc không dời được. */
const REPAIR_STEPS = 12;

/**
 * Sửa cục bộ sau khi căn vách: phòng nào còn hẹp dưới mức dựng, quá tỉ lệ, hay hụt sàn đầu bài thì DỜI
 * đúng nhát cắt sinh ra cạnh ấy (`pinLeaf`), giữ nguyên tôpô. Nhận bước sửa khi tổng chỗ còn thiếu của
 * cả tầng giảm — không thì trả lại bản trước.
 *
 * Vì sao không ép ngay lúc chia: chia một lượt từ trên xuống chỉ dời được vách theo MỘT trục mỗi lần,
 * nên ép cả diện tích lẫn tỉ lệ thì nhiều bản phác thành vô nghiệm (lượt 58d9ff66: phòng khách vẽ 36 m²
 * cho mức 55 m² đòi cột rộng 7,7 m, các phòng còn lại hết chỗ).
 */
function repair(root: Placed, input: SketchTreeInput): Placed {
  let current = root;
  let cost = shortfall(current, input);
  for (let step = 0; step < REPAIR_STEPS && cost.total > 0; step += 1) {
    const worst = cost.worst!;
    let moved: Placed | null = null;
    for (const grow of ['b', 'a'] as const) {
      const target =
        worst.axis === 'x'
          ? grow === 'b'
            ? { ...worst.rect, x1: worst.rect.x0 + worst.need }
            : { ...worst.rect, x0: worst.rect.x1 - worst.need }
          : grow === 'b'
            ? { ...worst.rect, y1: worst.rect.y0 + worst.need }
            : { ...worst.rect, y0: worst.rect.y1 - worst.need };
      const next = pinLeaf(current, worst.id, target, input.minCell);
      if (!next) continue;
      const after = shortfall(next, input);
      if (after.total < cost.total) {
        moved = next;
        cost = after;
        break;
      }
    }
    if (!moved) return current;
    current = moved;
  }
  return current;
}

interface Shortfall {
  total: number;
  worst: { id: string; axis: Axis; need: number; rect: Rect } | null;
}

/** Tổng chỗ còn thiếu của cả tầng, cm, và phòng thiếu nhiều nhất — thước để nhận hay bỏ một bước dời. */
function shortfall(root: Placed, input: SketchTreeInput): Shortfall {
  let total = 0;
  let worstGap = 0;
  let worst: Shortfall['worst'] = null;
  for (const leaf of leaves(root)) {
    const w = leaf.rect.x1 - leaf.rect.x0;
    const h = leaf.rect.y1 - leaf.rect.y0;
    const box = { w, h };
    const aspect = input.maxAspect?.(leaf.id) ?? null;
    const area = input.needArea?.(leaf.id) ?? 0;
    const wants: { axis: Axis; need: number }[] = [
      { axis: 'x', need: input.minExtent?.(leaf.id, 'x', box) ?? 0 },
      { axis: 'y', need: input.minExtent?.(leaf.id, 'y', box) ?? 0 },
    ];
    if (aspect) {
      wants.push({ axis: w >= h ? 'y' : 'x', need: Math.ceil(Math.max(w, h) / aspect) });
    }
    if (area > 0 && w * h < area) {
      wants.push(
        w >= h
          ? { axis: 'y', need: Math.ceil(area / w) }
          : { axis: 'x', need: Math.ceil(area / h) },
      );
    }
    for (const want of wants) {
      const have = want.axis === 'x' ? w : h;
      const gap = want.need - have;
      if (gap <= 0) continue;
      total += gap;
      if (!worst || gap > worstGap) {
        worstGap = gap;
        worst = { id: leaf.id, axis: want.axis, need: want.need, rect: leaf.rect };
      }
    }
  }
  return { total, worst };
}

function extentText(rect: Rect): string {
  return `${rect.x1 - rect.x0}×${rect.y1 - rect.y0}`;
}

function branchText(node: GridNode): string {
  return node.kind === 'leaf' ? node.id : leafIds(node).join('+');
}

function leafIds(node: GridNode, out: string[] = []): string[] {
  if (node.kind === 'leaf') out.push(node.id);
  else {
    leafIds(node.a, out);
    leafIds(node.b, out);
  }
  return out;
}

function weightOf(node: GridNode, weight: (id: string) => number): number {
  return node.kind === 'leaf'
    ? Math.max(0, weight(node.id))
    : weightOf(node.a, weight) + weightOf(node.b, weight);
}

function snap(value: number): number {
  return Math.round(value / MODULE_CM) * MODULE_CM;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Mặt bằng đã chia → hàng bản phác, trên lưới khối nhà `cols × rows` mà mô hình đã vẽ (T86). Dùng khi
 * chương trình phải CHIA LẠI một tầng (bản phác hỏng) và tầng ấy qua cổng: lượt sửa giữ nguyên tầng đó,
 * và gửi mô hình đúng cách chia thật thay cho bản phác cũ — tầng trên vẽ theo vị trí thang, thang máy,
 * khu ướt thật chứ không theo bản phác đã bị bỏ.
 *
 * Toạ độ phòng là lòng phòng (mép trong tường), nên giữa hai phòng có khe tường: mỗi ô lấy phòng CHỒNG
 * LẤN NHIỀU NHẤT, không lấy theo tâm ô (tâm ô rơi vào khe tường thì thành lỗ «.» giữa nhà). Ô không chạm
 * phòng nào là «.». Phòng không thắng ô nào vẫn được ô chồng lấn nó nhiều nhất, để không phòng nào biến
 * mất khỏi bản phác.
 */
export function partitionRows(
  rooms: readonly { id: string; rect: readonly number[] }[],
  block: Rect,
  cols: number,
  rows: number,
): string[] {
  const w = (block.x1 - block.x0) / cols;
  const h = (block.y1 - block.y0) / rows;
  const overlap = (rect: readonly number[], r: number, c: number) => {
    const x0 = block.x0 + c * w;
    const y0 = block.y0 + r * h;
    const dx = Math.min(rect[2]!, x0 + w) - Math.max(rect[0]!, x0);
    const dy = Math.min(rect[3]!, y0 + h) - Math.max(rect[1]!, y0);
    return dx > 0 && dy > 0 ? dx * dy : 0;
  };
  const cells: string[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      let best = EMPTY;
      let most = 0;
      for (const room of rooms) {
        const area = overlap(room.rect, r, c);
        if (area > most) {
          most = area;
          best = room.id;
        }
      }
      return best;
    }),
  );
  for (const room of rooms) {
    if (cells.some((row) => row.includes(room.id))) continue;
    let at: [number, number] | null = null;
    let most = 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const area = overlap(room.rect, r, c);
        if (area > most) {
          most = area;
          at = [r, c];
        }
      }
    }
    if (at) cells[at[0]]![at[1]] = room.id;
  }
  return cells.map((row) => row.join(' '));
}

/**
 * Tách phòng gộp (`also`, ví dụ khách + ăn mở chung) về từng phòng của ý định, dọc cạnh dài, theo tỉ lệ
 * diện tích mục tiêu — bản phác của mô hình ghi riêng từng phòng, thiếu một mã thì chương trình coi là
 * «ý định bỏ sót phòng».
 */
export function splitMerged(
  rooms: readonly { id: string; rect: readonly number[]; also?: readonly string[] | null }[],
  targetOf: (id: string) => number,
): { id: string; rect: number[] }[] {
  return rooms.flatMap((room) => {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = room.rect;
    const members = [room.id, ...(room.also ?? [])];
    if (members.length < 2) return [{ id: room.id, rect: [x0, y0, x1, y1] }];
    const weights = members.map((id) => Math.max(targetOf(id), 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const horizontal = x1 - x0 >= y1 - y0;
    let cursor = horizontal ? x0 : y0;
    return members.map((id, index) => {
      const end =
        index === members.length - 1
          ? horizontal
            ? x1
            : y1
          : cursor + ((horizontal ? x1 - x0 : y1 - y0) * weights[index]!) / total;
      const rect = horizontal ? [cursor, y0, end, y1] : [x0, cursor, x1, end];
      cursor = end;
      return { id, rect };
    });
  });
}

/**
 * Ô ghi mã ngoài `known` (phòng chương trình tự thêm, ví dụ nhánh hành lang V-29) nhập vào phòng kề nó
 * — ưu tiên phòng giao thông, rồi phòng kề nhiều ô nhất. Bản phác chỉ được ghi mã phòng của ý định, và
 * ô «.» giữa nhà là lỗ thủng, không phải chỗ trống.
 */
export function absorbUnknown(rows: readonly string[], known: ReadonlySet<string>): string[] {
  const cells = rows.map((row) => row.split(' '));
  const unknown = (id: string) => id !== EMPTY && !known.has(id);
  for (let pass = 0; pass < cells.length * (cells[0]?.length ?? 0); pass += 1) {
    let changed = false;
    let left = false;
    for (let r = 0; r < cells.length; r += 1) {
      for (let c = 0; c < cells[r]!.length; c += 1) {
        if (!unknown(cells[r]![c]!)) continue;
        const near = [
          cells[r - 1]?.[c],
          cells[r + 1]?.[c],
          cells[r]![c - 1],
          cells[r]![c + 1],
        ].filter((id): id is string => !!id && known.has(id));
        if (!near.length) {
          left = true;
          continue;
        }
        const count = (id: string) => near.filter((item) => item === id).length;
        const rank = (id: string) => (/^circulation_|^corridor_/.test(id) ? 100 : 0) + count(id);
        cells[r]![c] = [...near].sort((p, q) => rank(q) - rank(p) || p.localeCompare(q))[0]!;
        changed = true;
      }
    }
    if (!left || !changed) break;
  }
  return cells.map((row) => row.map((id) => (unknown(id) ? EMPTY : id)).join(' '));
}
