/**
 * Lược đồ hình chữ nhật → ý định cả nhà có bản phác (bàn giao v5, cách A — Haan chốt 04/10/2026).
 *
 * Mô hình khai mỗi phòng một hình chữ nhật mm (`ai-house-layout`) thay cho bản phác lưới ô ~1 m (T48).
 * Tệp này kiểm và sửa nhẹ các hình ấy rồi đổi ra bản phác lưới MỊN (0,5 m) — đúng dạng bộ xếp đang đọc —
 * nên mọi bước sau (nắn, khung xương T102, thu hành lang T104, nới phòng T113, cổng, thước chấm) giữ
 * nguyên. Chương trình vẫn gán mọi toạ độ cuối: rect là ý đồ, không phải số trên bản vẽ.
 *
 * Tự sửa (ghi lại, không gọi mô hình): bắt bước 100 mm; vách lệch nhau ≤ 300 mm kéo về một đường (kể cả
 * mép khối); chồng nhau một dải mỏng ≤ 300 mm thì phòng lớn nhường. Phần còn lại là lỗi có số đo — câu
 * nhắc cho vòng sửa nếu phương án vẫn hỏng, không chặn: bộ xếp nắn được nhiều chỗ lệch hơn ta tưởng.
 */
import type { AiHouseLayout, AiHouseLayoutDelta } from '@nvg/shared/design';
import type { HouseProgramSpec } from '../kb/house-program';
import type { HouseCantilever, HouseIntent, HouseRoom } from './house';
import { typeOfId, type ProgramRow } from './house-program';

/** Bước toạ độ của rect, mm. */
export const LAYOUT_SNAP_MM = 100;
/** Vách / mép lệch nhau tới mức này thì coi là một đường; chồng mỏng tới mức này thì tự cắt. */
export const LAYOUT_ALIGN_MM = 300;
/** Cỡ ô bản phác dựng từ rect, mm — đủ mịn để WC 1,5 m, hành lang 1,3 m không bị làm tròn mất. */
export const LAYOUT_CELL_MM = 500;

export type LayoutRect = [number, number, number, number];

export interface LayoutOptions {
  /** Khối xây được, mm, đo từ góc LÔ (gốc toạ độ của mô hình): góc trước-trái `x`, `y`, cỡ `widthMm` × `depthMm`. */
  block: { x: number; y: number; widthMm: number; depthMm: number };
  /** Danh mục chương trình cấp — nguồn của loại phòng và phòng mẹ (`ai/house-program.ts`). */
  program: readonly ProgramRow[];
  spec: HouseProgramSpec;
  /** Số tầng mái («roof»): phòng khai ở đó đi vào `intent.roof`, không vào bản phác. Vắng = không có mái. */
  roofLevel?: number;
  /** Các tầng của nhà (đầu bài). Vắng = nhận mọi số tầng dương. */
  levels?: readonly number[];
  /** Mặt được đua và độ đua tối đa, cm (đầu bài). Vắng mặt = không cho đua ở mặt ấy. */
  cantileverFaces?: Partial<Record<HouseCantilever['face'], number>>;
  /** Loại phòng được làm phòng mẹ của phòng khép kín (`ensuite_of`) — ban công đua từ phòng ngủ là ban công riêng. */
  parentTypes?: ReadonlySet<string>;
  /** Cỡ ô bản phác, mm. */
  cellMm: number;
  /** Bề dày tường trừ ở mỗi chiều khi đổi rect (tim tường) ra diện tích lọt lòng, m. */
  wallM: number;
}

export type LayoutIssueCode =
  | 'rect_shape'
  | 'rect_outside_block'
  | 'rect_overlap'
  | 'rect_gap'
  | 'rect_too_small'
  | 'layout_unknown_id'
  | 'layout_bad_level'
  | 'cantilever_bad';

export interface LayoutIssue {
  code: LayoutIssueCode;
  level: number;
  rooms: string[];
  /** Tiếng Việt, cho nhật ký và ghi chú. */
  message: string;
  /** Tham số câu nhắc tiếng Anh (`house_layout.hints`). */
  params: Record<string, string | number>;
}

export interface LayoutConversion {
  intent: HouseIntent;
  issues: LayoutIssue[];
  /** Chỗ chương trình tự sửa, tiếng Việt. */
  fixes: string[];
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const snap = (v: number) => Math.round(v / LAYOUT_SNAP_MM) * LAYOUT_SNAP_MM;
const m = (mm: number) => (mm / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const rectText = (b: Box) => `[${b.x0}, ${b.y0}, ${b.x1 - b.x0}, ${b.y1 - b.y0}]`;
const areaOf = (b: Box) => (b.x1 - b.x0) * (b.y1 - b.y0);

/** Ý định cả nhà có bản phác lưới mịn, dựng từ câu trả lời hình chữ nhật. */
export function layoutToIntent(layout: AiHouseLayout, options: LayoutOptions): LayoutConversion {
  const issues: LayoutIssue[] = [];
  const fixes: string[] = [];
  const { x: X0, y: Y0, widthMm: W, depthMm: D } = options.block;
  const block: Box = { x0: X0, y0: Y0, x1: X0 + W, y1: Y0 + D };
  const programOf = new Map(options.program.map((row) => [row.id, row]));
  const boxes = new Map<HouseRoom, Box>();
  const storey: HouseRoom[] = [];
  const roof: HouseRoom[] = [];
  const seen = new Set<string>();

  for (const raw of layout.rooms) {
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    const type = typeOfId(raw.id, options.program, options.spec);
    const isRoof = raw.level === 'roof';
    const level = isRoof ? (options.roofLevel ?? Number.NaN) : Number(raw.level);
    if (
      !Number.isInteger(level) ||
      level < 1 ||
      (!isRoof && options.levels !== undefined && !options.levels.includes(level))
    ) {
      issues.push({
        code: 'layout_bad_level',
        level: 0,
        rooms: [raw.id],
        message: `Phòng "${raw.id}" khai tầng «${raw.level}» không có trong nhà.`,
        params: { room: raw.id, level: raw.level },
      });
      continue;
    }
    if (!type) {
      issues.push({
        code: 'layout_unknown_id',
        level,
        rooms: [raw.id],
        message: `Mã "${raw.id}" không có trong danh mục và không mang tiền tố được tự thêm.`,
        params: { room: raw.id, prefixes: Object.keys(options.spec.modelAdded).join(', ') },
      });
      continue;
    }
    const room: HouseRoom = {
      id: raw.id,
      type,
      level,
      target_area_m2: 1,
      ensuite_of: programOf.get(raw.id)?.parent ?? null,
    };
    const r = raw.rect;
    if (r.length !== 4 || r[2]! <= 0 || r[3]! <= 0) {
      issues.push({
        code: 'rect_shape',
        level,
        rooms: [raw.id],
        message: `Phòng "${raw.id}" tầng ${raw.level}: rect phải đủ bốn số [x, y, rộng, sâu], rộng và sâu dương.`,
        params: { room: raw.id },
      });
      continue;
    }
    if (isRoof) {
      roof.push({ ...room, rect: [r[0]!, r[1]!, r[2]!, r[3]!] });
      continue;
    }
    const exact: Box = { x0: r[0]!, y0: r[1]!, x1: r[0]! + r[2]!, y1: r[1]! + r[3]! };
    const box: Box = {
      x0: snap(exact.x0),
      y0: snap(exact.y0),
      x1: snap(exact.x1),
      y1: snap(exact.y1),
    };
    if (box.x0 !== exact.x0 || box.y0 !== exact.y0 || box.x1 !== exact.x1 || box.y1 !== exact.y1) {
      fixes.push(`"${raw.id}" tầng ${level}: bắt toạ độ về bước ${LAYOUT_SNAP_MM} mm.`);
    }
    const out = Math.max(
      block.x0 - box.x0,
      block.y0 - box.y0,
      box.x1 - block.x1,
      box.y1 - block.y1,
    );
    if (out > 0) {
      if (out > LAYOUT_ALIGN_MM) {
        issues.push({
          code: 'rect_outside_block',
          level,
          rooms: [raw.id],
          message: `Phòng "${raw.id}" tầng ${level} vượt vùng xây được ${m(out)} m.`,
          params: {
            room: raw.id,
            rect: rectText(box),
            out_mm: out,
            block: rectText(block),
          },
        });
      } else {
        fixes.push(`"${raw.id}" tầng ${level}: cắt phần vượt vùng xây ${m(out)} m.`);
      }
      const clipped = overlap(box, block);
      if (clipped.x1 <= clipped.x0 || clipped.y1 <= clipped.y0) continue;
      Object.assign(box, clipped);
    }
    storey.push(room);
    boxes.set(room, box);
  }

  const levels = [...new Set(storey.map((room) => room.level))].sort((a, b) => a - b);
  const share = new Map<HouseRoom, number>();
  const sketches: { level: number; rows: string[] }[] = [];
  for (const level of levels) {
    const here = [...boxes].filter(([room]) => room.level === level);
    alignEdges(here, 'x', [block.x0, block.x1], level, fixes);
    alignEdges(here, 'y', [block.y0, block.y1], level, fixes);
    trimOverlaps(here, level, issues, fixes);
    const raster = rasterise(here, block, options.cellMm, level, issues);
    if (raster) {
      sketches.push({ level, rows: raster });
      // Phần rect phòng thật sự GIỮ sau khi gỡ chồng (phòng nhỏ đè phòng lớn): diện tích mục tiêu tính trên phần ấy,
      // không thì hai phòng chồng nhau cùng kể chung một mảng sàn.
      const grid = raster.map((line) => line.split(' '));
      const cellMm2 =
        ((block.x1 - block.x0) / grid[0]!.length) * ((block.y1 - block.y0) / grid.length);
      const owned = new Map<string, number>();
      for (const line of grid) for (const id of line) owned.set(id, (owned.get(id) ?? 0) + 1);
      for (const [room, box] of here)
        share.set(room, Math.min(1, ((owned.get(room.id) ?? 0) * cellMm2) / areaOf(box)));
    }
  }
  for (const [room, box] of boxes) {
    const w = (box.x1 - box.x0) / 1000 - options.wallM;
    const h = (box.y1 - box.y0) / 1000 - options.wallM;
    // Diện tích mục tiêu suy từ rect (lọt lòng ≈ trừ một bề dày tường mỗi chiều) — mô hình không khai.
    const kept = share.get(room) ?? 1;
    room.target_area_m2 = Math.max(
      0.5,
      Math.round(Math.max(0, w) * Math.max(0, h) * kept * 10) / 10,
    );
    room.rect = [box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0];
  }

  const known = new Set(storey.map((room) => room.id));
  const relationships: HouseIntent['relationships'] = [];
  const pairOk = (pair: readonly string[]) =>
    pair.length === 2 && pair[0] !== pair[1] && known.has(pair[0]!) && known.has(pair[1]!);
  for (const pair of layout.doors)
    if (pairOk(pair)) relationships.push({ a: pair[0]!, b: pair[1]!, kind: 'adjacent' });
  for (const pair of layout.open)
    if (pairOk(pair)) relationships.push({ a: pair[0]!, b: pair[1]!, kind: 'open' });

  // Ban công đua: phòng ban công cho danh mục (không ô bản phác), dựng ngoài khối ở bước dựng ô.
  const cantilevers: HouseCantilever[] = [];
  const balconies: HouseRoom[] = [];
  for (const c of layout.cantilevers) {
    if (c.depth <= 0) continue;
    const host = storey.find((room) => room.id === c.from_room);
    const allowed = options.cantileverFaces?.[c.face];
    const type = programOf.get(c.id)?.type ?? typeOfId(c.id, options.program, options.spec);
    const bad = (why: string) =>
      issues.push({
        code: 'cantilever_bad',
        level: host?.level ?? 0,
        rooms: [c.id],
        message: `Ban công đua "${c.id}": ${why}`,
        params: { room: c.id, from: c.from_room, face: c.face, why },
      });
    if (!host) {
      bad(`phòng "${c.from_room}" không có trên mặt bằng.`);
      continue;
    }
    if (type !== 'balcony' || known.has(c.id)) {
      bad('mã phải là một ban công của danh mục (hoặc bc_…) chưa vẽ thành phòng.');
      continue;
    }
    if (!allowed) {
      bad(`mặt ${c.face} không được đua.`);
      continue;
    }
    const depthCm = Math.min(Math.round(c.depth / 10), allowed);
    if (depthCm < Math.round(c.depth / 10)) {
      fixes.push(
        `Ban công đua "${c.id}": hạ độ đua về ${depthCm} cm — mức đầu bài cho phép ở mặt ấy.`,
      );
    }
    cantilevers.push({
      id: c.id,
      from: host.id,
      face: c.face,
      depth_cm: depthCm,
      level: host.level,
    });
    const [, , rw, rh] = host.rect!;
    const along = c.face === 'front' || c.face === 'back' ? rw : rh;
    const parent = programOf.get(c.id)?.parent;
    balconies.push({
      id: c.id,
      type: 'balcony',
      level: host.level,
      target_area_m2: Math.max(0.5, Math.round(((along / 1000) * depthCm) / 10) / 10),
      ensuite_of: parent ?? (options.parentTypes?.has(host.type) ? host.id : null),
    });
    relationships.push({ a: host.id, b: c.id, kind: 'adjacent' });
  }

  return {
    intent: {
      variant_label: layout.variant_label,
      rationale: layout.rationale,
      assumptions: layout.assumptions,
      ...(layout.design_notes.length ? { design_notes: layout.design_notes } : {}),
      rooms: [...storey, ...balconies],
      relationships,
      sketches,
      entry_room: layout.entry_room || null,
      garage_room: layout.garage_room || null,
      ...(roof.length ? { roof } : {}),
      ...(cantilevers.length ? { cantilevers } : {}),
    },
    issues,
    fixes,
  };
}

const overlap = (a: Box, b: Box): Box => ({
  x0: Math.max(a.x0, b.x0),
  y0: Math.max(a.y0, b.y0),
  x1: Math.min(a.x1, b.x1),
  y1: Math.min(a.y1, b.y1),
});

/**
 * Kéo các vách gần trùng về một đường (dọc trục `axis`): nhóm mép cách nhau ≤ 300 mm tính từ mép đầu
 * nhóm, không bao giờ gộp hai mép của cùng một phòng. Nhóm có mép khối thì về mép khối; không thì về giá
 * trị nhiều phòng dùng nhất. Đây là việc kiến trúc sư làm đầu tiên với bản phác tay: thẳng hàng vách.
 */
function alignEdges(
  here: readonly [HouseRoom, Box][],
  axis: 'x' | 'y',
  anchors: readonly number[],
  level: number,
  fixes: string[],
): void {
  const lo = axis === 'x' ? 'x0' : 'y0';
  const hi = axis === 'x' ? 'x1' : 'y1';
  type Edge = { box: Box | null; key: 'x0' | 'y0' | 'x1' | 'y1' | null; v: number };
  const edges: Edge[] = [
    ...anchors.map((v) => ({ box: null, key: null, v })),
    ...here.flatMap(([, box]) => [
      { box, key: lo, v: box[lo] } as Edge,
      { box, key: hi, v: box[hi] } as Edge,
    ]),
  ].sort((a, b) => a.v - b.v);
  const before = new Map(here.map(([room, box]) => [room, { ...box }]));
  let i = 0;
  while (i < edges.length) {
    const group: Edge[] = [edges[i]!];
    let j = i + 1;
    while (
      j < edges.length &&
      edges[j]!.v - edges[i]!.v <= LAYOUT_ALIGN_MM &&
      !(edges[j]!.box && group.some((e) => e.box === edges[j]!.box))
    ) {
      group.push(edges[j]!);
      j += 1;
    }
    const anchor = group.find((e) => e.box === null);
    let target: number;
    if (anchor) target = anchor.v;
    else {
      const count = new Map<number, number>();
      for (const e of group) count.set(e.v, (count.get(e.v) ?? 0) + 1);
      const mean = group.reduce((sum, e) => sum + e.v, 0) / group.length;
      target = [...count].sort(
        (p, q) => q[1] - p[1] || Math.abs(p[0] - mean) - Math.abs(q[0] - mean) || p[0] - q[0],
      )[0]![0];
    }
    for (const e of group) if (e.box && e.key) e.box[e.key] = target;
    i = j;
  }
  for (const [room, box] of here) {
    const was = before.get(room)!;
    if (box[hi] - box[lo] < LAYOUT_SNAP_MM) {
      // Hai mép của một phòng hẹp bị kéo chéo nhau — trả phòng ấy về chỗ mô hình vẽ.
      box[lo] = was[lo];
      box[hi] = was[hi];
      continue;
    }
    if (box[lo] !== was[lo] || box[hi] !== was[hi]) {
      fixes.push(
        `"${room.id}" tầng ${level}: căn vách ${axis === 'x' ? 'ngang' : 'dọc'} về đường chung (lệch ≤ ${m(LAYOUT_ALIGN_MM)} m).`,
      );
    }
  }
}

/** Chồng nhau một dải mỏng thì phòng lớn nhường; chồng dày là lỗi có số đo. */
function trimOverlaps(
  here: readonly [HouseRoom, Box][],
  level: number,
  issues: LayoutIssue[],
  fixes: string[],
): void {
  for (let i = 0; i < here.length; i += 1) {
    for (let j = i + 1; j < here.length; j += 1) {
      const [ra, a] = here[i]!;
      const [rb, b] = here[j]!;
      const ow = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oh = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ow <= 0 || oh <= 0) continue;
      const [bigRoom, big, small] = areaOf(a) >= areaOf(b) ? [ra, a, b] : [rb, b, a];
      const thin = Math.min(ow, oh);
      if (thin <= LAYOUT_ALIGN_MM && trimAway(big, small, ow <= oh ? 'x' : 'y')) {
        fixes.push(`"${bigRoom.id}" tầng ${level}: lùi vách ${m(thin)} m cho phòng chồng lên nó.`);
        continue;
      }
      issues.push({
        code: 'rect_overlap',
        level,
        rooms: [ra.id, rb.id],
        message: `Tầng ${level}: "${ra.id}" và "${rb.id}" chồng nhau ${m(ow)} × ${m(oh)} m.`,
        params: {
          a: ra.id,
          b: rb.id,
          area_m2: Math.round((ow * oh) / 100_000) / 10,
          rect_a: rectText(a),
          rect_b: rectText(b),
        },
      });
    }
  }
}

/** Lùi một cạnh của `big` ra khỏi `small` theo trục cho trước; `false` khi làm thế thì `big` biến mất. */
function trimAway(big: Box, small: Box, axis: 'x' | 'y'): boolean {
  const lo = axis === 'x' ? 'x0' : 'y0';
  const hi = axis === 'x' ? 'x1' : 'y1';
  // Cạnh nào của `big` nằm trong `small` thì lùi cạnh ấy.
  if (big[hi] > small[lo] && big[hi] <= small[hi] && small[lo] - big[lo] >= LAYOUT_SNAP_MM) {
    big[hi] = small[lo];
    return true;
  }
  if (big[lo] < small[hi] && big[lo] >= small[lo] && big[hi] - small[hi] >= LAYOUT_SNAP_MM) {
    big[lo] = small[hi];
    return true;
  }
  return false;
}

/**
 * Tô rect lên lưới ô `cellMm` (phòng lớn tô trước, phòng nhỏ đè sau — chỗ chồng còn sót thuộc phòng nhỏ),
 * mép làm tròn về ô gần nhất nên hai phòng chung vách vẫn chung vách. Ô trống thông ra mép khối là sân;
 * ô trống bị bao kín là lỗ — báo.
 */
function rasterise(
  here: readonly [HouseRoom, Box][],
  block: Box,
  cellMm: number,
  level: number,
  issues: LayoutIssue[],
): string[] | null {
  if (!here.length) return null;
  const width = block.x1 - block.x0;
  const depth = block.y1 - block.y0;
  const cols = Math.max(1, Math.round(width / cellMm));
  const rows = Math.max(1, Math.round(depth / cellMm));
  const col = (x: number) => Math.round(((x - block.x0) / width) * cols);
  const row = (y: number) => Math.round(((y - block.y0) / depth) * rows);
  const cells: (string | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  const order = [...here].sort((p, q) => areaOf(q[1]) - areaOf(p[1]));
  for (const [room, box] of order) {
    const c0 = col(box.x0);
    const c1 = col(box.x1);
    const r0 = row(box.y0);
    const r1 = row(box.y1);
    if (c1 <= c0 || r1 <= r0) {
      issues.push({
        code: 'rect_too_small',
        level,
        rooms: [room.id],
        message: `Phòng "${room.id}" tầng ${level} hẹp dưới ${m(cellMm / 2)} m — không còn trên bản phác.`,
        params: { room: room.id, rect: rectText(box) },
      });
      continue;
    }
    for (let r = r0; r < r1; r += 1) for (let c = c0; c < c1; c += 1) cells[r]![c] = room.id;
  }

  // Ô trống không thông ra mép khối: lỗ giữa nhà.
  const seen = cells.map((line) => line.map(() => false));
  const queue: [number, number][] = [];
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1)
      if ((r === 0 || c === 0 || r === rows - 1 || c === cols - 1) && cells[r]![c] === null) {
        seen[r]![c] = true;
        queue.push([r, c]);
      }
  while (queue.length) {
    const [r, c] = queue.pop()!;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      if (seen[nr]![nc] || cells[nr]![nc] !== null) continue;
      seen[nr]![nc] = true;
      queue.push([nr, nc]);
    }
  }
  const x = (c: number) => block.x0 + Math.round((c * width) / cols);
  const y = (r: number) => block.y0 + Math.round((r * depth) / rows);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (cells[r]![c] !== null || seen[r]![c]) continue;
      // Gom một lỗ thành hình bao của nó, báo một lần.
      const hole: Box = { x0: c, y0: r, x1: c + 1, y1: r + 1 };
      const stack: [number, number][] = [[r, c]];
      seen[r]![c] = true;
      while (stack.length) {
        const [hr, hc] = stack.pop()!;
        hole.x0 = Math.min(hole.x0, hc);
        hole.y0 = Math.min(hole.y0, hr);
        hole.x1 = Math.max(hole.x1, hc + 1);
        hole.y1 = Math.max(hole.y1, hr + 1);
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nr = hr + dr;
          const nc = hc + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (seen[nr]![nc] || cells[nr]![nc] !== null) continue;
          seen[nr]![nc] = true;
          stack.push([nr, nc]);
        }
      }
      const mm: Box = { x0: x(hole.x0), y0: y(hole.y0), x1: x(hole.x1), y1: y(hole.y1) };
      const around = new Set<string>();
      for (let hr = Math.max(0, hole.y0 - 1); hr < Math.min(rows, hole.y1 + 1); hr += 1)
        for (let hc = Math.max(0, hole.x0 - 1); hc < Math.min(cols, hole.x1 + 1); hc += 1) {
          const id = cells[hr]![hc];
          if (id) around.add(id);
        }
      issues.push({
        code: 'rect_gap',
        level,
        rooms: [...around].sort(),
        message: `Tầng ${level}: khoảng trống giữa nhà ${rectText(mm)} không thuộc phòng nào.`,
        params: { rect: rectText(mm), rooms: [...around].sort().join(', ') },
      });
    }
  }

  return cells.map((line) => line.map((id) => id ?? '.').join(' '));
}

/**
 * Rect của một phòng từ bản phác lưới (hình bao các ô của nó, mm) — cho ý định cũ không mang rect và cho
 * phép thử khứ hồi. `null` khi bản phác không có phòng ấy.
 */
export function rectFromSketch(
  rows: readonly string[],
  id: string,
  block: LayoutOptions['block'],
): LayoutRect | null {
  const grid = rows.map((row) => row.trim().split(/\s+/));
  const cols = Math.max(...grid.map((line) => line.length));
  let box: Box | null = null;
  grid.forEach((line, r) =>
    line.forEach((cell, c) => {
      if (cell !== id) return;
      box = box
        ? {
            x0: Math.min(box.x0, c),
            y0: Math.min(box.y0, r),
            x1: Math.max(box.x1, c + 1),
            y1: Math.max(box.y1, r + 1),
          }
        : { x0: c, y0: r, x1: c + 1, y1: r + 1 };
    }),
  );
  if (!box) return null;
  const b = box as Box;
  const x = (c: number) => block.x + snap((c * block.widthMm) / cols);
  const y = (r: number) => block.y + snap((r * block.depthMm) / grid.length);
  return [x(b.x0), y(b.y0), x(b.x1) - x(b.x0), y(b.y1) - y(b.y0)];
}

/**
 * Ý định (đã qua chương trình) nhìn theo lược đồ hình chữ nhật — phần `<plan>` của vòng sửa và gốc để gộp delta.
 * Phòng không mang rect (ý định cũ, phòng chương trình thêm) lấy hình bao trên bản phác của tầng ấy; phòng ban công
 * đua đi vào `cantilevers`, không vào `rooms`.
 */
export function layoutView(
  intent: Omit<HouseIntent, 'rationale' | 'assumptions'> &
    Partial<Pick<HouseIntent, 'rationale' | 'assumptions'>>,
  block: LayoutOptions['block'],
  roofLevel?: number,
): AiHouseLayout {
  const sketchOf = new Map((intent.sketches ?? []).map((sketch) => [sketch.level, sketch.rows]));
  const jut = new Set((intent.cantilevers ?? []).map((c) => c.id));
  const toLevel = (level: number) => (level === roofLevel ? 'roof' : String(level));
  return {
    variant_label: intent.variant_label,
    rationale: intent.rationale ?? '',
    design_notes: intent.design_notes ?? [],
    assumptions: intent.assumptions ?? [],
    rooms: [...intent.rooms, ...(intent.roof ?? [])].flatMap((room) => {
      if (jut.has(room.id)) return [];
      const rows = sketchOf.get(room.level);
      const rect = room.rect ?? (rows ? rectFromSketch(rows, room.id, block) : null);
      return rect ? [{ id: room.id, level: toLevel(room.level), rect: [...rect] }] : [];
    }),
    doors: intent.relationships
      .filter((rel) => rel.kind === 'adjacent' && !jut.has(rel.a) && !jut.has(rel.b))
      .map((rel) => [rel.a, rel.b]),
    open: intent.relationships.filter((rel) => rel.kind === 'open').map((rel) => [rel.a, rel.b]),
    cantilevers: (intent.cantilevers ?? []).map((c) => ({
      id: c.id,
      from_room: c.from,
      face: c.face,
      depth: c.depth_cm * 10,
    })),
    entry_room: intent.entry_room ?? '',
    garage_room: intent.garage_room ?? '',
  };
}

const samePair = (p: readonly string[], q: readonly string[]) =>
  (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]);

/**
 * Gộp phần thay đổi của vòng sửa (bàn giao v5 mục 6) vào kế hoạch mới nhất. Phòng xoá kéo theo cửa, ô thông và ban
 * công đua trỏ tới nó; ban công đua độ đua 0 là gỡ.
 */
export function mergeLayoutDelta(base: AiHouseLayout, delta: AiHouseLayoutDelta): AiHouseLayout {
  const gone = new Set(delta.rooms_delete);
  const upserts = new Map(delta.rooms_upsert.map((room) => [room.id, room]));
  const rooms = base.rooms
    .filter((room) => !gone.has(room.id))
    .map((room) => upserts.get(room.id) ?? room);
  for (const room of delta.rooms_upsert)
    if (!base.rooms.some((r) => r.id === room.id) && !gone.has(room.id)) rooms.push(room);
  const alive = (pair: readonly string[]) => pair.every((id) => !gone.has(id));
  const doors = base.doors
    .filter((pair) => alive(pair) && !delta.doors_remove.some((q) => samePair(pair, q)))
    .concat(
      delta.doors_add.filter((pair) => alive(pair) && !base.doors.some((q) => samePair(pair, q))),
    );
  const cantilevers = new Map(base.cantilevers.map((c) => [c.id, c]));
  for (const c of delta.cantilevers_upsert) {
    if (c.depth <= 0) cantilevers.delete(c.id);
    else cantilevers.set(c.id, c);
  }
  return {
    ...base,
    design_notes: delta.notes.length ? delta.notes : base.design_notes,
    rooms,
    doors,
    open: base.open.filter(alive),
    cantilevers: [...cantilevers.values()].filter((c) => !gone.has(c.id) && !gone.has(c.from_room)),
  };
}

/**
 * Tham số lỗi nói bằng ô bản phác → mm, cho câu nhắc của chế độ hình chữ nhật: mô hình không thấy lưới nên
 * «hàng 3–5, cột 2–4» vô nghĩa với nó. Thêm `rect`, `need_m2`, `cells_m2`, `door_mm`, `along_mm`, `across_mm`;
 * chữ tự do có «rows …, columns …», «between columns k and k+1», «n cells away» được viết lại.
 */
export function gridParamsInMm(
  params: Readonly<Record<string, string | number>>,
  grid: { x: number; y: number; ox?: number; oy?: number },
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  // Gốc khối xây được trong toạ độ lô — mô hình đọc toạ độ đo từ góc lô.
  const ox = grid.ox ?? 0;
  const oy = grid.oy ?? 0;
  const cell = (grid.x + grid.y) / 2;
  const round100 = (v: number) => Math.round(v / 100) * 100;
  const span = (text: string): [number, number] | null => {
    const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(text.trim());
    return m ? [Number(m[1]), Number(m[2] ?? m[1])] : null;
  };
  if (typeof params.rows === 'string' && typeof params.cols === 'string') {
    const r = span(params.rows);
    const c = span(params.cols);
    if (r && c) {
      const x = round100((c[0] - 1) * grid.x);
      const y = round100((r[0] - 1) * grid.y);
      out.rect = `[${ox + x}, ${oy + y}, ${round100(c[1] * grid.x) - x}, ${round100(r[1] * grid.y) - y}]`;
    }
  }
  const area = (n: number) => Math.round((n * grid.x * grid.y) / 100_000) / 10;
  if (typeof params.need_cells === 'number') out.need_m2 = area(params.need_cells);
  if (typeof params.cells === 'number') out.cells_m2 = area(params.cells);
  if (typeof params.door_cells === 'number') out.door_mm = round100(params.door_cells * cell);
  if (typeof params.along === 'number') out.along_mm = round100(params.along * cell);
  if (typeof params.across === 'number') out.across_mm = round100(params.across * cell);
  const ranged = (a: string, b: string | undefined, step: number, o: number) =>
    `${o + round100((Number(a) - 1) * step)}–${o + round100(Number(b ?? a) * step)} mm`;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string') continue;
    const text = value
      .replace(
        /rows? (\d+)(?:–(\d+))?, columns? (\d+)(?:–(\d+))?/g,
        (_, r0: string, r1: string | undefined, c0: string, c1: string | undefined) =>
          `x ${ranged(c0, c1, grid.x, ox)}, y ${ranged(r0, r1, grid.y, oy)}`,
      )
      .replace(
        /between columns (\d+) and \d+/g,
        (_, k: string) => `at x = ${ox + round100(Number(k) * grid.x)} mm`,
      )
      .replace(
        /between rows (\d+) and \d+/g,
        (_, k: string) => `at y = ${oy + round100(Number(k) * grid.y)} mm`,
      )
      .replace(/(\d+) cells? away/g, (_, n: string) => `${round100(Number(n) * cell)} mm away`)
      .replace(/(\d+) cells?\b/g, (_, n: string) => `${round100(Number(n) * cell)} mm`);
    if (text !== value) out[key] = text;
  }
  return out;
}

/**
 * Chuẩn hoá mã phòng trong câu trả lời rect / delta về dạng hợp đồng (`^[a-z0-9_]+$`): bỏ dấu, chữ thường, ký tự lạ
 * thành `_` — ở MỌI chỗ có mã (phòng, cửa, ô thông, ban công đua, cửa chính, chỗ xe). Tài liệu bàn giao viết mã in
 * hoa (`NGU_OB`); mô hình chép theo thì vẫn khớp danh mục.
 */
export function normaliseLayoutIds(json: unknown): unknown {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
  const fix = (v: unknown) =>
    typeof v === 'string'
      ? v
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/đ/gi, 'd')
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, '_')
          .replace(/^_+|_+$/g, '') || v
      : v;
  const copy = structuredClone(json) as Record<string, unknown>;
  const each = (key: string, f: (item: Record<string, unknown>) => void) => {
    const list = copy[key];
    if (Array.isArray(list))
      for (const item of list)
        if (item && typeof item === 'object') f(item as Record<string, unknown>);
  };
  const pairs = (key: string) => {
    const list = copy[key];
    if (Array.isArray(list))
      copy[key] = list.map((pair) => (Array.isArray(pair) ? pair.map(fix) : pair));
  };
  each('rooms', (room) => (room.id = fix(room.id)));
  each('rooms_upsert', (room) => (room.id = fix(room.id)));
  each('cantilevers', (c) => {
    c.id = fix(c.id);
    c.from_room = fix(c.from_room);
  });
  each('cantilevers_upsert', (c) => {
    c.id = fix(c.id);
    c.from_room = fix(c.from_room);
  });
  for (const key of ['doors', 'open', 'doors_add', 'doors_remove']) pairs(key);
  if (Array.isArray(copy.rooms_delete)) copy.rooms_delete = copy.rooms_delete.map(fix);
  if ('entry_room' in copy) copy.entry_room = fix(copy.entry_room);
  if ('garage_room' in copy) copy.garage_room = fix(copy.garage_room);
  return copy;
}
