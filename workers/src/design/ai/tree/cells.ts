/**
 * Cây chia → Ô — bước đầu tiên của việc gán số (T37, 13/09/2026).
 *
 * Mô hình khai một tầng thành cây chia guillotine: mỗi nút cắt một ô chữ nhật bằng một nhát thẳng
 * tại `at` (TIM bức vách), `a` là nửa phía toạ độ nhỏ, `b` là nửa phía lớn. Duyệt cây từ footprint
 * cho ra một tập ô theo TIM tường, lấp kín footprint và không chồng nhau — và đó là tính chất của
 * phép duyệt, không phải điều phải kiểm lại.
 *
 * Mỗi ô nhớ cạnh nào do NÚT nào cắt ra (`from`). Đó là thứ các bước sau cần: hai ô kề nhau luôn
 * có chung một nút ở cạnh giáp nhau (nút tổ tiên chung thấp nhất), nên tìm hàng xóm là so mã nút,
 * không phải so toạ độ có dung sai; và dời một cạnh (bám mốc thang, `snap.ts`) là đổi `at` của
 * đúng một nút.
 *
 * Cây KHÔNG tin được: nó do mô hình sinh. Mọi dạng hỏng — vòng, nút mồ côi, hai cha, nhát cắt
 * nằm ngoài ô — thành lỗi cổng có câu tiếng Việt nêu đúng mã nút và con số, không bao giờ ném.
 */

import type { AiPlanTree } from '@nvg/shared/design';
import { toRect, type Rect } from '../draw/geometry';
import type { PlanIssue } from '../plan-check';
import { treeIssue } from './issues';

/**
 * Nhát cắt phải chừa MỖI BÊN ít nhất chừng này, cm.
 *
 * Dưới mức này ô con không thành được phòng (trừ hai bề dày tường thì còn vài xen-ti-mét), và
 * `draw/derive-walls.ts` ghép hai mặt phòng cách nhau dưới 40 cm thành MỘT bức vách — tức một ô
 * trống quá hẹp sẽ biến mất khỏi tờ vẽ mà không ai nói gì. 60 cm là cùng ngưỡng «lỗ, không phải
 * khe tường» của cổng G1 (`POCKET_MIN_SIDE_CM`), vì cùng một câu hỏi.
 */
export const MIN_CELL_CM = 60;

export const UNBUILT_RE = /^unbuilt_\d+$/;
export const VOID_RE = /^void_\d+$/;

export type LeafKind = 'room' | 'unbuilt' | 'void';

/** Cạnh của ô → mã nút đã cắt ra cạnh ấy. `null` = cạnh của footprint. */
export interface CellSides {
  x0: string | null;
  x1: string | null;
  y0: string | null;
  y1: string | null;
}

export interface Cell {
  id: string;
  kind: LeafKind;
  /** Theo TIM tường, cm. */
  rect: Rect;
  from: CellSides;
}

export interface WalkInput {
  tree: Pick<AiPlanTree, 'footprint' | 'nodes'>;
  level: number;
  /** Mã phòng của chương trình THUỘC TẦNG NÀY. */
  roomIds: ReadonlySet<string>;
  /** Mã phòng của chương trình → tầng, để câu lỗi nói được «phòng này thuộc tầng 2». */
  levelOf: ReadonlyMap<string, number>;
  /** `at` thay thế theo mã nút — chỉ `snap.ts` dùng. */
  overrides?: ReadonlyMap<string, number>;
}

export interface TreeWalk {
  /** Theo thứ tự duyệt cây — tất định, nên cùng cây cho cùng thứ tự phòng. */
  cells: Cell[];
  issues: PlanIssue[];
}

export function walkTree(input: WalkInput): TreeWalk {
  const { tree, level } = input;
  const where = `tầng ${level}`;
  const issues: PlanIssue[] = [];
  const footprint = toRect(tree.footprint);
  const [fx0, fy0, fx1, fy1] = tree.footprint;
  if (fx0 === undefined || fy0 === undefined || fx1 === undefined || fy1 === undefined) {
    return { cells: [], issues };
  }
  if (fx1 <= fx0 || fy1 <= fy0) {
    issues.push(
      treeIssue(
        'footprint_empty',
        `Khối xây ${where} khai [${tree.footprint.join(', ')}] — cạnh sau phải lớn hơn cạnh trước.`,
        {},
      ),
    );
    return { cells: [], issues };
  }

  const byId = new Map<string, AiPlanTree['nodes'][number]>();
  for (const node of tree.nodes) {
    const clash =
      byId.has(node.id) ||
      input.roomIds.has(node.id) ||
      input.levelOf.has(node.id) ||
      UNBUILT_RE.test(node.id) ||
      VOID_RE.test(node.id);
    if (clash) {
      issues.push(
        treeIssue(
          'tree_id_reused',
          `Nút "${node.id}" ở ${where} trùng mã với một nút khác, một phòng, hoặc một ô unbuilt/void.`,
          { id: node.id },
          node.id,
        ),
      );
      continue;
    }
    byId.set(node.id, node);
  }

  const parents = new Map<string, number>();
  for (const node of byId.values()) {
    if (node.a === node.b) {
      issues.push(
        treeIssue(
          'tree_self_child',
          `Nút "${node.id}" ở ${where} trỏ cả hai nửa vào cùng "${node.a}".`,
          { id: node.id, a: node.a },
          node.id,
        ),
      );
    }
    for (const child of [node.a, node.b]) parents.set(child, (parents.get(child) ?? 0) + 1);
  }
  for (const [child, count] of parents) {
    if (count > 1) {
      issues.push(
        treeIssue(
          'tree_child_reused',
          `"${child}" ở ${where} là con của ${count} nút — mỗi ô chỉ nằm ở MỘT chỗ trên cây.`,
          { id: child },
          child,
        ),
      );
    }
  }
  if (issues.length) return { cells: [], issues };

  const roots = [...byId.keys()].filter((id) => !parents.has(id));
  if (roots.length !== 1) {
    issues.push(
      roots.length === 0
        ? treeIssue(
            'tree_no_root',
            `Cây ${where} không có nút gốc: mọi nút đều là con của nút khác, tức cây có vòng.`,
            {},
          )
        : treeIssue(
            'tree_many_roots',
            `Cây ${where} có ${roots.length} nút gốc (${roots.join(', ')}) — chỉ được một nút chia chính footprint.`,
            { ids: roots.join(', ') },
          ),
    );
    return { cells: [], issues };
  }

  const cells: Cell[] = [];
  const seenLeaves = new Set<string>();
  const visited = new Set<string>();

  const visit = (id: string, rect: Rect, from: CellSides): void => {
    const node = byId.get(id);
    if (node) {
      // Hai cha đã bị bắt ở trên, nên gặp lại một nút ở đây chỉ có thể là vòng.
      if (visited.has(id)) return;
      visited.add(id);
      const at = input.overrides?.get(id) ?? node.at;
      const [lo, hi] = node.cut === 'x' ? [rect.x0, rect.x1] : [rect.y0, rect.y1];
      const axis = node.cut === 'x' ? 'x' : 'y';
      if (at <= lo || at >= hi) {
        issues.push(
          treeIssue(
            'cut_outside_cell',
            `Nhát cắt "${id}" ở ${where} đặt tại ${axis} = ${at} cm, nằm ngoài ô nó chia (${axis} từ ${lo} đến ${hi} cm).`,
            { id, cm: at, lo, hi },
            id,
          ),
        );
        return;
      }
      if (at - lo < MIN_CELL_CM || hi - at < MIN_CELL_CM) {
        issues.push(
          treeIssue(
            'cut_too_close',
            `Nhát cắt "${id}" ở ${where} tại ${axis} = ${at} cm chỉ chừa ${Math.min(at - lo, hi - at)} cm cho một bên — mỗi bên cần ít nhất ${MIN_CELL_CM} cm.`,
            { id, cm: Math.min(at - lo, hi - at), min: MIN_CELL_CM },
            id,
          ),
        );
        return;
      }
      if (node.cut === 'x') {
        visit(node.a, { ...rect, x1: at }, { ...from, x1: id });
        visit(node.b, { ...rect, x0: at }, { ...from, x0: id });
      } else {
        visit(node.a, { ...rect, y1: at }, { ...from, y1: id });
        visit(node.b, { ...rect, y0: at }, { ...from, y0: id });
      }
      return;
    }

    const kind: LeafKind | null = UNBUILT_RE.test(id)
      ? 'unbuilt'
      : VOID_RE.test(id)
        ? 'void'
        : input.roomIds.has(id)
          ? 'room'
          : null;
    if (!kind) {
      const elsewhere = input.levelOf.get(id);
      issues.push(
        treeIssue(
          'leaf_unknown',
          elsewhere === undefined
            ? `Ô "${id}" ở ${where} không phải nút, không phải phòng của chương trình, cũng không phải unbuilt_N hay void_N.`
            : `Ô "${id}" đặt ở ${where}, nhưng chương trình xếp phòng này ở tầng ${elsewhere}.`,
          { id, level: elsewhere ?? '' },
          id,
        ),
      );
      return;
    }
    if (seenLeaves.has(id)) {
      issues.push(
        treeIssue('leaf_duplicate', `Ô "${id}" xuất hiện hai lần trên cây ${where}.`, { id }, id),
      );
      return;
    }
    seenLeaves.add(id);
    cells.push({ id, kind, rect, from });
  };

  visit(roots[0]!, footprint, { x0: null, x1: null, y0: null, y1: null });

  for (const id of byId.keys()) {
    if (!visited.has(id)) {
      issues.push(
        treeIssue(
          'tree_orphan_node',
          `Nút "${id}" ở ${where} không nằm trên đường nào từ nút gốc.`,
          { id },
          id,
        ),
      );
    }
  }

  return { cells, issues };
}
