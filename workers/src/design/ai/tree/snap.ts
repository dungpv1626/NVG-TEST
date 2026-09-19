/**
 * Bám MỐC tầng dưới — ô thang và giếng trời phải chồng khít qua các tầng (T38).
 *
 * Tầng ≥ 2 được gọi riêng, song song, sau khi tầng 1 đã qua cổng; lời dẫn đưa các số `at` của ô
 * thang tầng 1 và dặn dùng lại đúng các số ấy. Mô hình vẫn có thể lệch vài xen-ti-mét — cắt ở 480
 * thay vì 490 — và một cái thang lệch 10 cm là cái thang không xây được.
 *
 * Nên chương trình SỬA HỘ những lệch nhỏ, và chỉ những lệch nhỏ: dời `at` của đúng nút đã cắt ra
 * cạnh lệch, rồi duyệt lại cây. Dời được vì mỗi cạnh của một ô là nhát cắt của đúng một nút
 * (`cells.ts`). Không dời được — cạnh ấy là cạnh footprint, hoặc dời làm ô bên cạnh hẹp dưới mức
 * tối thiểu — thì là lỗi cổng, không đoán tiếp. Mọi lần dời đều để lại một dòng ghi chú.
 */

import type { Rect } from '../draw/geometry';
import type { DrawNotes } from '../draw/notes';
import { STAIR_ALIGN_CM, type PlanIssue } from '../plan-check';
import { walkTree, type Cell, type WalkInput } from './cells';
import { treeIssue, type TreeIssueCode } from './issues';

/**
 * Lệch tối đa chương trình tự dời để bám mốc, cm. Lệch hơn thì là một bố cục khác, không phải một
 * sai số — sửa hộ khi đó là chương trình tự thiết kế lại thay mô hình.
 */
export const SNAP_MAX_CM = 30;

const SIDES = ['x0', 'x1', 'y0', 'y1'] as const;

export interface SnapTarget {
  /** Mã lá phải bám mốc. */
  leaf: string;
  anchor: Rect;
  code: Extract<TreeIssueCode, 'stair_not_at_anchor' | 'light_well_not_at_anchor'>;
  label: string;
}

export interface SnapResult {
  cells: Cell[];
  overrides: Map<string, number>;
  issues: PlanIssue[];
}

export function snapToAnchors(
  walk: WalkInput,
  cells: Cell[],
  targets: readonly SnapTarget[],
  notes: DrawNotes,
): SnapResult {
  const issues: PlanIssue[] = [];
  const overrides = new Map<string, number>(walk.overrides ?? []);
  const where = `tầng ${walk.level}`;
  const moved: string[] = [];

  for (const target of targets) {
    const cell = cells.find((c) => c.id === target.leaf);
    if (!cell) continue;
    for (const side of SIDES) {
      const deviation = target.anchor[side] - cell.rect[side];
      if (deviation === 0) continue;
      const node = cell.from[side];
      const tooFar = Math.abs(deviation) > SNAP_MAX_CM;
      const footprintEdge = node === null;
      if (tooFar || (footprintEdge && Math.abs(deviation) > STAIR_ALIGN_CM)) {
        issues.push(
          treeIssue(
            target.code,
            footprintEdge
              ? `${target.label} "${target.leaf}" ở ${where} lệch ${Math.abs(deviation)} cm so với tầng dưới trên cạnh footprint — không dời được, phải cắt lại cho trùng.`
              : `${target.label} "${target.leaf}" ở ${where} lệch ${Math.abs(deviation)} cm so với tầng dưới, quá ${SNAP_MAX_CM} cm.`,
            { id: target.leaf, cm: Math.abs(deviation), max: SNAP_MAX_CM },
            target.leaf,
          ),
        );
        continue;
      }
      if (footprintEdge) continue;
      overrides.set(node, target.anchor[side]);
      moved.push(`${target.leaf}.${side} ${deviation > 0 ? '+' : ''}${deviation} cm`);
    }
  }

  if (issues.length || moved.length === 0) return { cells, overrides, issues };

  const again = walkTree({ ...walk, overrides });
  if (again.issues.length) {
    return {
      cells,
      overrides,
      issues: [
        treeIssue(
          'snap_collapsed_cell',
          `Dời vách ${where} để bám mốc tầng dưới (${moved.join('; ')}) làm hỏng ô bên cạnh: ${again.issues[0]!.message}`,
          { moves: moved.join('; ') },
        ),
      ],
    };
  }
  notes.add(
    'anchor_snapped',
    `Đã dời vách ${where} để ô thang / giếng trời chồng khít tầng dưới: ${moved.join('; ')}.`,
  );
  return { cells: again.cells, overrides, issues };
}
