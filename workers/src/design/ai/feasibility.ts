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
    'chưa kể hành lang và các phòng không khai diện tích. Vui lòng giảm diện tích tối thiểu hoặc số phòng, ' +
    'hoặc tăng số tầng trong đầu bài.'
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
