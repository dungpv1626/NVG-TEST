/**
 * Kiểm khả thi diện tích TRƯỚC khi gọi mô hình (T112, review lời dẫn 01/10/2026 — Haan chốt «chặn,
 * không gọi mô hình»).
 *
 * Mỗi tầng cộng phần chắc chắn phải có trên bản phác: số ô tối thiểu của từng phòng đầu bài khai diện
 * tích (`min_cells`, cùng con số gửi mô hình), ô thang khi nhà nhiều tầng, và ô khu vệ sinh khép kín
 * của phòng ngủ đầu bài khai khép kín. So với số ô sàn xây được của tầng (đã kẹp mật độ). Vượt
 * `maxShare` thì không mô hình nào xếp nổi — mỗi lượt như thế tốn ~0,5 USD cho năm lời gọi chắc chắn
 * hỏng (biệt thự demo: tầng 2 ~83 % sàn, T102).
 *
 * Cố ý ĐẾM THIẾU: hành lang, WC chung, bếp, giặt phơi và mọi phòng không khai diện tích không cộng,
 * phòng chưa ghim tầng không cộng. Chặn oan một đầu bài xếp được còn tệ hơn để lọt một đầu bài
 * không xếp được — cái sau chỉ tốn tiền, cái trước chặn người dùng.
 */

import type { HouseKnowledge } from './plan';
import type { PlanQuality } from './plan-quality';
import { minSketchCells } from './sketch-cells';

export interface StoreyShortfall {
  level: number;
  /** Ô sàn xây được của tầng. */
  haveCells: number;
  /** Ô đã chắc chắn phải có. */
  needCells: number;
  /** Từng phần cộng vào `needCells` — để câu báo nói được phòng nào chiếm bao nhiêu. */
  items: { type: string; cells: number }[];
}

export function storeyShortfalls(
  k: HouseKnowledge,
  wallM: number,
  maxShare: number,
): StoreyShortfall[] {
  const cellArea = k.sketch_grid.cell_m * k.sketch_grid.cell_m;
  const out: StoreyShortfall[] = [];
  for (let level = 1; level <= k.floors; level += 1) {
    const items: { type: string; cells: number }[] = [];
    for (const row of k.min_cells) {
      // Chỗ để xe không ghim tầng vẫn ở tầng 1 (lối xe vào từ mặt đất).
      const floor = row.floor ?? (row.type === 'garage' ? 1 : null);
      if (floor === level) items.push({ type: row.type, cells: row.cells });
    }
    const stairCells = k.stair_geometry.shape?.cells;
    if (k.floors > 1 && stairCells) {
      items.push({ type: k.stair_types[0] ?? 'stair', cells: stairCells[0] * stairCells[1] });
    }
    const wcMin = k.area_norms?.get('wc')?.min;
    if (wcMin) {
      const ensuites = k.members
        .filter((m) => m.ensuite && m.floor === level && m.bedroom_type)
        .reduce((sum, m) => sum + m.rooms, 0);
      if (ensuites > 0) {
        items.push({
          type: 'wc',
          cells: ensuites * minSketchCells(wcMin, k.sketch_grid.cell_m, wallM),
        });
      }
    }
    const plate = k.buildable_per_level_m2[level - 1] ?? 0;
    const haveCells = Math.min(
      k.sketch_grid.columns * k.sketch_grid.rows,
      Math.floor(plate / cellArea + 1e-9),
    );
    const needCells = items.reduce((sum, item) => sum + item.cells, 0);
    if (needCells > haveCells * maxShare) out.push({ level, haveCells, needCells, items });
  }
  return out;
}

/** Câu báo tiếng Việt: việc không làm được + vì sao + cần làm gì (CGD 4.4). */
export function shortfallMessage(
  shortfalls: readonly StoreyShortfall[],
  labels: Record<string, string>,
  cellM: number,
): string {
  const m2 = (cells: number) =>
    (Math.round(cells * cellM * cellM * 10) / 10).toLocaleString('vi-VN');
  const parts = shortfalls.map((s) => {
    const biggest = [...s.items]
      .sort((a, b) => b.cells - a.cells)
      .slice(0, 4)
      .map((item) => `${labels[item.type] ?? item.type} ~${m2(item.cells)} m²`)
      .join(', ');
    return `tầng ${s.level} cần tối thiểu ~${m2(s.needCells)} m² (${biggest}) trên ${m2(s.haveCells)} m² sàn xây được`;
  });
  return (
    `Chưa tạo được mặt bằng vì diện tích yêu cầu vượt sàn xây được: ${parts.join('; ')} — ` +
    'chưa kể hành lang và các phòng không khai diện tích. Các lựa chọn nới trong đầu bài: thu nhỏ phòng khách, ' +
    'gộp bếp và phòng ăn thành một không gian, bỏ kho, đổi giếng trời tầng 1 thành sân sau, giảm diện tích tối ' +
    'thiểu hay số phòng, hoặc tăng số tầng.'
  );
}

/**
 * Câu chặn khi đầu bài vượt sàn, hoặc `null` khi đi tiếp được / thước không bật kiểm. Gọi trước lời
 * gọi mô hình ĐẦU TIÊN của một phương án — cả đường Workflow (`runVariant`) lẫn `generateAiPlan`.
 */
export function feasibilityIssue(
  knowledge: HouseKnowledge,
  wallM: number,
  quality: Pick<PlanQuality, 'feasibilityMaxPercent'>,
  labels: Record<string, string>,
): string | null {
  const maxPercent = quality.feasibilityMaxPercent;
  if (maxPercent === null) return null;
  const shortfalls = storeyShortfalls(knowledge, wallM, maxPercent / 100);
  return shortfalls.length
    ? shortfallMessage(shortfalls, labels, knowledge.sketch_grid.cell_m)
    : null;
}

/** Tải một tầng theo mức TỐI THIỂU (đường dải v6) — dòng `knowledge.feasibility` và cổng chặn dùng chung. */
export interface StoreyLoad {
  level: string;
  /** Diện tích cần, m² (đã nhân hệ số tường, đã cộng ô thang + sảnh thang). */
  needM2: number;
  /** Sàn xây được, m² (tầng 1 tính cả mật độ chủ nhà khai). */
  capM2: number;
  verdict: 'fits' | 'tight' | 'over';
  /** Phòng chiếm nhiều nhất trước — để câu báo nói được phòng nào. */
  items: { id: string; type: string; m2: number }[];
  /** Chiều sâu trước–sau (nhà hẹp, đường dải) — vắng khi không đo. */
  depth?: StoreyDepth;
}

/**
 * Chiều sâu trước–sau một tầng khi xếp thành dải nguyên bề ngang (cm). `oneEachCm`: mỗi phòng một dải riêng — cách mô
 * hình hay làm ở nhà hẹp; `bestCm`: cách ghép phòng cạnh nhau tốt nhất (chặn dưới — chưa tính hành lang), kèm nhóm của
 * cách ấy để gợi ý.
 */
export interface StoreyDepth {
  oneEachCm: number;
  bestCm: number;
  capCm: number;
  groups: string[][];
}

export interface StoreyDepthInput {
  rooms: readonly { id: string; type: string; m2: number }[];
  /** Cạnh ngắn tối thiểu theo loại, cm. */
  minSideCm: (type: string) => number;
  /** Loại không đẩy chiều sâu theo diện tích (giếng trời, giao thông) — chỉ cạnh tối thiểu. */
  areaFree: ReadonlySet<string>;
  /** Ô thang (cm, theo tim tường) — vắng khi nhà một tầng. Mã hiển thị `stairLabel`. */
  stair: { width: number; length: number } | null;
  stairLabel: string;
  widthCm: number;
  depthCm: number;
  /** Phần tường trừ khỏi bề ngang / chiều sâu một ô khi đổi diện tích ra cạnh, cm — cùng số bộ giải dải dùng. */
  wallCm: number;
  stepCm?: number;
}

/** Một ô khi đo chiều sâu: `w` > 0 = bề ngang cố định (ô thang), `side` = cạnh tối thiểu, `area` cm² (0 = không đẩy). */
export interface DepthCell {
  id: string;
  side: number;
  w: number;
  area: number;
}

/**
 * Chiều sâu tối thiểu (cm) của một dải chứa `members` đứng cạnh nhau trên bề ngang `widthCm`; vô cực khi không vừa
 * bề ngang. Ô cần bề ngang max(cạnh tối thiểu, diện tích / (d − tường) + tường); ô thang sâu ít nhất bằng chiều dài
 * thang, ô thường sâu ít nhất bằng cạnh tối thiểu (như `needOf` của bộ giải).
 */
export function bandMinDepth(
  members: readonly DepthCell[],
  widthCm: number,
  wallCm: number,
  step: number,
  limitCm: number,
): number {
  const widthAt = (cell: DepthCell, d: number) =>
    cell.w > 0
      ? cell.w
      : Math.max(cell.side, cell.area > 0 ? cell.area / Math.max(d - wallCm, 1) + wallCm : 0);
  for (
    let d = Math.ceil(Math.max(...members.map((c) => c.side)) / step) * step;
    d <= limitCm;
    d += step
  ) {
    if (members.reduce((sum, c) => sum + widthAt(c, d), 0) <= widthCm) return d;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Đo chiều sâu một tầng theo cách bộ giải dải dựng (lượt thật 36fb8000: tầng 1 nhà ống 5 × 18 m — gara, khách, thang,
 * giếng trời, WC, bếp, ăn — mỗi phòng một dải thì sâu 18,8 m trên 16,5 m; ước lượng diện tích chỉ thấy «chật 80/81 m²»,
 * mô hình tốn ba vòng sửa mà vẫn thừa 560 mm). Một dải chứa nhiều ô cạnh nhau, chung một chiều sâu `d`; ô cần bề ngang
 * max(cạnh tối thiểu, diện tích / (d − tường) + tường), dải hợp lệ khi tổng bề ngang ≤ bề ngang khối. Ghép tối ưu bằng
 * quy hoạch động trên tập con (≤ 12 ô). Hàm THUẦN.
 */
export function storeyDepth(input: StoreyDepthInput): StoreyDepth | null {
  const step = input.stepCm ?? 10;
  const cells: DepthCell[] = [
    ...(input.stair
      ? [{ id: input.stairLabel, side: input.stair.length, w: input.stair.width, area: 0 }]
      : []),
    ...input.rooms.map((room) => ({
      id: room.id,
      side: input.minSideCm(room.type),
      w: 0,
      area: input.areaFree.has(room.type) ? 0 : room.m2 * 1e4,
    })),
  ];
  const n = cells.length;
  if (n === 0 || n > 12) return null;
  const bandDepth = (members: DepthCell[]) =>
    bandMinDepth(members, input.widthCm, input.wallCm, step, input.depthCm * 3);
  const full = (1 << n) - 1;
  const depthOf = new Array<number>(full + 1).fill(Number.POSITIVE_INFINITY);
  for (let mask = 1; mask <= full; mask += 1)
    depthOf[mask] = bandDepth(cells.filter((_, i) => mask & (1 << i)));
  const best = new Array<number>(full + 1).fill(Number.POSITIVE_INFINITY);
  const pick = new Array<number>(full + 1).fill(0);
  best[0] = 0;
  for (let mask = 1; mask <= full; mask += 1) {
    const low = mask & -mask;
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if (!(sub & low)) continue;
      const total = depthOf[sub]! + best[mask ^ sub]!;
      if (total < best[mask]!) {
        best[mask] = total;
        pick[mask] = sub;
      }
    }
  }
  const groups: string[][] = [];
  for (let mask = full; mask > 0; mask ^= pick[mask]!)
    groups.push(cells.filter((_, i) => pick[mask]! & (1 << i)).map((c) => c.id));
  return {
    oneEachCm: cells.reduce((sum, _, i) => sum + depthOf[1 << i]!, 0),
    bestCm: best[full]!,
    capCm: input.depthCm,
    groups: groups.filter((g) => g.length > 0),
  };
}

export interface StoreyLoadInput {
  program: readonly { id: string; type: string; level: string; min_m2: number | null }[];
  /** Mức tối thiểu khi đầu bài không khai: định mức nghề TỐI THIỂU — cùng nguồn bộ giải dải dùng (`normMinM2`). */
  minM2: (type: string) => number;
  storeys: number;
  stairAreaM2: number;
  feasibility: { wallFactor: number; hubM2: number; tightRatio: number };
  envelopeM2: number;
  maxFootprintM2: number | null;
  /** Đo thêm chiều sâu trước–sau (`storeyDepth`) — đường dải. */
  depth?: Omit<StoreyDepthInput, 'rooms'>;
}

/**
 * Ước lượng khả thi từng tầng theo mức tối thiểu (handoff v6 sửa lỗi đợt 1, P0-4). Dòng cũ của lời dẫn v5 tính bằng
 * diện tích THƯỜNG DÙNG nên nhà ống demo 5 × 18 m ra «tầng 1 ≈93 m² vs 81 m² → over» trong khi bộ dải viết tay cho
 * đúng đầu bài vẫn vừa và qua cổng — chặn bằng số ấy là chặn oan. Ở đây chỉ dùng mức đầu bài khai hoặc định mức nghề tối
 * thiểu, như bộ giải.
 */
export function storeyLoads(input: StoreyLoadInput): StoreyLoad[] {
  const f = input.feasibility;
  const levels = [...new Set(input.program.map((row) => row.level))]
    .filter((level) => /^\d+$/.test(level))
    .sort((a, b) => Number(a) - Number(b));
  return levels.map((level) => {
    const items = input.program
      .filter((row) => row.level === level)
      .map((row) => ({ id: row.id, type: row.type, m2: row.min_m2 ?? input.minM2(row.type) }))
      .sort((a, b) => b.m2 - a.m2);
    const sum = items.reduce((s, item) => s + item.m2, 0);
    const core = input.storeys >= 2 ? input.stairAreaM2 + f.hubM2 : 0;
    const needM2 = Math.round((sum + core) * f.wallFactor);
    const capM2 = Math.round(
      level === '1' && input.maxFootprintM2
        ? Math.min(input.envelopeM2, input.maxFootprintM2)
        : input.envelopeM2,
    );
    const depth = input.depth ? storeyDepth({ ...input.depth, rooms: items }) : null;
    // Chiều sâu: cách ghép tốt nhất vẫn vượt → vượt (chặn dưới, chưa tính hành lang — chặn không oan); mỗi phòng một dải
    // vượt → chật, kèm gợi ý ghép.
    const verdict =
      needM2 > capM2 || (depth && depth.bestCm > depth.capCm)
        ? 'over'
        : needM2 >= capM2 * f.tightRatio || (depth && depth.oneEachCm > depth.capCm)
          ? 'tight'
          : 'fits';
    return { level, needM2, capM2, verdict, items, ...(depth ? { depth } : {}) };
  });
}

/** Dòng gửi mô hình: chỉ tầng chật / vượt, mỗi tầng một dòng ngắn (T6). Rỗng = mọi tầng vừa. */
export function loadsKnowledge(loads: readonly StoreyLoad[]): Record<string, string> {
  return Object.fromEntries(
    loads.filter((load) => load.verdict !== 'fits').map((load) => [load.level, loadLine(load)]),
  );
}

function loadLine(load: StoreyLoad): string {
  const area = `${load.verdict}: ${load.needM2} of ${load.capM2} m²`;
  const d = load.depth;
  if (!d || d.oneEachCm <= d.capCm) return area;
  const m = (cm: number) => (cm / 100).toFixed(1);
  const groups = d.groups.map((g) => `{${g.join(', ')}}`).join(' ');
  return `${area}; depth: one room per band needs ${m(d.oneEachCm)} m of ${m(d.capCm)} m — put rooms side by side (beside THANG too); sharing bands like this needs about ${m(d.bestCm)} m before corridors (front-to-back order is yours): ${groups}`;
}

/** Câu chặn trước lời gọi mô hình khi một tầng vượt theo mức tối thiểu; `null` = đi tiếp. Gợi ý nới bằng chữ (không ô mới). */
export function loadsIssue(
  loads: readonly StoreyLoad[],
  labels: Record<string, string>,
): string | null {
  const over = loads.filter((load) => load.verdict === 'over');
  if (!over.length) return null;
  const parts = over.map((load) => {
    const top = load.items
      .slice(0, 3)
      .map((item) => `${labels[item.type] ?? item.type} ${Math.round(item.m2)} m²`)
      .join(', ');
    const d = load.depth;
    if (d && d.bestCm > d.capCm && load.needM2 <= load.capM2)
      return `tầng ${load.level} xếp phòng cạnh nhau sát nhất vẫn cần sâu ~${(d.bestCm / 100).toFixed(1)} m trên ${(d.capCm / 100).toFixed(1)} m khối nhà (${top}…)`;
    return `tầng ${load.level} cần tối thiểu ~${load.needM2} m² (${top}…) trên ${load.capM2} m² sàn xây được`;
  });
  return `Đầu bài chưa xếp vừa khối nhà: ${parts.join('; ')}. Cần nới đầu bài trước khi chạy — ví dụ thu nhỏ phòng khách, gộp bếp và phòng ăn, bỏ kho hoặc chuyển một phòng lên tầng khác.`;
}
